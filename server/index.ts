import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { verifyFirebaseToken } from "./middleware/auth";
import crypto from "crypto";
import { isIntegrationConfigured } from "./integration/config";
import { syncAllOrgClients } from "./integration/sync";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── Generate internal scheduler key (in-memory, rotated on each restart) ──
  process.env.INTERNAL_SCHEDULER_KEY = crypto.randomBytes(24).toString('hex');

  // ── Phase 2: Firebase token verification on all /api/ routes ──────────────
  // Public paths and OpenClaw action routes are whitelisted inside the middleware.
  app.use('/api/', verifyFirebaseToken);

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      startBullpenScheduler(port);
      startPrepReadinessScheduler(port);
      startAutopilotScheduler(port);
      startSweepScheduler(port);
      startAISystemsSyncScheduler();
    },
  );
})();

// ── Bullpen Daily Scheduler ────────────────────────────────────────────────
// Runs every 30 minutes, fires the daily brief for orgs that are due.
function startBullpenScheduler(port: number) {
  const TZ_OFFSET_MS = 10 * 3600 * 1000; // AEST = UTC+10

  async function checkAndRun() {
    try {
      const { firestore } = await import('./firebase');
      if (!firestore) return;

      const orgsSnap = await firestore.collection('orgs').get();
      for (const orgDoc of orgsSnap.docs) {
        try {
          const schedSnap = await orgDoc.ref.collection('settings').doc('reviewSchedule').get();
          const sched = schedSnap.data();
          if (!sched?.enabled) continue;

          const dailyHour: number = typeof sched.dailyRunHour === 'number' ? sched.dailyRunHour : 8;
          const nowUtc = new Date();
          const localMs = nowUtc.getTime() + TZ_OFFSET_MS;
          const localDate = new Date(localMs);
          const localHour = localDate.getUTCHours();

          // Only fire during the target hour window
          if (localHour !== dailyHour) continue;

          // Skip if already ran today (in AEST)
          if (sched.lastRunAt) {
            const lastMs = new Date(sched.lastRunAt).getTime() + TZ_OFFSET_MS;
            const lastLocal = new Date(lastMs);
            if (
              lastLocal.getUTCFullYear() === localDate.getUTCFullYear() &&
              lastLocal.getUTCMonth() === localDate.getUTCMonth() &&
              lastLocal.getUTCDate() === localDate.getUTCDate()
            ) continue;
          }

          log(`[Scheduler] Running daily brief for org ${orgDoc.id}`, 'bullpen-scheduler');
          const resp = await fetch(`http://localhost:${port}/api/bullpen/daily-run`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-scheduler-key': process.env.INTERNAL_SCHEDULER_KEY || '',
            },
            body: JSON.stringify({ orgId: orgDoc.id, scheduled: true }),
          });
          if (!resp.ok) {
            const body = await resp.text();
            log(`[Scheduler] daily-run failed for ${orgDoc.id}: ${body}`, 'bullpen-scheduler');
          } else {
            log(`[Scheduler] daily brief complete for ${orgDoc.id}`, 'bullpen-scheduler');
          }
        } catch (orgErr: any) {
          log(`[Scheduler] error for org ${orgDoc.id}: ${orgErr.message}`, 'bullpen-scheduler');
        }
      }
    } catch (err: any) {
      log(`[Scheduler] top-level error: ${err.message}`, 'bullpen-scheduler');
    }
  }

  // Run every 30 minutes
  setInterval(checkAndRun, 30 * 60 * 1000);
  log('Bullpen daily scheduler started (30 min check interval)', 'bullpen-scheduler');
}

// ── Prep Readiness Scheduler ───────────────────────────────────────────────
// Fires prep readiness job for all orgs twice daily (6am and 2pm AEST).
// This ensures active leads are prepped before Nathan opens them.
function startPrepReadinessScheduler(port: number) {
  const TZ_OFFSET_MS = 10 * 3600 * 1000; // AEST = UTC+10
  const RUN_HOURS = [6, 14]; // 6am and 2pm AEST

  async function checkAndRun() {
    try {
      const { firestore } = await import('./firebase');
      if (!firestore) return;

      const nowUtc = new Date();
      const localMs = nowUtc.getTime() + TZ_OFFSET_MS;
      const localDate = new Date(localMs);
      const localHour = localDate.getUTCHours();

      if (!RUN_HOURS.includes(localHour)) return;

      const orgsSnap = await firestore.collection('orgs').get();
      for (const orgDoc of orgsSnap.docs) {
        try {
          // Check last run — skip if ran in this same hour window
          const statusSnap = await orgDoc.ref.collection('settings').doc('prepReadiness').get();
          const status = statusSnap.data();
          if (status?.startedAt) {
            const lastMs = new Date(status.startedAt).getTime() + TZ_OFFSET_MS;
            const lastLocal = new Date(lastMs);
            // Skip if ran in the same hour today
            if (
              lastLocal.getUTCFullYear() === localDate.getUTCFullYear() &&
              lastLocal.getUTCMonth() === localDate.getUTCMonth() &&
              lastLocal.getUTCDate() === localDate.getUTCDate() &&
              lastLocal.getUTCHours() === localHour
            ) continue;
          }

          log(`[PrepScheduler] Starting prep readiness for org ${orgDoc.id}`, 'prep-scheduler');
          const resp = await fetch(`http://localhost:${port}/api/orgs/${orgDoc.id}/prep-readiness/run`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-scheduler-key': process.env.INTERNAL_SCHEDULER_KEY || '',
            },
            body: JSON.stringify({ batchSize: 25 }),
          });
          if (!resp.ok) {
            const body = await resp.text();
            log(`[PrepScheduler] run failed for ${orgDoc.id}: ${body}`, 'prep-scheduler');
          } else {
            log(`[PrepScheduler] prep readiness started for ${orgDoc.id}`, 'prep-scheduler');
          }
        } catch (orgErr: any) {
          log(`[PrepScheduler] error for org ${orgDoc.id}: ${orgErr.message}`, 'prep-scheduler');
        }
      }
    } catch (err: any) {
      log(`[PrepScheduler] top-level error: ${err.message}`, 'prep-scheduler');
    }
  }

  // Check every 30 minutes (same interval as bullpen scheduler)
  setInterval(checkAndRun, 30 * 60 * 1000);
  log('Prep readiness scheduler started (fires at 6am and 2pm AEST)', 'prep-scheduler');
}

