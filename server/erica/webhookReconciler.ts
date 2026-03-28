// =============================================================================
// ERICA CALLING SYSTEM — WEBHOOK RECONCILER
// =============================================================================
// Called by the Vapi webhook handler when events arrive for Erica calls.
//
// Responsibilities:
// - Extract orgId, batchId, batchItemId from webhook metadata
// - Update batch item call state (phase, timestamps)
// - Append transcript messages
// - Handle function calls through Erica-aware tool dispatch
// - Write final EricaCallResult to the batch item on call end
// - Keep the EricaCallBatch summary counters up to date
// - Write auditable event logs
//
// Key principle: webhook metadata carries orgId + batchId + batchItemId
// so reconciliation never requires a Firestore scan.
// =============================================================================

import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getBatch, updateItemStatus, writeCallResult } from './batchService';
import type { EricaCallResult } from '../../client/src/lib/ericaTypes';
import type { EricaVapiCallPhase } from '../../client/src/lib/ericaExecutionTypes';
import { checkAvailability } from './availabilityService';
import { createConfirmedBooking, createBookingRequest } from './bookingService';
import { checkRescheduleAvailability, confirmReschedule } from './rescheduleService';
import { cancelBooking } from './cancellationService';
import type {
  CheckAvailabilityToolPayload,
  CreateBookingToolPayload,
  CreateBookingRequestToolPayload,
} from './bookingTypes';
import type {
  RequestRescheduleToolPayload,
  ConfirmRescheduleToolPayload,
  RequestCancellationToolPayload,
} from './bookingChangeTypes';

// ---------------------------------------------------------------------------
// Extract Erica identifiers from Vapi metadata
// ---------------------------------------------------------------------------

export function extractEricaIds(body: Record<string, any>): {
  orgId:       string | null;
  batchId:     string | null;
  batchItemId: string | null;
  briefId:     string | null;
  momentumCallId: string | null;
  vapiCallId:  string | null;
  entityType:  string | null;
  entityId:    string | null;
} {
  const meta = body?.message?.call?.metadata
    ?? body?.call?.metadata
    ?? body?.metadata
    ?? {};

  return {
    orgId:          meta.orgId          ?? null,
    batchId:        meta.batchId        ?? null,
    batchItemId:    meta.batchItemId    ?? null,
    briefId:        meta.briefId        ?? null,
    momentumCallId: meta.momentumCallId ?? null,
    vapiCallId:     body?.message?.call?.id ?? body?.call?.id ?? meta.vapiCallId ?? null,
    entityType:     meta.entityType     ?? null,
    entityId:       meta.entityId       ?? null,
  };
}

// ---------------------------------------------------------------------------
// Determine if a webhook is for an Erica batch call
// ---------------------------------------------------------------------------

export function isEricaCall(body: Record<string, any>): boolean {
  const meta = body?.message?.call?.metadata
    ?? body?.call?.metadata
    ?? body?.metadata
    ?? {};
  return !!(meta.batchId && meta.batchItemId);
}

// ---------------------------------------------------------------------------
// Map Vapi call state to Erica phase
// ---------------------------------------------------------------------------

function mapVapiStatusToPhase(vapiStatus: string): EricaVapiCallPhase {
  switch (vapiStatus.toLowerCase()) {
    case 'queued':      return 'queued';
    case 'ringing':     return 'ringing';
    case 'in-progress':
    case 'in_progress':
    case 'answered':    return 'in_progress';
    case 'forwarding':  return 'in_progress';
    case 'ended':
    case 'completed':   return 'completed';
    case 'no-answer':
    case 'no_answer':
    case 'busy':        return 'no_answer';
    case 'failed':      return 'failed';
    case 'cancelled':   return 'cancelled';
    default:            return 'in_progress';
  }
}

// ---------------------------------------------------------------------------
// Reconcile: call started
// ---------------------------------------------------------------------------

