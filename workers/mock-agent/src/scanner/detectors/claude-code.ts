import { ExecutorType, ExecutorCapability } from '@axing/shared';
import { existsSync } from 'node:fs';
import type { DetectedAgent } from '../types';

export function detectClaudeCode(claudePath: string): DetectedAgent | null {
  if (!existsSync(claudePath)) return null;

  return {
    name: 'Claude Code',
    type: ExecutorType.ClaudeCode,
    capabilities: [
      ExecutorCapability.OraclePlan,
      ExecutorCapability.OracleReview,
      ExecutorCapability.ForgeImplement,
      ExecutorCapability.ForgeReview,
      ExecutorCapability.DocGenerate,
    ],
    location: claudePath,
  };
}