// ── Sweep Runner Scheduler ────────────────────────────────────────────────────
// Checks every 30 minutes. Fires per-org based on org sweep schedule settings.
// Modes: every_hour | twice_daily | daily_morning | manual | disabled
function startSweepScheduler(port: number) {
  const TZ_OFFSET_MS = 10 * 3600 * 1000; // AEST = UTC+10
  const TWICE_DAILY_HOURS = [6, 14];

  async function checkAndRun() {
    try {
      const { firestore } = await import('./firebase');
      if (!firestore) return;

      const nowUtc = new Date();
      const localMs = nowUtc.getTime() + TZ_OFFSET_MS;
      const localDate = new Date(localMs);
      const localHour = localDate.getUTCHours();
      const localDay = localDate.getUTCDay(); // 0=Sun, 6=Sat

      const orgsSnap = await firestore.collection('orgs').get();
      for (const orgDoc of orgsSnap.docs) {
        try {
          const schedSnap = await orgDoc.ref.collection('settings').doc('sweepSchedule').get();
          const sched = schedSnap.exists ? schedSnap.data()! : { mode: 'manual' };
          const mode = sched.mode ?? 'manual';

          if (mode === 'disabled' || mode === 'manual') continue;

          const weekdaysOnly = sched.weekdaysOnly ?? true;
          if (weekdaysOnly && (localDay === 0 || localDay === 6)) continue;

          // Parse last run
          const lastRunAt = sched.lastRunAt ? new Date(sched.lastRunAt) : null;
          const lastRunMs = lastRunAt ? lastRunAt.getTime() + TZ_OFFSET_MS : 0;
          const lastRunLocal = new Date(lastRunMs);

          let shouldRun = false;

          if (mode === 'every_hour') {
            // Run if not run in the last 55 minutes (buffer for timing drift)
            const minutesSinceRun = lastRunAt ? (Date.now() - lastRunAt.getTime()) / 60_000 : 9999;
            shouldRun = minutesSinceRun >= 55;

          } else if (mode === 'twice_daily') {
            if (!TWICE_DAILY_HOURS.includes(localHour)) continue;
            shouldRun = !(
              lastRunLocal.getUTCFullYear() === localDate.getUTCFullYear() &&
              lastRunLocal.getUTCMonth() === localDate.getUTCMonth() &&
              lastRunLocal.getUTCDate() === localDate.getUTCDate() &&
              lastRunLocal.getUTCHours() === localHour
            );

          } else if (mode === 'daily_morning') {
            const dailyHour = typeof sched.dailyHour === 'number' ? sched.dailyHour : 8;
            if (localHour !== dailyHour) continue;
            shouldRun = !(
              lastRunLocal.getUTCFullYear() === localDate.getUTCFullYear() &&
              lastRunLocal.getUTCMonth() === localDate.getUTCMonth() &&
              lastRunLocal.getUTCDate() === localDate.getUTCDate()
            );
          }

          if (!shouldRun) continue;

          log(`[SweepScheduler] Running sweep for org ${orgDoc.id} (mode: ${mode})`, 'sweep');
          const resp = await fetch(`http://localhost:${port}/api/sweeps/run-internal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-scheduler-key': process.env.INTERNAL_SCHEDULER_KEY || '',
            },
            body: JSON.stringify({ orgId: orgDoc.id }),
          });
          if (!resp.ok) {
            const body = await resp.text();
            log(`[SweepScheduler] sweep failed for ${orgDoc.id}: ${body}`, 'sweep');
          } else {
            const data = await resp.json();
            const r = data.record;
            log(`[SweepScheduler] sweep complete for ${orgDoc.id} — candidates=${r?.candidateCount ?? 0} actions=${r?.actionCreatedCount ?? 0} approvals=${r?.approvalRequestedCount ?? 0} suppressed=${r?.suppressedDupeCount ?? 0} ${r?.durationMs ?? 0}ms`, 'sweep');
            // Run autopilot execution after each sweep to process auto_created actions
            try {
              const execResp = await fetch(`http://localhost:${port}/api/internal/orgs/${orgDoc.id}/autopilot/exec/run`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
              });
              if (execResp.ok) {
                const execData = await execResp.json();
                const s = execData.summary;
                log(`[ExecRunner] org=${orgDoc.id} — succeeded=${s?.jobsSucceeded ?? 0} failed=${s?.jobsFailed ?? 0} suppressed=${s?.jobsSuppressed ?? 0} ${s?.durationMs ?? 0}ms`, 'sweep');
              }
            } catch (execErr: any) {
              log(`[ExecRunner] error for org ${orgDoc.id}: ${execErr.message}`, 'sweep');
            }
          }
        } catch (orgErr: any) {
          log(`[SweepScheduler] error for org ${orgDoc.id}: ${orgErr.message}`, 'sweep');
        }
      }
    } catch (err: any) {
      log(`[SweepScheduler] top-level error: ${err.message}`, 'sweep');
    }
  }

  setInterval(checkAndRun, 30 * 60 * 1000);
  log('Sweep scheduler started (30 min check interval)', 'sweep');
}

