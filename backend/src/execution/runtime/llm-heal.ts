import type { LocatorDescriptor } from './types';

type LlmResult = { provider: string; model: string; raw: string };

/** Standalone (Groq + Gemini raced in parallel) -> OpenRouter -> OpenAI fallback chain for
 *  use inside a spawned test-runner child process (no NestJS DI available there) — same
 *  provider logic as LlmProviderService, duplicated intentionally since this file gets
 *  bundled into generated spec files that run outside the Nest application context.
 *  Groq and Gemini are raced (first valid response wins) rather than tried one after another,
 *  since self-healing sits on the critical path of a running test and a slow/down provider
 *  shouldn't add its full timeout before the other gets a chance. */
async function groqAttempt(systemPrompt: string, userPrompt: string): Promise<LlmResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('unconfigured');
  const model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error('Groq returned an empty response');
  return { provider: 'groq', model, raw: content };
}

async function geminiAttempt(systemPrompt: string, userPrompt: string): Promise<LlmResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('unconfigured');
  const model = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      // Disable "thinking" — newer flash aliases default it on and can burn the whole
      // output budget on invisible reasoning, returning zero content parts.
      generationConfig: { temperature: 0, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = (await res.json()) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  const text = data.candidates[0]?.content.parts.map((p) => p.text).join('');
  if (!text) throw new Error('Gemini returned an empty response');
  return { provider: 'gemini', model, raw: text };
}

async function openRouterAttempt(systemPrompt: string, userPrompt: string): Promise<LlmResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('unconfigured');
  const model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error('OpenRouter returned an empty response');
  return { provider: 'openrouter', model, raw: content };
}

async function openaiAttempt(systemPrompt: string, userPrompt: string): Promise<LlmResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('unconfigured');
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error('OpenAI returned an empty response');
  return { provider: 'openai', model, raw: content };
}

/** Resolves as soon as the first attempt succeeds, without waiting for the others; only
 *  rejects (returning null) once every attempt has failed or is unconfigured. */
async function raceFirstSuccess(attempts: Array<() => Promise<LlmResult>>, errors: string[]): Promise<LlmResult | null> {
  try {
    return await Promise.any(attempts.map((attempt) => attempt()));
  } catch (err) {
    if (err instanceof AggregateError) {
      errors.push(...err.errors.map((e) => (e instanceof Error ? e.message : String(e))));
    } else {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    return null;
  }
}

async function completeWithFallback(systemPrompt: string, userPrompt: string): Promise<LlmResult> {
  const errors: string[] = [];

  const raced = await raceFirstSuccess([() => groqAttempt(systemPrompt, userPrompt), () => geminiAttempt(systemPrompt, userPrompt)], errors);
  if (raced) return raced;

  for (const attempt of [openRouterAttempt, openaiAttempt]) {
    try {
      return await attempt(systemPrompt, userPrompt);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`All LLM providers failed or are unconfigured: ${errors.join('; ')}`);
}

const SYSTEM_PROMPT = `You are a Playwright locator-repair assistant. Given a failing selector \
description and a JSON snapshot of the page's current interactive elements, suggest ONE replacement \
selector. Never suggest XPath. Respond with ONLY a JSON object, no markdown fences, no prose, matching:
{ "strategy": "testid"|"role"|"label"|"placeholder"|"text"|"css", "value": string, "roleName"?: string }`;

export async function suggestHealedDescriptor(
  key: string,
  original: LocatorDescriptor,
  domSnapshot: unknown,
): Promise<{ descriptor: LocatorDescriptor; provider: string; model: string } | null> {
  const userPrompt = JSON.stringify({ failingSelector: original, pageInteractiveElements: domSnapshot }, null, 2);
  const result = await completeWithFallback(SYSTEM_PROMPT, userPrompt);
  const cleaned = result.raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Omit<LocatorDescriptor, 'key'>;
    if (!parsed.strategy || !parsed.value) return null;
    return { descriptor: { key, ...parsed }, provider: result.provider, model: result.model };
  } catch {
    return null;
  }
}
