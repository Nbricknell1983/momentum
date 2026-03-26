import { createHash } from 'crypto';
import type { RouteResult, QAIssue, RawIssue, IssueType, Severity } from './types';
import { generateReplitPrompt } from './prompts';

// ── Severity classification ───────────────────────────────────────────────────

function classifySeverity(type: IssueType, detail: string): Severity {
  if (type === 'react_crash' || type === 'blank_screen') return 'critical';
  if (type === 'route_failure') return 'high';
  if (type === 'stuck_loading' || type === 'scroll_lock') return 'high';
  if (type === 'network_error') {
    if (detail.includes('status=5') || detail.includes('status=0')) return 'high';
    return 'medium';
  }
  if (type === 'console_error') {
    if (detail.toLowerCase().includes('cannot read') || detail.toLowerCase().includes('undefined')) return 'high';
    if (detail.toLowerCase().includes('failed to fetch') || detail.toLowerCase().includes('network')) return 'medium';
    return 'medium';
  }
  if (type === 'clipped_ui' || type === 'modal_broken') return 'medium';
  if (type === 'tab_broken') return 'medium';
  return 'low';
}

// ── Probable cause mapping ────────────────────────────────────────────────────

function inferProbableCause(type: IssueType, detail: string, route: string): string {
  if (type === 'react_crash' && detail.includes('Cannot read')) {
    return 'A component is reading a property off an undefined value — likely a missing null-check on data that arrives async or can be absent.';
  }
  if (type === 'react_crash') {
    return 'React component threw an unhandled exception during render or effect execution.';
  }
  if (type === 'blank_screen') {
    return 'Page content is not rendering — possible routing issue, missing data guard, or component mount failure.';
  }
  if (type === 'stuck_loading') {
    return 'A loading state was never resolved — possible unhandled promise rejection, missing error handling, or a Firestore listener that never fires.';
  }
  if (type === 'network_error') {
    if (detail.includes('status=5')) return 'Server returned a 5xx error — likely an unhandled server-side exception or missing route handler.';
    if (detail.includes('status=4')) return 'Client request returned a 4xx error — possible auth issue, missing resource, or incorrect API path.';
    return 'Network request failed — possible CORS issue, server not running, or misconfigured endpoint.';
  }
  if (type === 'scroll_lock') {
    return 'A modal or drawer was closed but the body scroll-lock (overflow:hidden) was not cleared — likely a missing cleanup in the modal close handler.';
  }
  if (type === 'route_failure') {
    return `Route ${route} is not accessible — either it requires auth/manager role not present, or the route is not registered in the router.`;
  }
  if (type === 'clipped_ui') {
    return 'UI elements extend beyond the viewport — likely a missing overflow:hidden on a container, or a fixed-width layout that does not account for the current viewport size.';
  }
  if (type === 'console_error') {
    return 'A JavaScript error was logged to the browser console — inspect the stack trace to identify the component and line.';
  }
  return 'Unknown cause — manual investigation required.';
}

// ── Fix approach mapping ──────────────────────────────────────────────────────

function inferFixApproach(type: IssueType, detail: string): string {
  if (type === 'react_crash' && detail.includes('Cannot read')) {
    return 'Add optional chaining (?.) or a null-check guard before accessing the property. Verify data is loaded before rendering the component.';
  }
  if (type === 'react_crash') {
    return 'Wrap the component in an error boundary, trace the stack trace in the console, and fix the root exception.';
  }
  if (type === 'blank_screen') {
    return 'Check browser console for errors. Verify the route is registered correctly. Ensure the component exports a default function and does not throw during render.';
  }
  if (type === 'stuck_loading') {
    return 'Add error handling to all async operations that drive loading state. Ensure the loading flag is always set to false in both success and error branches.';
  }
  if (type === 'network_error') {
    return 'Check the server route handler for the failing endpoint. Add proper error handling and return appropriate HTTP status codes.';
  }
  if (type === 'scroll_lock') {
    return 'In the modal/drawer close handler, ensure document.body.style.overflow is reset or the Radix/shadcn dialog cleanup runs correctly.';
  }
  if (type === 'clipped_ui') {
    return 'Add overflow-x-hidden to the relevant container, or use responsive Tailwind classes (max-w-full, w-full) to constrain the element to the viewport width.';
  }
  return 'Inspect the browser console and network tab for additional context, then trace to the responsible component.';
}

// ── Issue deduplication ───────────────────────────────────────────────────────

const seenSignatures = new Set<string>();