// ── Autopilot Orchestrator Scheduler ──────────────────────────────────────────
// Runs every 5 minutes. Hits POST /api/agent/autopilot-scan internally.
// Respects AUTOPILOT_ENABLE env flag — off by default in dev.
function startAutopilotScheduler(port: number) {
  if (process.env.AUTOPILOT_ENABLE === 'false' || !process.env.AUTOPILOT_ENABLE) {
    log('Autopilot scheduler disabled (set AUTOPILOT_ENABLE=true to enable)', 'autopilot');
    return;
  }

  const INTERVAL_MS = 5 * 60 * 1000; // 5 min

  async function runScan() {
    try {
      const url = `http://localhost:${port}/api/agent/autopilot-scan`;
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'x-scheduler-key': process.env.INTERNAL_SCHEDULER_KEY || '',
        },
        body: JSON.stringify({ reason: 'scheduled-scan' }),
      });
      const body = await res.text();
      if (!res.ok) {
        log(`[AutopilotScheduler] scan failed (${res.status}): ${body}`, 'autopilot');
      } else {
        const data = JSON.parse(body);
        const s = data.scan;
        log(`[AutopilotScheduler] scan complete — enqueued=${s?.enqueuedJobs ?? 0} ttlSkipped=${s?.skippedTtl ?? 0} entities=${s?.scannedEntities ?? 0} ms=${s?.durationMs ?? 0}`, 'autopilot');
      }
    } catch (err: any) {
      log(`[AutopilotScheduler] error: ${err.message}`, 'autopilot');
    }
  }

  // Run once at startup (after a short delay for routes to settle)
  setTimeout(runScan, 30_000);
  setInterval(runScan, INTERVAL_MS);
  log(`Autopilot orchestrator started (every ${INTERVAL_MS / 60000} min)`, 'autopilot');
}

// ── AI Systems Delivery Summary Sync Scheduler ─────────────────────────────
// Runs every 4 hours. Sweeps all orgs and syncs delivery summaries from AI Systems.
// Graceful — skips orgs / clients that are not yet provisioned.
function startAISystemsSyncScheduler() {

  const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

  async function runSync() {
    if (!isIntegrationConfigured()) {
      log('[AISyncScheduler] Integration not configured — skipping scheduled sync', 'ai-sync');
      return;
    }
    const { firestore } = await import('./firebase');
    if (!firestore) {
      log('[AISyncScheduler] Firestore not ready — skipping', 'ai-sync');
      return;
    }
    try {
      const orgsSnap = await firestore.collection('orgs').get();
      log(`[AISyncScheduler] Syncing ${orgsSnap.size} org(s)`, 'ai-sync');
      for (const orgDoc of orgsSnap.docs) {
        try {
          const result = await syncAllOrgClients({ db: firestore, orgId: orgDoc.id, triggeredBy: 'scheduler' });
          const r = result.run;
          log(
            `[AISyncScheduler] org=${orgDoc.id} attempted=${r.clientsAttempted} ok=${r.clientsSucceeded} failed=${r.clientsFailed} skipped=${r.clientsSkipped}`,
            'ai-sync'
          );
        } catch (orgErr: any) {
          log(`[AISyncScheduler] org=${orgDoc.id} error: ${orgErr.message}`, 'ai-sync');
        }
      }
    } catch (err: any) {
      log(`[AISyncScheduler] top-level error: ${err.message}`, 'ai-sync');
    }
  }

  // First run 2 minutes after startup (give everything time to settle)
  setTimeout(runSync, 2 * 60 * 1000);
  setInterval(runSync, INTERVAL_MS);
  log('AI Systems sync scheduler started (every 4 hours)', 'ai-sync');
}
