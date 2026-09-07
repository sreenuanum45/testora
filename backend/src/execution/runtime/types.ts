export type LocatorStrategy = 'testid' | 'role' | 'label' | 'placeholder' | 'text' | 'css';

export interface LocatorDescriptor {
  key: string;
  strategy: LocatorStrategy;
  value: string;
  roleName?: string;
}

export interface HealEventPayload {
  locatorKey: string;
  failedStrategy: LocatorStrategy;
  healedStrategy: LocatorStrategy;
  method: 'HEURISTIC' | 'LLM';
  provider?: string;
  model?: string;
  oldValue: string;
  newValue: string;
  verified: boolean;
}
