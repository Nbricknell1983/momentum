// =============================================================================
// ERICA RUNTIME PACKET BUILDER
// =============================================================================
// Converts a fully-formed EricaCallBrief into the EricaRuntimePacket
// that is delivered to Vapi at call launch.
//
// This is the single source of truth for:
//   - What Erica says first
//   - What questions she asks (and in what order)
//   - How she handles objections
//   - How she closes toward the appointment
//   - What actions she is allowed to take
//   - What the conversation must never touch
//   - The complete Vapi system prompt
//
// The builder never produces a generic fallback unless explicitly configured.
// If the brief is missing required fields, the build fails with an error.
// =============================================================================

import { v4 as uuid } from 'uuid';
import type {
  EricaRuntimePacket,
  EricaAssistantProfile,
  EricaAllowedActionSet,
  EricaAllowedAction,
  EricaConversationGuardrail,
  EricaRuntimeConfig,
} from './ericaRuntimeTypes';
import type { EricaCallBrief } from '../../client/src/lib/ericaTypes';
import {
  INTENT_STYLES,
  buildOpeningStrategy,
  buildQuestionStrategy,
  buildClosePlan,
} from './assistantInstructions';
import { buildObjectionHandlingPlan } from './objectionHandlingLibrary';

// ---------------------------------------------------------------------------
// Default assistant profile — override via EricaRuntimeConfig in Firestore
// ---------------------------------------------------------------------------

export const DEFAULT_ASSISTANT_PROFILE: EricaAssistantProfile = {
  name:             'Erica',
  voiceId:          'alloy',         // Vapi/OpenAI voice — override in config
  personality:      'Warm, direct, curious, and non-pushy. She genuinely cares about the person she\'s speaking with.',
  speakingStyle:    'Conversational, confident, never salesy. Uses short sentences. Pauses intentionally. Never rushes.',
  forbiddenWords:   ['discount', 'cheap', 'just quickly', 'real quick', 'honestly', 'literally', 'amazing', 'awesome deal', 'limited time'],
  maxCallDuration:  360,    // 6 minutes max — Erica doesn't linger
  silenceTimeoutMs: 8000,   // 8 seconds before Erica re-engages
};

// ---------------------------------------------------------------------------
// Tool action map — maps brief.allowedTools to typed EricaAllowedAction
// ---------------------------------------------------------------------------

const TOOL_ACTION_MAP: Record<string, EricaAllowedAction> = {
  book_appointment:        'book_appointment',
  take_message:            'take_message',
  request_callback:        'request_callback',
  createFollowUpTask:      'create_followup_task',
  create_followup_task:    'create_followup_task',
  logObjection:            'log_objection',
  log_objection:           'log_objection',
  logCallOutcome:          'log_call_outcome',
  log_call_outcome:        'log_call_outcome',
  scheduleMeetingRequest:  'schedule_meeting_request',
  schedule_meeting_request: 'schedule_meeting_request',
  createDraftFromCallOutcome: 'create_draft_from_outcome',
  create_draft_from_outcome:  'create_draft_from_outcome',
  createApprovalRequest:   'escalate_to_human',
  escalate_to_human:       'escalate_to_human',
};

const ALL_ACTIONS: EricaAllowedAction[] = [
  'book_appointment', 'take_message', 'request_callback',
  'create_followup_task', 'log_objection', 'log_call_outcome',
  'schedule_meeting_request', 'create_draft_from_outcome', 'escalate_to_human',
];

function buildAllowedActionSet(
  allowedToolStrings: string[],
  intent: string,
): EricaAllowedActionSet {
  const allowed = allowedToolStrings
    .map(t => TOOL_ACTION_MAP[t])
    .filter(Boolean) as EricaAllowedAction[];

  // Always include outcome logging as a baseline
  if (!allowed.includes('log_call_outcome')) allowed.push('log_call_outcome');
  if (!allowed.includes('log_objection'))    allowed.push('log_objection');

  const blocked = ALL_ACTIONS.filter(a => !allowed.includes(a));

  // Primary action depends on intent
  const primary: EricaAllowedAction = allowed.includes('book_appointment') ? 'book_appointment'
    : allowed.includes('schedule_meeting_request')                          ? 'schedule_meeting_request'
    : allowed.includes('request_callback')                                  ? 'request_callback'
    : 'log_call_outcome';

  const fallback: EricaAllowedAction = allowed.includes('take_message')        ? 'take_message'
    : allowed.includes('create_followup_task')                                  ? 'create_followup_task'
    : 'log_call_outcome';

  return { allowed, blocked, primary, fallback };
}

// ---------------------------------------------------------------------------
// Guardrail builder
// ---------------------------------------------------------------------------

