import type { Lead, Activity } from "@shared/schema";

export type NBAActionType = 'call' | 'sms' | 'email' | 'meeting' | 'dropin' | 'proposal' | 'followup' | 'research';

export type NBAActionStatus = 'open' | 'done' | 'dismissed';

// Client type for NBA engine (matches frontend Client type)
export interface ClientForNBA {
  id: string;
  businessName: string;
  primaryContactName: string;
  phone?: string;
  email?: string;
  address?: string;
  healthStatus: 'green' | 'amber' | 'red';
  churnRiskScore: number;
  strategyStatus: 'not_started' | 'in_progress' | 'completed' | 'needs_review';
  totalMRR: number;
  lastContactDate?: Date;
  nextContactDate?: Date;
  preferredContactCadenceDays: number;
  notes?: string;
}

export interface NBAAction {
  id: string;
  targetType: 'lead' | 'deal' | 'client';
  targetId: string;
  title: string;
  suggestedActionType: NBAActionType;
  suggestedMessage: string;
  suggestedEmail: { subject: string; body: string } | null;
  nepqQuestions: [string, string, string];
  reason: string;
  whyBullets: string[];
  suggestedNextStep: string;
  priorityScore: number;
  points: number;
  dueAt: Date | null;
  status: NBAActionStatus;
  createdAt: Date;
  updatedAt: Date;
  aiModelVersion: string;
  suppressUntil: Date | null;
  dismissedReason: string | null;
  dismissedAt: Date | null;
  fingerprint: string;
}

const ACTION_POINTS: Record<NBAActionType, number> = {
  call: 5,
  sms: 3,
  email: 3,
  meeting: 8,
  dropin: 8,
  proposal: 6,
  followup: 5,
  research: 2,
};

export interface DailyTargets {
  calls: { target: number; completed: number };
  meetings: { target: number; completed: number };
  proposals: { target: number; completed: number };
}

export interface NBAEngineInput {
  lead: Lead;
  activities: Activity[];
  dailyTargets: DailyTargets;
  existingFingerprints: string[];
}

export interface NBARecommendation {
  targetType: 'lead' | 'deal' | 'client';
  targetId: string;
  title: string;
  suggestedActionType: NBAActionType;
  suggestedMessage: string;
  suggestedEmail: { subject: string; body: string } | null;
  nepqQuestions: [string, string, string];
  reason: string;
  whyBullets: string[];
  suggestedNextStep: string;
  priorityScore: number;
  points: number;
  dueAt: Date | null;
  fingerprint: string;
  safetyChecks: {
    requiresPhone: boolean;
    requiresEmail: boolean;
    missingFields: string[];
  };
}

function generateFingerprint(targetId: string, actionType: NBAActionType): string {
  return `${targetId}-${actionType}-${new Date().toISOString().split('T')[0]}`;
}

function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs(date2.getTime() - date1.getTime()) / oneDay);
}

function getLastActivityDate(activities: Activity[]): Date | null {
  if (!activities || activities.length === 0) return null;
  const sorted = [...activities].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return new Date(sorted[0].createdAt);
}

export function calculatePriorityScore(lead: Lead, activities: Activity[], dailyTargets: DailyTargets): number {
  let score = 0;
  const now = new Date();
  const lastActivityDate = getLastActivityDate(activities);
  
  const nextContactDate = lead.nextContactDate ? new Date(lead.nextContactDate) : null;
  
  if (nextContactDate && now > nextContactDate) {
    const hasActivitySince = lastActivityDate && lastActivityDate > nextContactDate;
    if (!hasActivitySince) {
      score += 30;
    }
  }
  
  if (lead.stage === 'proposal') {
    const daysSinceActivity = lastActivityDate ? daysBetween(now, lastActivityDate) : 999;
    if (daysSinceActivity >= 2) {
      score += 25;
    }
  }
  
  if (lead.stage === 'contacted') {
    const daysSinceActivity = lastActivityDate ? daysBetween(now, lastActivityDate) : 999;
    if (daysSinceActivity >= 3) {
      score += 20;
    }
  }
  
  if (lead.mrr) {
    if (lead.mrr >= 5000) {
      score += 15;
    } else if (lead.mrr >= 2500) {
      score += 10;
    } else if (lead.mrr >= 1000) {
      score += 5;
    }
  }
  
  const updatedAt = new Date(lead.updatedAt);
  const daysSinceUpdate = daysBetween(now, updatedAt);
  if (daysSinceUpdate >= 7) {
    score += 15;
  }
  
  const callsShortfall = dailyTargets.calls.target - dailyTargets.calls.completed;
  const meetingsShortfall = dailyTargets.meetings.target - dailyTargets.meetings.completed;
  
  if (callsShortfall > 5) {
    score += 5;
  }
  
  if (meetingsShortfall > 0) {
    score += 10;
  }
  
  return Math.min(100, Math.max(0, score));
}

