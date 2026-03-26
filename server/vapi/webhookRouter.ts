// =============================================================================
// MOMENTUM VAPI — WEBHOOK ROUTER
// =============================================================================
// Public endpoint: POST /api/vapi/webhook
//
// Handles ALL Vapi event types:
//   call.started / call-start     — record call, load caller memory
//   call.ended  / end-of-call-report — finalise call record
//   transcript                    — append message to call transcript
//   function_call                 — book_appointment, take_message, recall_customer
//   tool-calls / tool_calls       — Momentum tool dispatch (existing layer)
//   status-update                 — intermediate status
//   assistant-request             — inbound routing
//
// Security: Authorization: Bearer {VAPI_WEBHOOK_SECRET}
// If VAPI_WEBHOOK_SECRET is not set, requests are accepted in dev mode.
//
// Firestore paths:
//   orgs/{orgId}/vapiCalls/{callId}              — call records
//   orgs/{orgId}/vapiCalls/{callId}/messages     — transcript messages
//   orgs/{orgId}/vapiAppointments/{id}           — booked appointments
//   orgs/{orgId}/vapiMessages/{id}               — taken messages
//   vapiCalls/{vapiCallId}                       — fallback (no orgId)
// =============================================================================

import { Router, Request, Response } from 'express';
import { dispatchTool }              from './toolHandlers';
import { updateCallStatus }          from './callService';
import { isVapiWebhookSecured, getVapiConfig } from './config';
import { firestore } from '../firebase';

export const vapiWebhookRouter = Router();

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

