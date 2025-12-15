import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema, insertActivitySchema } from "@shared/schema";
import OpenAI from "openai";

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

  return httpServer;
}
