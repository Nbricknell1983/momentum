// =============================================================================
// ERICA CALLING SYSTEM — VAPI PAYLOAD BUILDER
// =============================================================================
// Maps Momentum's EricaCallBrief into a Vapi outbound call API payload.
//
// Key design decisions:
// - assistantOverrides.firstMessage = Erica's opening line from the brief
// - assistantOverrides.model.messages[0] = structured system prompt hint
// - All Momentum metadata (batchId, itemId, briefId, context) embedded in
//   the call metadata so webhooks can reconcile without a Firestore scan
// =============================================================================

import type { EricaCallBrief } from '../../client/src/lib/ericaTypes';
import { buildSystemPromptHint } from '../../client/src/lib/ericaBriefGenerator';
import { getVapiConfig } from '../vapi/config';

export interface EricaPayloadBuildParams {
  momentumCallId: string;
  batchId:        string;
  batchItemId:    string;
  assistantId:    string;
  brief:          EricaCallBrief;
}

export function buildEricaVapiPayload(params: EricaPayloadBuildParams): Record<string, any> {
  const { momentumCallId, batchId, batchItemId, assistantId, brief } = params;
  const cfg = getVapiConfig();

  if (!cfg.phoneNumberId) {
    throw new Error('VAPI_PHONE_NUMBER_ID is not set — cannot build Vapi payload');
  }
  if (!brief.phone) {
    throw new Error(`No phone number on brief for ${brief.businessName} — cannot dial`);
  }

  const pkt = brief.vapiContextPacket;

  // ── System prompt hint ────────────────────────────────────────────────────
  // This is the full structured briefing injected into Erica's system prompt
  // for this specific call. It overrides the generic assistant prompt.
  const systemPromptHint = buildSystemPromptHint(brief);

  // ── Payload ───────────────────────────────────────────────────────────────
  return {
    phoneNumberId: cfg.phoneNumberId,
    assistantId,
    customer: {
      number: brief.phone,
      name:   brief.contactName ?? brief.businessName,
    },

    // Override assistant behaviour for this specific call
    assistantOverrides: {
      // Erica's opening line — exactly what she says first
      firstMessage: pkt.openingLine,

      // Inject the full call brief as the system prompt for this call
      model: {
        messages: [
          {
            role:    'system',
            content: systemPromptHint,
          },
        ],
      },

      // Pass variables that Erica can reference during the call
      variableValues: {
        businessName:  brief.businessName,
        contactName:   brief.contactName ?? '',
        callIntent:    brief.callIntent,
        objective:     pkt.objective,
        whyCallingNow: pkt.whyCallingNow,
      },
    },

    // All Momentum metadata embedded — used by webhook reconciler
    metadata: {
      momentumCallId,
      orgId:         brief.vapiContextPacket.source,    // overwritten below
      batchId,
      batchItemId,
      briefId:       brief.briefId,
      intent:        brief.callIntent,
      callSource:    brief.callSource,
      entityType:    brief.entityType,
      entityId:      brief.entityId,
      contextPacket: pkt,
    },
  };
}

// Build the metadata block with correct orgId (orgId must be passed separately)
export function buildEricaVapiPayloadWithOrg(params: EricaPayloadBuildParams & { orgId: string }): Record<string, any> {
  const payload = buildEricaVapiPayload(params);
  payload.metadata.orgId = params.orgId;
  return payload;
}
