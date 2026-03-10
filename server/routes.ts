import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema, insertActivitySchema } from "@shared/schema";
import OpenAI from "openai";
import { firestore, isFirebaseAdminReady } from "./firebase";
import { crawlWebsite } from "./strategyEngine";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============================================
  // SEO Assets - Sitemap & Robots
  // ============================================
  
  const siteUrl = 'https://battlescore.com.au';
  const marketingPages = [
    { path: '/marketing', priority: '1.0', changefreq: 'weekly' },
    { path: '/marketing/services', priority: '0.9', changefreq: 'weekly' },
    { path: '/marketing/about', priority: '0.8', changefreq: 'monthly' },
    { path: '/marketing/contact', priority: '0.8', changefreq: 'monthly' },
  ];

  app.get('/sitemap.xml', (req, res) => {
    const lastmod = new Date().toISOString().split('T')[0];
    const urls = marketingPages.map(page => `
    <url>
      <loc>${siteUrl}${page.path}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>${page.changefreq}</changefreq>
      <priority>${page.priority}</priority>
    </url>`).join('');
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
    
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  });

  app.get('/robots.txt', (req, res) => {
    const robots = `User-agent: *
Allow: /
Allow: /marketing
Allow: /marketing/services
Allow: /marketing/about
Allow: /marketing/contact
Disallow: /api/
Disallow: /login
Disallow: /pipeline
Disallow: /clients
Disallow: /tasks
Disallow: /daily-plan
Disallow: /settings

Sitemap: ${siteUrl}/sitemap.xml
`;
    res.header('Content-Type', 'text/plain');
    res.send(robots);
  });

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
  // AI Movement Tips (Chess Cheats for Account Progression)
  // ============================================

  // Simple in-memory cache for movement tips (6-hour TTL)
  const movementTipsCache = new Map<string, { tip: any; expiresAt: number }>();
  const MOVEMENT_TIP_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  app.post("/api/clients/:clientId/movement-tip", async (req, res) => {
    try {
      const { clientId } = req.params;
      const { client, activities, tasks, healthContributors, forceRefresh } = req.body;
      
      if (!clientId || !client) {
        return res.status(400).json({ error: "Client data is required" });
      }

      // Check cache first (unless force refresh)
      const cached = movementTipsCache.get(clientId);
      if (cached && !forceRefresh && Date.now() < cached.expiresAt) {
        return res.json(cached.tip);
      }

      // Determine current board stage
      const currentStage = client.boardStage || (() => {
        if (client.archived) return 'churned';
        if (client.deliveryStatus === 'onboarding') return 'onboarding';
        if (client.healthStatus === 'red' || client.healthStatus === 'amber') return 'watchlist';
        if (client.upsellReadiness === 'ready' || client.upsellReadiness === 'hot') return 'growth_plays';
        return 'steady_state';
      })();

      // Determine target stage based on current position
      const stageProgression: Record<string, string> = {
        'onboarding': 'steady_state',
        'watchlist': 'steady_state',
        'steady_state': 'growth_plays',
        'growth_plays': 'growth_plays', // Maintain and expand
        'churned': 'watchlist', // Re-engage first
      };
      const targetStage = stageProgression[currentStage] || 'steady_state';

      // Build client snapshot for AI
      const daysSinceContact = client.lastContactDate 
        ? Math.floor((Date.now() - new Date(client.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)) 
        : null;

      const clientSnapshot = {
        name: client.businessName,
        industry: client.businessProfile?.industry || 'Unknown',
        mrr: client.totalMRR || 0,
        currentStage,
        targetStage,
        healthStatus: client.healthStatus,
        healthContributors: (healthContributors || []).map((h: any) => ({
          type: h.type,
          status: h.status,
          label: h.label
        })),
        deliveryStatus: client.deliveryStatus,
        upsellReadiness: client.upsellReadiness,
        daysSinceContact,
        nextContactDate: client.nextContactDate,
        products: (client.products || []).map((p: any) => ({
          name: p.productType,
          status: p.status,
          value: p.monthlyValue
        })),
        recentActivities: (activities || []).slice(0, 5).map((a: any) => ({
          type: a.type,
          date: a.createdAt,
          notes: a.notes?.substring(0, 80)
        })),
        pendingTasks: (tasks || []).filter((t: any) => t.status === 'pending').length,
      };

      const prompt = `You are a strategic account advisor using proven sales frameworks (NEPQ, Jeb Blount, Chris Voss). 
Analyze this client and provide "chess cheats" - specific actions that will move them from their current lifecycle stage to the target stage.

CLIENT SNAPSHOT:
${JSON.stringify(clientSnapshot, null, 2)}

STAGE DEFINITIONS:
- onboarding: New client, setting up services
- steady_state: Active, healthy, low-maintenance client
- growth_plays: Ready for upsell/expansion opportunities
- watchlist: At-risk, needs intervention
- churned: Inactive, needs re-engagement

CURRENT: ${currentStage} → TARGET: ${targetStage}

Generate specific, actionable recommendations in this JSON format:
{
  "headline": "Brief statement of the movement goal (e.g., 'Stabilize and rebuild trust')",
  "reasoning": "1-2 sentences explaining why the client is in current stage and what's blocking progress",
  "actions": [
    {
      "action": "Specific action to take (e.g., 'Schedule a 15-min check-in call to address delivery concerns')",
      "outcome": "Predicted result (e.g., 'Will reduce anxiety and rebuild confidence in the relationship')",
      "confidence": "high" | "medium" | "low",
      "framework": "NEPQ" | "Jeb Blount" | "Chris Voss" (which framework this aligns with)
    }
  ],
  "blockingFactors": ["Factor preventing progress 1", "Factor 2"]
}

Rules:
1. Generate exactly 3 actions prioritized by impact
2. Use NEPQ for discovery/qualification actions, Jeb Blount for urgency/persistence, Chris Voss for negotiation/rapport
3. If days since contact > 14, first action should be re-engagement
4. If health is red, focus on problem identification (NEPQ) and empathy (Chris Voss)
5. If health is green and on watchlist, reassess the categorization in reasoning
6. Be specific to THIS client's situation, not generic advice
7. Each action should be doable in under 30 minutes`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const tipData = JSON.parse(content);
      
      // Build the response with metadata
      const expiresAt = Date.now() + MOVEMENT_TIP_TTL_MS;
      const result = {
        id: `tip_${clientId}_${Date.now()}`,
        clientId,
        currentStage,
        targetStage,
        headline: tipData.headline || `Move from ${currentStage} to ${targetStage}`,
        reasoning: tipData.reasoning || '',
        actions: tipData.actions || [],
        blockingFactors: tipData.blockingFactors || [],
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
      };
      
      // Store in cache
      movementTipsCache.set(clientId, { tip: result, expiresAt });
      
      res.json(result);
    } catch (error) {
      console.error("Error generating movement tip:", error);
      res.status(500).json({ error: "Failed to generate movement tip" });
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

      // Step 2: Use Text Search API for better filtering by business type
      const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
      
      // Build the text query combining location and business type
      let textQuery = locationAddress;
      if (type && type !== 'all') {
        // Convert underscore types to readable text for search
        const readableType = (type as string).replace(/_/g, ' ');
        textQuery = `${readableType} near ${locationAddress}`;
        console.log(`[Google Places] Text search query: "${textQuery}"`);
      } else {
        textQuery = `businesses near ${locationAddress}`;
        console.log(`[Google Places] Generic business search near: ${locationAddress}`);
      }
      
      const requestBody: any = {
        textQuery,
        locationBias: {
          circle: {
            center: {
              latitude: lat,
              longitude: lng
            },
            radius: Math.min(parseInt(radius as string), 50000)
          }
        },
        maxResultCount: 20,
        languageCode: 'en-AU'
      };

      console.log(`[Google Places] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(searchUrl, {
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

  // ===============================
  // AI Outreach Script Generation (for Research leads)
  // ===============================

  app.post("/api/leads/generate-outreach-scripts", async (req, res) => {
    try {
      const { 
        businessName, 
        businessType, 
        location, 
        phone,
        website,
        rating,
        reviewCount,
        source, // 'abr' | 'google_places'
        addedReason, // User's reason for adding this lead
        businessSignals, // Detected signals like 'newly registered', 'few reviews'
        stage, // Pipeline stage: 'suspect', 'prospect', 'qualify', 'present', 'propose', 'won', 'lost'
        relationshipContext, // Notes, activity history, logged activities
      } = req.body;

      if (!businessName || !addedReason) {
        return res.status(400).json({ error: "Business name and reason are required" });
      }

      // Build business context for AI
      const businessContext = {
        name: businessName,
        type: businessType || 'Unknown',
        location: location || 'Unknown location',
        hasPhone: !!phone,
        hasWebsite: !!website,
        rating: rating || null,
        reviewCount: reviewCount || 0,
        source: source || 'research',
        addedReason,
        signals: businessSignals || [],
      };

      // Determine outreach approach based on pipeline stage
      const stageGuidelines: Record<string, string> = {
        suspect: 'First contact - they don\'t know you. Focus on creating curiosity and establishing credibility. Cold outreach approach.',
        prospect: 'They\'ve shown some interest. Reference any prior interaction. Build on initial connection. Warmer tone.',
        qualify: 'They\'re evaluating options. Focus on understanding their specific needs. Ask discovery questions. Position as a partner.',
        present: 'Deep in discussions. Reference specific conversations. Provide value and address concerns. Consultative approach.',
        propose: 'Decision phase. Be helpful, not pushy. Address any final objections. Create urgency without pressure.',
        won: 'Customer relationship. Focus on onboarding, satisfaction, and upsell opportunities. Partner mindset.',
        lost: 'Re-engagement approach. Acknowledge time passed. Offer new value or changed circumstances. Low-pressure reconnection.',
      };

      const currentStage = stage || 'suspect';
      const stageContext = stageGuidelines[currentStage] || stageGuidelines.suspect;
      const hasRelationshipHistory = relationshipContext && relationshipContext.trim().length > 0;

      const prompt = `You are an expert sales copywriter using proven frameworks (NEPQ, Jeb Blount "Fanatical Prospecting", Chris Voss "Never Split the Difference"). 
Generate personalized outreach scripts for this business lead at the "${currentStage}" stage.

BUSINESS CONTEXT:
${JSON.stringify(businessContext, null, 2)}

PIPELINE STAGE: ${currentStage}
STAGE GUIDANCE: ${stageContext}

${hasRelationshipHistory ? `RELATIONSHIP HISTORY (use this to personalize - reference specific interactions, notes, or prior conversations):
${relationshipContext}` : 'No prior interactions logged.'}

THE SALES REP'S REASON FOR REACHING OUT:
"${addedReason}"

Generate outreach scripts in this exact JSON format:
{
  "textScript": "SMS message (under 160 chars, conversational, creates curiosity, no hard sell, includes a soft CTA like 'quick question for you')${hasRelationshipHistory ? ' - reference prior interaction if relevant' : ''}",
  "emailScript": "Email with Subject line and Body. Use NEPQ approach - start with a problem-focused question, acknowledge they're busy, offer value not features, end with low-pressure CTA. Max 150 words.${hasRelationshipHistory ? ' Reference specific prior conversations or logged activities.' : ''}",
  "callScript": "Phone cold calling script following this EXACT structure and tone:\\n\\nHi (prospect name), It's (rep name)... from Localsearch? (Curious voice)\\n\\n(Prospect name)... I work with a couple of local businesses in the area, including [drop name of person and business they may know], helping with their online reputation and how and where they are positioned on Google. (Pause)\\n\\nIs now a bad time to talk? (If not, continue...or get them to call you back because you are really busy)\\n\\nI've got a meeting with [reference business] later this week regarding some significant changes coming to Google surrounding AI. You may already be aware of this? If not, would you be opposed to me dropping in [suggest date & time]?\\n\\nIf client questions it... response...\\n\\n(Curious tone) I'm actually really interested to learn more about you and your business to see if the solutions we provide for [name drop] might be of benefit to you?\\n\\nSecure the meeting & collaborate with the new prospect.\\n\\nAdapt this template to match the prospect's specific business and situation. ${hasRelationshipHistory ? 'Reference prior interactions naturally.' : ''}"
}

FRAMEWORK GUIDELINES:
- NEPQ (Neuro-Emotional Persuasion Questions): Lead with questions about their situation/challenges, not your product
- Jeb Blount: Be confident, direct, and persistent. Time is valuable. Get to the point.
- Chris Voss: Use tactical empathy, labeling ("It seems like..."), calibrated questions ("How am I supposed to..."), and mirroring

PERSONALIZATION RULES:
1. ${hasRelationshipHistory ? 'PRIORITY: Reference specific logged activities, notes, or prior conversations naturally' : 'If they\'re a new business (few reviews, new registration), acknowledge the challenge of getting started'}
2. If they have a website but low reviews, that's a digital presence gap to mention
3. Reference their specific industry/business type naturally
4. Never use generic "I help businesses like yours" - be specific
5. The SMS must feel like it's from a real person, not marketing
6. The email subject line must create curiosity without being clickbait
7. Adjust warmth and familiarity based on pipeline stage - ${currentStage === 'suspect' ? 'cold and professional' : currentStage === 'prospect' ? 'warmer, reference prior touch' : 'familiar, reference relationship'}

TONE: Professional but warm. Confident but not pushy. Curious about THEIR business, not eager to pitch.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const scripts = JSON.parse(content);

      res.json({
        smsScript: scripts.textScript || scripts.smsScript || '',
        emailScript: scripts.emailScript || '',
        callScript: scripts.callScript || '',
        generatedAt: new Date().toISOString(),
        frameworks: ['NEPQ', 'Jeb Blount', 'Chris Voss'],
      });
    } catch (error) {
      console.error("Error generating outreach scripts:", error);
      res.status(500).json({ error: "Failed to generate outreach scripts" });
    }
  });

  // Draft Email from Notes - generates follow-up emails based on call notes
  app.post("/api/leads/draft-email-from-notes", async (req, res) => {
    try {
      const { 
        businessName,
        contactName,
        notes,
        recentActivities, // Array of recent activities with type, notes, createdAt
        stage,
        businessType,
        location,
        customInstructions // Optional: what specifically they asked for
      } = req.body;

      if (!businessName || !notes) {
        return res.status(400).json({ error: "Business name and notes are required" });
      }

      // Build context from recent activities
      let activityContext = '';
      if (recentActivities && recentActivities.length > 0) {
        const recentCalls = recentActivities
          .filter((a: any) => a.type === 'call')
          .slice(0, 3);
        
        if (recentCalls.length > 0) {
          activityContext = recentCalls.map((a: any) => {
            const date = new Date(a.createdAt);
            const formattedDate = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
            return `- Call on ${formattedDate}: ${a.notes || 'No notes'}`;
          }).join('\n');
        }
      }

      const prompt = `You are a professional business consultant drafting a follow-up email after a phone call.
The client asked to receive some information via email. Generate a professional, personalized email based on the notes from the call.

BUSINESS DETAILS:
- Business Name: ${businessName}
- Contact Name: ${contactName || 'the business owner'}
- Business Type: ${businessType || 'Unknown'}
- Location: ${location || 'Unknown'}
- Pipeline Stage: ${stage || 'prospect'}

YOUR NOTES FROM THE INTERACTION:
${notes}

${activityContext ? `RECENT CALL HISTORY:\n${activityContext}\n` : ''}
${customInstructions ? `SPECIFIC REQUEST FROM LEAD:\n${customInstructions}\n` : ''}

GUIDELINES:
1. Start with a warm, personalized greeting referencing your conversation
2. Acknowledge what they asked for and provide it clearly
3. Structure information in easy-to-scan format (bullet points if multiple items)
4. Include a clear next step or call-to-action
5. Keep it concise - respect their time
6. Professional but warm tone - you've already spoken, so be friendly
7. End with an invitation to discuss further

Return the email in this JSON format:
{
  "subject": "Email subject line - make it specific to what you're sending",
  "greeting": "Personalized greeting",
  "body": "Main email body with the information they requested",
  "callToAction": "Clear next step suggestion",
  "signature": "Professional sign-off"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 800,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const email = JSON.parse(content);

      // Compose full email
      const fullEmail = `${email.greeting}\n\n${email.body}\n\n${email.callToAction}\n\n${email.signature}`;

      res.json({
        subject: email.subject || 'Following up on our conversation',
        body: fullEmail,
        greeting: email.greeting,
        mainBody: email.body,
        callToAction: email.callToAction,
        signature: email.signature,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error generating draft email:", error);
      res.status(500).json({ error: "Failed to generate draft email" });
    }
  });

  // ===============================
  // SMART SCHEDULING API
  // ===============================

  // AI-powered next contact date suggestion
  app.post("/api/scheduling/suggest-next-contact", async (req, res) => {
    try {
      const { 
        leadStage, 
        activityType, 
        taskLoadByDate, // { "2026-01-12": 5, "2026-01-13": 3, ... }
        maxTasksPerDay = 8,
        preferredDays = [1, 2, 3, 4, 5], // Mon-Fri by default
        leadPriority = 'normal' // 'high', 'normal', 'low'
      } = req.body;

      if (!leadStage || !activityType) {
        return res.status(400).json({ error: "leadStage and activityType are required" });
      }

      // Calculate base follow-up interval based on stage
      const stageIntervals: Record<string, { min: number; ideal: number; max: number }> = {
        new: { min: 1, ideal: 2, max: 5 },
        contacted: { min: 2, ideal: 3, max: 7 },
        qualified: { min: 2, ideal: 5, max: 10 },
        proposal: { min: 1, ideal: 3, max: 7 },
        negotiation: { min: 1, ideal: 2, max: 5 },
        won: { min: 7, ideal: 14, max: 30 },
        lost: { min: 14, ideal: 30, max: 60 },
        nurture: { min: 7, ideal: 14, max: 30 }
      };

      const interval = stageIntervals[leadStage] || stageIntervals.contacted;
      
      // Adjust based on priority
      const priorityMultiplier = leadPriority === 'high' ? 0.7 : leadPriority === 'low' ? 1.5 : 1;
      const adjustedIdeal = Math.round(interval.ideal * priorityMultiplier);

      // Find optimal date considering task load
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let selectedDate: Date | null = null;
      let selectedReason = '';

      // Check dates from min to max interval
      for (let dayOffset = interval.min; dayOffset <= interval.max + 7; dayOffset++) {
        const candidateDate = new Date(today);
        candidateDate.setDate(today.getDate() + dayOffset);
        
        const dayOfWeek = candidateDate.getDay();
        const dateKey = candidateDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const taskCount = taskLoadByDate?.[dateKey] || 0;
        
        // Skip if not a preferred day
        if (!preferredDays.includes(dayOfWeek)) continue;
        
        // Skip if day is overloaded
        if (taskCount >= maxTasksPerDay) continue;
        
        // Found a good slot
        if (!selectedDate) {
          selectedDate = candidateDate;
          if (dayOffset === adjustedIdeal) {
            selectedReason = `Optimal follow-up timing for ${leadStage} stage`;
          } else if (taskCount < maxTasksPerDay / 2) {
            selectedReason = `Light workload day (${taskCount} tasks scheduled)`;
          } else {
            selectedReason = `Balanced workload (${taskCount}/${maxTasksPerDay} tasks)`;
          }
        }
        
        // Prefer the ideal day if it has capacity
        if (dayOffset === adjustedIdeal && taskCount < maxTasksPerDay) {
          selectedDate = candidateDate;
          selectedReason = `Optimal ${adjustedIdeal}-day follow-up for ${leadStage} leads`;
          break;
        }
      }

      if (!selectedDate) {
        // Fallback: find the next available preferred day beyond max interval
        for (let dayOffset = interval.max + 1; dayOffset <= interval.max + 30; dayOffset++) {
          const candidateDate = new Date(today);
          candidateDate.setDate(today.getDate() + dayOffset);
          const dayOfWeek = candidateDate.getDay();
          
          if (preferredDays.includes(dayOfWeek)) {
            selectedDate = candidateDate;
            selectedReason = `Next available workday (high workload period)`;
            break;
          }
        }
        
        // Ultimate fallback if no preferred day found
        if (!selectedDate) {
          selectedDate = new Date(today);
          selectedDate.setDate(today.getDate() + adjustedIdeal);
          selectedReason = `Default ${adjustedIdeal}-day follow-up`;
        }
      }

      // Format date as DD-MM-YYYY for display
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const year = selectedDate.getFullYear();
      const displayDate = `${day}-${month}-${year}`;

      res.json({
        suggestedDate: selectedDate.toISOString(),
        displayDate,
        reason: selectedReason,
        daysFromNow: Math.round((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
        stage: leadStage,
        activityType
      });

    } catch (error) {
      console.error("Error suggesting next contact:", error);
      res.status(500).json({ error: "Failed to suggest next contact date" });
    }
  });

  // ============================================
  // AI Message Generation
  // ============================================

  app.post("/api/messages/generate", async (req, res) => {
    try {
      const { 
        channel, // 'sms' or 'email'
        recipientName,
        companyName,
        phone,
        email,
        stage,
        notes,
        sourceData,
        activityHistory,
        contactName,
        userContext // Any additional context from user
      } = req.body;

      if (!channel || !companyName) {
        return res.status(400).json({ error: "Channel and company name are required" });
      }

      // Determine which sales framework to use based on context
      let frameworkToUse = 'NEPQ'; // Default
      let frameworkReason = 'Discovery and relationship building';

      // Framework selection logic
      if (stage === 'suspect' || stage === 'lead') {
        // Cold outreach - use Jeb Blount's Fanatical Prospecting
        frameworkToUse = 'Jeb Blount';
        frameworkReason = 'Cold outreach - pattern interrupt and value proposition';
      } else if (stage === 'qualified' || stage === 'proposal') {
        // Discovery phase - use NEPQ
        frameworkToUse = 'NEPQ';
        frameworkReason = 'Discovery phase - asking situation and problem questions';
      } else if (stage === 'negotiation' || activityHistory?.includes('objection')) {
        // Negotiation - use Chris Voss
        frameworkToUse = 'Chris Voss';
        frameworkReason = 'Negotiation - tactical empathy and calibrated questions';
      }

      // Build context for the AI
      const contextParts: string[] = [];
      
      if (sourceData?.source === 'google_places') {
        contextParts.push(`Lead source: Found this business via Google Business Profile search.`);
        if (sourceData.googleRating) {
          contextParts.push(`They have a ${sourceData.googleRating}/5 rating with ${sourceData.googleReviewCount || 'some'} reviews.`);
        }
        if (sourceData.businessSignals?.length) {
          contextParts.push(`Business signals: ${sourceData.businessSignals.join(', ')}.`);
        }
        if (sourceData.addedReason) {
          contextParts.push(`Reason added: ${sourceData.addedReason}`);
        }
      } else if (sourceData?.source === 'abr') {
        contextParts.push(`Lead source: Found via Australian Business Register (ABR).`);
        if (sourceData.abn) {
          contextParts.push(`ABN: ${sourceData.abn}, State: ${sourceData.abnState || 'Unknown'}`);
        }
        if (sourceData.businessSignals?.length) {
          contextParts.push(`Business signals: ${sourceData.businessSignals.join(', ')}.`);
        }
      }

      if (notes) {
        contextParts.push(`Notes about this lead: ${notes}`);
      }

      if (activityHistory?.length) {
        contextParts.push(`Recent activity: ${activityHistory.slice(0, 3).join('; ')}`);
      }

      if (userContext) {
        contextParts.push(`Additional context: ${userContext}`);
      }

      const context = contextParts.join('\n');

      const systemPrompt = `You are an expert sales copywriter who crafts personalized outreach messages. You use proven sales frameworks:

FRAMEWORKS:
1. **NEPQ (New Economy Power Questions)** by Jeremy Miner: Focus on asking questions that help prospects discover their own problems. Use situation, problem, consequence, and solution questions.
2. **Jeb Blount (Fanatical Prospecting)**: For cold outreach, use pattern interrupts, be direct about why you're reaching out, focus on value proposition, keep it brief.
3. **Chris Voss (Never Split the Difference)**: Use tactical empathy, calibrated questions ("How am I supposed to...?"), labels ("It seems like..."), mirrors, and accusation audits.

CURRENT FRAMEWORK TO USE: ${frameworkToUse}
REASON: ${frameworkReason}

RULES:
- Keep ${channel === 'sms' ? 'text messages under 160 characters when possible, max 300' : 'emails concise but professional, 3-5 sentences max'}
- Be conversational and human, not robotic
- ${channel === 'sms' ? 'Use casual but professional tone' : 'Include a clear subject line for emails'}
- Reference specific details about their business if available
- End with a soft call-to-action or open question
- Never be pushy or salesy
- Personalize based on the context provided
- Use DD-MM-YYYY format for any dates

OUTPUT FORMAT:
${channel === 'email' ? 'Return JSON with "subject" and "body" fields' : 'Return JSON with "message" field only'}`;

      const userPrompt = `Generate a ${channel === 'sms' ? 'text message' : 'professional email'} for:

RECIPIENT:
- Company: ${companyName}
${contactName ? `- Contact: ${contactName}` : ''}
- Stage: ${stage || 'New prospect'}

CONTEXT:
${context || 'No additional context available.'}

Generate a personalized ${channel} using the ${frameworkToUse} framework.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const generated = JSON.parse(content);

      res.json({
        channel,
        framework: frameworkToUse,
        frameworkReason,
        ...generated,
        recipientPhone: phone,
        recipientEmail: email,
        companyName
      });

    } catch (error) {
      console.error("Error generating message:", error);
      res.status(500).json({ error: "Failed to generate message" });
    }
  });

  // ===============================
  // ADMIN: USER & TEAM MANAGEMENT
  // ===============================

  // Helper to verify Firebase token and check admin role
  async function verifyAdminAccessForTeam(authHeader: string | undefined, orgId: string): Promise<{ valid: boolean; error?: string; uid?: string }> {
    if (!authHeader?.startsWith('Bearer ')) {
      return { valid: false, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.split('Bearer ')[1];
    const admin = (await import('./firebase')).default;
    
    try {
      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(token);
      const requestingUid = decodedToken.uid;

      // Check if user is org owner (check both ownerUid and ownerId for compatibility)
      const orgDoc = await firestore?.collection('orgs').doc(orgId).get();
      if (!orgDoc?.exists) {
        return { valid: false, error: 'Organization not found' };
      }

      const orgData = orgDoc.data();
      const isOwner = orgData?.ownerId === requestingUid || orgData?.ownerUid === requestingUid;

      if (isOwner) {
        return { valid: true, uid: requestingUid };
      }

      // Check member role
      const memberDoc = await firestore?.collection('orgs').doc(orgId).collection('members').doc(requestingUid).get();
      if (!memberDoc?.exists) {
        return { valid: false, error: 'Not a member of this organization' };
      }

      const memberData = memberDoc.data();
      if (!['owner', 'admin'].includes(memberData?.role)) {
        return { valid: false, error: 'Insufficient permissions - admin role required' };
      }

      return { valid: true, uid: requestingUid };
    } catch (error) {
      console.error('Token verification failed:', error);
      return { valid: false, error: 'Invalid or expired token' };
    }
  }

  // Create a new team member with Firebase Auth account
  app.post("/api/admin/create-team-member", async (req, res) => {
    try {
      const { email, password, orgId, role = 'member' } = req.body;

      if (!email || !password || !orgId) {
        return res.status(400).json({ error: "Email, password, and orgId are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Validate role - only allow 'admin' or 'member', never 'owner'
      const allowedRoles = ['admin', 'member'];
      const validatedRole = allowedRoles.includes(role) ? role : 'member';

      if (!isFirebaseAdminReady()) {
        return res.status(503).json({ error: "Firebase Admin not available" });
      }

      // Verify the requesting user has admin access
      const authResult = await verifyAdminAccessForTeam(req.headers.authorization, orgId);
      if (!authResult.valid) {
        return res.status(403).json({ error: authResult.error || 'Access denied' });
      }

      const admin = (await import('./firebase')).default;
      
      // Check if user already exists
      let userRecord;
      let alreadyExists = false;
      try {
        userRecord = await admin.auth().getUserByEmail(email);
        alreadyExists = true;
      } catch (error: any) {
        if (error.code !== 'auth/user-not-found') {
          throw error;
        }
        // User doesn't exist, create them
        userRecord = await admin.auth().createUser({
          email,
          password,
          emailVerified: false,
        });
      }

      // Always ensure the Firestore member document exists
      if (firestore) {
        const memberRef = firestore.collection('orgs').doc(orgId).collection('members').doc(userRecord.uid);
        const memberDoc = await memberRef.get();
        
        if (!memberDoc.exists) {
          await memberRef.set({
            email,
            role: validatedRole,
            status: 'active',
            active: true,
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdByAdmin: true,
          });
        }
      }

      res.json({ 
        success: true, 
        message: alreadyExists 
          ? `User ${email} already exists. Added to team.`
          : `Account created for ${email}`,
        uid: userRecord.uid,
        alreadyExists
      });
    } catch (error: any) {
      console.error("Error creating team member:", error);
      if (error.code === 'auth/email-already-exists') {
        return res.status(400).json({ error: "An account with this email already exists" });
      }
      if (error.code === 'auth/invalid-email') {
        return res.status(400).json({ error: "Invalid email address" });
      }
      res.status(500).json({ error: "Failed to create team member" });
    }
  });

  // Reset a team member's password (admin only)
  app.post("/api/admin/reset-password", async (req, res) => {
    try {
      const { email, newPassword, orgId } = req.body;

      if (!email || !newPassword || !orgId) {
        return res.status(400).json({ error: "Email, new password, and orgId are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      if (!isFirebaseAdminReady()) {
        return res.status(503).json({ error: "Firebase Admin not available" });
      }

      // Verify the requesting user has admin access
      const authResult = await verifyAdminAccessForTeam(req.headers.authorization, orgId);
      if (!authResult.valid) {
        return res.status(403).json({ error: authResult.error || 'Access denied' });
      }

      // Get user by email
      const admin = (await import('./firebase')).default;
      const userRecord = await admin.auth().getUserByEmail(email);

      // Update the password
      await admin.auth().updateUser(userRecord.uid, {
        password: newPassword,
      });

      res.json({ 
        success: true, 
        message: `Password updated for ${email}` 
      });
    } catch (error: any) {
      console.error("Error resetting password:", error);
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ error: "User not found with that email" });
      }
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Send password reset email to user (admin only)
  app.post("/api/admin/send-password-reset", async (req, res) => {
    try {
      const { email, orgId } = req.body;

      if (!email || !orgId) {
        return res.status(400).json({ error: "Email and orgId are required" });
      }

      if (!isFirebaseAdminReady()) {
        return res.status(503).json({ error: "Firebase Admin not available" });
      }

      // Verify the requesting user has admin access
      const authResult = await verifyAdminAccessForTeam(req.headers.authorization, orgId);
      if (!authResult.valid) {
        return res.status(403).json({ error: authResult.error || 'Access denied' });
      }

      const admin = (await import('./firebase')).default;
      
      // Generate password reset link
      const resetLink = await admin.auth().generatePasswordResetLink(email);

      res.json({ 
        success: true, 
        message: `Password reset link generated for ${email}`,
        resetLink // Admin can share this with the team member
      });
    } catch (error: any) {
      console.error("Error generating password reset:", error);
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ error: "User not found with that email" });
      }
      res.status(500).json({ error: "Failed to generate password reset link" });
    }
  });

  // ===============================
  // AI MEETING NOTES PROCESSING
  // ===============================

  app.post("/api/ai/process-meeting-notes", async (req, res) => {
    try {
      const { notes, clientName, clientContext } = req.body;

      if (!notes) {
        return res.status(400).json({ error: "Meeting notes are required" });
      }

      const systemPrompt = `You are an AI assistant for a marketing agency. You help extract actionable insights from meeting notes with clients.

Your task is to analyze meeting notes and extract:
1. A concise summary (2-3 sentences)
2. Key discussion points (bullet points)
3. Action items with clear ownership and suggested due dates
4. Next steps and follow-up recommendations

Focus on actionable outcomes that move the client relationship forward. Be specific about deliverables and timelines.

Respond in JSON format:
{
  "summary": "Brief meeting summary",
  "keyPoints": ["Point 1", "Point 2"],
  "actionItems": [
    {
      "title": "Action item description",
      "taskType": "check_in|proposal|strategy_review|content_review|campaign_launch|reporting|onboarding|training|other",
      "priority": "low|medium|high|urgent",
      "suggestedDueDays": 3,
      "notes": "Additional context"
    }
  ],
  "nextSteps": "Recommended next steps",
  "clientSentiment": "positive|neutral|concerned",
  "riskFlags": ["Any concerns or risks identified"]
}`;

      const userPrompt = `Client: ${clientName || 'Unknown'}
${clientContext ? `Context: ${clientContext}` : ''}

Meeting Notes:
${notes}

Please analyze these meeting notes and extract actionable insights.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.5,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const result = JSON.parse(content);
      res.json(result);

    } catch (error) {
      console.error("Error processing meeting notes:", error);
      res.status(500).json({ error: "Failed to process meeting notes" });
    }
  });

  // ============================================
  // AI Sales Engine Endpoints
  // ============================================

  app.post("/api/ai/sales-engine/pre-call", async (req, res) => {
    try {
      const {
        businessName, location, websiteUrl, hasWebsite, googleMapsUrl, hasGBP,
        reviewCount, rating, gbpPhotoCount, gbpPostsLast30Days,
        facebookUrl, instagramUrl, industry,
      } = req.body;

      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const facts = {
        website: hasWebsite ? "yes" : "no",
        gbp: hasGBP ? "yes" : "no",
        reviews: reviewCount != null ? String(reviewCount) : "unknown",
        rating: rating != null ? String(rating) : "unknown",
        gbpPhotos: gbpPhotoCount != null ? String(gbpPhotoCount) : "unknown",
        gbpPosts30Days: gbpPostsLast30Days != null ? String(gbpPostsLast30Days) : "unknown",
        socialProfiles: (facebookUrl || instagramUrl) ? "detected" : "not detected",
      };

      const prompt = `You are assisting a digital marketing sales consultant preparing for a call.

STRUCTURED BUSINESS DATA:
businessName: ${businessName}
location: ${location || "Not specified"}
websiteUrl: ${websiteUrl || "None"}
hasWebsite: ${hasWebsite}
googleMapsUrl: ${googleMapsUrl || "None"}
hasGBP: ${hasGBP}
reviewCount: ${reviewCount != null ? reviewCount : "unknown"}
rating: ${rating != null ? rating : "unknown"}
gbpPhotoCount: ${gbpPhotoCount != null ? gbpPhotoCount : "unknown"}
gbpPostsLast30Days: ${gbpPostsLast30Days != null ? gbpPostsLast30Days : "unknown"}
facebookUrl: ${facebookUrl || "None"}
instagramUrl: ${instagramUrl || "None"}
industry: ${industry || "Not specified"}

RULES — follow these exactly:
1. Only flag gaps that are SUPPORTED by the data above. Never invent missing assets.
2. If hasGBP = true → do NOT say the business lacks a Google Business Profile.
3. If hasWebsite = true → do NOT say the business lacks a website.
4. If reviewCount < 15 → gap = low review volume. If reviewCount is "unknown", do NOT flag reviews.
5. If gbpPhotoCount < 10 → gap = weak photo content. If gbpPhotoCount is "unknown", do NOT flag photos.
6. If gbpPostsLast30Days = 0 → gap = no recent Google Posts activity. If "unknown", do NOT flag posts.
7. If facebookUrl AND instagramUrl are both "None" → gap = limited social presence.
8. If hasWebsite = false → gap = missing website.
9. If hasGBP = false → gap = missing Google Business Profile.
10. For each gap, provide the evidence from the data and why it matters for leads or rankings.

Respond with JSON in this exact format:
{
  "whatTheyDo": "2 sentences about what this business does and who they serve",
  "strengths": ["Strength 1 based on their actual data", "Strength 2", "Strength 3"],
  "gaps": [
    { "title": "Gap title", "evidence": "The data point supporting this gap", "impact": "Why this matters for leads or rankings" }
  ],
  "salesHook": "A short conversational opening line for my call based on the strongest gap"
}

Keep it concise and practical. Only include gaps genuinely supported by the data.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let aiResult;
      try {
        aiResult = JSON.parse(content);
        if (!aiResult.whatTheyDo || !Array.isArray(aiResult.strengths) || !Array.isArray(aiResult.gaps)) {
          throw new Error("Invalid response structure");
        }
        const normalizedGaps = aiResult.gaps.map((g: any) => {
          if (typeof g === 'string') return { title: g, evidence: '', impact: '' };
          return { title: g.title || '', evidence: g.evidence || '', impact: g.impact || '' };
        });
        aiResult.gaps = normalizedGaps;
      } catch (e) {
        aiResult = {
          whatTheyDo: `${businessName} is a ${industry || "local"} business located in ${location || "the area"}. They serve local customers with their products and services.`,
          strengths: ["Established local presence", "Serving a defined market", "Existing customer base"],
          gaps: [{ title: "Limited online visibility", evidence: "Could not fully assess digital presence", impact: "May be losing potential customers to competitors with better visibility" }],
          salesHook: `Hi, I was looking at ${businessName} online and noticed a few things that could help you get more customers.`,
        };
      }

      res.json({ ...aiResult, facts });
    } catch (error) {
      console.error("Error generating pre-call intelligence:", error);
      res.status(500).json({ error: "Failed to generate pre-call intelligence" });
    }
  });

  app.post("/api/ai/sales-engine/objection", async (req, res) => {
    try {
      const { objections, leadContext } = req.body;

      if (!objections || !Array.isArray(objections) || objections.length === 0) {
        return res.status(400).json({ error: "At least one objection is required" });
      }

      const contextInfo = leadContext
        ? `\nContext about the prospect:\n- Business: ${leadContext.businessName || "Unknown"}\n- Industry: ${leadContext.industry || "Unknown"}\n- Stage: ${leadContext.stage || "Unknown"}`
        : "";

      const objectionList = objections.map((o: string, i: number) => `${i + 1}. "${o}"`).join("\n");

      const prompt = `I sell digital marketing services to Australian small businesses.
${contextInfo}

For each of these objections:
${objectionList}

Respond in JSON format with a "responses" array. Each item must have:
{
  "objection": "the original objection text",
  "realConcern": "What is the real concern behind it (1-2 sentences)",
  "response": "A confident, conversational 2-3 sentence response",
  "regainControlQuestion": "A question to regain control of the conversation"
}

Be natural, not scripted. Sound like a confident peer, not a pushy salesperson.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
        if (!result.responses || !Array.isArray(result.responses)) {
          throw new Error("Invalid response structure");
        }
      } catch (e) {
        result = {
          responses: objections.map((o: string) => ({
            objection: o,
            realConcern: "They may have had a bad experience or are unsure about the ROI.",
            response: "I completely understand that concern. Many businesses feel the same way initially. What we focus on is measurable outcomes tied directly to revenue growth.",
            regainControlQuestion: "If I could show you exactly how we'd approach it differently, would that be worth a quick look?"
          }))
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error generating objection responses:", error);
      res.status(500).json({ error: "Failed to generate objection responses" });
    }
  });

  app.post("/api/ai/sales-engine/follow-up", async (req, res) => {
    try {
      const { business, industry, location, meetingNotes, servicesDiscussed, nextStep } = req.body;

      if (!business) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const prompt = `I just had a sales call with:

Business: ${business}
Industry: ${industry || "Not specified"}
Location: ${location || "Not specified"}

On the call they told me:
${meetingNotes || "General interest in digital marketing services"}

Services discussed: ${servicesDiscussed || "Digital marketing services"}
Agreed next step: ${nextStep || "Follow up with more information"}

Generate follow-up content in JSON format with these exact fields:
{
  "email": {
    "subject": "Email subject line",
    "body": "Full personalised follow-up email that thanks them naturally, references what they told me, suggests 2-3 relevant improvements, and ends with a clear next step"
  },
  "sms": {
    "message": "A short, professional SMS follow-up (max 160 chars) that references the call and confirms the next step"
  },
  "proposalIntro": {
    "opening": "A 2-3 paragraph proposal introduction that positions the solution around their specific needs and pain points discussed on the call"
  }
}

Write in a professional but warm tone. Be specific to what was discussed, not generic.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
        if (!result.email || !result.sms || !result.proposalIntro) {
          throw new Error("Invalid response structure");
        }
      } catch (e) {
        result = {
          email: {
            subject: `Great chatting today - next steps for ${business}`,
            body: `Hi,\n\nThanks for taking the time to chat today. I really enjoyed learning about ${business} and the work you're doing in ${location || "your area"}.\n\nBased on what you shared, I think there are a couple of quick wins we could help with:\n\n1. Improving your local search visibility\n2. Setting up a review generation system\n3. Optimising your Google Business Profile\n\nAs discussed, I'll put together a brief overview of how we'd approach this. Would ${nextStep || "a follow-up call later this week"} work?\n\nLooking forward to it.\n\nBest regards`
          },
          sms: {
            message: `Hey, great chat today about ${business}. I'll send through that info we discussed. Talk soon!`
          },
          proposalIntro: {
            opening: `Thank you for the opportunity to discuss how we can help ${business} grow. Based on our conversation, it's clear you have a strong foundation and a real opportunity to capture more of your local market.\n\nWe've identified several areas where targeted digital marketing can drive measurable results for your business, particularly around ${servicesDiscussed || "local search and online visibility"}.`
          }
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error generating follow-up content:", error);
      res.status(500).json({ error: "Failed to generate follow-up content" });
    }
  });

  app.post("/api/ai/sales-engine/prospect", async (req, res) => {
    try {
      const { businessType, suburb, nearbySuburbs } = req.body;

      if (!businessType || !suburb) {
        return res.status(400).json({ error: "Business type and suburb are required" });
      }

      const prompt = `I just spoke to a ${businessType} in ${suburb}.

List 10 similar businesses in ${nearbySuburbs ? `these surrounding suburbs: ${nearbySuburbs}` : `surrounding suburbs near ${suburb}`} that are likely to need digital marketing help.

Return the results in JSON format with this exact structure:
{
  "prospects": [
    {
      "businessName": "Suggested business name based on common naming patterns for this type",
      "suburb": "The suburb this business would be in",
      "painPoint": "The most likely digital marketing pain point for this type of business",
      "whyStrongProspect": "Why this would be a strong prospect (1 sentence)",
      "openingLine": "A natural opening line to use when calling this prospect"
    }
  ]
}

Generate realistic prospect suggestions based on common business patterns in the Australian market. Each prospect should have a unique angle and pain point.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
        if (!result.prospects || !Array.isArray(result.prospects)) {
          throw new Error("Invalid response structure");
        }
      } catch (e) {
        result = {
          prospects: [
            {
              businessName: `${businessType} - ${suburb} Area`,
              suburb: suburb,
              painPoint: "Limited online visibility in local search results",
              whyStrongProspect: "Similar business model with likely similar digital marketing needs",
              openingLine: `Hi, I work with several ${businessType.toLowerCase()} businesses in the area and noticed an opportunity to help you get more visible online.`
            }
          ]
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error generating prospect suggestions:", error);
      res.status(500).json({ error: "Failed to generate prospect suggestions" });
    }
  });

  // ============================================
  // Growth Plan Endpoints
  // ============================================

  app.post("/api/ai/growth-plan/website-xray", async (req, res) => {
    try {
      const { websiteUrl, businessName, industry, location } = req.body;
      if (!websiteUrl) {
        return res.status(400).json({ error: "Website URL is required" });
      }

      const crawlData = await crawlWebsite(websiteUrl);

      if (!crawlData.success) {
        return res.status(400).json({ error: `Could not access website: ${crawlData.error}` });
      }

      const prompt = `You are a digital marketing auditor. Analyse these website crawl signals and identify issues.

WEBSITE: ${websiteUrl}
BUSINESS: ${businessName || 'Unknown'}
INDUSTRY: ${industry || 'Unknown'}
LOCATION: ${location || 'Unknown'}

CRAWL DATA:
- Title: ${crawlData.title || 'MISSING'}
- Meta Description: ${crawlData.metaDescription || 'MISSING'}
- H1 Tags: ${crawlData.h1s.length > 0 ? crawlData.h1s.join(', ') : 'NONE'}
- Heading Hierarchy: ${crawlData.headingHierarchy.slice(0, 10).map(h => `${h.tag}: ${h.text}`).join(' | ')}
- Word Count: ${crawlData.wordCount}
- Internal Links: ${crawlData.internalLinks}
- External Links: ${crawlData.externalLinks}
- HTTPS: ${crawlData.hasHttps}
- Sitemap: ${crawlData.hasSitemap}
- Schema Markup: ${crawlData.hasSchema}
- Images: ${crawlData.images.total} total, ${crawlData.images.withAlt} with alt text
- Nav Labels: ${crawlData.navLabels.join(', ') || 'None detected'}
- Service Keywords Found: ${crawlData.serviceKeywords.join(', ') || 'None'}
- Location Keywords Found: ${crawlData.locationKeywords.join(', ') || 'None'}

Respond with JSON:
{
  "callouts": [
    { "id": 1, "issue": "Issue title", "detail": "What the data shows", "fix": "Recommended fix", "severity": "high|medium|low" }
  ],
  "summary": "2-3 sentence overall assessment of the website's SEO health and biggest opportunity"
}

Rules:
- Only flag issues supported by the crawl data
- Prioritise issues that impact local search rankings
- Include 4-8 callouts ordered by severity
- Focus on: service clarity, location signals, call-to-action strength, content depth, technical SEO`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let aiResult;
      try {
        aiResult = JSON.parse(content);
        if (!Array.isArray(aiResult.callouts)) throw new Error("Invalid");
      } catch {
        aiResult = {
          callouts: [{ id: 1, issue: "Analysis incomplete", detail: "Could not fully analyse the website", fix: "Try again or review manually", severity: "medium" }],
          summary: `The website for ${businessName} was crawled but the AI analysis could not be completed.`,
        };
      }

      res.json({ crawlData, ...aiResult });
    } catch (error) {
      console.error("Error in website x-ray:", error);
      res.status(500).json({ error: "Failed to analyse website" });
    }
  });

  app.post("/api/ai/growth-plan/serp-analysis", async (req, res) => {
    try {
      const { businessName, websiteUrl, location, industry, keyword } = req.body;
      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const searchKeyword = keyword || `${industry || businessName} ${location || ''}`.trim();

      const prompt = `You are an SEO analyst. Generate a realistic local search analysis for this business.

BUSINESS: ${businessName}
WEBSITE: ${websiteUrl || 'None'}
LOCATION: ${location || 'Not specified'}
INDUSTRY: ${industry || 'Not specified'}
SEARCH KEYWORD: "${searchKeyword}"

Based on the business type, location, and industry, generate a realistic analysis of what the Google search results would look like for "${searchKeyword}".

Respond with JSON:
{
  "keyword": "${searchKeyword}",
  "prospectPosition": {
    "mapsPresence": "detected or not detected",
    "organicPresence": "detected or not detected",
    "bestMatchingPage": "URL or empty string",
    "relevanceScore": 0-100
  },
  "serpSnapshot": [
    { "position": 1, "title": "Result title", "domain": "example.com", "snippet": "Result description", "type": "organic|maps|ad" }
  ],
  "competitors": [
    { "name": "Business name", "domain": "domain.com", "position": 1, "strength": "Why they rank well" }
  ],
  "opportunities": [
    { "keyword": "Related keyword", "difficulty": "low|medium|high", "volume": "estimated monthly searches", "recommendation": "How to target this" }
  ]
}

Rules:
- Generate 8-10 SERP snapshot results (mix of maps pack and organic)
- Generate 5 competitors
- Generate 5-8 keyword opportunities
- If the business has a website, assess whether it would realistically appear
- Be realistic about competitor strength based on the Australian market`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
        if (!result.prospectPosition) throw new Error("Invalid");
      } catch {
        result = {
          keyword: searchKeyword,
          prospectPosition: { mapsPresence: "not detected", organicPresence: "not detected", bestMatchingPage: "", relevanceScore: 20 },
          serpSnapshot: [],
          competitors: [],
          opportunities: [],
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error in SERP analysis:", error);
      res.status(500).json({ error: "Failed to analyse search results" });
    }
  });

  app.post("/api/ai/growth-plan/competitor-gap", async (req, res) => {
    try {
      const { businessName, websiteUrl, location, industry, serpData, xrayData } = req.body;
      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const competitorContext = serpData?.competitors
        ? `Known competitors from SERP: ${serpData.competitors.map((c: any) => c.name).join(', ')}`
        : '';
      const websiteContext = xrayData
        ? `Prospect website signals: ${xrayData.wordCount} words, ${xrayData.internalLinks} internal links, ${xrayData.serviceKeywords?.length || 0} service keywords, ${xrayData.locationKeywords?.length || 0} location keywords`
        : '';

      const prompt = `You are an SEO competitive analyst. Compare a prospect against their likely competitors.

PROSPECT: ${businessName}
WEBSITE: ${websiteUrl || 'None'}
LOCATION: ${location || 'Not specified'}
INDUSTRY: ${industry || 'Not specified'}
${competitorContext}
${websiteContext}

Respond with JSON:
{
  "prospect": {
    "servicePages": estimated_number,
    "locationPages": estimated_number,
    "contentDepth": "thin|moderate|strong",
    "internalLinking": "weak|moderate|strong",
    "reviewSignals": "low|moderate|strong"
  },
  "competitorAverage": {
    "servicePages": estimated_number,
    "locationPages": estimated_number,
    "contentDepth": "thin|moderate|strong",
    "internalLinking": "weak|moderate|strong",
    "reviewSignals": "low|moderate|strong"
  },
  "competitors": [
    {
      "name": "Competitor name",
      "servicePages": number,
      "locationPages": number,
      "contentDepth": "thin|moderate|strong",
      "strengths": ["strength 1", "strength 2"]
    }
  ],
  "insights": ["Key insight about the competitive gap"]
}

Rules:
- Generate 3 realistic competitors
- Base estimates on industry norms for Australian local businesses
- Insights should be actionable
- If prospect has a website, factor in the actual signals`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
        if (!result.prospect || !result.competitorAverage) throw new Error("Invalid");
      } catch {
        result = {
          prospect: { servicePages: 1, locationPages: 0, contentDepth: "thin", internalLinking: "weak", reviewSignals: "low" },
          competitorAverage: { servicePages: 5, locationPages: 3, contentDepth: "moderate", internalLinking: "moderate", reviewSignals: "moderate" },
          competitors: [],
          insights: ["Unable to generate full competitive analysis. Please try again."],
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error in competitor gap analysis:", error);
      res.status(500).json({ error: "Failed to analyse competitor gap" });
    }
  });

  app.post("/api/ai/growth-plan/traffic-forecast", async (req, res) => {
    try {
      const { businessName, websiteUrl, location, industry, reviewCount, rating, serpData, xrayData } = req.body;
      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const prompt = `You are a digital marketing strategist. Generate a realistic 12-month traffic and revenue forecast.

BUSINESS: ${businessName}
WEBSITE: ${websiteUrl || 'None'}
LOCATION: ${location || 'Not specified'}
INDUSTRY: ${industry || 'Not specified'}
CURRENT REVIEWS: ${reviewCount ?? 'Unknown'}
CURRENT RATING: ${rating ?? 'Unknown'}

Respond with JSON:
{
  "currentEstimate": { "monthlyTraffic": number, "monthlyLeads": number, "monthlyRevenue": number },
  "projectedEstimate": { "monthlyTraffic": number, "monthlyLeads": number, "monthlyRevenue": number },
  "growthTimeline": [
    { "month": "Month 1", "traffic": number, "leads": number, "revenue": number },
    { "month": "Month 3", "traffic": number, "leads": number, "revenue": number },
    { "month": "Month 6", "traffic": number, "leads": number, "revenue": number },
    { "month": "Month 9", "traffic": number, "leads": number, "revenue": number },
    { "month": "Month 12", "traffic": number, "leads": number, "revenue": number }
  ],
  "assumptions": ["Assumption 1", "Assumption 2", "Assumption 3"],
  "keyDrivers": ["Driver 1", "Driver 2", "Driver 3"]
}

Rules:
- Base estimates on realistic Australian local business benchmarks
- Current estimates should reflect a typical business with limited digital marketing
- Projected estimates should reflect 12 months of consistent optimisation
- All forecasts must be labelled as estimates
- Use conservative numbers — don't overpromise
- Include 3-5 assumptions and 3-5 key drivers
- Growth should be gradual, not hockey-stick`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
        if (!result.currentEstimate || !result.projectedEstimate) throw new Error("Invalid");
      } catch {
        result = {
          currentEstimate: { monthlyTraffic: 50, monthlyLeads: 3, monthlyRevenue: 1500 },
          projectedEstimate: { monthlyTraffic: 300, monthlyLeads: 20, monthlyRevenue: 10000 },
          growthTimeline: [
            { month: "Month 1", traffic: 60, leads: 4, revenue: 2000 },
            { month: "Month 3", traffic: 100, leads: 7, revenue: 3500 },
            { month: "Month 6", traffic: 180, leads: 12, revenue: 6000 },
            { month: "Month 9", traffic: 250, leads: 17, revenue: 8500 },
            { month: "Month 12", traffic: 300, leads: 20, revenue: 10000 },
          ],
          assumptions: ["Industry average conversion rates", "Consistent optimisation efforts", "Local market conditions remain stable"],
          keyDrivers: ["Google Business Profile optimisation", "Website content expansion", "Review generation strategy"],
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error in traffic forecast:", error);
      res.status(500).json({ error: "Failed to generate forecast" });
    }
  });

  app.post("/api/ai/growth-plan/strategy-data", async (req, res) => {
    try {
      const { businessName, websiteUrl, location, industry, reviewCount, rating, xrayData, serpData, competitorData, forecastData } = req.body;
      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const contextParts = [];
      if (xrayData?.crawlData) contextParts.push(`Website: ${xrayData.crawlData.wordCount} words, ${xrayData.crawlData.h1s?.length || 0} H1s, ${xrayData.callouts?.length || 0} issues found`);
      if (serpData) contextParts.push(`SERP: Maps ${serpData.prospectPosition?.mapsPresence}, Organic ${serpData.prospectPosition?.organicPresence}`);
      if (competitorData) contextParts.push(`Competitors: prospect has ${competitorData.prospect?.servicePages} service pages vs ${competitorData.competitorAverage?.servicePages} avg`);
      if (forecastData) contextParts.push(`Forecast: ${forecastData.currentEstimate?.monthlyTraffic} → ${forecastData.projectedEstimate?.monthlyTraffic} monthly traffic`);

      const prompt = `Generate a professional 12-month digital marketing strategy document for a sales presentation.

BUSINESS: ${businessName}
WEBSITE: ${websiteUrl || 'None'}
LOCATION: ${location || 'Not specified'}
INDUSTRY: ${industry || 'Not specified'}
REVIEWS: ${reviewCount ?? 'Unknown'}
RATING: ${rating ?? 'Unknown'}
ANALYSIS DATA: ${contextParts.join(' | ') || 'No prior analysis available'}

Respond with JSON containing these text sections (each 2-4 paragraphs):
{
  "executiveSummary": "Overview of opportunities and recommended approach",
  "websiteAnalysis": "Assessment of current website SEO performance",
  "searchVisibility": "Current search visibility and where they stand",
  "competitorAnalysis": "How they compare to competitors",
  "keywordOpportunities": "Key search terms they should target",
  "trafficForecast": "Expected traffic and revenue growth estimates",
  "mapsOptimisation": "Google Maps and GBP optimisation plan",
  "growthRoadmap": "Month-by-month plan: Months 1-3 foundations, Months 4-6 growth, Months 7-9 expansion, Months 10-12 optimisation",
  "expectedImpact": "Projected business impact and ROI"
}

Write in a professional, consultant tone. Be specific to the business type and location. All forecasts must be labelled as estimates.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
      } catch {
        result = {
          executiveSummary: `This strategy outlines a 12-month growth plan for ${businessName}.`,
          websiteAnalysis: "Website analysis unavailable.",
          searchVisibility: "Search visibility analysis unavailable.",
          competitorAnalysis: "Competitor analysis unavailable.",
          keywordOpportunities: "Keyword analysis unavailable.",
          trafficForecast: "Traffic forecast unavailable.",
          mapsOptimisation: "Maps optimisation plan unavailable.",
          growthRoadmap: "Growth roadmap unavailable.",
          expectedImpact: "Impact projections unavailable.",
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error generating strategy data:", error);
      res.status(500).json({ error: "Failed to generate strategy data" });
    }
  });

  return httpServer;
}