export async function reconcileCallStarted(
  db: Firestore,
  ids: ReturnType<typeof extractEricaIds>,
  body: Record<string, any>,
): Promise<void> {
  if (!ids.orgId || !ids.batchId || !ids.batchItemId) return;

  const phoneNumber = body?.message?.call?.customer?.number
    ?? body?.call?.customer?.number
    ?? null;

  // Update batch item to 'calling' / ringing
  await updateItemStatus({
    orgId:     ids.orgId,
    batchId:   ids.batchId,
    itemId:    ids.batchItemId,
    status:    'calling',
    callId:    ids.momentumCallId ?? undefined,
    vapiCallId: ids.vapiCallId ?? undefined,
  });

  // Store phase on vapiCall record
  if (ids.momentumCallId) {
    await db.collection('orgs').doc(ids.orgId)
      .collection('vapiCalls').doc(ids.momentumCallId)
      .set({ status: 'ringing', phoneNumber, answeredAt: null }, { merge: true });
  }

  await writeEventAudit(db, ids.orgId, {
    type: 'call.started', ...ids, note: `Erica call started → ${phoneNumber ?? 'unknown'}`,
  });
}

// ---------------------------------------------------------------------------
// Reconcile: transcript message
// ---------------------------------------------------------------------------

export async function reconcileTranscript(
  db: Firestore,
  ids: ReturnType<typeof extractEricaIds>,
  body: Record<string, any>,
): Promise<void> {
  if (!ids.orgId || !ids.momentumCallId) return;

  const msg       = body?.message ?? body;
  const speaker   = msg?.role ?? msg?.speaker ?? 'unknown';
  const text      = msg?.transcript ?? msg?.text ?? msg?.content ?? '';
  const timestamp = msg?.timestamp ?? new Date().toISOString();

  if (!text) return;

  const msgRecord = { speaker, text, timestamp, createdAt: new Date().toISOString() };

  await db.collection('orgs').doc(ids.orgId)
    .collection('vapiCalls').doc(ids.momentumCallId)
    .collection('messages').add(msgRecord);

  // Increment transcript count on the vapiCall doc
  const callRef = db.collection('orgs').doc(ids.orgId)
    .collection('vapiCalls').doc(ids.momentumCallId);
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    await callRef.update({ transcriptCount: FieldValue.increment(1), lastTranscriptAt: timestamp });
  } catch { /* FieldValue not always available */ }
}

// ---------------------------------------------------------------------------
// Reconcile: function call (Erica tool dispatch)
// ---------------------------------------------------------------------------

