import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import type { QAReport, QAIssue } from './types';

const REPORTS_DIR = join(process.cwd(), 'tests', 'qa', 'reports');

function ensureReportsDir() {
  mkdirSync(REPORTS_DIR, { recursive: true });
}

export function writeJsonReport(report: QAReport): string {
  ensureReportsDir();
  const fileName = `qa-report-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
  const filePath = join(REPORTS_DIR, fileName);
  writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}

export function writeMarkdownReport(report: QAReport): string {
  ensureReportsDir();
  const fileName = `qa-report-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.md`;
  const filePath = join(REPORTS_DIR, fileName);
  writeFileSync(filePath, buildMarkdown(report), 'utf-8');
  return filePath;
}

function severityEmoji(s: string): string {
  if (s === 'critical') return '🔴';
  if (s === 'high') return '🟠';
  if (s === 'medium') return '🟡';
  return '⚪';
}

function buildMarkdown(report: QAReport): string {
  const lines: string[] = [];

  lines.push(`# Momentum QA Report`);
  lines.push(`**Run at:** ${report.runAt}`);
  lines.push(`**App URL:** ${report.appUrl}`);
  lines.push(`**Authenticated:** ${report.authenticated ? 'Yes' : 'No (unauthenticated routes only)'}`);
  lines.push(`**Routes tested:** ${report.totalRoutesTested}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| 🔴 Critical | ${report.criticalCount} |`);
  lines.push(`| 🟠 High | ${report.highCount} |`);
  lines.push(`| 🟡 Medium | ${report.mediumCount} |`);
  lines.push(`| ⚪ Low | ${report.lowCount} |`);
  lines.push(`| **Total** | **${report.totalIssues}** |`);
  lines.push('');

  if (report.topFivePriorities.length > 0) {
    lines.push('## Top 5 Priorities');
    lines.push('');
    for (const p of report.topFivePriorities) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  lines.push('## Routes Tested');
  lines.push('');
  for (const r of report.routesTested) {
    lines.push(`- \`${r}\``);
  }
  lines.push('');

  if (report.issues.length === 0) {
    lines.push('## Issues');
    lines.push('');
    lines.push('✅ No issues found in this QA sweep.');
    lines.push('');
  } else {
    lines.push('## Issues');
    lines.push('');

    // Group by route
    const byRoute: Record<string, QAIssue[]> = {};
    for (const issue of report.issues) {
      if (!byRoute[issue.route]) byRoute[issue.route] = [];
      byRoute[issue.route].push(issue);
    }

    for (const [route, issues] of Object.entries(byRoute)) {
      lines.push(`### Route: \`${route}\``);
      lines.push('');
      for (const issue of issues) {
        lines.push(`#### ${severityEmoji(issue.severity)} ${issue.issueTitle}`);
        lines.push('');
        lines.push(`**Severity:** ${issue.severity.toUpperCase()}  `);
        lines.push(`**Viewport:** ${issue.viewport}  `);
        lines.push(`**Issue ID:** \`${issue.id}\``);
        lines.push('');
        lines.push('**Observed behaviour:**');
        lines.push('```');
        lines.push(issue.observedBehaviour.slice(0, 500));
        lines.push('```');
        lines.push('');
        lines.push(`**Expected behaviour:** ${issue.expectedBehaviour}`);
        lines.push('');
        if (issue.consoleError) {
          lines.push('**Console error:**');
          lines.push('```');
          lines.push(issue.consoleError.slice(0, 400));
          lines.push('```');
          lines.push('');
        }
        if (issue.networkError) {
          lines.push('**Network error:**');
          lines.push('```');
          lines.push(issue.networkError);
          lines.push('```');
          lines.push('');
        }
        lines.push(`**Probable cause:** ${issue.probableCause}`);
        lines.push('');
        lines.push(`**Fix approach:** ${issue.recommendedFixApproach}`);
        lines.push('');
        lines.push('**Reproduction steps:**');
        for (const step of issue.reproductionSteps) {
          lines.push(`  - ${step}`);
        }
        lines.push('');
        if (issue.screenshotPath) {
          lines.push(`**Screenshot:** \`${issue.screenshotPath}\``);
          lines.push('');
        }
        lines.push('<details>');
        lines.push('<summary>Replit Repair Prompt</summary>');
        lines.push('');
        lines.push('```');
        lines.push(issue.replitPrompt);
        lines.push('```');
        lines.push('');
        lines.push('</details>');
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }
  }

  lines.push('## Master Repair Prompt');
  lines.push('');
  lines.push(report.masterRepairPrompt);
  lines.push('');

  return lines.join('\n');
}
