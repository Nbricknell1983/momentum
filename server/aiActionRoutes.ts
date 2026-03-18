/**
 * OpenClaw Action Layer
 * Secure API endpoints for AI orchestration. Momentum is the authority.
 * OpenClaw can ONLY call these endpoints — no direct access to Firestore, Twilio, or secrets.
 */

import type { Express, Request, Response, NextFunction } from "express";
import OpenAI from "openai";
import { firestore } from "./firebase";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Valid stage transitions ───────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  suspect:       ['contacted', 'nurture', 'lost'],
  contacted:     ['engaged', 'suspect', 'nurture', 'lost'],
  engaged:       ['qualified', 'contacted', 'nurture', 'lost'],
  qualified:     ['discovery', 'engaged', 'nurture', 'lost'],
  discovery:     ['proposal', 'qualified', 'nurture', 'lost'],
  proposal:      ['verbal_commit', 'discovery', 'nurture', 'lost'],
  verbal_commit: ['won', 'proposal', 'lost'],
  won:           [],
  lost:          ['suspect', 'nurture'],
  nurture:       ['suspect', 'contacted'],
};

const ALL_STAGES = Object.keys(VALID_TRANSITIONS);

// ─── Auth middleware ────────────────────────────────────────────────────────
function openclawAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = process.env.OPENCLAW_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'OpenClaw integration not configured',
      hint: 'Set OPENCLAW_API_KEY environment secret',
    });
  }
  const provided = req.headers['x-openclaw-key'] as string | undefined;
  if (!provided || provided !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing x-openclaw-key header' });
  }
  next();
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function requireFirestore(res: Response): boolean {
  if (!firestore) {
    res.status(503).json({ error: 'Firestore unavailable' });
    return false;
  }
  return true;
}

// ─── Bullpen comms: log OpenClaw actions as team messages ──────────────────
const CLAW_AGENT_VOICE: Record<string, string> = {
  'move-lead-stage':           'Sales',
  'create-task':               'Strategy',
  'log-call-outcome':          'Sales',
  'draft-followup':            'Sales',
  'send-approved-sms':         'Sales',
  'send-approved-email':       'Sales',
  'request-appointment-slot':  'Sales',
  'suspects-needing-followup': 'Sales',
  'next-best-action':          'Strategist',
};

async function writeBullpenComm(orgId: string, actionType: string, message: string) {
  if (!firestore || !orgId) return;
  const from = CLAW_AGENT_VOICE[actionType] || 'Ops';
  try {
    await firestore
      .collection('orgs').doc(orgId)
      .collection('bullpenComms')
      .add({
        from,
        message,
        actionType,
        source: 'openclaw',
        createdAt: new Date(),
      });
  } catch (e) {
    console.error('[bullpenComms] write failed:', e);
  }
}

async function writeAuditLog(orgId: string, action: string, payload: object, result: object) {
  if (!firestore) return;
  try {
    await firestore
      .collection('orgs').doc(orgId)
      .collection('aiAuditLog')
      .add({
        action,
        payload,
        result,
        orchestrator: 'openclaw',
        timestamp: new Date().toISOString(),
        createdAt: new Date(),
      });
  } catch (e) {
    console.error('[aiAuditLog] write failed:', e);
  }
}

// Business rule: check DNC + archived
function checkDNC(lead: any): { blocked: boolean; reason?: string } {
  if (lead.archived) return { blocked: true, reason: 'Lead is archived' };
  if (lead.doNotContact) return { blocked: true, reason: 'Lead is marked Do Not Contact' };
  if (lead.stage === 'won') return { blocked: false }; // won leads can still be contacted
  return { blocked: false };
}

// Business rule: contact frequency (no contact within 24h unless overridden)
function checkFrequency(lead: any, override = false): { blocked: boolean; reason?: string; lastContactedAt?: string } {
  if (override) return { blocked: false };
  const last = lead.lastActivityAt || lead.lastContactDate;
  if (!last) return { blocked: false };
  const ms = Date.now() - new Date(last.toDate ? last.toDate() : last).getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) {
    return {
      blocked: true,
      reason: `Last contacted ${hours.toFixed(1)}h ago — 24h cooldown applies`,
      lastContactedAt: new Date(last.toDate ? last.toDate() : last).toISOString(),
    };
  }
  return { blocked: false };
}

