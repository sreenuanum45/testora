import type { PrismaClient } from '@prisma/client';
import type { RecordedStep } from '../recording/step-parser';

const STRATEGY_MAP: Record<string, 'TESTID' | 'ROLE' | 'LABEL' | 'PLACEHOLDER' | 'TEXT' | 'CSS'> = {
  testid: 'TESTID',
  role: 'ROLE',
  label: 'LABEL',
  placeholder: 'PLACEHOLDER',
  text: 'TEXT',
  css: 'CSS',
};

/**
 * Self-healing needs a persistent, per-step locator record to heal AGAINST and improve
 * over time — not just the raw step list, which never changes once captured. Each step
 * with a selector gets a durable Locator row (key: "step-<i>") that execution reads from
 * and healing writes back to. Shared by both the recording pipeline and the NLP step
 * generator, since both produce the same RecordedStep[] shape.
 *
 * Re-materializing must NOT blindly overwrite strategy/value on every call — this function
 * runs again every time steps are saved (edit a step, generate more via NLP, re-record),
 * and a naive upsert would silently revert a self-healed locator back to the step's
 * original (often broken) selector, forcing the exact same repair to repeat on every run.
 * `sourceStrategy/sourceValue/sourceRoleName` track what the STEP itself last specified;
 * only when that actually changes (the user genuinely retargeted the step) do we discard
 * the current strategy/value and reset to the new source. Otherwise the active,
 * possibly-healed locator is left alone.
 */
export async function materializeLocators(prisma: PrismaClient, testId: string, steps: RecordedStep[]): Promise<void> {
  for (const [index, step] of steps.entries()) {
    if (!step.selector || !step.selectorStrategy) continue;
    const key = `step-${index}`;
    const strategy = STRATEGY_MAP[step.selectorStrategy];
    const value = step.selector;
    const roleName = step.roleName ?? null;

    const existing = await prisma.locator.findUnique({ where: { testId_key: { testId, key } } });

    if (!existing) {
      await prisma.locator.create({
        data: { testId, key, strategy, value, roleName, sourceStrategy: strategy, sourceValue: value, sourceRoleName: roleName },
      });
      continue;
    }

    const sourceUnchanged =
      existing.sourceStrategy === strategy && existing.sourceValue === value && (existing.sourceRoleName ?? null) === roleName;
    if (sourceUnchanged) continue;

    await prisma.locator.update({
      where: { testId_key: { testId, key } },
      data: { strategy, value, roleName, sourceStrategy: strategy, sourceValue: value, sourceRoleName: roleName },
    });
  }
}
