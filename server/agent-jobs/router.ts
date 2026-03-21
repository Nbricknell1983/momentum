import type { AgentTaskType } from './types';

const TASK_AGENT_MAP: Record<string, string> = {
  strategy: 'strategy-specialist',
  seo: 'seo-specialist',
  gbp: 'gbp-specialist',
  ads: 'google-ads-specialist',
  website: 'website-specialist',
};

const DEFAULT_AGENT = 'strategy-specialist';

export function resolveAgentId(taskType: AgentTaskType): string {
  return TASK_AGENT_MAP[taskType] ?? DEFAULT_AGENT;
}

export function getSupportedTaskTypes(): string[] {
  return Object.keys(TASK_AGENT_MAP);
}
