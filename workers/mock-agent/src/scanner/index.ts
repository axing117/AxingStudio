import type { DetectedAgent } from './types';
import { detectClaudeCode } from './detectors/claude-code';

export type { DetectedAgent };

export interface ScanOptions {
  claudePath: string;
}

export function scanAgents(options: ScanOptions): DetectedAgent[] {
  const detected: DetectedAgent[] = [];

  const claude = detectClaudeCode(options.claudePath);
  if (claude) detected.push(claude);

  // Future detectors:
  //   const codex = detectCodex();
  //   const hermes = detectHermes();
  //   ...

  return detected;
}
