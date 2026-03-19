import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { verifyFirebaseToken } from "./middleware/auth";
import crypto from "crypto";

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