export function selectActionType(
  lead: Lead, 
  activities: Activity[], 
  dailyTargets: DailyTargets
): NBAActionType {
  const hasPhone = !!lead.phone;
  const hasEmail = !!lead.email;
  const lastActivityDate = getLastActivityDate(activities);
  const now = new Date();
  
  if (!hasPhone && !hasEmail) {
    return 'research';
  }
  
  if (lead.stage === 'proposal') {
    return hasPhone ? 'call' : 'email';
  }
  
  if (lead.stage === 'verbal_commit') {
    return hasPhone ? 'call' : 'email';
  }
  
  if (lead.stage === 'discovery' || lead.stage === 'qualified') {
    if (hasPhone && dailyTargets.meetings.target > dailyTargets.meetings.completed) {
      return 'meeting';
    }
    return hasPhone ? 'call' : 'email';
  }
  
  if (lead.stage === 'suspect' || lead.stage === 'contacted') {
    if (hasPhone && dailyTargets.calls.target > dailyTargets.calls.completed) {
      return 'call';
    }
    return hasEmail ? 'email' : 'sms';
  }
  
  if (lead.stage === 'engaged') {
    return hasPhone ? 'call' : 'email';
  }
  
  if (lead.stage === 'nurture') {
    const touchChannel = lead.lastTouchChannel;
    if (touchChannel === 'call' && hasEmail) return 'email';
    if (touchChannel === 'email' && hasPhone) return 'sms';
    if (touchChannel === 'sms' && hasPhone) return 'call';
    return hasEmail ? 'email' : hasPhone ? 'sms' : 'research';
  }
  
  return 'followup';
}

function generateTitle(lead: Lead, actionType: NBAActionType): string {
  const contactName = lead.contactName || lead.companyName;
  
  switch (actionType) {
    case 'call':
      return `Call ${contactName}`;
    case 'sms':
      return `Text ${contactName}`;
    case 'email':
      return `Email ${contactName}`;
    case 'meeting':
      return `Book meeting with ${contactName}`;
    case 'dropin':
      return `Drop in on ${contactName}`;
    case 'proposal':
      return `Send proposal to ${contactName}`;
    case 'followup':
      return `Follow up with ${contactName}`;
    case 'research':
      return `Research ${contactName}`;
  }
}

function generateReason(lead: Lead, actionType: NBAActionType, priorityScore: number): string {
  const stage = lead.stage;
  
  if (priorityScore >= 50) {
    return `High priority: ${lead.companyName} needs attention based on ${stage} stage and activity patterns.`;
  }
  
  if (priorityScore >= 30) {
    return `${lead.companyName} is ready for the next step in the sales process.`;
  }
  
  return `Time to engage ${lead.companyName} and move forward.`;
}

function generateWhyBullets(lead: Lead, activities: Activity[], actionType: NBAActionType): string[] {
  const bullets: string[] = [];
  const now = new Date();
  const lastActivityDate = getLastActivityDate(activities);
  
  if (lead.nextContactDate) {
    const nextContact = new Date(lead.nextContactDate);
    if (now > nextContact) {
      bullets.push(`Overdue for follow-up since ${nextContact.toLocaleDateString()}`);
    } else {
      bullets.push(`Next contact scheduled for ${nextContact.toLocaleDateString()}`);
    }
  }
  
  if (lastActivityDate) {
    const days = daysBetween(now, lastActivityDate);
    bullets.push(`Last activity was ${days} days ago`);
  } else {
    bullets.push(`No recent activity recorded`);
  }
  
  if (lead.mrr && lead.mrr > 0) {
    bullets.push(`Estimated value: $${lead.mrr.toLocaleString()}/mo`);
  }
  
  bullets.push(`Current stage: ${lead.stage}`);
  
  if (lead.nepqLabel) {
    bullets.push(`NEPQ Label: ${lead.nepqLabel}`);
  }
  
  return bullets.slice(0, 5);
}

