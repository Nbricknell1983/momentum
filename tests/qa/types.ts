export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface QAIssue {
  id: string;
  issueTitle: string;
  severity: Severity;
  route: string;
  viewport: 'desktop' | 'mobile';
  reproductionSteps: string[];
  observedBehaviour: string;
  expectedBehaviour: string;
  consoleError?: string;
  networkError?: string;
  probableCause: string;
  recommendedFixApproach: string;
  replitPrompt: string;
  screenshotPath?: string;
  timestamp: string;
}

export interface RouteDefinition {
  path: string;
  label: string;
  requiresAuth: boolean;
  requiresManager: boolean;
  priority: number;
  tags: string[];
}

export interface RouteResult {
  route: RouteDefinition;
  viewport: 'desktop' | 'mobile';
  status: 'ok' | 'error' | 'skipped';
  loadTimeMs: number;
  consoleErrors: string[];
  networkErrors: NetworkError[];
  rawIssues: RawIssue[];
  screenshotPath?: string;
}

export interface NetworkError {
  url: string;
  status: number;
  method: string;
}

export interface RawIssue {
  type: IssueType;
  detail: string;
  context?: string;
}

export type IssueType =
  | 'console_error'
  | 'network_error'
  | 'blank_screen'
  | 'react_crash'
  | 'stuck_loading'
  | 'scroll_lock'
  | 'route_failure'
  | 'clipped_ui'
  | 'modal_broken'
  | 'tab_broken'
  | 'render_error';

export interface QAReport {
  runAt: string;
  appUrl: string;
  authenticated: boolean;
  totalRoutesTested: number;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  routesTested: string[];
  issues: QAIssue[];
  topFivePriorities: string[];
  masterRepairPrompt: string;
}

export interface QAConfig {
  baseUrl: string;
  qaEmail?: string;
  qaPassword?: string;
  headless: boolean;
  slowMo: number;
  screenshotDir: string;
  desktopWidth: number;
  desktopHeight: number;
  mobileWidth: number;
  mobileHeight: number;
  pageTimeout: number;
  skipRoutes: string[];
}
