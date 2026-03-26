import type { QAIssue } from './types';

/**
 * Generate a copy-pasteable Replit repair prompt for a single issue.
 */
export function generateReplitPrompt(issue: QAIssue): string {
  const viewport = issue.viewport === 'mobile' ? ' (mobile viewport)' : ' (desktop)';
  const consoleBlock = issue.consoleError
    ? `\n\nConsole error captured:\n\`\`\`\n${issue.consoleError}\n\`\`\``
    : '';
  const networkBlock = issue.networkError
    ? `\n\nNetwork error captured:\n\`\`\`\n${issue.networkError}\n\`\`\``
    : '';

  return `## Bug: ${issue.issueTitle}
**Severity:** ${issue.severity.toUpperCase()}
**Route:** \`${issue.route}\`${viewport}

**Observed behaviour:**
${issue.observedBehaviour}

**Expected behaviour:**
${issue.expectedBehaviour}${consoleBlock}${networkBlock}

**Probable cause:**
${issue.probableCause}

**Suggested fix approach:**
${issue.recommendedFixApproach}

**Reproduction steps:**
${issue.reproductionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---
Please inspect the component(s) responsible for the \`${issue.route}\` route in the Momentum codebase.
Look in \`client/src/pages/\` and \`client/src/components/\` for the relevant file.
Fix the root cause of this issue without breaking adjacent functionality.
If the fix involves a null/undefined guard, use optional chaining (\`?.\`) rather than explicit null checks where appropriate.
If the fix involves loading state, ensure the loading flag is reset in all code paths (success, error, and abort).
If you make assumptions about the correct behaviour, explain them before implementing.`;
}

/**
 * Generate a master repair prompt covering the top-priority issues.
 */
export function generateMasterRepairPrompt(issues: QAIssue[]): string {
  const critical = issues.filter(i => i.severity === 'critical');
  const high = issues.filter(i => i.severity === 'high');
  const topIssues = [...critical, ...high].slice(0, 5);

  if (topIssues.length === 0) {
    return 'No critical or high-severity issues were found in this QA sweep. Review the medium/low issues in the full report.';
  }

  const issueList = topIssues
    .map((issue, i) => `${i + 1}. **[${issue.severity.toUpperCase()}] ${issue.issueTitle}** — \`${issue.route}\`\n   ${issue.observedBehaviour.split('\n')[0].slice(0, 120)}`)
    .join('\n\n');

  const routeList = [...new Set(topIssues.map(i => i.route))].join(', ');

  return `## Momentum QA Master Repair Prompt

The automated QA sweep found **${issues.length} total issue(s)** — ${critical.length} critical and ${high.length} high severity.

### Top Priority Fixes Required

${issueList}

---

### Instructions for Replit

Please inspect the Momentum codebase and fix the issues above in priority order. Focus on these routes: \`${routeList}\`.

Key guidelines:
1. For **critical** issues (crashes, blank screens): fix immediately — these block users from using the app
2. For **high** issues (network errors, stuck loading, scroll locks): fix before the next deploy
3. Use optional chaining (\`?.\`) and null-coalescing (\`??\`) for null-safety fixes
4. Ensure loading states always resolve — add error handling to every \`try/catch\` block that drives a loading flag
5. After fixing, verify the fix does not break adjacent components or routes
6. Do not perform destructive changes (no schema changes, no data deletion)
7. Explain your reasoning for any non-obvious fix

Check the full JSON report at \`tests/qa/reports/\` for reproduction steps, console errors, and network errors for each issue.`;
}

/**
 * Extract the top 5 fix priorities as plain strings.
 */
export function extractTopFivePriorities(issues: QAIssue[]): string[] {
  return issues.slice(0, 5).map(
    (issue, i) => `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.issueTitle} (${issue.route})`,
  );
}