function generateSuggestedMessage(lead: Lead, actionType: NBAActionType): string {
  const contactName = lead.contactName || 'there';
  const companyName = lead.companyName;
  
  switch (actionType) {
    case 'call':
      return `Hi ${contactName}, this is [Your Name] calling about ${companyName}. Do you have a few minutes to discuss how we can help?`;
    case 'sms':
      return `Hi ${contactName}, following up on ${companyName}. When would be a good time for a quick call?`;
    case 'email':
      return `Hi ${contactName},\n\nI wanted to follow up regarding ${companyName}. I have some insights that might be valuable for your business.\n\nWould you have time for a brief call this week?\n\nBest regards`;
    case 'meeting':
      return `Hi ${contactName}, I'd like to schedule a meeting to discuss how we can help ${companyName} achieve its goals.`;
    case 'dropin':
      return `Visiting ${companyName} to check in and discuss next steps.`;
    case 'proposal':
      return `Hi ${contactName}, I'm preparing a proposal for ${companyName} based on our recent discussions.`;
    case 'followup':
      return `Hi ${contactName}, just following up on our previous conversation about ${companyName}.`;
    case 'research':
      return `Researching ${companyName} to gather more information about their needs and decision-making process.`;
  }
}

function generateSuggestedEmail(lead: Lead, actionType: NBAActionType): { subject: string; body: string } | null {
  if (actionType !== 'email') return null;
  
  const contactName = lead.contactName || 'there';
  const companyName = lead.companyName;
  
  return {
    subject: `Following up - ${companyName}`,
    body: `Hi ${contactName},\n\nI hope this message finds you well. I wanted to follow up regarding ${companyName} and see if you had any questions about how we can help.\n\nWould you have time for a brief 15-minute call this week? I'd love to share some insights that might be valuable for your business.\n\nLooking forward to hearing from you.\n\nBest regards,\n[Your Name]`
  };
}

function generateNEPQQuestions(lead: Lead, actionType: NBAActionType): [string, string, string] {
  if (lead.stage === 'suspect' || lead.stage === 'contacted') {
    return [
      "What's currently driving your decision to explore new solutions?",
      "What happens if you don't address this situation soon?",
      "Who else is involved in making this type of decision?"
    ];
  }
  
  if (lead.stage === 'engaged' || lead.stage === 'qualified') {
    return [
      "What would success look like for you in this partnership?",
      "What concerns do you have about moving forward?",
      "What timeline are you working with?"
    ];
  }
  
  if (lead.stage === 'discovery' || lead.stage === 'proposal') {
    return [
      "What's the most important factor in your decision?",
      "What would need to happen for you to feel confident moving forward?",
      "Is there anything else you need from us to make this decision?"
    ];
  }
  
  if (lead.stage === 'verbal_commit') {
    return [
      "What's the next step to finalize our agreement?",
      "Is there anyone else who needs to sign off on this?",
      "What's your preferred start date?"
    ];
  }
  
  return [
    "What's your current situation with this?",
    "What would you like to see change?",
    "What's driving the timing on this?"
  ];
}

function generateSuggestedNextStep(lead: Lead, actionType: NBAActionType): string {
  switch (actionType) {
    case 'call':
      return "Schedule a follow-up call or next meeting";
    case 'sms':
      return "Get confirmation on best time to call";
    case 'email':
      return "Request a 15-minute discovery call";
    case 'meeting':
      return "Confirm meeting and send calendar invite";
    case 'dropin':
      return "Set next action based on visit outcome";
    case 'proposal':
      return "Schedule proposal review meeting";
    case 'followup':
      return "Advance to next stage or schedule next touch";
    case 'research':
      return "Update lead record with findings";
  }
}