export async function reconcileFunctionCall(
  db: Firestore,
  ids: ReturnType<typeof extractEricaIds>,
  body: Record<string, any>,
): Promise<Record<string, any>> {
  const msg          = body?.message ?? body;
  const functionName = msg?.function?.name ?? msg?.functionCall?.name ?? msg?.name ?? '';
  const parameters   = msg?.function?.parameters ?? msg?.functionCall?.parameters ?? msg?.parameters ?? {};

  console.log(`[erica-reconciler] function_call: ${functionName}`, parameters);

  const orgId  = ids.orgId;
  const callId = ids.momentumCallId ?? '';

  await writeEventAudit(db, orgId ?? '', {
    type: 'function_call', ...ids, note: `Tool: ${functionName}`, data: parameters,
  });

  if (!orgId) return { result: 'Missing orgId — cannot process tool' };
  const base = db.collection('orgs').doc(orgId);

  // book_appointment
  if (functionName === 'book_appointment') {
    const { name, phone, service, date, time, notes } = parameters;
    if (!name || !phone) return { result: 'Missing name or phone — cannot book appointment' };
    const rec = {
      name, phone, service: service ?? null, date: date ?? null, time: time ?? null,
      notes: notes ?? null, status: 'pending', source: 'erica',
      vapiCallId: ids.vapiCallId ?? null, momentumCallId: callId,
      batchId: ids.batchId ?? null, batchItemId: ids.batchItemId ?? null,
      createdAt: new Date().toISOString(),
    };
    try {
      await base.collection('vapiAppointments').add(rec);
      // Mark on vapiCall that booking occurred
      if (callId) {
        await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId)
          .set({ booked: true, bookingDetails: { name, phone, service, date, time } }, { merge: true });
      }
    } catch (err) { console.error('[erica] book_appointment write:', err); }
    return { result: `Appointment booked for ${name} on ${date ?? 'TBC'} at ${time ?? 'TBC'}` };
  }

  // take_message
  if (functionName === 'take_message') {
    const { name, phone, message: msgText } = parameters;
    const rec = {
      name: name ?? null, phone: phone ?? null, message: msgText ?? null,
      status: 'unread', source: 'erica',
      vapiCallId: ids.vapiCallId ?? null, momentumCallId: callId,
      batchId: ids.batchId ?? null, batchItemId: ids.batchItemId ?? null,
      createdAt: new Date().toISOString(),
    };
    try { await base.collection('vapiMessages').add(rec); } catch {}
    return { result: `Message received for ${name ?? 'the caller'}. Someone will be in touch.` };
  }

  // recall_customer
  if (functionName === 'recall_customer') {
    const { phone } = parameters;
    if (!phone) return { result: 'Phone number required to look up caller history' };
    try {
      const [callsSnap, apptSnap] = await Promise.all([
        base.collection('vapiCalls').where('phoneNumber', '==', phone).orderBy('launchedAt', 'desc').limit(5).get(),
        base.collection('vapiAppointments').where('phone', '==', phone).orderBy('createdAt', 'desc').limit(3).get(),
      ]);
      const callCount = callsSnap.size;
      const apptCount = apptSnap.size;
      return {
        result: `Found ${callCount} previous call${callCount !== 1 ? 's' : ''} and ${apptCount} appointment${apptCount !== 1 ? 's' : ''} for this number.`,
        history: { calls: callCount, appointments: apptCount },
      };
    } catch {
      return { result: 'Could not retrieve caller history at this time.' };
    }
  }

  // request_callback
  if (functionName === 'request_callback') {
    const { name, phone, preferredTime } = parameters;
    try {
      await base.collection('vapiMessages').add({
        type: 'callback_request', name: name ?? null, phone: phone ?? null,
        preferredTime: preferredTime ?? null, status: 'pending', source: 'erica',
        momentumCallId: callId, batchItemId: ids.batchItemId ?? null,
        createdAt: new Date().toISOString(),
      });
    } catch {}
    return { result: `Callback request logged for ${name ?? 'caller'} ${preferredTime ? `at ${preferredTime}` : ''}` };
  }

  // create_followup_task
  if (functionName === 'create_followup_task') {
    const { entityId, entityType: entType, description, dueDate } = parameters;
    try {
      const taskEntityId = entityId ?? ids.entityId;
      const taskEntityType = entType ?? ids.entityType;
      if (taskEntityId && taskEntityType) {
        const collection = taskEntityType === 'client' ? 'clients' : 'leads';
        await base.collection(collection).doc(taskEntityId)
          .collection('tasks').add({
            description: description ?? 'Follow-up from Erica call',
            dueDate: dueDate ?? null,
            status: 'pending',
            source: 'erica',
            momentumCallId: callId,
            createdAt: new Date().toISOString(),
          });
      }
    } catch {}
    return { result: `Follow-up task created: ${description ?? 'follow up'}` };
  }

  // log_objection
  if (functionName === 'log_objection') {
    const { objectionType, notes } = parameters;
    try {
      if (callId) {
        const { FieldValue } = await import('firebase-admin/firestore');
        await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId)
          .update({
            objections: FieldValue.arrayUnion({ type: objectionType, notes: notes ?? null, loggedAt: new Date().toISOString() }),
          });
      }
    } catch {}
    return { result: `Objection noted: ${objectionType}` };
  }

  // log_call_outcome
  if (functionName === 'log_call_outcome') {
    const { outcome, booked, nextStep, notes: outcomeNotes } = parameters;
    try {
      if (callId) {
        await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId)
          .set({
            callOutcome:    outcome ?? null,
            booked:         booked ?? false,
            nextStep:       nextStep ?? null,
            outcomeNotes:   outcomeNotes ?? null,
            outcomeLoggedAt: new Date().toISOString(),
          }, { merge: true });
      }
    } catch {}
    return { result: `Call outcome logged: ${outcome}` };
  }

  // ── check_availability ─────────────────────────────────────────────────
  if (functionName === 'check_availability') {
    const payload: CheckAvailabilityToolPayload = {
      entityId:        parameters.entityId ?? ids.entityId ?? '',
      entityType:      parameters.entityType ?? ids.entityType ?? 'lead',
      callId:          callId || undefined,
      durationMinutes: Number(parameters.durationMinutes ?? 30),
      preferenceTime:  parameters.preferenceTime ?? 'any',
      timezone:        parameters.timezone ?? 'Australia/Sydney',
      lookAheadDays:   Number(parameters.lookAheadDays ?? 7),
    };

    try {
      const result = await checkAvailability(orgId, payload);
      if (!result.configured) {
        return {
          result:   'Calendar not configured — booking request flow will be used instead.',
          error:    result.notConfiguredMsg,
          slots:    [],
          provider: result.providerState,
        };
      }
      if (!result.success) {
        return { result: `Availability check failed: ${result.error}`, slots: [] };
      }
      const slotList = (result.slots ?? [])
        .map((s: any, i: number) => `${i + 1}. ${s.timeLabel}`)
        .join(' | ');
      return {
        result:    result.slotCount > 0
          ? `Found ${result.slotCount} available slot${result.slotCount !== 1 ? 's' : ''}: ${slotList}`
          : `No available slots found in the requested window`,
        windowId:  result.windowId,
        slotCount: result.slotCount,
        slots:     result.slots,
      };
    } catch (err: any) {
      return { result: `Availability check error: ${err.message}`, slots: [] };
    }
  }

  // ── create_booking ──────────────────────────────────────────────────────
  if (functionName === 'create_booking') {
    const payload: CreateBookingToolPayload = {
      entityId:       parameters.entityId ?? ids.entityId ?? '',
      entityType:     parameters.entityType ?? ids.entityType ?? 'lead',
      callId:         callId || undefined,
      batchId:        ids.batchId || undefined,
      batchItemId:    ids.batchItemId || undefined,
      briefId:        ids.briefId || undefined,
      slotId:         parameters.slotId ?? '',
      windowId:       parameters.windowId ?? '',
      format:         parameters.format ?? 'phone',
      meetingPurpose: parameters.meetingPurpose ?? 'Discovery call',
      contactEmail:   parameters.contactEmail,
    };

    if (!payload.slotId || !payload.windowId) {
      return { result: 'Missing slotId or windowId — cannot confirm booking.' };
    }

    try {
      // Attempt to pull entity data from Firestore for context
      let entityData = {
        entityName:   parameters.entityName ?? 'Unknown',
        businessName: parameters.businessName ?? 'Unknown',
        contactName:  parameters.contactName,
        contactEmail: parameters.contactEmail,
        phone:        parameters.phone,
      };
      try {
        const col  = payload.entityType === 'client' ? 'clients' : 'leads';
        const snap = await base.collection(col).doc(payload.entityId).get();
        if (snap.exists) {
          const d = snap.data()!;
          entityData = {
            entityName:   d.name ?? d.businessName ?? entityData.entityName,
            businessName: d.businessName ?? entityData.businessName,
            contactName:  d.contactName ?? d.name ?? entityData.contactName,
            contactEmail: d.email ?? entityData.contactEmail,
            phone:        d.phone ?? entityData.phone,
          };
        }
      } catch { /* Non-critical — proceed with payload data */ }

      const outcome = await createConfirmedBooking(orgId, payload, entityData, 'erica');
      return {
        result:          outcome.notes,
        success:         outcome.success,
        bookingId:       outcome.booking?.bookingId,
        calendarEventId: outcome.calendarEventId,
        meetingLink:     outcome.meetingLink,
        nextStep:        outcome.nextStep,
      };
    } catch (err: any) {
      return { result: `Booking creation error: ${err.message}` };
    }
  }

  // ── create_booking_request ──────────────────────────────────────────────
  if (functionName === 'create_booking_request') {
    const payload: CreateBookingRequestToolPayload = {
      entityId:          parameters.entityId ?? ids.entityId ?? '',
      entityType:        parameters.entityType ?? ids.entityType ?? 'lead',
      callId:            callId || undefined,
      batchId:           ids.batchId || undefined,
      batchItemId:       ids.batchItemId || undefined,
      briefId:           ids.briefId || undefined,
      meetingPurpose:    parameters.meetingPurpose ?? 'Discovery call',
      preferredFormat:   parameters.preferredFormat ?? 'phone',
      preferredTimezone: parameters.preferredTimezone ?? 'Australia/Sydney',
      internalNotes:     parameters.internalNotes ?? parameters.notes ?? '',
      fallbackReason:    parameters.fallbackReason ?? 'provider_not_configured',
    };

    try {
      let entityData = {
        entityName:   parameters.entityName ?? 'Unknown',
        businessName: parameters.businessName ?? 'Unknown',
        contactName:  parameters.contactName,
        phone:        parameters.phone,
      };
      try {
        const col  = payload.entityType === 'client' ? 'clients' : 'leads';
        const snap = await base.collection(col).doc(payload.entityId).get();
        if (snap.exists) {
          const d = snap.data()!;
          entityData = {
            entityName:   d.name ?? d.businessName ?? entityData.entityName,
            businessName: d.businessName ?? entityData.businessName,
            contactName:  d.contactName ?? d.name ?? entityData.contactName,
            phone:        d.phone ?? entityData.phone,
          };
        }
      } catch { /* Non-critical */ }

      const outcome = await createBookingRequest(orgId, payload, entityData, 'erica');
      return {
        result:       outcome.notes,
        success:      outcome.success,
        requestId:    outcome.bookingRequest?.requestId,
        nextStep:     outcome.nextStep,
      };
    } catch (err: any) {
      return { result: `Booking request creation error: ${err.message}` };
    }
  }

  // ── request_reschedule ──────────────────────────────────────────────────
  if (functionName === 'request_reschedule' || functionName === 'check_reschedule_availability') {
    const payload: RequestRescheduleToolPayload = {
      bookingId:       parameters.bookingId ?? '',
      entityId:        parameters.entityId ?? ids.entityId ?? '',
      entityType:      parameters.entityType ?? ids.entityType ?? 'lead',
      callId:          callId || undefined,
      reason:          parameters.reason ?? 'prospect_requested',
      reasonNote:      parameters.reasonNote ?? parameters.notes ?? undefined,
      preferenceTime:  parameters.preferenceTime ?? 'any',
      timezone:        parameters.timezone ?? 'Australia/Sydney',
      lookAheadDays:   Number(parameters.lookAheadDays ?? 7),
      durationMinutes: Number(parameters.durationMinutes ?? 30),
    };

    try {
      const outcome = await checkRescheduleAvailability(orgId, payload, 'erica');
      return {
        result:       outcome.notes,
        success:      outcome.success,
        changeId:     outcome.changeId,
        outcomeKey:   outcome.outcomeKey,
        offeredSlots: (outcome.offeredSlots ?? []).slice(0, 5).map((s: any) => ({
          slotId:    s.slotId,
          windowId:  s.windowId,
          label:     s.timeLabel,
          startIso:  s.startIso,
        })),
        nextStep:     outcome.nextStep,
        fallbackUsed: outcome.fallbackUsed,
      };
    } catch (err: any) {
      return { result: `Reschedule availability error: ${err.message}` };
    }
  }

  // ── confirm_reschedule ──────────────────────────────────────────────────
  if (functionName === 'confirm_reschedule') {
    const payload: ConfirmRescheduleToolPayload = {
      changeId:    parameters.changeId ?? '',
      bookingId:   parameters.bookingId ?? '',
      slotId:      parameters.slotId ?? '',
      windowId:    parameters.windowId ?? '',
      callId:      callId || undefined,
    };

    if (!payload.changeId || !payload.bookingId || !payload.slotId) {
      return { result: `confirm_reschedule requires changeId, bookingId, and slotId.` };
    }

    try {
      const outcome = await confirmReschedule(orgId, payload, 'erica');
      return {
        result:         outcome.notes,
        success:        outcome.success,
        changeId:       outcome.changeId,
        newSlotLabel:   outcome.newSlot?.timeLabel,
        meetingLink:    outcome.meetingLink,
        nextStep:       outcome.nextStep,
        fallbackUsed:   outcome.fallbackUsed,
      };
    } catch (err: any) {
      return { result: `Confirm reschedule error: ${err.message}` };
    }
  }

  // ── request_cancellation / confirm_cancellation ─────────────────────────
  if (functionName === 'request_cancellation' || functionName === 'confirm_cancellation') {
    const payload: RequestCancellationToolPayload = {
      bookingId:   parameters.bookingId ?? '',
      entityId:    parameters.entityId ?? ids.entityId ?? '',
      entityType:  parameters.entityType ?? ids.entityType ?? 'lead',
      callId:      callId || undefined,
      reason:      parameters.reason ?? 'prospect_requested',
      reasonNote:  parameters.reasonNote ?? parameters.notes ?? undefined,
    };

    if (!payload.bookingId) {
      return { result: `request_cancellation requires a bookingId.` };
    }

    try {
      const outcome = await cancelBooking(orgId, payload, 'erica');
      return {
        result:               outcome.notes,
        success:              outcome.success,
        changeId:             outcome.changeId,
        remindersSuppressed:  outcome.remindersSuppressed,
        nextStep:             outcome.nextStep,
        fallbackUsed:         outcome.fallbackUsed,
      };
    } catch (err: any) {
      return { result: `Cancellation error: ${err.message}` };
    }
  }

  // Unknown function
  return { result: `Function ${functionName} is not available for Erica calls.` };
}