function dedupeKey(type: IssueType, detail: string): string {
  // Normalise the detail to remove runtime-specific noise (IDs, timestamps)
  const normalised = detail
    .replace(/[0-9a-f]{8}-[0-9a-f-]{23,}/gi, '<uuid>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, '<ts>')
    .replace(/\bhttps?:\/\/[^\s]+/g, '<url>')
    .slice(0, 200);
  return createHash('md5').update(`${type}:${normalised}`).digest('hex').slice(0, 12);
}

// ── Build reproduction steps ──────────────────────────────────────────────────

function buildReproductionSteps(result: RouteResult, issue: RawIssue): string[] {
  const steps: string[] = [
    `Open the Momentum app at ${result.viewport === 'mobile' ? 'mobile viewport (390×844)' : 'desktop viewport (1280×800)'}`,
    `Navigate to ${result.route.path} (${result.route.label})`,
  ];

  if (issue.type === 'scroll_lock') {
    steps.push('Open and then close any modal or drawer on the page');
    steps.push('Attempt to scroll the page');
  }
  if (issue.type === 'stuck_loading') {
    steps.push('Wait 5–10 seconds for the page to fully load');
    steps.push('Observe that a loading spinner remains visible');
  }
  if (issue.type === 'clipped_ui') {
    steps.push('Scroll horizontally or inspect the right edge of the viewport');
  }
  steps.push('Observe the issue described below');
  return steps;
}

// ── Normalise a single route result into QAIssues ────────────────────────────

export function normaliseIssues(results: RouteResult[]): QAIssue[] {
  const issues: QAIssue[] = [];

  for (const result of results) {
    if (result.status === 'skipped') continue;

    // Console errors
    for (const err of result.consoleErrors) {
      const raw: RawIssue = { type: 'console_error', detail: err };
      const key = dedupeKey('console_error', err);
      if (seenSignatures.has(key)) continue;
      seenSignatures.add(key);
      issues.push(buildIssue(result, raw, `Console error on ${result.route.label}`, key));
    }

    // Network errors
    for (const ne of result.networkErrors) {
      const detail = `${ne.method} ${ne.url} → status=${ne.status}`;
      const raw: RawIssue = { type: 'network_error', detail };
      const key = dedupeKey('network_error', detail);
      if (seenSignatures.has(key)) continue;
      seenSignatures.add(key);
      issues.push(buildIssue(result, raw, `Network error on ${result.route.label}`, key));
    }

    // Raw issues from checks
    for (const raw of result.rawIssues) {
      const key = dedupeKey(raw.type, raw.detail);
      if (seenSignatures.has(key)) continue;
      seenSignatures.add(key);
      const title = issueTitles[raw.type] + ` on ${result.route.label}`;
      issues.push(buildIssue(result, raw, title, key));
    }
  }

  // Sort: critical first, then high, medium, low
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

const issueTitles: Record<IssueType, string> = {
  console_error: 'Console error',
  network_error: 'Network request failure',
  blank_screen: 'Blank / empty screen',
  react_crash: 'React crash / unhandled error',
  stuck_loading: 'Stuck loading spinner',
  scroll_lock: 'Body scroll locked after modal close',
  route_failure: 'Route navigation failure',
  clipped_ui: 'Clipped or off-screen UI',
  modal_broken: 'Modal broken',
  tab_broken: 'Tab interaction broken',
  render_error: 'Render error',
};

function buildIssue(result: RouteResult, raw: RawIssue, title: string, id: string): QAIssue {
  const severity = classifySeverity(raw.type, raw.detail);
  const probableCause = inferProbableCause(raw.type, raw.detail, result.route.path);
  const recommendedFixApproach = inferFixApproach(raw.type, raw.detail);
  const reproductionSteps = buildReproductionSteps(result, raw);

  const issue: QAIssue = {
    id,
    issueTitle: title,
    severity,
    route: result.route.path,
    viewport: result.viewport,
    reproductionSteps,
    observedBehaviour: raw.detail + (raw.context ? `\n\nContext:\n${raw.context}` : ''),
    expectedBehaviour: expectedBehaviours[raw.type] ?? 'No errors or unexpected behaviour',
    consoleError: raw.type === 'console_error' ? raw.detail : undefined,
    networkError: raw.type === 'network_error' ? raw.detail : undefined,
    probableCause,
    recommendedFixApproach,
    replitPrompt: '',
    screenshotPath: result.screenshotPath,
    timestamp: new Date().toISOString(),
  };

  issue.replitPrompt = generateReplitPrompt(issue);
  return issue;
}

const expectedBehaviours: Record<IssueType, string> = {
  console_error: 'No errors in the browser console',
  network_error: 'All API and network requests return 2xx responses',
  blank_screen: 'The page renders meaningful content',
  react_crash: 'The page renders without any crash or error boundary message',
  stuck_loading: 'Loading state resolves within a few seconds',
  scroll_lock: 'The page remains scrollable after any modal or drawer is closed',
  route_failure: 'The route loads the expected page without redirecting',
  clipped_ui: 'All UI elements are fully visible within the viewport',
  modal_broken: 'Modals open and close without visual issues',
  tab_broken: 'Tabs switch content correctly without errors',
  render_error: 'The component renders without errors',
};