function buildGuardrails(brief: EricaCallBrief): EricaConversationGuardrail {
  return {
    doNotMention:       brief.whatNotToSay,
    doNotPromise:       [
      'guaranteed results',
      'specific timelines without checking',
      'pricing without approval',
      'that we will fix the problem immediately',
    ],
    doNotUseTools:      [],   // Populated from allowedActions.blocked
    escalationTriggers: brief.escalationTriggers,
    maxCallDuration:    DEFAULT_ASSISTANT_PROFILE.maxCallDuration,
    silenceRecovery:    `Sorry — I just want to make sure I understood what you said. You mentioned [repeat last point]. Is that right?`,
    endCallStatement:   `Thanks so much for your time today, [name] — I really appreciate it. I'll follow up as we discussed. Have a great rest of your day.`,
  };
}

// ---------------------------------------------------------------------------
// System prompt generator
// ---------------------------------------------------------------------------

function buildSystemPrompt(packet: Omit<EricaRuntimePacket, 'systemPrompt' | 'inspectionSummary'>): string {
  const {
    callIntent, relationship, entityName, businessName, contactName,
    openingStrategy, questionStrategy, objectionPlan, closePlan,
    allowedActions, guardrails, intentStyle, assistantProfile,
  } = packet;

  const firstName  = contactName?.split(' ')[0] ?? entityName;
  const intentStyle_ = INTENT_STYLES[callIntent];

  return `
# ERICA RUNTIME INSTRUCTION SET
# Intent: ${callIntent.replace(/_/g, ' ').toUpperCase()}
# Generated: ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}

## WHO YOU ARE
You are Erica — a senior growth advisor calling on behalf of [Company]. You are warm, direct, and non-pushy. You genuinely care about the person you're speaking with and you never pitch products. You ask great questions and listen carefully.

Persona: ${assistantProfile.personality}
Speaking style: ${assistantProfile.speakingStyle}

## WHO YOU ARE CALLING
- Name: ${firstName} at ${businessName}${contactName ? ` (contact: ${contactName})` : ''}
- Relationship: ${relationship}
- Call type: ${callIntent.replace(/_/g, ' ')}

## WHY YOU ARE CALLING
${packet.openingStrategy.openingLine}

Operator context: ${intentStyle_.frameworkNote}

## HOW TO OPEN
1. Use this exact opening line (adapt naturally): "${openingStrategy.openingLine}"
2. After their response, bridge with: "${openingStrategy.followUpBridge}"
3. Ask permission: "${openingStrategy.permissionAsk}"
4. Keep opening under ${openingStrategy.maxOpeningWords} words.
5. DO NOT launch into a pitch after the opening. Wait. Listen.

## DISCOVERY — QUESTION FLOW (${questionStrategy.framework.replace(/_/g, ' ').toUpperCase()})
Use these questions in sequence. Ask ONE at a time. Wait for the full answer before asking the next.
${questionStrategy.stages.map((s, i) => `
Stage ${i + 1} — ${s.stage.replace(/_/g, ' ')}:
  Ask: "${s.question}"
  Intent: ${s.intent}
  If closed/negative: "${s.ifNegative}"
  Voss alternative: "${s.vossVariant}"`).join('\n')}

Pivot signal: ${questionStrategy.pivotSignal}
Max questions before pivoting to close: ${questionStrategy.maxQuestions}

## OBJECTION HANDLING (mode: ${objectionPlan.mode.replace(/_/g, ' ')})
Max attempts per objection: ${objectionPlan.maxAttempts}

${objectionPlan.responses.slice(0, 4).map(o => `
### If they say: ${o.objectionKey.replace(/_/g, ' ')}
1. Label: "${o.label}"
2. Acknowledge: "${o.acknowledgement}"
3. Ask: "${o.calibratedQuestion}"
4. Reframe (use only if appropriate): "${o.nepqReframe}"
5. Pivot to appointment: "${o.appointmentAsk}"
NEVER say: ${o.doNotSay.join(', ')}`).join('\n')}

## CLOSING — TOWARD THE APPOINTMENT
Close style: ${closePlan.styleKey.replace(/_/g, ' ')}
Max close attempts: ${closePlan.maxCloseAttempts}

1. Main close: "${closePlan.closingStatement}"
2. Calendar ask: "${closePlan.calendarAsk}"
3. If rejected: "${closePlan.fallbackClose}"
4. Release: "${closePlan.releaseStatement}"
${closePlan.urgencyHook ? `5. Urgency (only if truthful): "${closePlan.urgencyHook}"` : ''}

## ALLOWED ACTIONS
You may ONLY take these actions:
${allowedActions.allowed.map(a => `  ✓ ${a.replace(/_/g, ' ')}`).join('\n')}

You must NEVER use:
${allowedActions.blocked.map(a => `  ✗ ${a.replace(/_/g, ' ')}`).join('\n')}

Primary goal: ${allowedActions.primary.replace(/_/g, ' ')}
Fallback if primary unavailable: ${allowedActions.fallback.replace(/_/g, ' ')}

## GUARDRAILS — HARD RULES
NEVER mention:
${guardrails.doNotMention.map(d => `  ✗ ${d}`).join('\n')}

NEVER promise:
${guardrails.doNotPromise.map(d => `  ✗ ${d}`).join('\n')}

Escalate immediately if:
${guardrails.escalationTriggers.map(t => `  ⚡ ${t}`).join('\n')}

If silence > 8 seconds: "${guardrails.silenceRecovery}"
End call with: "${guardrails.endCallStatement}"
Hard stop at: ${guardrails.maxCallDuration} seconds

## FORBIDDEN WORDS
Never use: ${assistantProfile.forbiddenWords.join(', ')}

## WHAT MAKES A SUCCESSFUL CALL
- You asked great questions and they felt heard
- You moved toward the appointment without pressure
- You left the door open if the timing isn't right
- You logged the outcome accurately
- You did NOT pitch. You did NOT argue. You did NOT rush.
`.trim();
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildRuntimePacket(
  brief:  EricaCallBrief,
  config: Partial<EricaRuntimeConfig> = {},
): EricaRuntimePacket {
  const assistantProfile   = config.assistantProfile ?? DEFAULT_ASSISTANT_PROFILE;
  const objMode            = config.objectionHandlingMode ?? 'non_pushy';
  const closeAggression    = config.closeAggressiveness ?? 'standard';
  const openingOverride    = config.openingStyleOverrides?.[brief.callIntent];

  // Build each layer
  const openingStrategy  = buildOpeningStrategy(
    brief.callIntent,
    brief.entityName,
    brief.contactName,
    brief.openingAngle.openingLine,
    brief.relationship,
    openingOverride,
  );

  const questionStrategy = buildQuestionStrategy(brief.callIntent);

  const objectionPlan    = buildObjectionHandlingPlan(
    objMode,
    brief.objectionPredictions.map(o => o.objectionType),
  );

  const closePlan        = buildClosePlan(
    brief.callIntent,
    closeAggression,
    brief.entityName,
  );

  const allowedActions   = buildAllowedActionSet(brief.allowedTools, brief.callIntent);
  const guardrails       = buildGuardrails(brief);
  const intentStyle      = INTENT_STYLES[brief.callIntent];

  const basePacket: Omit<EricaRuntimePacket, 'systemPrompt' | 'inspectionSummary'> = {
    packetId:         uuid(),
    briefId:          brief.briefId,
    batchItemId:      brief.batchItemId,
    generatedAt:      new Date().toISOString(),
    callIntent:       brief.callIntent,
    callSource:       brief.callSource,
    relationship:     brief.relationship,
    entityName:       brief.entityName,
    businessName:     brief.businessName,
    contactName:      brief.contactName,
    phone:            brief.phone,
    assistantProfile,
    openingStrategy,
    questionStrategy,
    objectionPlan,
    closePlan,
    allowedActions,
    guardrails,
    intentStyle,
  };

  const systemPrompt = buildSystemPrompt(basePacket);

  const inspectionSummary = {
    intentLabel:        brief.callIntent.replace(/_/g, ' '),
    openingStyleLabel:  openingStrategy.styleKey.replace(/_/g, ' '),
    objectionModeLabel: objMode.replace(/_/g, ' '),
    closeStyleLabel:    closePlan.styleKey.replace(/_/g, ' '),
    allowedActionCount: allowedActions.allowed.length,
    guardrailCount:     guardrails.doNotMention.length + guardrails.escalationTriggers.length,
    questionCount:      questionStrategy.stages.length,
  };

  return { ...basePacket, systemPrompt, inspectionSummary };
}

// ---------------------------------------------------------------------------
// Inject runtime packet into Vapi assistant overrides
// ---------------------------------------------------------------------------

export function injectRuntimePacketIntoVapi(
  packet: EricaRuntimePacket,
  existingOverrides: Record<string, any> = {},
): Record<string, any> {
  return {
    ...existingOverrides,
    firstMessage: packet.openingStrategy.openingLine,
    model: {
      ...(existingOverrides.model ?? {}),
      messages: [
        {
          role:    'system',
          content: packet.systemPrompt,
        },
        ...(existingOverrides.model?.messages?.filter((m: any) => m.role !== 'system') ?? []),
      ],
      temperature: 0.4,    // Slightly lower — Erica stays grounded
    },
    voice: {
      ...(existingOverrides.voice ?? {}),
      voiceId: packet.assistantProfile.voiceId,
    },
    maxDurationSeconds: packet.assistantProfile.maxCallDuration,
    silenceTimeoutSeconds: Math.round(packet.assistantProfile.silenceTimeoutMs / 1000),
    metadata: {
      ...(existingOverrides.metadata ?? {}),
      runtimePacketId: packet.packetId,
      briefId:         packet.briefId,
      batchItemId:     packet.batchItemId,
      callIntent:      packet.callIntent,
    },
  };
}