function getMissingFields(lead: Lead, actionType: NBAActionType): string[] {
  const missing: string[] = [];
  
  if (['call', 'sms'].includes(actionType) && !lead.phone) {
    missing.push('phone');
  }
  
  if (actionType === 'email' && !lead.email) {
    missing.push('email');
  }
  
  if (!lead.contactName) {
    missing.push('contactName');
  }
  
  return missing;
}

export function generateNBARecommendation(input: NBAEngineInput): NBARecommendation | null {
  const { lead, activities, dailyTargets, existingFingerprints } = input;
  
  if (lead.stage === 'won' || lead.stage === 'lost' || lead.archived) {
    return null;
  }
  
  const actionType = selectActionType(lead, activities, dailyTargets);
  const fingerprint = generateFingerprint(lead.id, actionType);
  
  if (existingFingerprints.includes(fingerprint)) {
    return null;
  }
  
  const priorityScore = calculatePriorityScore(lead, activities, dailyTargets);
  const points = ACTION_POINTS[actionType];
  
  const missingFields = getMissingFields(lead, actionType);
  const finalActionType = missingFields.length > 0 && 
    (missingFields.includes('phone') || missingFields.includes('email')) 
    ? 'research' 
    : actionType;
  
  const dueAt = lead.nextContactDate ? new Date(lead.nextContactDate) : null;
  
  return {
    targetType: 'lead',
    targetId: lead.id,
    title: generateTitle(lead, finalActionType),
    suggestedActionType: finalActionType,
    suggestedMessage: generateSuggestedMessage(lead, finalActionType),
    suggestedEmail: generateSuggestedEmail(lead, finalActionType),
    nepqQuestions: generateNEPQQuestions(lead, finalActionType),
    reason: generateReason(lead, finalActionType, priorityScore),
    whyBullets: generateWhyBullets(lead, activities, finalActionType),
    suggestedNextStep: generateSuggestedNextStep(lead, finalActionType),
    priorityScore,
    points: ACTION_POINTS[finalActionType],
    dueAt,
    fingerprint: generateFingerprint(lead.id, finalActionType),
    safetyChecks: {
      requiresPhone: ['call', 'sms'].includes(finalActionType),
      requiresEmail: finalActionType === 'email',
      missingFields
    }
  };
}

export function generateNBAQueue(
  leads: Lead[], 
  activitiesMap: Map<string, Activity[]>,
  dailyTargets: DailyTargets,
  existingFingerprints: string[],
  limit: number = 10
): NBARecommendation[] {
  const recommendations: NBARecommendation[] = [];
  
  for (const lead of leads) {
    const activities = activitiesMap.get(lead.id) || [];
    
    const recommendation = generateNBARecommendation({
      lead,
      activities,
      dailyTargets,
      existingFingerprints
    });
    
    if (recommendation) {
      recommendations.push(recommendation);
      existingFingerprints.push(recommendation.fingerprint);
    }
  }
  
  recommendations.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    
    if (a.dueAt && b.dueAt) {
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    }
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    
    return 0;
  });
  
  return recommendations.slice(0, limit);
}

export function deduplicateActions(
  newActions: NBARecommendation[], 
  existingQueue: NBAAction[]
): NBARecommendation[] {
  const existingFingerprints = new Set(
    existingQueue
      .filter(a => a.status === 'open')
      .map(a => a.fingerprint)
  );
  
  const suppressedFingerprints = new Set(
    existingQueue
      .filter(a => a.suppressUntil && new Date(a.suppressUntil) > new Date())
      .map(a => a.fingerprint)
  );
  
  return newActions.filter(action => 
    !existingFingerprints.has(action.fingerprint) &&
    !suppressedFingerprints.has(action.fingerprint)
  );
}

export interface AIEnhancedInput {
  lead: Lead;
  activities: Activity[];
  dailyTargets: DailyTargets;
  timezone?: string;
}

