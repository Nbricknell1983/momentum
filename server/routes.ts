import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema, insertActivitySchema } from "@shared/schema";
import OpenAI from "openai";
import { firestore, isFirebaseAdminReady } from "./firebase";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============================================
  // Leads API
  // ============================================
  
  app.get("/api/leads", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const leads = await storage.getLeads(userId);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      res.json(lead);
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const parsed = insertLeadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid lead data", details: parsed.error.errors });
      }
      const lead = await storage.createLead(parsed.data);
      res.status(201).json(lead);
    } catch (error) {
      console.error("Error creating lead:", error);
      res.status(500).json({ error: "Failed to create lead" });
    }
  });

  app.put("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.updateLead(req.params.id, req.body);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      res.json(lead);
    } catch (error) {
      console.error("Error updating lead:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  app.delete("/api/leads/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteLead(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Lead not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting lead:", error);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  // ============================================
  // Activities API
  // ============================================

  app.get("/api/leads/:leadId/activities", async (req, res) => {
    try {
      const activities = await storage.getActivities(req.params.leadId);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      const parsed = insertActivitySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid activity data", details: parsed.error.errors });
      }
      const activity = await storage.createActivity(parsed.data);
      res.status(201).json(activity);
    } catch (error) {
      console.error("Error creating activity:", error);
      res.status(500).json({ error: "Failed to create activity" });
    }
  });

  // ============================================
  // Daily Plan AI Endpoints
  // ============================================
  
  app.post("/api/daily-plan/summary", async (req, res) => {
    try {
      const { leads, metrics, targets } = req.body;
      
      const prompt = `You are a sales coach helping a B2B sales rep plan their day using the Fanatical Prospecting methodology.

Based on this data:
- Priority leads requiring attention: ${JSON.stringify(leads?.slice(0, 5) || [])}
- Today's targets: Calls: ${targets?.calls || 25}, Doors: ${targets?.doors || 5}, Meetings: ${targets?.meetings || 2}
- Current progress: Calls: ${metrics?.calls || 0}, Doors: ${metrics?.doors || 0}, Meetings: ${metrics?.meetings || 0}

Generate a brief daily plan summary in JSON format with these exact fields:
{
  "todaysFocus": "One sentence describing the main priority for today",
  "nonNegotiableActions": ["Action 1", "Action 2", "Action 3"] (exactly 3 critical actions that must happen today),
  "riskAreas": ["Risk 1", "Risk 2"] (1-2 areas where the rep might fall short if not careful)
}

Keep it motivating but realistic. Focus on prospecting activities.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let summary;
      try {
        summary = JSON.parse(content);
        if (!summary.todaysFocus || !Array.isArray(summary.nonNegotiableActions) || !Array.isArray(summary.riskAreas)) {
          throw new Error("Invalid response structure");
        }
      } catch (e) {
        summary = {
          todaysFocus: "Focus on prospecting activities and pipeline management",
          nonNegotiableActions: ["Complete morning prospecting block", "Follow up on priority leads", "Update CRM notes"],
          riskAreas: ["Prospecting time may get interrupted", "Follow-ups could slip"]
        };
      }
      
      res.json({
        ...summary,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error generating daily plan summary:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  app.post("/api/daily-plan/debrief", async (req, res) => {
    try {
      const { targets, completedActions, battleScore } = req.body;
      
      const prompt = `You are a sales coach providing end-of-day feedback to a B2B sales rep using Fanatical Prospecting principles.

Today's Performance:
- Prospecting: Calls ${targets?.prospecting?.calls?.completed || 0}/${targets?.prospecting?.calls?.target || 25}, Doors ${targets?.prospecting?.doors?.completed || 0}/${targets?.prospecting?.doors?.target || 5}
- Meetings Booked: ${targets?.prospecting?.meetingsBooked?.completed || 0}/${targets?.prospecting?.meetingsBooked?.target || 2}
- Client Work: Check-ins ${targets?.clients?.checkIns?.completed || 0}/${targets?.clients?.checkIns?.target || 5}, Follow-ups ${targets?.clients?.followUps?.completed || 0}/${targets?.clients?.followUps?.target || 10}
- Battle Score Earned: ${battleScore || 0} points
- Actions Completed: ${completedActions || 0}

Generate an end-of-day debrief in JSON format:
{
  "aiReview": "2-3 sentence honest assessment of the day's performance",
  "improvements": ["Improvement 1", "Improvement 2"] (2 specific things to do better tomorrow),
  "tomorrowsFocus": "One sentence describing what should be the #1 priority tomorrow"
}

Be encouraging but honest. If they missed targets, acknowledge it but focus on solutions.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 400,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let debrief;
      try {
        debrief = JSON.parse(content);
        if (!debrief.aiReview || !Array.isArray(debrief.improvements)) {
          throw new Error("Invalid response structure");
        }
      } catch (e) {
        debrief = {
          aiReview: "Good effort today. Continue focusing on consistent prospecting activities.",
          improvements: ["Start prospecting block on time", "Log activities immediately after completion"],
          tomorrowsFocus: "Hit prospecting targets early in the day"
        };
      }
      
      res.json(debrief);
    } catch (error) {
      console.error("Error generating debrief:", error);
      res.status(500).json({ error: "Failed to generate debrief" });
    }
  });

  // ============================================
  // NBA (Next Best Action) API
  // ============================================

  app.post("/api/nba/generate", async (req, res) => {
    try {
      const { leads, activitiesMap, dailyTargets, existingFingerprints = [] } = req.body;
      
      if (!leads || !Array.isArray(leads)) {
        return res.status(400).json({ error: "leads array is required" });
      }
      
      const { generateNBAQueue } = await import("./nbaEngine");
      
      const activityMapConverted = new Map<string, any[]>();
      if (activitiesMap && typeof activitiesMap === 'object') {
        Object.entries(activitiesMap).forEach(([key, value]) => {
          activityMapConverted.set(key, value as any[]);
        });
      }
      
      const targets = dailyTargets || {
        calls: { target: 25, completed: 0 },
        meetings: { target: 2, completed: 0 },
        proposals: { target: 1, completed: 0 }
      };
      
      const recommendations = generateNBAQueue(
        leads,
        activityMapConverted,
        targets,
        existingFingerprints,
        10
      );
      
      res.json({ recommendations });
    } catch (error) {
      console.error("Error generating NBA queue:", error);
      res.status(500).json({ error: "Failed to generate NBA recommendations" });
    }
  });

  app.post("/api/nba/ai-enhance", async (req, res) => {
    try {
      const { lead, activities, dailyTargets, timezone } = req.body;
      
      if (!lead) {
        return res.status(400).json({ error: "lead is required" });
      }
      
      const { buildAIPrompt, generateNBARecommendation, parseAIResponse } = await import("./nbaEngine");
      
      const targets = dailyTargets || {
        calls: { target: 25, completed: 0 },
        meetings: { target: 2, completed: 0 },
        proposals: { target: 1, completed: 0 }
      };
      
      const fallback = generateNBARecommendation({
        lead,
        activities: activities || [],
        dailyTargets: targets,
        existingFingerprints: []
      });
      
      if (!fallback) {
        return res.status(400).json({ error: "Cannot generate recommendation for this lead" });
      }
      
      const prompt = buildAIPrompt({ lead, activities: activities || [], dailyTargets: targets, timezone });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 800,
        response_format: { type: "json_object" },
      });
      
      const content = response.choices[0]?.message?.content || "{}";
      const enhanced = parseAIResponse(content, lead, fallback);
      
      res.json({ recommendation: enhanced });
    } catch (error) {
      console.error("Error AI-enhancing NBA recommendation:", error);
      res.status(500).json({ error: "Failed to enhance NBA recommendation" });
    }
  });

  app.post("/api/nba/single", async (req, res) => {
    try {
      const { lead, activities, dailyTargets, existingFingerprints = [] } = req.body;
      
      if (!lead) {
        return res.status(400).json({ error: "lead is required" });
      }
      
      const { generateNBARecommendation } = await import("./nbaEngine");
      
      const targets = dailyTargets || {
        calls: { target: 25, completed: 0 },
        meetings: { target: 2, completed: 0 },
        proposals: { target: 1, completed: 0 }
      };
      
      const recommendation = generateNBARecommendation({
        lead,
        activities: activities || [],
        dailyTargets: targets,
        existingFingerprints
      });
      
      res.json({ recommendation });
    } catch (error) {
      console.error("Error generating single NBA:", error);
      res.status(500).json({ error: "Failed to generate NBA recommendation" });
    }
  });

  // ============================================
  // Momentum Coach API
  // ============================================
  
  app.post("/api/momentum/coach", async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "You are a sales coach in the style of Jeb Blount from 'Fanatical Prospecting'. Be firm, direct, and focus on inputs that drive outcomes. Never be generic or motivational. Be specific and actionable. Use phrases like 'Replacement before celebration', 'Inputs drive outcomes', 'Future pipeline protection'."
          },
          { role: "user", content: prompt }
        ],
        max_completion_tokens: 500,
      });

      const advice = response.choices[0]?.message?.content || "Focus on your prospecting activities. Inputs drive outcomes.";
      
      res.json({ advice });
    } catch (error) {
      console.error("Error generating coaching advice:", error);
      res.status(500).json({ error: "Failed to generate coaching advice" });
    }
  });

  // ============================================
  // Client AI Tools
  // ============================================

  app.post("/api/clients/ai/seo-blog", async (req, res) => {
    try {
      const { client, topic, keywords } = req.body;
      
      if (!client || !topic) {
        return res.status(400).json({ error: "Client and topic are required" });
      }

      const prompt = `You are an expert SEO content writer. Generate a blog post for a client.

Client Business: ${client.businessName}
Products/Services: ${client.products?.map((p: any) => p.productType).join(', ') || 'Marketing services'}
Topic: ${topic}
Target Keywords: ${keywords || 'local business, digital marketing'}

Generate a blog post in JSON format:
{
  "title": "SEO-optimized title with primary keyword",
  "metaDescription": "150-160 character meta description with keyword",
  "outline": ["Section 1", "Section 2", "Section 3", "Section 4"],
  "content": "Full blog post content with H2 headings marked as ## (800-1200 words)",
  "suggestedInternalLinks": ["Topic 1 to link to", "Topic 2 to link to"],
  "callToAction": "Compelling CTA for the business"
}

Write in a professional but engaging tone. Include the target keywords naturally.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const blogPost = JSON.parse(content);
      
      res.json(blogPost);
    } catch (error) {
      console.error("Error generating SEO blog:", error);
      res.status(500).json({ error: "Failed to generate SEO blog content" });
    }
  });

  app.post("/api/clients/ai/facebook-post", async (req, res) => {
    try {
      const { client, postType, promotion } = req.body;
      
      if (!client) {
        return res.status(400).json({ error: "Client is required" });
      }

      const prompt = `You are a social media marketing expert. Create a Facebook post for a client.

Client Business: ${client.businessName}
Industry/Services: ${client.products?.map((p: any) => p.productType).join(', ') || 'Local business'}
Post Type: ${postType || 'engagement'}
${promotion ? `Promotion/Offer: ${promotion}` : ''}

Generate a Facebook post in JSON format:
{
  "primaryPost": "Main post text (max 300 chars, engaging, with emoji)",
  "alternativePost": "Alternative version with different angle",
  "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3"],
  "bestTimeToPost": "Suggested posting time and day",
  "imagePrompt": "Description for an AI image generator or stock photo search",
  "engagementTip": "Tip to boost engagement on this post"
}

Make the posts authentic, engaging, and appropriate for the business type.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 800,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const post = JSON.parse(content);
      
      res.json(post);
    } catch (error) {
      console.error("Error generating Facebook post:", error);
      res.status(500).json({ error: "Failed to generate Facebook post" });
    }
  });

  app.post("/api/clients/ai/meeting-prep", async (req, res) => {
    try {
      const { client, meetingType, recentActivities, strategyPlan } = req.body;
      
      if (!client) {
        return res.status(400).json({ error: "Client is required" });
      }

      const prompt = `You are a client success manager preparing for a client meeting.

Client: ${client.businessName}
Health Status: ${client.healthStatus} (${client.healthStatus === 'red' ? 'Critical - at risk of churn' : client.healthStatus === 'amber' ? 'Needs attention' : 'Healthy'})
Products: ${client.products?.map((p: any) => `${p.productType} ($${p.monthlyValue}/mo)`).join(', ') || 'N/A'}
Total MRR: $${client.totalMRR || 0}
Last Contact: ${client.lastContactDate ? new Date(client.lastContactDate).toLocaleDateString() : 'Never'}
Strategy Status: ${client.strategyStatus || 'Not started'}
Meeting Type: ${meetingType || 'check-in'}
${strategyPlan ? `Current Strategy: ${strategyPlan.coreStrategy}` : ''}
${recentActivities?.length ? `Recent Activities: ${recentActivities.slice(0, 3).map((a: any) => a.notes).join('; ')}` : ''}

Generate meeting preparation notes in JSON format:
{
  "agenda": ["Agenda item 1", "Agenda item 2", "Agenda item 3"],
  "keyTalkingPoints": ["Point 1 with context", "Point 2 with context", "Point 3 with context"],
  "questionsToAsk": ["Question 1 to uncover needs", "Question 2 about satisfaction", "Question 3 about future plans"],
  "potentialConcerns": ["Concern they might raise", "How to address it"],
  "upsellOpportunities": ["Opportunity 1", "Opportunity 2"],
  "successMetricsToHighlight": ["Metric or win to celebrate"],
  "nextStepsToPropose": ["Proposed next step 1", "Proposed next step 2"]
}

Be specific and actionable. Focus on retention and growth.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const prep = JSON.parse(content);
      
      res.json(prep);
    } catch (error) {
      console.error("Error generating meeting prep:", error);
      res.status(500).json({ error: "Failed to generate meeting preparation" });
    }
  });

  // Generate AI Strategy Plan
  app.post("/api/clients/ai/generate-strategy", async (req, res) => {
    try {
      const { client, businessProfile } = req.body;
      
      if (!client || !businessProfile) {
        return res.status(400).json({ error: "Client and business profile are required" });
      }

      const prompt = `You are a digital marketing strategist creating a comprehensive 90-day strategy for a local service business.

Client Business: ${client.businessName}
Industry: ${businessProfile.industry || 'Local Services'}
Primary Services: ${businessProfile.primaryServices?.join(', ') || 'N/A'}
Primary Locations: ${businessProfile.primaryLocations?.join(', ') || 'N/A'}
Service Area Type: ${businessProfile.serviceAreaType || 'local'}
Primary Goal: ${businessProfile.primaryGoal || 'more_leads'}
Ideal Job Type: ${businessProfile.idealJobType || 'N/A'}
Average Job Value: $${businessProfile.averageJobValue || 'Unknown'}
Website: ${businessProfile.websiteUrl || 'N/A'}
Google Business Profile: ${businessProfile.gbpUrl || 'N/A'}
What's Working: ${businessProfile.workingWell?.join(', ') || 'Nothing specified'}
What's Not Working: ${businessProfile.notWorkingWell?.join(', ') || 'Nothing specified'}
Seasonality Notes: ${businessProfile.seasonalityNotes || 'None'}
Additional Notes: ${businessProfile.additionalNotes || 'None'}

Generate a comprehensive strategy plan in JSON format:
{
  "coreStrategy": "One sentence core strategy statement that encapsulates the overall approach",
  "currentState": {
    "summary": "2-3 sentence assessment of current digital presence",
    "strengths": ["Strength 1", "Strength 2", "Strength 3"],
    "weaknesses": ["Weakness 1", "Weakness 2", "Weakness 3"]
  },
  "targetState": {
    "summary": "2-3 sentence vision of where they should be in 90 days",
    "outcomes": ["Measurable outcome 1", "Measurable outcome 2", "Measurable outcome 3"]
  },
  "gapSummary": "Brief explanation of the gap between current and target state",
  "channelPlan": [
    {
      "channel": "gbp",
      "objective": "Clear objective for this channel",
      "keyResults": ["KR1", "KR2"],
      "tactics": ["Tactic 1", "Tactic 2", "Tactic 3"]
    },
    {
      "channel": "seo",
      "objective": "Clear objective for this channel",
      "keyResults": ["KR1", "KR2"],
      "tactics": ["Tactic 1", "Tactic 2", "Tactic 3"]
    },
    {
      "channel": "website",
      "objective": "Clear objective for this channel",
      "keyResults": ["KR1", "KR2"],
      "tactics": ["Tactic 1", "Tactic 2", "Tactic 3"]
    }
  ],
  "roadmap_30_60_90": [
    {"id": "m1", "title": "Milestone title", "description": "What will be done", "phase": "30", "channel": "gbp", "status": "pending"},
    {"id": "m2", "title": "Milestone title", "description": "What will be done", "phase": "30", "channel": "seo", "status": "pending"},
    {"id": "m3", "title": "Milestone title", "description": "What will be done", "phase": "60", "channel": "website", "status": "pending"},
    {"id": "m4", "title": "Milestone title", "description": "What will be done", "phase": "60", "channel": "gbp", "status": "pending"},
    {"id": "m5", "title": "Milestone title", "description": "What will be done", "phase": "90", "channel": "seo", "status": "pending"},
    {"id": "m6", "title": "Milestone title", "description": "What will be done", "phase": "90", "channel": "social", "status": "pending"}
  ],
  "channelOKRs": [
    {"channel": "GBP", "objective": "Objective statement", "keyResults": ["KR1", "KR2"]},
    {"channel": "SEO", "objective": "Objective statement", "keyResults": ["KR1", "KR2"]},
    {"channel": "Website", "objective": "Objective statement", "keyResults": ["KR1", "KR2"]}
  ],
  "roadmap30": ["Action 1 for first 30 days", "Action 2", "Action 3"],
  "roadmap60": ["Action 1 for days 31-60", "Action 2", "Action 3"],
  "roadmap90": ["Action 1 for days 61-90", "Action 2", "Action 3"],
  "initiatives": ["Key initiative 1", "Key initiative 2", "Key initiative 3"]
}

Focus on practical, achievable actions for a local service business. Tailor recommendations to their specific industry and goals.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const strategy = JSON.parse(content);
      
      res.json(strategy);
    } catch (error) {
      console.error("Error generating strategy:", error);
      res.status(500).json({ error: "Failed to generate strategy plan" });
    }
  });

  // ============================================
  // Client Attention AI Recommendations
  // ============================================

  app.post("/api/clients/ai/attention-recommendations", async (req, res) => {
    try {
      const { clients } = req.body;
      
      if (!clients || !Array.isArray(clients) || clients.length === 0) {
        return res.status(400).json({ error: "Clients array is required" });
      }

      // Build a summary of clients needing attention
      const clientSummaries = clients.slice(0, 10).map((c: any) => ({
        name: c.businessName,
        id: c.id,
        health: c.healthStatus,
        reasons: c.healthReasons?.slice(0, 2) || [],
        contributors: c.healthContributors?.filter((h: any) => h.status === 'bad').map((h: any) => h.label) || [],
        daysSinceContact: c.lastContactDate ? Math.floor((Date.now() - new Date(c.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)) : null,
        strategyStatus: c.strategyStatus,
        products: c.products?.map((p: any) => ({ name: p.productType, status: p.status })) || [],
        mrr: c.totalMRR || 0
      }));

      const prompt = `You are a client success manager for a marketing agency. Analyze these at-risk clients and provide ONE specific, actionable next step for each.

Clients needing attention:
${JSON.stringify(clientSummaries, null, 2)}

For each client, generate a recommendation in this JSON format:
{
  "recommendations": [
    {
      "clientId": "client id",
      "clientName": "client name",
      "urgency": "critical" | "high" | "medium",
      "action": "Specific action to take (max 50 chars)",
      "reason": "Why this action (max 80 chars)",
      "actionType": "call" | "email" | "meeting" | "strategy" | "review"
    }
  ]
}

Prioritize by:
1. Revenue at risk (higher MRR = higher priority)
2. Days without contact (longer = more urgent)
3. Health status (red > amber)

Be specific and actionable. Focus on relationship repair and strategy advancement.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || '{"recommendations":[]}';
      const result = JSON.parse(content);
      
      res.json(result);
    } catch (error) {
      console.error("Error generating attention recommendations:", error);
      res.status(500).json({ error: "Failed to generate recommendations" });
    }
  });

  // ============================================
  // Strategy Engine AI API
  // ============================================

  app.post("/api/clients/:clientId/strategy/engine-sync", async (req, res) => {
    try {
      const { clientId } = req.params;
      const { client, answers, activities, tasks, healthContributors } = req.body;
      
      if (!clientId || !client) {
        return res.status(400).json({ error: "Client data is required" });
      }

      // Build context from structured question answers
      const answeredQuestions = (answers || []).map((a: any) => ({
        questionId: a.questionId,
        answer: a.answer,
        confidence: a.confidence
      }));

      // Build client snapshot for AI
      const clientSnapshot = {
        name: client.businessName,
        industry: client.businessProfile?.industry || 'Unknown',
        primaryGoal: client.businessProfile?.primaryGoal || null,
        mrr: client.totalMRR || 0,
        healthStatus: client.healthStatus,
        healthContributors: (healthContributors || []).map((h: any) => ({
          type: h.type,
          status: h.status,
          label: h.label
        })),
        products: (client.products || []).map((p: any) => ({
          name: p.productType,
          status: p.status,
          value: p.monthlyValue
        })),
        strategyStatus: client.strategyStatus,
        daysSinceContact: client.lastContactDate 
          ? Math.floor((Date.now() - new Date(client.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)) 
          : null,
        recentActivities: (activities || []).slice(0, 5).map((a: any) => ({
          type: a.type,
          date: a.createdAt,
          notes: a.notes?.substring(0, 100)
        })),
        pendingTasks: (tasks || []).filter((t: any) => t.status === 'pending').length,
        overdueTasks: (tasks || []).filter((t: any) => {
          if (t.status !== 'pending') return false;
          const dueDate = t.planDateKey || t.dueAt;
          return dueDate && dueDate < new Date().toISOString().split('T')[0].replace(/-/g, '');
        }).length
      };

      const prompt = `You are a strategy engine for a marketing agency. Based on the structured inputs and client data, generate a strategic plan with specific, actionable recommendations.

CLIENT SNAPSHOT:
${JSON.stringify(clientSnapshot, null, 2)}

STRUCTURED INTELLIGENCE (answers to strategy questions):
${JSON.stringify(answeredQuestions, null, 2)}

Generate a strategy output with the following structure. Be specific and actionable - this is for marketing execution, not passive documentation.

Return valid JSON only:
{
  "strategySummary": "2-3 sentence executive summary of the strategic direction for this client",
  "pillars": [
    {
      "id": "pillar_1",
      "name": "Pillar name (e.g., Lead Generation, Client Retention)",
      "goal": "Specific, measurable goal",
      "rationale": "Why this pillar matters for this client",
      "kpi": "Key metric to track",
      "kpiTarget": "Target value/improvement",
      "risk": "Main risk or blocker",
      "priority": 1
    }
  ],
  "actions": [
    {
      "id": "action_1",
      "actionType": "call" | "email" | "meeting" | "task" | "review" | "follow_up",
      "title": "Specific action (max 60 chars)",
      "reason": "Why this action now (max 100 chars)",
      "urgency": "immediate" | "this_week" | "this_month" | "ongoing",
      "priority": 1
    }
  ],
  "narrativeGuidance": "Coaching note for the account manager - what to focus on, watch out for, and how to approach this client",
  "confidenceLevel": "low" | "medium" | "high"
}

Rules:
1. Generate 2-4 strategic pillars based on client goals and health status
2. Generate 3-6 specific actions prioritized by urgency and impact
3. If client health is red/critical, prioritize relationship repair actions
4. If no contact in 14+ days, include a contact action as immediate priority
5. Confidence level depends on how many questions were answered (low if <3, medium if 3-6, high if >6)
6. Be specific to this client's industry, products, and situation`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const engineOutput = JSON.parse(content);
      
      // Add metadata
      const result = {
        ...engineOutput,
        id: `strategy_${clientId}_${Date.now()}`,
        clientId,
        inputsUsed: answeredQuestions.map((a: any) => a.questionId),
        generatedAt: new Date().toISOString(),
        modelVersion: "gpt-4o-mini",
        tokenUsage: response.usage?.total_tokens
      };
      
      res.json(result);
    } catch (error) {
      console.error("Error running strategy engine:", error);
      res.status(500).json({ error: "Failed to run strategy engine" });
    }
  });

  // ============================================
  // Daily Plan AI Generation API
  // ============================================

  app.post("/api/daily-plan/generate-brief", async (req, res) => {
    try {
      const { planDate, targets, leads, clients, overdueTasks, userSettings } = req.body;
      
      if (!planDate) {
        return res.status(400).json({ error: "planDate is required (DD-MM-YYYY format)" });
      }

      const prompt = `You are an AI sales coach helping a sales rep plan their day. Today's date is ${planDate}.

Current Daily Targets:
${JSON.stringify(targets, null, 2)}

Active Leads (${leads?.length || 0} total):
${JSON.stringify(leads?.slice(0, 10) || [], null, 2)}

Active Clients (${clients?.length || 0} total):
${JSON.stringify(clients?.slice(0, 10) || [], null, 2)}

Overdue Tasks (${overdueTasks?.length || 0} total):
${JSON.stringify(overdueTasks || [], null, 2)}

User Settings:
${JSON.stringify(userSettings || {}, null, 2)}

Generate a daily brief with:
1. Today's focus - A motivating single sentence theme for the day
2. Focus Mode Top 3 - The 3 most important tasks/priorities
3. Risk List - Any at-risk clients, overdue tasks, or opportunities that need attention
4. Suggested Time Allocation - How to best allocate time blocks

Return valid JSON only:
{
  "todaysFocus": "Motivating theme for the day",
  "focusModeTop3": ["Priority 1", "Priority 2", "Priority 3"],
  "targets": {
    "calls": 25,
    "doorKnocks": 5,
    "conversations": 10,
    "meetingsBooked": 2,
    "clientCheckIns": 5,
    "upsellConvos": 2,
    "renewalActions": 3,
    "followUps": 10
  },
  "riskList": [
    {"type": "overdue_client", "targetId": "id", "targetName": "Name", "reason": "Why at risk"}
  ],
  "suggestedTimeAllocation": [
    {"blockId": "block-morning-prospecting", "blockName": "Morning Prospecting", "suggestedTasks": 15}
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const brief = JSON.parse(content);
      
      res.json({
        id: `brief-${planDate}`,
        planDate,
        ...brief,
        generatedAt: new Date().toISOString(),
        aiModelVersion: "gpt-4o-mini"
      });
    } catch (error) {
      console.error("Error generating daily brief:", error);
      res.status(500).json({ error: "Failed to generate daily brief" });
    }
  });

  app.post("/api/daily-plan/generate-actions", async (req, res) => {
    try {
      const { planDate, leads, clients, overdueTasks, brief, timeBlocks } = req.body;
      
      if (!planDate) {
        return res.status(400).json({ error: "planDate is required (DD-MM-YYYY format)" });
      }

      const prompt = `You are an AI sales coach generating recommended actions for a sales rep's daily plan.

Today's date: ${planDate}
Today's Focus: ${brief?.todaysFocus || "General sales activities"}
Top 3 Priorities: ${JSON.stringify(brief?.focusModeTop3 || [])}

Available Time Blocks:
${JSON.stringify(timeBlocks || [], null, 2)}

Active Leads to consider:
${JSON.stringify(leads?.slice(0, 15) || [], null, 2)}

Active Clients to consider:
${JSON.stringify(clients?.slice(0, 15) || [], null, 2)}

Overdue Tasks:
${JSON.stringify(overdueTasks || [], null, 2)}

Generate 10-15 recommended actions. Each should specify the target (lead/client), what to do, and which time block.

Return valid JSON:
{
  "recommendations": [
    {
      "id": "rec-1",
      "targetType": "lead",
      "targetId": "lead-id",
      "targetName": "Business Name",
      "reason": "Why this action is recommended",
      "expectedImpact": "Expected outcome",
      "suggestedBlockId": "block-morning-prospecting",
      "suggestedBlockName": "Morning Prospecting",
      "taskType": "call",
      "priorityScore": 95
    }
  ]
}

taskType options: call, door_knock, meeting, follow_up, check_in, renewal, upsell, other
priorityScore: 1-100 based on urgency and impact`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || '{"recommendations":[]}';
      const result = JSON.parse(content);
      
      const recommendations = (result.recommendations || []).map((rec: any, idx: number) => ({
        ...rec,
        id: rec.id || `rec-${idx + 1}`,
        status: "recommended"
      }));
      
      res.json({ recommendations });
    } catch (error) {
      console.error("Error generating action recommendations:", error);
      res.status(500).json({ error: "Failed to generate action recommendations" });
    }
  });

  app.post("/api/daily-plan/generate-debrief", async (req, res) => {
    try {
      const { planDate, tasks, targets, activities, brief } = req.body;
      
      if (!planDate) {
        return res.status(400).json({ error: "planDate is required (DD-MM-YYYY format)" });
      }

      const completedTasks = tasks?.filter((t: any) => t.status === 'completed') || [];
      const pendingTasks = tasks?.filter((t: any) => t.status === 'pending') || [];
      const totalPlanned = tasks?.length || 0;
      const totalCompleted = completedTasks.length;
      const percentage = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

      const prompt = `You are an AI sales coach conducting an end-of-day debrief for a sales rep.

Today's date: ${planDate}
Today's Focus was: ${brief?.todaysFocus || "General sales activities"}
Top 3 Priorities were: ${JSON.stringify(brief?.focusModeTop3 || [])}

Target vs Actual:
${JSON.stringify(targets, null, 2)}

Completed Tasks (${completedTasks.length}):
${JSON.stringify(completedTasks.slice(0, 10), null, 2)}

Incomplete Tasks (${pendingTasks.length}):
${JSON.stringify(pendingTasks.slice(0, 10), null, 2)}

Today's Activities:
${JSON.stringify(activities?.slice(0, 20) || [], null, 2)}

Generate an end-of-day debrief with:
1. Summary of what was accomplished
2. What slipped (tasks not completed and why)
3. Tomorrow's priorities based on what wasn't done today
4. Tasks to roll forward to tomorrow
5. AI coach review with encouragement and improvement suggestions

Return valid JSON:
{
  "summary": {
    "planned": ${totalPlanned},
    "completed": ${totalCompleted},
    "percentage": ${percentage}
  },
  "whatSlipped": [
    {"taskId": "id", "title": "Task title", "reason": "overdue"}
  ],
  "tomorrowPriorities": ["Priority 1", "Priority 2", "Priority 3"],
  "rollForwardTasks": [
    {"taskId": "id", "title": "Task title", "newPlanDate": "DD-MM-YYYY"}
  ],
  "aiReview": "Encouraging summary of the day's performance",
  "improvements": ["Suggestion 1", "Suggestion 2"]
}

reason options: overdue, rescheduled, no_response, skipped`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const debrief = JSON.parse(content);
      
      res.json({
        id: `debrief-${planDate}`,
        planDate,
        summary: {
          planned: totalPlanned,
          completed: totalCompleted,
          percentage
        },
        ...debrief,
        generatedAt: new Date().toISOString(),
        aiModelVersion: "gpt-4o-mini"
      });
    } catch (error) {
      console.error("Error generating debrief:", error);
      res.status(500).json({ error: "Failed to generate debrief" });
    }
  });

  // AI Task Assist - enhance a rough task description into actionable task
  app.post("/api/ai/task-assist", async (req, res) => {
    try {
      const { 
        roughTask, 
        clientName, 
        clientContext,
        lastContactDate,
        pipelineStage,
        products,
        knownObjections,
        todayDate
      } = req.body;

      if (!roughTask) {
        return res.status(400).json({ error: "Rough task description is required" });
      }

      const contextInfo = clientContext ? `
Client: ${clientName || 'Unknown'}
Last Contact: ${lastContactDate || 'Unknown'}
Pipeline Stage: ${pipelineStage || 'Unknown'}
Products/Services: ${products?.join(', ') || 'Not specified'}
Known Objections: ${knownObjections || 'None recorded'}
Additional Context: ${clientContext}
` : '';

      const prompt = `You are a sales productivity assistant. Transform this rough task into a clear, actionable task pack.

Rough Task: "${roughTask}"
${contextInfo}
Today's Date: ${todayDate || new Date().toLocaleDateString('en-AU')}

Return a JSON object with:
1. enhancedTitle: A clear, specific task title (max 60 chars)
2. outcomeStatement: What "done" looks like - the specific measurable outcome
3. checklist: Array of 3-7 specific action steps to complete the task
4. suggestedDueDate: Suggested due date in DD-MM-YYYY format based on urgency
5. priority: One of "low", "medium", "high", "urgent" based on context
6. suggestedTaskType: One of "call", "meeting", "follow_up", "check_in", "delivery", "renewal", "upsell", "prospecting", "admin"
7. suggestedFollowUp: What to do if there's no response (e.g., "If no response in 3 days, send reminder email")
8. emailTemplate: If task involves email, provide a draft email template (optional)
9. callScript: If task involves a call, provide a brief call script with key talking points (optional)

Be specific and actionable. Focus on sales outcomes and client relationships.

Return valid JSON:
{
  "enhancedTitle": "string",
  "outcomeStatement": "string",
  "checklist": ["step1", "step2", ...],
  "suggestedDueDate": "DD-MM-YYYY",
  "priority": "low|medium|high|urgent",
  "suggestedTaskType": "string",
  "suggestedFollowUp": "string",
  "emailTemplate": "string or null",
  "callScript": "string or null"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const aiResult = JSON.parse(content);
      
      res.json(aiResult);
    } catch (error) {
      console.error("Error in AI task assist:", error);
      res.status(500).json({ error: "Failed to enhance task with AI" });
    }
  });

  // ============================================
  // Client App Integration API
  // ============================================

  // Generate a pairing code for a client
  app.post("/api/integrations/generate-pairing-code", async (req, res) => {
    try {
      const { clientId, clientName, orgId } = req.body;

      if (!clientId || !clientName || !orgId) {
        return res.status(400).json({ error: "clientId, clientName, and orgId are required" });
      }

      // Generate a 12-character alphanumeric code
      const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0,O,1,I)
      let code = '';
      for (let i = 0; i < 12; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      // Generate unique ID
      const id = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes expiry

      const pairingCode = {
        id,
        code,
        clientId,
        clientName,
        orgId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: 'pending'
      };

      res.json(pairingCode);
    } catch (error) {
      console.error("Error generating pairing code:", error);
      res.status(500).json({ error: "Failed to generate pairing code" });
    }
  });

  // Validate pairing code and return integration secret
  app.post("/api/integrations/pair", async (req, res) => {
    try {
      const { pairingCode, appId, appName, appUrl } = req.body;

      if (!pairingCode || !appId || !appName) {
        return res.status(400).json({ error: "pairingCode, appId, and appName are required" });
      }

      // Check if Firebase Admin is configured
      if (!isFirebaseAdminReady() || !firestore) {
        console.warn("[Pair] Firebase Admin not configured, returning mock response");
        const integrationSecret = Array.from({ length: 32 }, () => 
          Math.floor(Math.random() * 16).toString(16)
        ).join('');
        const integrationId = `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return res.json({
          success: true,
          integrationId,
          integrationSecret,
          message: "Pairing successful (Firebase Admin not configured - mock mode). Store this secret securely."
        });
      }

      // Look up the pairing code in Firestore across all orgs
      const orgsSnapshot = await firestore.collection('orgs').get();
      let foundPairingDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      let foundOrgId: string | null = null;

      for (const orgDoc of orgsSnapshot.docs) {
        const pairingCodesRef = firestore.collection('orgs').doc(orgDoc.id).collection('pairingCodes');
        const pairingQuery = await pairingCodesRef.where('code', '==', pairingCode).where('status', '==', 'pending').limit(1).get();
        
        if (!pairingQuery.empty) {
          foundPairingDoc = pairingQuery.docs[0];
          foundOrgId = orgDoc.id;
          break;
        }
      }

      if (!foundPairingDoc || !foundOrgId) {
        return res.status(404).json({ error: "Invalid or expired pairing code" });
      }

      const pairingData = foundPairingDoc.data()!;
      
      // Check if expired
      const expiresAt = pairingData.expiresAt?.toDate ? pairingData.expiresAt.toDate() : new Date(pairingData.expiresAt);
      if (new Date() > expiresAt) {
        // Mark as expired
        await foundPairingDoc.ref.update({ status: 'expired' });
        return res.status(400).json({ error: "Pairing code has expired" });
      }

      // Generate a permanent integration secret (32-char hex)
      const integrationSecret = Array.from({ length: 32 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      const integrationId = `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();

      // Create the integration record in Firestore
      const integrationData = {
        id: integrationId,
        clientId: pairingData.clientId,
        clientName: pairingData.clientName,
        orgId: foundOrgId,
        appId,
        appName,
        appUrl: appUrl || null,
        integrationSecret,
        status: 'active',
        createdAt: now,
        lastEventAt: null,
        eventCount: 0
      };

      await firestore
        .collection('orgs')
        .doc(foundOrgId)
        .collection('clients')
        .doc(pairingData.clientId)
        .collection('integrations')
        .doc(integrationId)
        .set(integrationData);

      // Mark pairing code as used
      await foundPairingDoc.ref.update({ 
        status: 'used',
        usedAt: now,
        usedByAppId: appId
      });

      res.json({
        success: true,
        integrationId,
        integrationSecret,
        clientId: pairingData.clientId,
        clientName: pairingData.clientName,
        message: "Pairing successful. Store this secret securely - it cannot be retrieved again."
      });
    } catch (error) {
      console.error("Error validating pairing code:", error);
      res.status(500).json({ error: "Failed to validate pairing code" });
    }
  });

  // Receive events from integrated apps
  app.post("/api/integrations/events", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
      }

      const integrationSecret = authHeader.substring(7);
      const { eventType, payload } = req.body;

      if (!eventType || !payload) {
        return res.status(400).json({ error: "eventType and payload are required" });
      }

      // In production, validate the integrationSecret against stored integrations
      // and look up the associated clientId/orgId

      const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      res.json({
        success: true,
        eventId,
        receivedAt: new Date().toISOString(),
        message: "Event received and queued for processing"
      });
    } catch (error) {
      console.error("Error receiving integration event:", error);
      res.status(500).json({ error: "Failed to process event" });
    }
  });

  // Get integration status for a client
  app.get("/api/integrations/client/:clientId", async (req, res) => {
    try {
      const { clientId } = req.params;

      // In production, this would query Firestore for integrations by clientId
      // For now, return empty array (actual data comes from client-side Firestore)
      res.json({ integrations: [] });
    } catch (error) {
      console.error("Error fetching client integrations:", error);
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  // ============================================
  // ABR Business Research API
  // ============================================

  // Search businesses by name
  app.get("/api/abr/search-name", async (req, res) => {
    try {
      const { name, maxResults = 20 } = req.query;
      const guid = process.env.ABR_GUID;

      if (!guid) {
        return res.status(500).json({ error: "ABR API key not configured. Please add ABR_GUID to secrets." });
      }

      if (!name) {
        return res.status(400).json({ error: "Name parameter is required" });
      }

      const url = `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encodeURIComponent(name as string)}&maxResults=${maxResults}&guid=${guid}`;
      
      const response = await fetch(url);
      const text = await response.text();
      
      // ABR returns JSONP, need to extract JSON
      const jsonMatch = text.match(/callback\(([^]*)\)/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1]);
        res.json(data);
      } else {
        // Try parsing as regular JSON
        const data = JSON.parse(text);
        res.json(data);
      }
    } catch (error) {
      console.error("Error searching ABR by name:", error);
      res.status(500).json({ error: "Failed to search businesses" });
    }
  });

  // Search businesses by postcode
  app.get("/api/abr/search-postcode", async (req, res) => {
    try {
      const { postcode, maxResults = 100 } = req.query;
      const guid = process.env.ABR_GUID;

      if (!guid) {
        return res.status(500).json({ error: "ABR API key not configured. Please add ABR_GUID to secrets." });
      }

      if (!postcode) {
        return res.status(400).json({ error: "Postcode parameter is required" });
      }

      // ABR JSON endpoint for postcode search
      const url = `https://abr.business.gov.au/json/MatchingNames.aspx?postcode=${encodeURIComponent(postcode as string)}&maxResults=${maxResults}&guid=${guid}`;
      
      const response = await fetch(url);
      const text = await response.text();
      
      // ABR returns JSONP, need to extract JSON
      const jsonMatch = text.match(/callback\(([^]*)\)/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1]);
        res.json(data);
      } else {
        const data = JSON.parse(text);
        res.json(data);
      }
    } catch (error) {
      console.error("Error searching ABR by postcode:", error);
      res.status(500).json({ error: "Failed to search businesses" });
    }
  });

  // Get ABN details
  app.get("/api/abr/abn/:abn", async (req, res) => {
    try {
      const { abn } = req.params;
      const guid = process.env.ABR_GUID;

      if (!guid) {
        return res.status(500).json({ error: "ABR API key not configured. Please add ABR_GUID to secrets." });
      }

      const cleanAbn = abn.replace(/\s/g, '');
      const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${cleanAbn}&guid=${guid}`;
      
      const response = await fetch(url);
      const text = await response.text();
      
      // ABR returns JSONP, need to extract JSON
      const jsonMatch = text.match(/callback\(([^]*)\)/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1]);
        res.json(data);
      } else {
        const data = JSON.parse(text);
        res.json(data);
      }
    } catch (error) {
      console.error("Error fetching ABN details:", error);
      res.status(500).json({ error: "Failed to fetch ABN details" });
    }
  });

  // ===============================
  // Google Places API Routes
  // ===============================

  // Search Google Places by location (postcode/city) and business type
  app.get("/api/google-places/search", async (req, res) => {
    try {
      const { location, type, radius = 50000, lat: latParam, lng: lngParam } = req.query;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "Google Places API key not configured. Please add GOOGLE_PLACES_API_KEY to secrets." });
      }

      let lat: number;
      let lng: number;
      let locationAddress: string;

      // If lat/lng provided directly, use them
      if (latParam && lngParam) {
        lat = parseFloat(latParam as string);
        lng = parseFloat(lngParam as string);
        locationAddress = 'Your Location';
        console.log(`Using provided coordinates: ${lat}, ${lng}`);
      } else if (location) {
        // Geocode the text location to get coordinates
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location as string)}&key=${apiKey}&region=au`;
        const geocodeResponse = await fetch(geocodeUrl);
        const geocodeData = await geocodeResponse.json();

        if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) {
          console.error('Geocode failed:', geocodeData);
          return res.status(400).json({ error: "Could not find location. Try a more specific address." });
        }

        lat = geocodeData.results[0].geometry.location.lat;
        lng = geocodeData.results[0].geometry.location.lng;
        locationAddress = geocodeData.results[0].formatted_address;
        console.log(`Geocoded "${location}" to: ${lat}, ${lng}`);
      } else {
        return res.status(400).json({ error: "Location or coordinates required" });
      }

      // Step 2: Use Nearby Search (New) API with radius
      const nearbyUrl = 'https://places.googleapis.com/v1/places:searchNearby';
      
      const requestBody: any = {
        locationRestriction: {
          circle: {
            center: {
              latitude: lat,
              longitude: lng
            },
            radius: Math.min(parseInt(radius as string), 50000) // Max 50km per API call
          }
        },
        maxResultCount: 20,
        languageCode: 'en-AU'
      };

      // Add business type filter if specified
      if (type && type !== 'all') {
        requestBody.includedTypes = [type as string];
      }

      const response = await fetch(nearbyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.userRatingCount,places.rating,places.types,places.nationalPhoneNumber,places.websiteUri,places.businessStatus'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Google Places API error:', data);
        return res.status(response.status).json({ error: data.error?.message || 'Google Places API error' });
      }

      // Filter and transform results - prioritize businesses with fewer reviews (likely newer)
      const places = data.places || [];
      const transformedResults = places
        .filter((place: any) => place.businessStatus === 'OPERATIONAL')
        .map((place: any) => ({
          placeId: place.id,
          name: place.displayName?.text || '',
          address: place.formattedAddress || '',
          rating: place.rating || null,
          reviewCount: place.userRatingCount || 0,
          types: place.types || [],
          phone: place.nationalPhoneNumber || null,
          website: place.websiteUri || null,
          isLikelyNew: (place.userRatingCount || 0) < 50 // Fewer reviews = likely newer
        }))
        .sort((a: any, b: any) => a.reviewCount - b.reviewCount); // Sort by review count ascending (newest first)

      res.json({ 
        results: transformedResults,
        total: transformedResults.length,
        searchLocation: { lat, lng, address: locationAddress }
      });
    } catch (error) {
      console.error("Error searching Google Places:", error);
      res.status(500).json({ error: "Failed to search businesses" });
    }
  });

  // Get Place details by ID
  app.get("/api/google-places/details/:placeId", async (req, res) => {
    try {
      const { placeId } = req.params;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "Google Places API key not configured." });
      }

      const url = `https://places.googleapis.com/v1/places/${placeId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,rating,userRatingCount,types,businessStatus,primaryType,primaryTypeDisplayName,regularOpeningHours'
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || 'Failed to fetch details' });
      }

      res.json({
        placeId: data.id,
        name: data.displayName?.text || '',
        address: data.formattedAddress || '',
        phone: data.nationalPhoneNumber || data.internationalPhoneNumber || null,
        website: data.websiteUri || null,
        rating: data.rating || null,
        reviewCount: data.userRatingCount || 0,
        types: data.types || [],
        primaryType: data.primaryTypeDisplayName?.text || data.primaryType || null,
        businessStatus: data.businessStatus || null,
        openingHours: data.regularOpeningHours?.weekdayDescriptions || null
      });
    } catch (error) {
      console.error("Error fetching place details:", error);
      res.status(500).json({ error: "Failed to fetch place details" });
    }
  });

  // ===============================
  // Domain WHOIS / Age Lookup
  // ===============================

  app.get("/api/domain-age", async (req, res) => {
    try {
      const { domain } = req.query;
      
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: "Domain is required" });
      }

      // Extract just the domain from a full URL
      let cleanDomain = domain;
      try {
        if (domain.includes('://')) {
          cleanDomain = new URL(domain).hostname;
        } else if (domain.includes('/')) {
          cleanDomain = domain.split('/')[0];
        }
        // Remove www. prefix
        cleanDomain = cleanDomain.replace(/^www\./, '');
      } catch (e) {
        // Keep original if parsing fails
      }

      // Use whois package for lookup
      const whois = await import('whois');
      
      const lookupPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WHOIS lookup timed out'));
        }, 10000); // 10 second timeout
        
        whois.default.lookup(cleanDomain, (err: any, data: any) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve(typeof data === 'string' ? data : JSON.stringify(data));
        });
      });

      const whoisData = await lookupPromise;
      
      // Parse creation date from WHOIS response
      // Different registrars use different field names
      const creationPatterns = [
        /Creation Date:\s*(.+)/i,
        /Created Date:\s*(.+)/i,
        /Created:\s*(.+)/i,
        /Registration Date:\s*(.+)/i,
        /Registered:\s*(.+)/i,
        /Domain Registration Date:\s*(.+)/i,
        /created:\s*(\d{4}-\d{2}-\d{2})/i,
      ];

      let creationDate: Date | null = null;
      for (const pattern of creationPatterns) {
        const match = whoisData.match(pattern);
        if (match) {
          const dateStr = match[1].trim();
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            creationDate = parsed;
            break;
          }
        }
      }

      if (!creationDate) {
        return res.json({
          domain: cleanDomain,
          creationDate: null,
          ageInDays: null,
          ageDescription: 'Could not determine domain age',
          raw: whoisData.substring(0, 500)
        });
      }

      const now = new Date();
      const ageInDays = Math.floor((now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
      const ageInMonths = Math.floor(ageInDays / 30);
      const ageInYears = Math.floor(ageInDays / 365);

      let ageDescription: string;
      if (ageInDays < 30) {
        ageDescription = `${ageInDays} days old - VERY NEW!`;
      } else if (ageInDays < 90) {
        ageDescription = `${ageInMonths} months old - Recently launched`;
      } else if (ageInDays < 365) {
        ageDescription = `${ageInMonths} months old - New business`;
      } else if (ageInYears < 2) {
        ageDescription = `${ageInYears} year${ageInYears > 1 ? 's' : ''} old - Relatively new`;
      } else {
        ageDescription = `${ageInYears} years old - Established`;
      }

      res.json({
        domain: cleanDomain,
        creationDate: creationDate.toISOString(),
        ageInDays,
        ageInMonths,
        ageInYears,
        ageDescription,
        isNew: ageInDays < 365 // Less than 1 year = new
      });

    } catch (error: any) {
      console.error("Error looking up domain:", error);
      res.status(500).json({ 
        error: "Failed to lookup domain age",
        details: error.message
      });
    }
  });

  return httpServer;
}
