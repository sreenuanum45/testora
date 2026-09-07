import type { PrismaClient } from '@prisma/client';
import type { RecordedStep } from '../recording/step-parser';

/**
 * Replaces every { action: 'component', componentId } step with that Component's own
 * steps, spliced in inline — this is what makes Reusable Components actually reusable at
 * execution/export time rather than just a stored reference. Recurses (a component may
 * itself reference another component) with a depth guard against accidental cycles.
 */
export async function flattenComponentSteps(prisma: PrismaClient, steps: RecordedStep[], depth = 0): Promise<RecordedStep[]> {
  if (depth > 5) return steps; // guard against a cyclic component reference

  const flattened: RecordedStep[] = [];
  for (const step of steps) {
    if (step.action === 'component' && step.componentId) {
      const component = await prisma.component.findUnique({ where: { id: step.componentId } });
      if (component) {
        const nested = await flattenComponentSteps(prisma, component.steps as unknown as RecordedStep[], depth + 1);
        flattened.push(...nested);
        continue;
      }
    }
    flattened.push(step);
  }
  return flattened;
}

/** Data-Driven Testing: replaces {{columnName}} placeholders in step values/selectors
 *  with the current data row's values. */
export function applyDataRow(steps: RecordedStep[], row: Record<string, unknown> | null): RecordedStep[] {
  if (!row) return steps;
  const substitute = (text: string | undefined): string | undefined => {
    if (text === undefined) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (key in row ? String(row[key]) : `{{${key}}}`));
  };
  return steps.map((step) => ({ ...step, value: substitute(step.value), selector: substitute(step.selector) }));
}

/** Environment Variables: replaces {{env.KEY}} placeholders (a distinct namespace from
 *  Data Set columns, so a test can combine both) with a Test's linked Environment's
 *  variable values. */
export function applyVariables(steps: RecordedStep[], vars: Record<string, string> | null): RecordedStep[] {
  if (!vars || Object.keys(vars).length === 0) return steps;
  const substitute = (text: string | undefined): string | undefined => {
    if (text === undefined) return text;
    return text.replace(/\{\{env\.(\w+)\}\}/g, (_, key: string) => (key in vars ? vars[key]! : `{{env.${key}}}`));
  };
  return steps.map((step) => ({ ...step, value: substitute(step.value), selector: substitute(step.selector) }));
}

export function substituteVariables(text: string, vars: Record<string, string> | null): string {
  if (!vars || Object.keys(vars).length === 0) return text;
  return text.replace(/\{\{env\.(\w+)\}\}/g, (_, key: string) => (key in vars ? vars[key]! : `{{env.${key}}}`));
}