export function buildAIPrompt(input: AIEnhancedInput): string {
  const { lead, activities, dailyTargets, timezone = 'UTC' } = input;
  const now = new Date();
  
  const recentActivities = activities
    .slice(0, 10)
    .map(a => `${a.type} on ${new Date(a.createdAt).toLocaleDateString()}: ${a.notes || 'No notes'}`)
    .join('\n');

  return `You are a sales AI assistant using Fanatical Prospecting methodology. Recommend the single best next action for this lead.

CURRENT TIME: ${now.toISOString()} (${timezone})

DAILY TARGETS:
- Calls: ${dailyTargets.calls.completed}/${dailyTargets.calls.target}
- Meetings: ${dailyTargets.meetings.completed}/${dailyTargets.meetings.target}
- Proposals: ${dailyTargets.proposals.completed}/${dailyTargets.proposals.target}

LEAD SUMMARY:
- Business: ${lead.companyName}
- Contact: ${lead.contactName || 'Unknown'}
- Stage: ${lead.stage}
- Value: ${lead.mrr ? `$${lead.mrr}/mo` : 'Unknown'}
- Next Contact: ${lead.nextContactDate ? new Date(lead.nextContactDate).toLocaleDateString() : 'Not set'}
- Last Activity: ${lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleDateString() : 'Never'}
- Phone: ${lead.phone ? 'Available' : 'Missing'}
- Email: ${lead.email ? 'Available' : 'Missing'}
- NEPQ Label: ${lead.nepqLabel || 'None'}
- Notes: ${lead.notes || 'None'}

RECENT ACTIVITIES (last 10):
${recentActivities || 'No recent activities'}

Generate a JSON response with this exact schema:
{
  "suggestedActionType": "call"|"sms"|"email"|"meeting"|"dropin"|"proposal"|"followup"|"research",
  "title": "string",
  "reason": "string",
  "whyBullets": ["string","string","string"],
  "suggestedMessage": "string",
  "suggestedEmail": { "subject": "string", "body": "string" } | null,
  "nepqQuestions": ["string","string","string"],
  "suggestedNextStep": "string",
  "priorityScore": 0-100,
  "points": number,
  "dueAt": "ISO8601 or null",
  "safetyChecks": {
    "requiresPhone": boolean,
    "requiresEmail": boolean,
    "missingFields": ["string"]
  }
}

Rules:
- suggestedEmail is only populated when actionType is "email"
- Provide exactly 3 NEPQ questions
- If phone/email is missing for a call/email action, suggest "research" and list missing fields
- priorityScore should reflect urgency (overdue = higher, high value = higher)
- points: call=5, sms=3, email=3, meeting=8, dropin=8, proposal=6, followup=5, research=2

Output ONLY valid JSON, no markdown or extra text.`;
}

export interface AIEnhancedRecommendation extends NBARecommendation {
  aiEnhanced: boolean;
  aiModelVersion: string;
}

export function parseAIResponse(
  response: string, 
  lead: Lead, 
  fallback: NBARecommendation
): AIEnhancedRecommendation {
  try {
    const parsed = JSON.parse(response);
    
    const fingerprint = generateFingerprint(lead.id, parsed.suggestedActionType || fallback.suggestedActionType);
    
    return {
      targetType: 'lead',
      targetId: lead.id,
      title: parsed.title || fallback.title,
      suggestedActionType: parsed.suggestedActionType || fallback.suggestedActionType,
      suggestedMessage: parsed.suggestedMessage || fallback.suggestedMessage,
      suggestedEmail: parsed.suggestedEmail || fallback.suggestedEmail,
      nepqQuestions: parsed.nepqQuestions || fallback.nepqQuestions,
      reason: parsed.reason || fallback.reason,
      whyBullets: parsed.whyBullets || fallback.whyBullets,
      suggestedNextStep: parsed.suggestedNextStep || fallback.suggestedNextStep,
      priorityScore: typeof parsed.priorityScore === 'number' ? parsed.priorityScore : fallback.priorityScore,
      points: typeof parsed.points === 'number' ? parsed.points : fallback.points,
      dueAt: parsed.dueAt ? new Date(parsed.dueAt) : fallback.dueAt,
      fingerprint,
      safetyChecks: parsed.safetyChecks || fallback.safetyChecks,
      aiEnhanced: true,
      aiModelVersion: 'gpt-4o-mini'
    };
  } catch (e) {
    return {
      ...fallback,
      aiEnhanced: false,
      aiModelVersion: 'fallback'
    };
  }
}

// ============================================
// Client NBA Recommendation Functions
// ============================================

