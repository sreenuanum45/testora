export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Variable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

export interface Environment {
  id: string;
  name: string;
  baseUrl: string | null;
  variables: Variable[];
}

export interface TestModule {
  id: string;
  name: string;
}

export type TestType = 'WEB' | 'API' | 'WEB_API';
export type TestCategory = 'SMOKE' | 'REGRESSION' | 'SANITY' | 'E2E';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type StepAction =
  | 'goto'
  | 'click'
  | 'fill'
  | 'press'
  | 'check'
  | 'select'
  | 'assertVisible'
  | 'assertHidden'
  | 'assertText'
  | 'assertValue'
  | 'assertUrl'
  | 'assertCount'
  | 'assertAttribute'
  | 'assertCss'
  | 'assertEnabled'
  | 'assertDisabled'
  | 'assertChecked'
  | 'assertUnchecked'
  | 'waitForVisible'
  | 'waitForUrl'
  | 'waitForResponse'
  | 'waitForHidden'
  | 'waitForEnabled'
  | 'waitForNetworkIdle'
  | 'customCode'
  | 'component';

export interface Step {
  action: StepAction;
  selector?: string;
  selectorStrategy?: 'testid' | 'role' | 'label' | 'placeholder' | 'text' | 'css';
  roleName?: string;
  value?: string;
  code?: string;
  componentId?: string;
}

export interface Test {
  id: string;
  name: string;
  type: TestType;
  category: TestCategory;
  moduleId: string | null;
  module?: TestModule | null;
  targetUrl: string | null;
  recordInIncognito: boolean;
  apiMethod: HttpMethod | null;
  apiEndpoint: string | null;
  apiHeaders: Record<string, string> | null;
  apiBody: unknown;
  steps: Step[];
  retries: number;
  dataSetId: string | null;
  environmentId: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  userAgent: string | null;
  createdAt: string;
  locators?: Locator[];
}

export interface Suite {
  id: string;
  name: string;
  tests: Array<{ testId: string; test: Test }>;
  scheduler: { cronExpression: string; enabled: boolean } | null;
}

export interface SuiteRun {
  id: string;
  suiteId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  runs: Run[];
}

export type RunStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';

export type StepEventStatus = 'running' | 'passed' | 'failed' | 'healing' | 'healed';

export interface RunStepEvent {
  id: string;
  runId: string;
  index: number;
  action: string;
  status: StepEventStatus;
  message: string | null;
  createdAt: string;
}

export interface HealEvent {
  id: string;
  locatorKey: string;
  failedStrategy: string;
  healedStrategy: string;
  method: 'HEURISTIC' | 'LLM';
  provider: string | null;
  model: string | null;
  oldValue: string;
  newValue: string;
  createdAt: string;
}

export interface Run {
  id: string;
  testId: string;
  status: RunStatus;
  browser: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  tracePath: string | null;
  videoPath: string | null;
  dataRowIndex: number | null;
  dataRow: Record<string, unknown> | null;
  screenshotPath: string | null;
  headed: boolean;
  healEvents: HealEvent[];
}

export interface Locator {
  id: string;
  key: string;
  strategy: string;
  value: string;
  roleName: string | null;
  discoveredAt: string;
}

export interface Component {
  id: string;
  name: string;
  steps: Step[];
  createdAt: string;
}

export interface DataSet {
  id: string;
  name: string;
  rows: Array<Record<string, unknown>>;
  createdAt: string;
}

export type FakerColumnType =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'username'
  | 'password'
  | 'uuid'
  | 'streetAddress'
  | 'city'
  | 'country'
  | 'zipCode'
  | 'company'
  | 'jobTitle'
  | 'number'
  | 'boolean'
  | 'pastDate'
  | 'futureDate'
  | 'word'
  | 'sentence'
  | 'url'
  | 'creditCardNumber';

export interface FakerColumn {
  name: string;
  type: FakerColumnType;
}
