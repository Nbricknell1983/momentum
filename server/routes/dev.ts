/**
 * Dev-only routes — never loaded in production.
 *
 * Mounted at /__dev/ only when NODE_ENV !== 'production'.
 *
 * Routes:
 *   GET  /__dev/outbox          — last 20 outbound email/SMS messages
 *   POST /__dev/outbox          — add a message to the outbox (for testing)
 *   DELETE /__dev/outbox        — clear the outbox
 *   GET  /__dev/health          — simple liveness ping
 */

import { Router } from 'express';

const router = Router();

// In-memory outbox (per process lifetime)
type OutboxEntry = {
  id: string;
  channel: 'email' | 'sms' | 'call' | 'voicemail';
  to: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
  sentAt: string;
};

const _outbox: OutboxEntry[] = [];
let _counter = 0;

export function devOutboxPush(entry: Omit<OutboxEntry, 'id' | 'sentAt'>): OutboxEntry {
  _counter++;
  const full: OutboxEntry = {
    ...entry,
    id: `dev-msg-${_counter}`,
    sentAt: new Date().toISOString(),
  };
  _outbox.unshift(full);
  if (_outbox.length > 100) _outbox.splice(100);
  return full;
}

// GET /__dev/outbox
router.get('/outbox', (_req, res) => {
  res.json({ count: _outbox.length, messages: _outbox.slice(0, 20) });
});

// POST /__dev/outbox
router.post('/outbox', (req: any, res: any) => {
  const { channel, to, subject, body, metadata } = req.body ?? {};
  if (!channel || !to || !body) {
    return res.status(400).json({ error: 'channel, to, and body are required' });
  }
  const entry = devOutboxPush({ channel, to, subject, body, metadata });
  res.status(201).json(entry);
});

// DELETE /__dev/outbox
router.delete('/outbox', (_req, res) => {
  _outbox.splice(0);
  _counter = 0;
  res.json({ ok: true });
});

// GET /__dev/health
router.get('/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV, time: new Date().toISOString() });
});

export default router;