export interface ClientNBAEngineInput {
  client: ClientForNBA;
  existingFingerprints: string[];
}

function generateClientFingerprint(clientId: string, actionType: NBAActionType): string {
  return `client-${clientId}-${actionType}-${new Date().toISOString().split('T')[0]}`;
}

export function calculateClientPriorityScore(client: ClientForNBA): number {
  let score = 0;
  const now = new Date();
  
  // High priority if health status is red or amber
  if (client.healthStatus === 'red') {
    score += 40;
  } else if (client.healthStatus === 'amber') {
    score += 25;
  }
  
  // High churn risk
  if (client.churnRiskScore >= 70) {
    score += 30;
  } else if (client.churnRiskScore >= 50) {
    score += 15;
  }
  
  // Contact overdue
  if (client.lastContactDate) {
    const daysSinceContact = Math.floor((now.getTime() - new Date(client.lastContactDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceContact > client.preferredContactCadenceDays * 2) {
      score += 25;
    } else if (daysSinceContact > client.preferredContactCadenceDays) {
      score += 15;
    }
  } else {
    score += 20;
  }
  
  // Strategy needs attention
  if (client.strategyStatus === 'needs_review') {
    score += 10;
  } else if (client.strategyStatus === 'not_started') {
    score += 15;
  }
  
  // High MRR clients get more priority
  if (client.totalMRR >= 5000) {
    score += 10;
  } else if (client.totalMRR >= 2000) {
    score += 5;
  }
  
  return Math.min(100, Math.max(0, score));
}

export function selectClientActionType(client: ClientForNBA): NBAActionType {
  const hasPhone = !!client.phone;
  const hasEmail = !!client.email;
  
  if (!hasPhone && !hasEmail) {
    return 'research';
  }
  
  // Red health status - urgent call needed
  if (client.healthStatus === 'red') {
    return hasPhone ? 'call' : 'email';
  }
  
  // Strategy needs review - schedule meeting
  if (client.strategyStatus === 'needs_review' || client.strategyStatus === 'not_started') {
    return 'meeting';
  }
  
  // Amber status - check in
  if (client.healthStatus === 'amber') {
    return hasPhone ? 'call' : 'email';
  }
  
  // Regular check-in
  return hasPhone ? 'call' : 'email';
}

function generateClientTitle(client: ClientForNBA, actionType: NBAActionType): string {
  const contactName = client.primaryContactName || client.businessName;
  
  switch (actionType) {
    case 'call':
      return `Check in with ${contactName}`;
    case 'email':
      return `Send update to ${contactName}`;
    case 'meeting':
      return `Schedule review with ${contactName}`;
    case 'dropin':
      return `Visit ${contactName}`;
    case 'followup':
      return `Follow up with ${contactName}`;
    default:
      return `Contact ${contactName}`;
  }
}

function generateClientReason(client: ClientForNBA, priorityScore: number): string {
  if (client.healthStatus === 'red') {
    return `Critical: ${client.businessName} health status is red. Immediate attention required.`;
  }
  
  if (client.healthStatus === 'amber') {
    return `At-risk: ${client.businessName} needs proactive engagement to prevent churn.`;
  }
  
  if (client.strategyStatus === 'needs_review') {
    return `${client.businessName} strategy needs review to ensure alignment with goals.`;
  }
  
  if (priorityScore >= 50) {
    return `High priority check-in needed for ${client.businessName}.`;
  }
  
  return `Regular check-in with ${client.businessName} to maintain relationship.`;
}

function generateClientWhyBullets(client: ClientForNBA): string[] {
  const bullets: string[] = [];
  const now = new Date();
  
  // Health status
  if (client.healthStatus === 'red') {
    bullets.push('Health status: Critical - requires immediate attention');
  } else if (client.healthStatus === 'amber') {
    bullets.push('Health status: At risk - proactive engagement needed');
  } else {
    bullets.push('Health status: Healthy');
  }
  
  // Churn risk
  if (client.churnRiskScore >= 70) {
    bullets.push(`High churn risk score: ${client.churnRiskScore}%`);
  } else if (client.churnRiskScore >= 50) {
    bullets.push(`Moderate churn risk score: ${client.churnRiskScore}%`);
  }
  
  // Last contact
  if (client.lastContactDate) {
    const days = Math.floor((now.getTime() - new Date(client.lastContactDate).getTime()) / (1000 * 60 * 60 * 24));
    bullets.push(`Last contact: ${days} days ago`);
  } else {
    bullets.push('No contact recorded yet');
  }
  
  // MRR
  if (client.totalMRR > 0) {
    bullets.push(`Monthly value: $${client.totalMRR.toLocaleString()}`);
  }
  
  // Strategy status
  if (client.strategyStatus === 'needs_review') {
    bullets.push('Strategy needs review');
  } else if (client.strategyStatus === 'not_started') {
    bullets.push('Strategy not yet started');
  }
  
  return bullets.slice(0, 5);
}

function generateClientMessage(client: ClientForNBA, actionType: NBAActionType): string {
  const contactName = client.primaryContactName || 'there';
  const businessName = client.businessName;
  
  switch (actionType) {
    case 'call':
      return `Hi ${contactName}, this is [Your Name]. I wanted to check in on how things are going with ${businessName}. Do you have a few minutes?`;
    case 'email':
      return `Hi ${contactName},\n\nI wanted to check in and see how things are going at ${businessName}. Is there anything you need from us?\n\nBest regards`;
    case 'meeting':
      return `Hi ${contactName}, I'd like to schedule a strategy review for ${businessName}. When would work best for you?`;
    default:
      return `Checking in with ${businessName}.`;
  }
}

function getClientMissingFields(client: ClientForNBA, actionType: NBAActionType): string[] {
  const missing: string[] = [];
  
  if (['call'].includes(actionType) && !client.phone) {
    missing.push('phone');
  }
  
  if (actionType === 'email' && !client.email) {
    missing.push('email');
  }
  
  return missing;
}

export function generateClientNBARecommendation(input: ClientNBAEngineInput): NBARecommendation | null {
  const { client, existingFingerprints } = input;
  
  const actionType = selectClientActionType(client);
  const fingerprint = generateClientFingerprint(client.id, actionType);
  
  if (existingFingerprints.includes(fingerprint)) {
    return null;
  }
  
  const priorityScore = calculateClientPriorityScore(client);
  const points = ACTION_POINTS[actionType];
  
  const missingFields = getClientMissingFields(client, actionType);
  const finalActionType = missingFields.length > 0 && 
    (missingFields.includes('phone') || missingFields.includes('email')) 
    ? 'research' 
    : actionType;
  
  const dueAt = client.nextContactDate ? new Date(client.nextContactDate) : null;
  
  return {
    targetType: 'client',
    targetId: client.id,
    title: generateClientTitle(client, finalActionType),
    suggestedActionType: finalActionType,
    suggestedMessage: generateClientMessage(client, finalActionType),
    suggestedEmail: finalActionType === 'email' ? {
      subject: `Checking in - ${client.businessName}`,
      body: generateClientMessage(client, 'email')
    } : null,
    nepqQuestions: [
      "How has your experience been with our services so far?",
      "What challenges are you currently facing that we could help with?",
      "What goals are you working towards this quarter?"
    ],
    reason: generateClientReason(client, priorityScore),
    whyBullets: generateClientWhyBullets(client),
    suggestedNextStep: 'Schedule next check-in based on cadence',
    priorityScore,
    points: ACTION_POINTS[finalActionType],
    dueAt,
    fingerprint: generateClientFingerprint(client.id, finalActionType),
    safetyChecks: {
      requiresPhone: ['call'].includes(finalActionType),
      requiresEmail: finalActionType === 'email',
      missingFields
    }
  };
}

export function generateClientNBAQueue(
  clients: ClientForNBA[],
  existingFingerprints: string[],
  limit: number = 10
): NBARecommendation[] {
  const recommendations: NBARecommendation[] = [];
  
  for (const client of clients) {
    const recommendation = generateClientNBARecommendation({
      client,
      existingFingerprints
    });
    
    if (recommendation) {
      recommendations.push(recommendation);
      existingFingerprints.push(recommendation.fingerprint);
    }
  }
  
  recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
  
  return recommendations.slice(0, limit);
}
