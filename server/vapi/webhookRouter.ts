// =============================================================================
// MOMENTUM VAPI — WEBHOOK ROUTER
// =============================================================================
// Public endpoint: POST /api/vapi/webhook
// Vapi calls this for:
//   - tool_calls   — Momentum tool execution (dispatched to toolHandlers.ts)
//   - call-start   — call lifecycle event
//   - call-end     — final summary and transcript
//   - status-update — intermediate call status changes
//
// Security: validated by x-vapi-secret header (if VAPI_WEBHOOK_SECRET is set).
// If VAPI_WEBHOOK_SECRET is not set, a warning is logged but calls proceed
// (acceptable in dev; configure the secret before production use).
// =============================================================================

import { Router, Request, Response } from 'express';
import { dispatchTool }              from './toolHandlers';
import { updateCallStatus }          from './callService';
import { isVapiWebhookSecured, getVapiConfig } from './config';
import { firestore } from '../firebase';

export const vapiWebhookRouter = Router();

// ---------------------------------------------------------------------------
// Webhook validation
// ---------------------------------------------------------------------------

function validateWebhookRequest(req: Request): boolean {
  if (!isVapiWebhookSecured()) {
    // No secret configured — still process (dev mode)
    return true;
  }
  const cfg    = getVapiConfig();
  const secret = cfg.webhookSecret!;

  // Vapi sends Authorization: Bearer <secret> when configured via Integrations tab
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader === `Bearer ${secret}`) return true;

  // Fallback: x-vapi-secret header (older Vapi webhook style)
  const secretHeader = req.headers['x-vapi-secret'];
  if (secretHeader && secretHeader === secret) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Extract orgId from the webhook payload
// Momentum embeds orgId in the call metadata when creating outbound calls.
// For inbound calls, Vapi should include it in the assistant metadata.
// ---------------------------------------------------------------------------

function extractOrgId(body: Record<string, any>): string | null {
  return (
    body?.message?.call?.metadata?.orgId ??
    body?.call?.metadata?.orgId ??
    body?.metadata?.orgId ??
    null
  );
}

function extractCallId(body: Record<string, any>): string | null {
  return (
    body?.message?.call?.metadata?.momentumCallId ??
    body?.call?.metadata?.momentumCallId ??
    null
  );
}

function extractVapiCallId(body: Record<string, any>): string | null {
  return body?.message?.call?.id ?? body?.call?.id ?? body?.id ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/vapi/webhook
// ---------------------------------------------------------------------------

vapiWebhookRouter.post('/', async (req: Request, res: Response) => {
  if (!validateWebhookRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing x-vapi-secret' });
  }

  const body = req.body as Record<string, any>;

  // Vapi wraps events in a `message` envelope
  const messageType: string = body?.message?.type ?? body?.type ?? 'unknown';
  const db = firestore;

  if (!db) {
    console.error('[vapi-webhook] Firestore not initialised');
    return res.status(500).json({ error: 'Internal configuration error' });
  }

  const orgId     = extractOrgId(body);
  const callId    = extractCallId(body);
  const vapiCallId = extractVapiCallId(body);

  console.log(`[vapi-webhook] type=${messageType} orgId=${orgId} callId=${callId}`);

  // -------------------------------------------------------------------------
  // Tool call — Vapi is asking Momentum to execute an action
  // -------------------------------------------------------------------------
  if (messageType === 'tool-calls' || messageType === 'tool_calls') {
    const toolCalls: any[] = body?.message?.toolCallList ?? body?.toolCallList ?? body?.message?.toolCalls ?? [];

    if (!orgId || !callId) {
      // Missing context — cannot process safely
      console.warn('[vapi-webhook] tool-call missing orgId or callId — check assistant metadata');
      return res.status(200).json({
        results: toolCalls.map((tc: any) => ({
          toolCallId: tc.id ?? tc.toolCallId,
          result:     { error: 'Missing orgId or callId in call metadata. Check Momentum assistant configuration.' },
        })),
      });
    }

    const results: { toolCallId: string; result: unknown }[] = [];

    for (const tc of toolCalls) {
      const toolName: string = tc.function?.name ?? tc.name;
      const args: Record<string, unknown> = tc.function?.arguments
        ? (typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments)
        : (tc.arguments ?? {});

      try {
        const handlerResult = await dispatchTool({ db, orgId, callId, toolName, args });
        results.push({
          toolCallId: tc.id ?? tc.toolCallId,
          result:     handlerResult.success
            ? { success: true, ...(handlerResult.result as object ?? {}) }
            : { success: false, error: handlerResult.error, policyDecision: handlerResult.policyDecision },
        });
      } catch (err: any) {
        console.error(`[vapi-webhook] tool ${toolName} threw:`, err);
        results.push({
          toolCallId: tc.id ?? tc.toolCallId,
          result:     { success: false, error: 'Internal handler error' },
        });
      }
    }

    return res.status(200).json({ results });
  }

  // -------------------------------------------------------------------------
  // Call start
  // -------------------------------------------------------------------------
  if (messageType === 'call-start' || messageType === 'call_start') {
    if (orgId && callId) {
      try {
        await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId).set({
          vapiCallId: vapiCallId ?? null,
          status:     'in-progress',
          startedAt:  new Date().toISOString(),
        }, { merge: true });
      } catch { /* non-critical */ }
    }
    return res.status(200).json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // Call end — final summary, transcript, duration
  // -------------------------------------------------------------------------
  if (messageType === 'end-of-call-report' || messageType === 'call-end' || messageType === 'call_end') {
    if (orgId && callId) {
      const report      = body?.message ?? body;
      const durationMs  = report?.durationMs ?? (report?.endedAt && report?.startedAt
        ? new Date(report.endedAt).getTime() - new Date(report.startedAt).getTime()
        : null);

      await updateCallStatus({
        db, orgId, callId,
        status:          'ended',
        durationSeconds: durationMs ? Math.round(durationMs / 1000) : undefined,
        endedAt:         report?.endedAt ?? new Date().toISOString(),
        summary:         report?.summary ?? null,
        transcript:      report?.transcript ?? null,
      });
    }
    return res.status(200).json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // Status update
  // -------------------------------------------------------------------------
  if (messageType === 'status-update' || messageType === 'status_update') {
    const newStatus: string = body?.message?.status ?? body?.status ?? 'unknown';
    if (orgId && callId) {
      await updateCallStatus({ db, orgId, callId, status: newStatus });
    }
    return res.status(200).json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // Inbound call — create lead if inbound_lead_capture intent
  // -------------------------------------------------------------------------
  if (messageType === 'assistant-request' || messageType === 'assistant_request') {
    // Vapi is requesting which assistant to use for an inbound call.
    // Return the inbound lead capture assistant ID from the org config.
    if (orgId) {
      try {
        const configSnap = await db.collection('orgs').doc(orgId).collection('vapiConfig').doc('default').get();
        const config = configSnap.data();
        const inboundAssistant = config?.assistants?.find((a: any) => a.intentId === 'inbound_lead_capture' && a.enabled);
        if (inboundAssistant?.assistantId) {
          return res.status(200).json({ assistantId: inboundAssistant.assistantId });
        }
      } catch { /* fallthrough */ }
    }
    return res.status(200).json({ error: 'No inbound assistant configured for this org' });
  }

  // Default — acknowledge but don't process unknown types
  return res.status(200).json({ ok: true, messageType });
});