// Compute urgency score for a lead (higher = more urgent)
function urgencyScore(lead: any): number {
  let score = 0;
  const now = Date.now();

  // Overdue follow-up
  if (lead.nextContactDate) {
    const ncd = new Date(lead.nextContactDate.toDate ? lead.nextContactDate.toDate() : lead.nextContactDate);
    const overdueDays = (now - ncd.getTime()) / (1000 * 60 * 60 * 24);
    if (overdueDays > 0) score += Math.min(overdueDays * 10, 50);
  }

  // Active nurture
  if (lead.nurtureMode === 'active') score += 20;
  if (lead.nurtureMode === 'passive') score += 5;

  // Stage weight (further in pipeline = higher priority)
  const stageWeights: Record<string, number> = {
    verbal_commit: 40, proposal: 35, discovery: 30, qualified: 25,
    engaged: 20, contacted: 10, suspect: 5, nurture: 8, lost: 0, won: 0,
  };
  score += stageWeights[lead.stage] || 0;

  // No recent activity
  const lastActivity = lead.lastActivityAt || lead.lastContactDate;
  if (lastActivity) {
    const daysSince = (now - new Date(lastActivity.toDate ? lastActivity.toDate() : lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) score += 15;
    if (daysSince > 14) score += 10;
  } else {
    score += 20; // Never contacted
  }

  return Math.round(score);
}

// Safe date serialiser for Firestore timestamps
function safeDate(v: any): string | null {
  if (!v) return null;
  try { return new Date(v.toDate ? v.toDate() : v).toISOString(); } catch { return null; }
}

function summariseLead(id: string, lead: any) {
  return {
    id,
    companyName: lead.companyName,
    contactName: lead.contactName || null,
    phone: lead.phone || null,
    email: lead.email || null,
    stage: lead.stage,
    nurtureMode: lead.nurtureMode || 'none',
    nextContactDate: safeDate(lead.nextContactDate),
    lastContactDate: safeDate(lead.lastContactDate),
    lastActivityAt: safeDate(lead.lastActivityAt),
    urgencyScore: urgencyScore(lead),
    trafficLightStatus: lead.trafficLightStatus || null,
    archived: !!lead.archived,
    doNotContact: !!lead.doNotContact,
  };
}

// ─── Route registration ─────────────────────────────────────────────────────
export function registerAiActionRoutes(app: Express) {

  // ── GET /api/ai/suspects-needing-followup ──────────────────────────────
  app.get('/api/ai/suspects-needing-followup', openclawAuth, async (req, res) => {
    const orgId = req.query.orgId as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const stage = req.query.stage as string | undefined;

    if (!orgId) return res.status(400).json({ error: 'orgId query param required' });
    if (!requireFirestore(res)) return;

    try {
      let query = firestore!.collection(`orgs/${orgId}/leads`).where('archived', '!=', true);
      const snap = await query.get();

      const now = Date.now();
      const leads: any[] = [];

      snap.forEach(doc => {
        const lead = doc.data();
        if (lead.doNotContact) return;
        if (lead.stage === 'won') return;
        if (stage && lead.stage !== stage) return;

        // Include leads that need follow-up
        const ncd = lead.nextContactDate
          ? new Date(lead.nextContactDate.toDate ? lead.nextContactDate.toDate() : lead.nextContactDate)
          : null;
        const isOverdue = ncd && ncd.getTime() <= now;
        const neverContacted = !lead.lastActivityAt && !lead.lastContactDate;
        const inNurture = lead.nurtureMode && lead.nurtureMode !== 'none';

        if (isOverdue || neverContacted || inNurture) {
          leads.push({ id: doc.id, ...summariseLead(doc.id, lead) });
        }
      });

      // Sort by urgency descending
      leads.sort((a, b) => b.urgencyScore - a.urgencyScore);
      const result = leads.slice(0, limit);

      await writeAuditLog(orgId, 'suspects-needing-followup', { limit, stage }, { count: result.length });
      res.json({ success: true, count: result.length, leads: result });
    } catch (err: any) {
      console.error('[openclaw] suspects-needing-followup:', err);
      res.status(500).json({ error: 'Failed to fetch suspects', details: err.message });
    }
  });

  // ── GET /api/ai/next-best-action ─────────────────────────────────────────
  app.get('/api/ai/next-best-action', openclawAuth, async (req, res) => {
    const orgId = req.query.orgId as string;
    const leadId = req.query.leadId as string | undefined;
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    if (!requireFirestore(res)) return;

    try {
      if (leadId) {
        const doc = await firestore!.collection(`orgs/${orgId}/leads`).doc(leadId).get();
        if (!doc.exists) return res.status(404).json({ error: 'Lead not found' });
        const lead = doc.data()!;
        const dnc = checkDNC(lead);
        if (dnc.blocked) return res.json({ success: true, leadId, blocked: true, reason: dnc.reason, action: null });

        const action = deriveNextBestAction(leadId, lead);
        await writeAuditLog(orgId, 'next-best-action', { leadId }, { action });
        return res.json({ success: true, leadId, companyName: lead.companyName, action });
      }

      // Queue mode — return top 5 most urgent
      const snap = await firestore!.collection(`orgs/${orgId}/leads`).where('archived', '!=', true).get();
      const queue: any[] = [];
      snap.forEach(doc => {
        const lead = doc.data();
        if (lead.doNotContact || lead.stage === 'won') return;
        const action = deriveNextBestAction(doc.id, lead);
        if (action) queue.push({ id: doc.id, companyName: lead.companyName, stage: lead.stage, urgencyScore: urgencyScore(lead), action });
      });
      queue.sort((a, b) => b.urgencyScore - a.urgencyScore);
      const top = queue.slice(0, 5);

      await writeAuditLog(orgId, 'next-best-action-queue', {}, { count: top.length });
      res.json({ success: true, queue: top });
    } catch (err: any) {
      console.error('[openclaw] next-best-action:', err);
      res.status(500).json({ error: 'Failed to compute next best action', details: err.message });
    }
  });

  function deriveNextBestAction(leadId: string, lead: any): object | null {
    const now = Date.now();
    const ncd = lead.nextContactDate
      ? new Date(lead.nextContactDate.toDate ? lead.nextContactDate.toDate() : lead.nextContactDate)
      : null;
    const isOverdue = ncd && ncd.getTime() <= now;
    const neverContacted = !lead.lastActivityAt && !lead.lastContactDate;
    const stage = lead.stage || 'suspect';

    const actionMap: Record<string, { type: string; channel: string; objective: string }> = {
      suspect:       { type: 'outreach', channel: 'call', objective: 'First touch — qualify interest and book discovery' },
      contacted:     { type: 'follow_up', channel: 'call', objective: 'Follow up on first contact — build rapport' },
      engaged:       { type: 'follow_up', channel: 'call', objective: 'Progress to discovery — uncover pain points' },
      qualified:     { type: 'meeting', channel: 'call', objective: 'Book discovery meeting — needs analysis' },
      discovery:     { type: 'proposal', channel: 'email', objective: 'Send proposal — address identified needs' },
      proposal:      { type: 'follow_up', channel: 'call', objective: 'Follow up on proposal — handle objections' },
      verbal_commit: { type: 'close', channel: 'call', objective: 'Confirm commitment — finalise agreement' },
      nurture:       { type: 'nurture_touch', channel: 'sms', objective: 'Maintain relationship — re-engage when ready' },
      lost:          { type: 're_engage', channel: 'email', objective: 'Re-engagement after loss — changed circumstances check' },
      won:           { type: 'none', channel: 'none', objective: 'No action needed — client is won' },
    };

    const base = actionMap[stage] || actionMap.suspect;
    return {
      ...base,
      leadId,
      overdue: !!isOverdue,
      overdueByDays: isOverdue ? Math.round((now - ncd!.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      neverContacted,
      suggestedAt: new Date().toISOString(),
    };
  }

  // ── POST /api/ai/draft-followup ──────────────────────────────────────────
  app.post('/api/ai/draft-followup', openclawAuth, async (req, res) => {
    const { orgId, leadId, channel, objective } = req.body;
    if (!orgId || !leadId || !channel || !objective) {
      return res.status(400).json({ error: 'orgId, leadId, channel, objective required' });
    }
    if (!['call', 'sms', 'email'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be call, sms, or email' });
    }
    if (!requireFirestore(res)) return;

    try {
      const doc = await firestore!.collection(`orgs/${orgId}/leads`).doc(leadId).get();
      if (!doc.exists) return res.status(404).json({ error: 'Lead not found' });
      const lead = doc.data()!;

      const dnc = checkDNC(lead);
      if (dnc.blocked) return res.status(403).json({ error: dnc.reason, blocked: true });

      const si = lead.strategyIntelligence || {};
      const sd = lead.sourceData || {};

      const channelGuide: Record<string, string> = {
        call: 'Write a 30-second call opener. Be conversational, use the contact name, reference something specific about their business. End with a soft question.',
        sms: 'Write a 160-character max SMS. Personalised, casual, clear call to action. No spam words.',
        email: 'Write a short email (subject + 3-sentence body). Subject line max 50 chars. Body: personalised hook, one value statement, one CTA.',
      };

      const prompt = `You are a senior sales assistant. Draft a ${channel} follow-up for this prospect.

Business: ${lead.companyName}
Contact: ${lead.contactName || 'the owner'}
Stage: ${lead.stage}
Industry: ${lead.industry || sd.category || 'unknown'}
Location: ${lead.address || si.targetLocations || 'unknown'}
Notes: ${lead.notes || 'none'}
Objective: ${objective}

${channelGuide[channel]}

Return JSON with exactly these fields:
{
  "draft": "the full draft text",
  "subject": "email subject line (or null for call/sms)",
  "wordCount": number,
  "tone": "professional|casual|urgent",
  "warnings": []
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 600,
      });

      const parsed = JSON.parse(completion.choices[0].message.content || '{}');
      const result = {
        leadId,
        companyName: lead.companyName,
        channel,
        objective,
        draft: parsed.draft || '',
        subject: parsed.subject || null,
        wordCount: parsed.wordCount || 0,
        tone: parsed.tone || 'professional',
        warnings: parsed.warnings || [],
        generatedAt: new Date().toISOString(),
        simulate: true,
        note: 'Draft only — no message sent. Submit to /api/ai/send-approved-sms or /api/ai/send-approved-email to send.',
      };

      await writeAuditLog(orgId, 'draft-followup', { leadId, channel, objective }, { wordCount: result.wordCount });
      await writeBullpenComm(orgId, 'draft-followup', `Drafted ${channel} follow-up for ${lead.companyName}. Objective: ${objective}. ${result.wordCount} words — awaiting approval before send.`);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[openclaw] draft-followup:', err);
      res.status(500).json({ error: 'Failed to draft follow-up', details: err.message });
    }
  });

  // ── POST /api/ai/create-task ─────────────────────────────────────────────
  app.post('/api/ai/create-task', openclawAuth, async (req, res) => {
    const { orgId, leadId, taskType, notes, dueDate } = req.body;
    if (!orgId || !leadId || !taskType) {
      return res.status(400).json({ error: 'orgId, leadId, taskType required' });
    }
    const validTaskTypes = ['prospecting', 'follow_up', 'meeting', 'delivery', 'renewal', 'upsell', 'referral', 'admin', 'check_in'];
    if (!validTaskTypes.includes(taskType)) {
      return res.status(400).json({ error: `taskType must be one of: ${validTaskTypes.join(', ')}` });
    }
    if (!requireFirestore(res)) return;

    try {
      const leadDoc = await firestore!.collection(`orgs/${orgId}/leads`).doc(leadId).get();
      if (!leadDoc.exists) return res.status(404).json({ error: 'Lead not found' });
      const lead = leadDoc.data()!;

      const task = {
        leadId,
        companyName: lead.companyName,
        taskType,
        notes: notes || '',
        dueDate: dueDate || null,
        status: 'pending',
        createdBy: 'openclaw',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const taskRef = await firestore!
        .collection('orgs').doc(orgId)
        .collection('tasks')
        .add(task);

      const created = { id: taskRef.id, ...task, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() };
      await writeAuditLog(orgId, 'create-task', { leadId, taskType, dueDate }, { taskId: taskRef.id });
      await writeBullpenComm(orgId, 'create-task', `Created task for ${lead.companyName}: ${taskType.replace(/_/g, ' ')}${dueDate ? ` — due ${dueDate}` : ''}. Queued in action feed.`);
      res.status(201).json({ success: true, task: created });
    } catch (err: any) {
      console.error('[openclaw] create-task:', err);
      res.status(500).json({ error: 'Failed to create task', details: err.message });
    }
  });

  // ── POST /api/ai/log-call-outcome ────────────────────────────────────────
  app.post('/api/ai/log-call-outcome', openclawAuth, async (req, res) => {
    const { orgId, leadId, outcome, notes, nextStep, nextContactDate } = req.body;
    if (!orgId || !leadId || !outcome) {
      return res.status(400).json({ error: 'orgId, leadId, outcome required' });
    }
    const validOutcomes = ['connected', 'left_voicemail', 'no_answer', 'not_interested', 'callback_requested', 'meeting_booked', 'proposal_discussed'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: `outcome must be one of: ${validOutcomes.join(', ')}` });
    }
    if (!requireFirestore(res)) return;

    try {
      const leadRef = firestore!.collection(`orgs/${orgId}/leads`).doc(leadId);
      const leadDoc = await leadRef.get();
      if (!leadDoc.exists) return res.status(404).json({ error: 'Lead not found' });

      const now = new Date();
      const activity = {
        leadId,
        type: 'call',
        outcome,
        notes: notes || '',
        nextStep: nextStep || '',
        createdBy: 'openclaw',
        createdAt: now,
      };

      // Write activity sub-collection entry
      const actRef = await leadRef.collection('activities').add(activity);

      // Update lead
      const leadUpdate: any = {
        lastActivityAt: now,
        lastContactDate: now,
        updatedAt: now,
      };
      if (nextContactDate) {
        leadUpdate.nextContactDate = new Date(nextContactDate);
        leadUpdate.nextContactSource = 'ai';
      }

      await leadRef.update(leadUpdate);

      const result = {
        activityId: actRef.id,
        leadId,
        outcome,
        loggedAt: now.toISOString(),
        nextContactDate: nextContactDate || null,
      };

      await writeAuditLog(orgId, 'log-call-outcome', { leadId, outcome, nextContactDate }, result);
      await writeBullpenComm(orgId, 'log-call-outcome', `Logged call outcome for ${leadDoc.data()?.companyName || leadId}: ${outcome.replace(/_/g, ' ')}.${nextContactDate ? ` Next contact scheduled.` : ''}`);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[openclaw] log-call-outcome:', err);
      res.status(500).json({ error: 'Failed to log call outcome', details: err.message });
    }
  });

  // ── POST /api/ai/move-lead-stage ─────────────────────────────────────────
  app.post('/api/ai/move-lead-stage', openclawAuth, async (req, res) => {
    const { orgId, leadId, newStage, reason } = req.body;
    if (!orgId || !leadId || !newStage) {
      return res.status(400).json({ error: 'orgId, leadId, newStage required' });
    }
    if (!ALL_STAGES.includes(newStage)) {
      return res.status(400).json({ error: `newStage must be one of: ${ALL_STAGES.join(', ')}` });
    }
    if (!requireFirestore(res)) return;

    try {
      const leadRef = firestore!.collection(`orgs/${orgId}/leads`).doc(leadId);
      const leadDoc = await leadRef.get();
      if (!leadDoc.exists) return res.status(404).json({ error: 'Lead not found' });
      const lead = leadDoc.data()!;
      const currentStage = lead.stage;

      if (currentStage === newStage) {
        return res.json({ success: true, leadId, currentStage, newStage, changed: false, message: 'Already in that stage' });
      }

      const allowed = VALID_TRANSITIONS[currentStage] || [];
      if (!allowed.includes(newStage)) {
        return res.status(422).json({
          error: 'Invalid stage transition',
          currentStage,
          newStage,
          allowedTransitions: allowed,
          validation: 'REJECTED',
        });
      }

      const now = new Date();
      await leadRef.update({ stage: newStage, updatedAt: now });

      // Log stage change activity
      await leadRef.collection('activities').add({
        leadId, type: 'stage_change',
        fromStage: currentStage, toStage: newStage,
        reason: reason || 'OpenClaw orchestration',
        createdBy: 'openclaw', createdAt: now,
      });

      const result = {
        leadId, companyName: lead.companyName,
        previousStage: currentStage, newStage,
        changed: true, validation: 'APPROVED',
        reason: reason || null, changedAt: now.toISOString(),
      };

      await writeAuditLog(orgId, 'move-lead-stage', { leadId, currentStage, newStage, reason }, result);
      await writeBullpenComm(orgId, 'move-lead-stage', `Moved ${lead.companyName} from ${currentStage} → ${newStage}.${reason ? ` Reason: ${reason}.` : ''} Pipeline updated.`);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[openclaw] move-lead-stage:', err);
      res.status(500).json({ error: 'Failed to move lead stage', details: err.message });
    }
  });

  // ── POST /api/ai/request-appointment-slot ────────────────────────────────
  app.post('/api/ai/request-appointment-slot', openclawAuth, async (req, res) => {
    const { orgId, leadId, preferredWindow, notes } = req.body;
    if (!orgId || !leadId || !preferredWindow) {
      return res.status(400).json({ error: 'orgId, leadId, preferredWindow required' });
    }
    if (!requireFirestore(res)) return;

    try {
      const leadDoc = await firestore!.collection(`orgs/${orgId}/leads`).doc(leadId).get();
      if (!leadDoc.exists) return res.status(404).json({ error: 'Lead not found' });
      const lead = leadDoc.data()!;

      const dnc = checkDNC(lead);
      if (dnc.blocked) return res.status(403).json({ error: dnc.reason, blocked: true });

      const apptRequest = {
        leadId,
        companyName: lead.companyName,
        contactName: lead.contactName || null,
        phone: lead.phone || null,
        email: lead.email || null,
        preferredWindow,
        notes: notes || '',
        status: 'pending_confirmation',
        requestedBy: 'openclaw',
        requestedAt: new Date().toISOString(),
        instruction: 'Log the confirmed time via POST /api/ai/log-call-outcome with outcome=meeting_booked, then set nextContactDate to the meeting date.',
      };

      // Store the request in Firestore
      const ref = await firestore!
        .collection('orgs').doc(orgId)
        .collection('appointmentRequests')
        .add({ ...apptRequest, requestedAt: new Date() });

      await writeAuditLog(orgId, 'request-appointment-slot', { leadId, preferredWindow }, { requestId: ref.id });
      res.status(201).json({ success: true, requestId: ref.id, ...apptRequest });
    } catch (err: any) {
      console.error('[openclaw] request-appointment-slot:', err);
      res.status(500).json({ error: 'Failed to create appointment request', details: err.message });
    }
  });

  // ── POST /api/ai/send-approved-sms ──────────────────────────────────────
  app.post('/api/ai/send-approved-sms', openclawAuth, async (req, res) => {
    const { orgId, leadId, approvedMessage, simulate, overrideFrequency } = req.body;
    if (!orgId || !leadId || !approvedMessage) {
      return res.status(400).json({ error: 'orgId, leadId, approvedMessage required' });
    }
    if (!approvedMessage.trim()) {
      return res.status(400).json({ error: 'approvedMessage cannot be empty' });
    }
    if (approvedMessage.length > 160) {
      return res.status(400).json({ error: 'approvedMessage exceeds 160 characters for SMS', length: approvedMessage.length });
    }
    if (!requireFirestore(res)) return;

    try {
      const leadRef = firestore!.collection(`orgs/${orgId}/leads`).doc(leadId);
      const leadDoc = await leadRef.get();
      if (!leadDoc.exists) return res.status(404).json({ error: 'Lead not found' });
      const lead = leadDoc.data()!;

      const dnc = checkDNC(lead);
      if (dnc.blocked) return res.status(403).json({ error: dnc.reason, blocked: true, rules: ['DNC'] });

      const freq = checkFrequency(lead, overrideFrequency);
      if (freq.blocked) return res.status(429).json({ error: freq.reason, blocked: true, lastContactedAt: freq.lastContactedAt, rules: ['24H_COOLDOWN'] });

      if (!lead.phone) {
        return res.status(422).json({ error: 'Lead has no phone number — cannot send SMS', rules: ['MISSING_PHONE'] });
      }

      const isSimulate = simulate === true || simulate === 'true';

      if (isSimulate) {
        return res.json({
          success: true, simulate: true,
          message: 'SIMULATION MODE — no SMS sent',
          wouldSendTo: lead.phone,
          approvedMessage,
          leadId, companyName: lead.companyName,
          rulesChecked: ['DNC', '24H_COOLDOWN', 'PHONE_REQUIRED'],
          allRulesPassed: true,
        });
      }

      // Live send — log intent to audit trail (Twilio integration future)
      const now = new Date();
      await leadRef.collection('activities').add({
        leadId, type: 'sms', channel: 'sms',
        message: approvedMessage,
        status: 'queued',
        note: 'Queued via OpenClaw — Twilio integration pending',
        createdBy: 'openclaw', createdAt: now,
      });
      await leadRef.update({ lastActivityAt: now, updatedAt: now });

      const result = {
        leadId, companyName: lead.companyName,
        phone: lead.phone, approvedMessage,
        status: 'queued',
        note: 'Logged to activity trail. Twilio integration required for live delivery.',
        sentAt: now.toISOString(),
        simulate: false,
      };

      await writeAuditLog(orgId, 'send-approved-sms', { leadId, messageLength: approvedMessage.length }, result);
      await writeBullpenComm(orgId, 'send-approved-sms', `SMS queued for ${lead.companyName} (${lead.phone || 'no phone'}). Message approved and logged — delivery pending Twilio integration.`);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[openclaw] send-approved-sms:', err);
      res.status(500).json({ error: 'Failed to process SMS send', details: err.message });
    }
  });

  // ── POST /api/ai/send-approved-email ────────────────────────────────────
  app.post('/api/ai/send-approved-email', openclawAuth, async (req, res) => {
    const { orgId, leadId, subject, approvedBody, simulate, overrideFrequency } = req.body;
    if (!orgId || !leadId || !subject || !approvedBody) {
      return res.status(400).json({ error: 'orgId, leadId, subject, approvedBody required' });
    }
    if (!requireFirestore(res)) return;

    try {
      const leadRef = firestore!.collection(`orgs/${orgId}/leads`).doc(leadId);
      const leadDoc = await leadRef.get();
      if (!leadDoc.exists) return res.status(404).json({ error: 'Lead not found' });
      const lead = leadDoc.data()!;

      const dnc = checkDNC(lead);
      if (dnc.blocked) return res.status(403).json({ error: dnc.reason, blocked: true, rules: ['DNC'] });

      const freq = checkFrequency(lead, overrideFrequency);
      if (freq.blocked) return res.status(429).json({ error: freq.reason, blocked: true, lastContactedAt: freq.lastContactedAt, rules: ['24H_COOLDOWN'] });

      if (!lead.email) {
        return res.status(422).json({ error: 'Lead has no email address — cannot send email', rules: ['MISSING_EMAIL'] });
      }

      const isSimulate = simulate === true || simulate === 'true';

      if (isSimulate) {
        return res.json({
          success: true, simulate: true,
          message: 'SIMULATION MODE — no email sent',
          wouldSendTo: lead.email,
          subject, approvedBody,
          leadId, companyName: lead.companyName,
          rulesChecked: ['DNC', '24H_COOLDOWN', 'EMAIL_REQUIRED'],
          allRulesPassed: true,
        });
      }

      const now = new Date();
      await leadRef.collection('activities').add({
        leadId, type: 'email', channel: 'email',
        subject, body: approvedBody,
        status: 'queued',
        note: 'Queued via OpenClaw — email provider integration pending',
        createdBy: 'openclaw', createdAt: now,
      });
      await leadRef.update({ lastActivityAt: now, updatedAt: now });

      const result = {
        leadId, companyName: lead.companyName,
        email: lead.email, subject,
        status: 'queued',
        note: 'Logged to activity trail. Email provider integration required for live delivery.',
        sentAt: now.toISOString(),
        simulate: false,
      };

      await writeAuditLog(orgId, 'send-approved-email', { leadId, subject }, result);
      await writeBullpenComm(orgId, 'send-approved-email', `Email queued for ${lead.companyName}. Subject: "${subject}". Logged and awaiting delivery — email provider integration pending.`);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[openclaw] send-approved-email:', err);
      res.status(500).json({ error: 'Failed to process email send', details: err.message });
    }
  });

}