// ---------------------------------------------------------------------------
// Reconcile: call ended — write final result to batch item
// ---------------------------------------------------------------------------

export async function reconcileCallEnded(
  db: Firestore,
  ids: ReturnType<typeof extractEricaIds>,
  body: Record<string, any>,
): Promise<void> {
  if (!ids.orgId || !ids.batchId || !ids.batchItemId) return;

  const report   = body?.message ?? body;
  const endedAt  = report?.call?.endedAt ?? report?.endedAt ?? new Date().toISOString();
  const startedAt = report?.call?.startedAt ?? report?.startedAt;
  const durationMs = startedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : null;
  const durationSeconds = durationMs ? Math.round(durationMs / 1000) : undefined;

  // Read the vapiCall record to get tool call results
  let vapiCallData: Record<string, any> = {};
  if (ids.momentumCallId) {
    try {
      const snap = await db.collection('orgs').doc(ids.orgId)
        .collection('vapiCalls').doc(ids.momentumCallId).get();
      vapiCallData = snap.data() ?? {};
    } catch {}
  }

  // Determine outcome
  const booked    = vapiCallData.booked ?? false;
  const objections = (vapiCallData.objections ?? []) as any[];
  const outcome   = vapiCallData.callOutcome
    ?? (booked ? 'meeting_booked' : objections.length > 0 ? 'objection_raised' : 'completed');

  const summary   = report?.summary ?? report?.call?.analysis?.summary ?? vapiCallData.outcomeNotes ?? null;
  const nextStep  = vapiCallData.nextStep ?? null;

  // Build function calls summary
  const functionCallsSummary: string[] = (vapiCallData.toolCallLog ?? [])
    .map((t: any) => `${t.toolName}: ${t.result ?? 'ok'}`);

  const result: EricaCallResult = {
    resultId:          randomUUID(),
    batchItemId:       ids.batchItemId,
    callId:            ids.momentumCallId ?? '',
    outcome:           outcome as any,
    booked,
    appointmentDetails: booked ? vapiCallData.bookingDetails : undefined,
    objectionRaised:   objections[0]?.type,
    summaryNotes:      summary,
    nextStep,
    followUpRequired:  !booked && outcome !== 'not_interested',
    escalatedToHuman:  false,
    callDurationSeconds: durationSeconds,
    recordedAt:        new Date().toISOString(),
  };

  // Write result back to the batch item
  await writeCallResult({
    orgId:   ids.orgId,
    batchId: ids.batchId,
    itemId:  ids.batchItemId,
    result,
  });

  // Update vapiCall doc
  if (ids.momentumCallId) {
    await db.collection('orgs').doc(ids.orgId)
      .collection('vapiCalls').doc(ids.momentumCallId)
      .set({
        status:         'completed',
        endedAt,
        durationSeconds,
        callSummary:    summary,
        callTranscript: report?.transcript ?? null,
        recordingUrl:   report?.artifact?.recordingUrl ?? report?.call?.artifact?.recordingUrl ?? null,
        finalOutcome:   outcome,
        lastUpdatedAt:  new Date().toISOString(),
      }, { merge: true });
  }

  await writeEventAudit(db, ids.orgId, {
    type: 'call.ended', ...ids,
    note: `Outcome: ${outcome} | Booked: ${booked} | Duration: ${durationSeconds ?? '?'}s`,
  });
}

