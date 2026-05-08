/**
 * Sentinel — 规则引擎最小实现
 * 任务完成后自动质检，检查产物是否合格。
 *
 * 规则:
 *   - forge: 产物文件存在且非空，无明显语法错误
 *   - oracle: 输出文档存在且有实质内容
 *   - hermes: 输出数据存在
 *
 * 不依赖 AI，纯规则检查。未来可扩展为 AI 质检。
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import * as eventSvc from '../services/eventService.js';
import { EventType } from '@axing/shared';
import type { Task } from '@axing/shared';

export interface CheckResult {
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
}

/**
 * Run sentinel checks on a completed task.
 * Returns CheckResult with pass/fail for each rule.
 */
export function runSentinelChecks(task: Task, vaultRoot: string): CheckResult {
  const checks: CheckResult['checks'] = [];

  // 1. Check output exists
  if (!task.output || Object.keys(task.output).length === 0) {
    checks.push({ name: 'output-exists', passed: false, detail: '任务没有输出数据' });
    return { passed: false, checks };
  }
  checks.push({ name: 'output-exists', passed: true, detail: '输出数据存在' });

  // 2. Check artifact path
  const artifactPath = task.output?.artifactPath as string | undefined;
  if (artifactPath) {
    const fullPath = resolve(vaultRoot, '..', artifactPath);
    if (existsSync(fullPath)) {
      const stat = statSync(fullPath);
      if (stat.size > 0) {
        checks.push({ name: 'artifact-exists', passed: true, detail: `产物文件存在 (${stat.size} bytes)` });
      } else {
        checks.push({ name: 'artifact-exists', passed: false, detail: '产物文件为空' });
      }

      // 3. Type-specific checks
      if (task.type === 'forge') {
        const content = readFileSync(fullPath, 'utf8');
        // Check for obvious syntax issues
        const hasExport = /export\s+(default\s+)?(function|class|const|let|var)/.test(content);
        const hasUnclosedBraces = (content.match(/{/g) || []).length !== (content.match(/}/g) || []).length;
        if (hasUnclosedBraces) {
          checks.push({ name: 'syntax-check', passed: false, detail: '花括号不匹配' });
        } else {
          checks.push({ name: 'syntax-check', passed: true, detail: '基础语法检查通过' });
        }
        if (!hasExport) {
          checks.push({ name: 'has-export', passed: false, detail: '没有找到 export 语句' });
        } else {
          checks.push({ name: 'has-export', passed: true, detail: '包含 export' });
        }
      }

      if (task.type === 'oracle') {
        const content = readFileSync(fullPath, 'utf8');
        if (content.length < 100) {
          checks.push({ name: 'content-length', passed: false, detail: `文档太短 (${content.length} 字符)` });
        } else {
          checks.push({ name: 'content-length', passed: true, detail: `文档长度合格 (${content.length} 字符)` });
        }
        // Check for markdown headers
        const hasHeaders = /^#{1,3}\s/m.test(content);
        if (!hasHeaders) {
          checks.push({ name: 'has-headers', passed: false, detail: '文档缺少标题结构' });
        } else {
          checks.push({ name: 'has-headers', passed: true, detail: '文档结构完整' });
        }
      }
    } else {
      checks.push({ name: 'artifact-exists', passed: false, detail: `产物文件不存在: ${artifactPath}` });
    }
  } else {
    checks.push({ name: 'artifact-path', passed: false, detail: '输出中没有 artifactPath' });
  }

  const passed = checks.every(c => c.passed);
  return { passed, checks };
}

/**
 * Run sentinel checks and record results as events.
 */
export function checkAndRecord(task: Task, vaultRoot: string): CheckResult {
  const result = runSentinelChecks(task, vaultRoot);

  if (result.passed) {
    eventSvc.recordEvent('sentinel.passed' as EventType, task.id, undefined, {
      checks: result.checks,
    });
    console.log(`[Sentinel] ✓ ${task.title} — ${result.checks.length} 项检查全部通过`);
  } else {
    const failedChecks = result.checks.filter(c => !c.passed);
    eventSvc.recordEvent('sentinel.failed' as EventType, task.id, undefined, {
      checks: result.checks,
      failedCount: failedChecks.length,
    });
    console.log(`[Sentinel] ✗ ${task.title} — ${failedChecks.length} 项检查未通过:`);
    for (const c of failedChecks) {
      console.log(`  - ${c.name}: ${c.detail}`);
    }
  }

  return result;
}