function validateWebhookRequest(req: Request): boolean {
  if (!isVapiWebhookSecured()) {
    // No secret set — accept all (dev mode only)
    return true;
  }
  const secret = getVapiConfig().webhookSecret!;

  // Primary: Authorization: Bearer <secret>  (Vapi Integrations → Bearer Token)
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${secret}`) return true;

  // Fallback: x-vapi-secret header
  if (req.headers['x-vapi-secret'] === secret) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Payload extraction helpers
// ---------------------------------------------------------------------------

function extractField(body: Record<string, any>, ...paths: string[][]): any {
  for (const path of paths) {
    let val: any = body;
    for (const key of path) {
      if (val == null) break;
      val = val[key];
    }
    if (val != null) return val;
  }
  return null;
}

function extractOrgId(body: Record<string, any>): string | null {
  return extractField(body,
    ['message', 'call', 'metadata', 'orgId'],
    ['call', 'metadata', 'orgId'],
    ['metadata', 'orgId'],
  );
}

function extractMomentumCallId(body: Record<string, any>): string | null {
  return extractField(body,
    ['message', 'call', 'metadata', 'momentumCallId'],
    ['call', 'metadata', 'momentumCallId'],
    ['metadata', 'momentumCallId'],
  );
}

function extractVapiCallId(body: Record<string, any>): string | null {
  return extractField(body,
    ['message', 'call', 'id'],
    ['call', 'id'],
    ['message', 'callId'],
    ['callId'],
    ['id'],
  );
}

function extractPhoneNumber(body: Record<string, any>): string | null {
  return extractField(body,
    ['message', 'call', 'customer', 'number'],
    ['call', 'customer', 'number'],
    ['customer', 'number'],
    ['message', 'customer', 'number'],
  );
}

// Normalise event type — Vapi uses both dot and dash/underscore separators
function normaliseType(raw: string): string {
  return raw.replace(/[.\s]/g, '-').toLowerCase();
}

function getMessageType(body: Record<string, any>): string {
  const raw = body?.message?.type ?? body?.type ?? 'unknown';
  return normaliseType(raw);
}

// ---------------------------------------------------------------------------
// Caller memory — look up prior calls/appointments/messages by phone number
// ---------------------------------------------------------------------------

async function loadCallerMemory(db: NonNullable<typeof firestore>, orgId: string | null, phoneNumber: string | null): Promise<Record<string, any>> {
  if (!phoneNumber) return {};
  try {
    const base = orgId
      ? db.collection('orgs').doc(orgId)
      : null;

    const [callsSnap, apptSnap, msgSnap] = await Promise.all([
      base
        ? base.collection('vapiCalls').where('phoneNumber', '==', phoneNumber).orderBy('initiatedAt', 'desc').limit(5).get()
        : db.collection('vapiCalls').where('phoneNumber', '==', phoneNumber).orderBy('initiatedAt', 'desc').limit(5).get(),
      base
        ? base.collection('vapiAppointments').where('phone', '==', phoneNumber).orderBy('createdAt', 'desc').limit(3).get()
        : Promise.resolve({ docs: [] as any[] }),
      base
        ? base.collection('vapiMessages').where('phone', '==', phoneNumber).orderBy('createdAt', 'desc').limit(3).get()
        : Promise.resolve({ docs: [] as any[] }),
    ]);

    const priorCalls = callsSnap.docs.map(d => ({
      callId:     d.id,
      intent:     d.data().intent,
      outcome:    d.data().outcome,
      initiatedAt: d.data().initiatedAt,
      summary:    d.data().callSummary,
    }));

    const appointments = (apptSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const messages     = (msgSnap as any).docs.map((d: any) => ({ id: d.id, ...d.data() }));

    return { priorCalls, appointments, messages, isReturningCaller: priorCalls.length > 0 };
  } catch (err) {
    console.warn('[vapi-webhook] loadCallerMemory failed:', err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Handler: call started
// ---------------------------------------------------------------------------

async function handleCallStarted(
  db: NonNullable<typeof firestore>,
  body: Record<string, any>,
  orgId: string | null,
  callId: string | null,
  vapiCallId: string | null,
) {
  const phoneNumber = extractPhoneNumber(body);
  const assistantName = extractField(body,
    ['message', 'call', 'assistant', 'name'],
    ['call', 'assistant', 'name'],
    ['assistant', 'name'],
  ) ?? 'Erica';

  const callerMemory = await loadCallerMemory(db, orgId, phoneNumber);

  const record = {
    vapiCallId:      vapiCallId ?? null,
    phoneNumber:     phoneNumber ?? null,
    assistantName,
    status:          'active',
    startedAt:       new Date().toISOString(),
    isReturningCaller: callerMemory.isReturningCaller ?? false,
    callerMemory,
  };

  try {
    if (orgId && callId) {
      await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId)
        .set(record, { merge: true });
    } else if (vapiCallId) {
      await db.collection('vapiCalls').doc(vapiCallId).set(record, { merge: true });
    }
  } catch (err) {
    console.warn('[vapi-webhook] handleCallStarted write failed:', err);
  }

  return { callerMemory };
}

// ---------------------------------------------------------------------------
// Handler: transcript message
// ---------------------------------------------------------------------------

async function handleTranscript(
  db: NonNullable<typeof firestore>,
  body: Record<string, any>,
  orgId: string | null,
  callId: string | null,
  vapiCallId: string | null,
) {
  const msg = body?.message ?? body;
  const speaker   = msg?.role ?? msg?.speaker ?? 'unknown';
  const text      = msg?.transcript ?? msg?.text ?? msg?.content ?? '';
  const timestamp = msg?.timestamp ?? new Date().toISOString();

  if (!text) return;

  const messageRecord = { speaker, text, timestamp, createdAt: new Date().toISOString() };

  try {
    if (orgId && callId) {
      await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId)
        .collection('messages').add(messageRecord);
    } else if (vapiCallId) {
      await db.collection('vapiCalls').doc(vapiCallId)
        .collection('messages').add(messageRecord);
    }
  } catch (err) {
    console.warn('[vapi-webhook] handleTranscript write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Handler: function_call — book_appointment, take_message, recall_customer
// ---------------------------------------------------------------------------

async function handleFunctionCall(
  db: NonNullable<typeof firestore>,
  body: Record<string, any>,
  orgId: string | null,
  callId: string | null,
  vapiCallId: string | null,
): Promise<Record<string, any>> {
  const msg           = body?.message ?? body;
  const functionName  = msg?.function?.name ?? msg?.functionCall?.name ?? msg?.name ?? '';
  const parameters    = msg?.function?.parameters ?? msg?.functionCall?.parameters ?? msg?.parameters ?? {};

  console.log(`[vapi-webhook] function_call: ${functionName}`, parameters);

  const base = orgId ? db.collection('orgs').doc(orgId) : null;

  // ------------------------------------------------------------------
  // book_appointment
  // ------------------------------------------------------------------
  if (functionName === 'book_appointment') {
    const { name, phone, service, date, time, notes } = parameters;

    if (!name || !phone) {
      return { result: 'Missing required fields: name and phone are required to book an appointment.' };
    }

    const appointmentRecord = {
      name:         name ?? null,
      phone:        phone ?? null,
      service:      service ?? null,
      date:         date ?? null,
      time:         time ?? null,
      notes:        notes ?? null,
      status:       'pending',
      source:       'vapi',
      vapiCallId:   vapiCallId ?? null,
      momentumCallId: callId ?? null,
      createdAt:    new Date().toISOString(),
    };

    try {
      if (base) {
        const ref = await base.collection('vapiAppointments').add(appointmentRecord);
        console.log(`[vapi-webhook] Appointment booked: ${ref.path}`);
      } else {
        await db.collection('vapiAppointments').add(appointmentRecord);
      }
    } catch (err) {
      console.error('[vapi-webhook] book_appointment write failed:', err);
      return { result: 'There was a problem saving your appointment. Please try again.' };
    }

    return {
      result: `Appointment booked successfully for ${name} on ${date ?? 'a date to be confirmed'} at ${time ?? 'a time to be confirmed'}.`,
    };
  }

  // ------------------------------------------------------------------
  // take_message
  // ------------------------------------------------------------------
  if (functionName === 'take_message') {
    const { name, phone, message: msgText } = parameters;

    const messageRecord = {
      name:           name ?? null,
      phone:          phone ?? null,
      message:        msgText ?? null,
      status:         'unread',
      source:         'vapi',
      vapiCallId:     vapiCallId ?? null,
      momentumCallId: callId ?? null,
      createdAt:      new Date().toISOString(),
    };

    try {
      if (base) {
        const ref = await base.collection('vapiMessages').add(messageRecord);
        console.log(`[vapi-webhook] Message saved: ${ref.path}`);
      } else {
        await db.collection('vapiMessages').add(messageRecord);
      }
    } catch (err) {
      console.error('[vapi-webhook] take_message write failed:', err);
      return { result: 'There was a problem saving your message. Please try again.' };
    }

    return {
      result: `Message received and saved. Someone will be in touch with ${name ?? 'you'} shortly.`,
    };
  }

  // ------------------------------------------------------------------
  // recall_customer — load caller history by phone number
  // ------------------------------------------------------------------
  if (functionName === 'recall_customer') {
    const { phone } = parameters;
    const memory    = await loadCallerMemory(db, orgId, phone ?? null);

    if (!memory.isReturningCaller) {
      return { result: 'No previous records found for this caller.', memory };
    }

    const callCount  = (memory.priorCalls as any[]).length;
    const lastCall   = (memory.priorCalls as any[])[0];
    const apptCount  = (memory.appointments as any[]).length;
    const msgCount   = (memory.messages as any[]).length;

    return {
      result: `Found ${callCount} previous call${callCount !== 1 ? 's' : ''}, ${apptCount} appointment${apptCount !== 1 ? 's' : ''}, and ${msgCount} message${msgCount !== 1 ? 's' : ''} for this caller. Last contact: ${lastCall?.initiatedAt ?? 'unknown'}.`,
      memory,
    };
  }

  // ------------------------------------------------------------------
  // Unknown function — fall through to Momentum tool dispatch
  // ------------------------------------------------------------------
  if (orgId && callId) {
    try {
      const result = await dispatchTool({ db, orgId, callId, toolName: functionName, args: parameters });
      return { result: result.success ? (result.result ?? 'Done') : (result.error ?? 'Action could not be completed') };
    } catch { /* ignore */ }
  }

  return { result: `Function ${functionName} is not recognised.` };
}

// ---------------------------------------------------------------------------
// Handler: call ended
// ---------------------------------------------------------------------------

async function handleCallEnded(
  db: NonNullable<typeof firestore>,
  body: Record<string, any>,
  orgId: string | null,
  callId: string | null,
  vapiCallId: string | null,
) {
  const report     = body?.message ?? body;
  const endedAt    = report?.call?.endedAt ?? report?.endedAt ?? new Date().toISOString();
  const startedAt  = report?.call?.startedAt ?? report?.startedAt;
  const durationMs = report?.durationMs ?? (endedAt && startedAt
    ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
    : null);

  const update = {
    status:          'completed',
    endedAt,
    durationSeconds: durationMs ? Math.round(durationMs / 1000) : null,
    callSummary:     report?.summary ?? report?.call?.analysis?.summary ?? null,
    callTranscript:  report?.transcript ?? null,
    lastUpdatedAt:   new Date().toISOString(),
  };

  try {
    if (orgId && callId) {
      await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId)
        .set(update, { merge: true });
    } else if (vapiCallId) {
      await db.collection('vapiCalls').doc(vapiCallId).set(update, { merge: true });
    }
  } catch (err) {
    console.warn('[vapi-webhook] handleCallEnded write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/vapi/webhook  — main dispatcher
// ---------------------------------------------------------------------------

vapiWebhookRouter.post('/', async (req: Request, res: Response) => {

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!validateWebhookRequest(req)) {
    console.warn('[vapi-webhook] Unauthorized request rejected');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body       = req.body as Record<string, any>;
  const db         = firestore;

  if (!db) {
    console.error('[vapi-webhook] Firestore not initialised');
    return res.status(500).json({ error: 'Internal configuration error' });
  }

  const messageType = getMessageType(body);
  const orgId       = extractOrgId(body);
  const callId      = extractMomentumCallId(body);
  const vapiCallId  = extractVapiCallId(body);

  console.log(`[vapi-webhook] type=${messageType} orgId=${orgId} callId=${callId} vapiCallId=${vapiCallId}`);

  // ── call.started ──────────────────────────────────────────────────────────
  if (messageType === 'call-started' || messageType === 'call-start' || messageType === 'call_start') {
    const { callerMemory } = await handleCallStarted(db, body, orgId, callId, vapiCallId);
    // Return caller memory so Erica can personalise her opening
    return res.status(200).json({ success: true, callerMemory });
  }

  // ── transcript ────────────────────────────────────────────────────────────
  if (messageType === 'transcript') {
    await handleTranscript(db, body, orgId, callId, vapiCallId);
    return res.status(200).json({ success: true });
  }

  // ── function_call ─────────────────────────────────────────────────────────
  if (messageType === 'function-call' || messageType === 'function_call') {
    const result = await handleFunctionCall(db, body, orgId, callId, vapiCallId);
    return res.status(200).json({ success: true, ...result });
  }

  // ── tool-calls (Momentum tool dispatch layer) ─────────────────────────────
  if (messageType === 'tool-calls' || messageType === 'tool_calls') {
    const toolCalls: any[] = body?.message?.toolCallList ?? body?.toolCallList ?? body?.message?.toolCalls ?? [];

    if (!orgId || !callId) {
      console.warn('[vapi-webhook] tool-call missing orgId or callId — check assistant metadata');
      return res.status(200).json({
        results: toolCalls.map((tc: any) => ({
          toolCallId: tc.id ?? tc.toolCallId,
          result:     { error: 'Missing orgId or callId in call metadata. Check assistant configuration.' },
        })),
      });
    }

    const results: { toolCallId: string; result: unknown }[] = [];

    for (const tc of toolCalls) {
      const toolName = tc.function?.name ?? tc.name;
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
        results.push({ toolCallId: tc.id ?? tc.toolCallId, result: { success: false, error: 'Internal handler error' } });
      }
    }

    return res.status(200).json({ results });
  }

  // ── call.ended ────────────────────────────────────────────────────────────
  if (
    messageType === 'call-ended' ||
    messageType === 'call-end' ||
    messageType === 'call_end' ||
    messageType === 'end-of-call-report'
  ) {
    await handleCallEnded(db, body, orgId, callId, vapiCallId);
    return res.status(200).json({ success: true });
  }

  // ── status-update ─────────────────────────────────────────────────────────
  if (messageType === 'status-update' || messageType === 'status_update') {
    const newStatus = body?.message?.status ?? body?.status ?? 'unknown';
    if (orgId && callId) {
      await updateCallStatus({ db, orgId, callId, status: newStatus });
    }
    return res.status(200).json({ success: true });
  }

  // ── assistant-request (inbound routing) ───────────────────────────────────
  if (messageType === 'assistant-request' || messageType === 'assistant_request') {
    if (orgId) {
      try {
        const configSnap = await db.collection('orgs').doc(orgId)
          .collection('vapiConfig').doc('default').get();
        const inboundAssistant = configSnap.data()?.assistants?.find(
          (a: any) => a.intentId === 'inbound_lead_capture' && a.enabled
        );
        if (inboundAssistant?.assistantId) {
          return res.status(200).json({ assistantId: inboundAssistant.assistantId });
        }
      } catch { /* fallthrough */ }
    }
    return res.status(200).json({ error: 'No inbound assistant configured' });
  }

  // ── default ───────────────────────────────────────────────────────────────
  console.log(`[vapi-webhook] Unhandled event type: ${messageType}`);
  return res.status(200).json({ success: true, messageType });
});
