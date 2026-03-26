# Momentum QA Runner

An autonomous browser-based QA system that tests the app like a real user and produces structured bug reports plus copy-pasteable Replit repair prompts.

## What it does

- Launches a real Chromium browser (headless by default)
- Navigates all major routes at desktop (1280×800) and mobile (390×844) viewport sizes
- Waits for network idle before checking each page
- Detects and reports:
  - React crashes and unhandled errors
  - Blank / empty pages
  - Console errors (filtered for noise)
  - Failed network requests (4xx, 5xx, aborted)
  - Stuck loading spinners
  - Body scroll lock bugs after modal interactions
  - Clipped / off-screen UI elements
  - Route navigation failures
- Clicks through visible tabs and safe buttons
- Scrolls each page from top to bottom
- Deduplicates issues across routes
- Takes a screenshot of every tested route
- Writes a JSON report and a Markdown report with severity ratings and Replit repair prompts

---

## Setup

### 1. Install Playwright browsers

Run this once to download the Chromium browser binary:

```bash
npx playwright install chromium
```

### 2. Set environment variables (for authenticated testing)

Without credentials, the QA runner only tests unauthenticated public routes (login page etc.).
To test the full app, provide a Momentum account:

```bash
export QA_EMAIL="your-qa-account@example.com"
export QA_PASSWORD="your-password"
```

> **Tip:** Create a dedicated QA user account in Momentum with owner/admin role so all routes are accessible.

---

## Running the QA sweep

### Standard run (app must be running on port 5000)

```bash
npx tsx tests/qa/index.ts
```

### With credentials (full authenticated sweep)

```bash
QA_EMAIL=you@example.com QA_PASSWORD=secret npx tsx tests/qa/index.ts
```

### Against a deployed URL

```bash
QA_BASE_URL=https://momentum.battlescore.com.au QA_EMAIL=... QA_PASSWORD=... npx tsx tests/qa/index.ts
```

### Headful mode (watch the browser)

```bash
npx tsx tests/qa/index.ts --headful
```

### Skip specific routes

```bash
npx tsx tests/qa/index.ts --skip=/routes,/openclaw-setup,/admin/queue-health
```

---

## Output

Reports are written to `tests/qa/reports/`:

| File | Description |
|------|-------------|
| `qa-report-<timestamp>.json` | Full structured report — all issues, routes, metadata |
| `qa-report-<timestamp>.md` | Human-readable report with severity, reproduction steps, and repair prompts |

Screenshots are saved to `tests/qa/screenshots/`.

### Report structure (JSON)

```json
{
  "runAt": "26/03/2026 10:30:00",
  "appUrl": "http://localhost:5000",
  "authenticated": true,
  "totalRoutesTested": 28,
  "totalIssues": 3,
  "criticalCount": 1,
  "highCount": 1,
  "mediumCount": 1,
  "lowCount": 0,
  "routesTested": ["/dashboard", "/pipeline", ...],
  "issues": [
    {
      "id": "abc123",
      "issueTitle": "React crash on Execution Queue",
      "severity": "critical",
      "route": "/execution",
      "viewport": "desktop",
      "reproductionSteps": [...],
      "observedBehaviour": "...",
      "expectedBehaviour": "...",
      "consoleError": "...",
      "probableCause": "...",
      "recommendedFixApproach": "...",
      "replitPrompt": "## Bug: ...",
      "screenshotPath": "tests/qa/screenshots/..."
    }
  ],
  "topFivePriorities": [...],
  "masterRepairPrompt": "## Momentum QA Master Repair Prompt..."
}
```

---

## Issue severity guide

| Severity | Examples |
|----------|----------|
| 🔴 Critical | React crash, blank screen, page fails to render |
| 🟠 High | Network 5xx errors, stuck loading, scroll lock, route failure |
| 🟡 Medium | Network 4xx, console errors, clipped UI, tab issues |
| ⚪ Low | Minor console warnings, non-blocking visual glitches |

---

## Architecture

```
tests/qa/
  index.ts       Entry point — CLI, orchestration, report output
  runner.ts      Core Playwright loop — browser control, per-route execution
  routes.ts      All 30+ Momentum routes with auth/manager metadata
  auth.ts        Firebase email/password login via the login form
  checks.ts      Reusable check functions (blank, crash, loading, scroll, etc.)
  issues.ts      Issue normalisation, severity classification, deduplication
  prompts.ts     Replit repair prompt generation per issue + master prompt
  report.ts      JSON and Markdown report writers
  types.ts       TypeScript interfaces
  README.md      This file
  reports/       Generated reports (git-ignored)
  screenshots/   Route screenshots (git-ignored)
```

---

## Important notes

- **No destructive actions**: The runner never deletes records, submits production forms, or sends external communications.
- **Auth**: Uses the Momentum email/password login form. Google OAuth is not used (incompatible with headless browsers).
- **2FA**: If the QA account has 2FA enabled, the runner will report it cannot proceed. Use a QA account without 2FA.
- **Manager routes**: Visible only if the QA account has owner/admin role. A non-manager account will skip all manager-gated routes.
- **Deduplication**: The same error appearing on multiple routes is reported once with the first route it was seen on.
