export type AgentJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type AgentTaskType =
  | 'strategy'
  | 'seo'
  | 'gbp'
  | 'ads'
  | 'website'
  | string;

export interface AgentJob {
  id?: string;
  orgId: string;
  taskType: AgentTaskType;
  agentId: string;
  status: AgentJobStatus;
  input: Record<string, any>;
  output: Record<string, any> | null;
  raw: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
