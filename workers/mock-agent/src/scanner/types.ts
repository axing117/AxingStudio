import type { ExecutorType, ExecutorCapability } from '@axing/shared';

export interface DetectedAgent {
  name: string;
  type: ExecutorType;
  capabilities: ExecutorCapability[];
  location: string;
}