// ---------------------------------------------------------------------------
// Reconcile: call failed
// ---------------------------------------------------------------------------

export async function reconcileCallFailed(
  db: Firestore,
  ids: ReturnType<typeof extractEricaIds>,
  body: Record<string, any>,
): Promise<void> {
  if (!ids.orgId || !ids.batchId || !ids.batchItemId) return;

  const failReason = body?.message?.call?.endedReason
    ?? body?.call?.endedReason
    ?? body?.reason
    ?? 'Call failed';

  await updateItemStatus({
    orgId:   ids.orgId,
    batchId: ids.batchId,
    itemId:  ids.batchItemId,
    status:  'failed',
  });

  if (ids.momentumCallId) {
    await db.collection('orgs').doc(ids.orgId)
      .collection('vapiCalls').doc(ids.momentumCallId)
      .set({ status: 'failed', failedAt: new Date().toISOString(), failReason }, { merge: true });
  }

  await writeEventAudit(db, ids.orgId, {
    type: 'call.failed', ...ids, note: failReason,
  });
}

// ---------------------------------------------------------------------------
// Event audit log
// ---------------------------------------------------------------------------

async function writeEventAudit(
  db: Firestore,
  orgId: string,
  event: {
    type: string;
    orgId?: string | null;
    batchId?: string | null;
    batchItemId?: string | null;
    momentumCallId?: string | null;
    vapiCallId?: string | null;
    note?: string;
    data?: any;
  },
) {
  if (!orgId) return;
  try {
    await db.collection('orgs').doc(orgId).collection('ericaEventAudit').add({
      ...event,
      eventId:    randomUUID(),
      receivedAt: new Date().toISOString(),
    });
  } catch { /* never throw from audit */ }
}
