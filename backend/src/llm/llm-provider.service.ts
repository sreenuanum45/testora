import { Injectable } from '@nestjs/common';

export interface LlmSuggestion {
  provider: LlmProviderName;
  model: string;
  raw: string;
}

export type LlmProviderName = 'groq' | 'gemini' | 'openrouter' | 'openai';

interface ProviderHandler {
  name: LlmProviderName;
  isConfigured: () => boolean;
  complete: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

function envVal(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

/**
 * Groq -> Gemini -> OpenRouter -> OpenAI fallback chain. Ported from the already-verified
 * implementation in the sibling QA platform (self-healing/llm-providers.ts) rather than
 * rewritten from scratch, since that chain has been proven working end-to-end (live
 * self-healing repairs, scenario generation) across many real runs.
 */
@Injectable()
export class LlmProviderService {
  private readonly providers: ProviderHandler[] = [
    { name: 'groq', isConfigured: () => !!envVal('GROQ_API_KEY'), complete: (s, u) => this.groq(s, u) },
    { name: 'gemini', isConfigured: () => !!envVal('GEMINI_API_KEY'), complete: (s, u) => this.gemini(s, u) },
    { name: 'openrouter', isConfigured: () => !!envVal('OPENROUTER_API_KEY'), complete: (s, u) => this.openRouter(s, u) },
    { name: 'openai', isConfigured: () => !!envVal('OPENAI_API_KEY'), complete: (s, u) => this.openai(s, u) },
  ];

  async completeWithFallback(systemPrompt: string, userPrompt: string): Promise<LlmSuggestion> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        const raw = await provider.complete(systemPrompt, userPrompt);
        return { provider: provider.name, model: this.modelFor(provider.name), raw };
      } catch (err) {
        errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`All LLM providers failed or are unconfigured.\n${errors.join('\n') || 'No provider had an API key set.'}`);
  }

  status(): { active: LlmProviderName | null; configuredCount: number; chain: LlmProviderName[] } {
    const configured = this.providers.filter((p) => p.isConfigured());
    return {
      active: configured[0]?.name ?? null,
      configuredCount: configured.length,
      chain: this.providers.map((p) => p.name),
    };
  }

  private modelFor(name: LlmProviderName): string {
    switch (name) {
      case 'groq':
        return process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
      case 'gemini':
        return process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
      case 'openrouter':
        return process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
      case 'openai':
        return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    }
  }

  private async groq(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${envVal('GROQ_API_KEY')}` },
      body: JSON.stringify({
        model: this.modelFor('groq'),
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message.content;
    if (!content) throw new Error('Groq returned an empty response');
    return content;
  }

  private async gemini(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = this.modelFor('gemini');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': envVal('GEMINI_API_KEY') ?? '' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        // Newer Gemini flash aliases default to "thinking" on, which can burn the entire
        // output budget on invisible reasoning and return zero content parts for prompts
        // that need a short, strict answer. Disable it — we want the direct answer, not a
        // chain of thought — and keep a token floor as a second line of defense.
        generationConfig: { temperature: 0, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const text = data.candidates[0]?.content.parts.map((p) => p.text).join('');
    if (!text) throw new Error('Gemini returned an empty response');
    return text;
  }

  private async openRouter(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${envVal('OPENROUTER_API_KEY')}` },
      body: JSON.stringify({
        model: this.modelFor('openrouter'),
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message.content;
    if (!content) throw new Error('OpenRouter returned an empty response');
    return content;
  }

  private async openai(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${envVal('OPENAI_API_KEY')}` },
      body: JSON.stringify({
        model: this.modelFor('openai'),
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message.content;
    if (!content) throw new Error('OpenAI returned an empty response');
    return content;
  }
}
