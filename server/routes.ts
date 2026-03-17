import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema, insertActivitySchema } from "@shared/schema";
import OpenAI from "openai";
import { firestore, bucket, isFirebaseAdminReady } from "./firebase";
import { crawlWebsite } from "./strategyEngine";
import multer from "multer";
import fs from "fs";
import path from "path";

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

  // AI suggest a single onboarding field based on business context
  app.post("/api/clients/ai/suggest-field", async (req, res) => {
    try {
      const { fieldLabel, fieldHint, context } = req.body as {
        fieldLabel: string;
        fieldHint?: string;
        context: Record<string, string>;
      };
      if (!context?.businessOverview?.trim()) {
        return res.status(400).json({ error: 'Business overview required' });
      }

      const contextLines: string[] = [];
      if (context.businessOverview) contextLines.push(`Business Overview: ${context.businessOverview}`);
      if (context.keyServices) contextLines.push(`Key Services: ${context.keyServices}`);
      if (context.locations) contextLines.push(`Locations: ${context.locations}`);
      if (context.businessGoals) contextLines.push(`Business Goals: ${context.businessGoals}`);
      if (context.competitorNotes) contextLines.push(`Competitors: ${context.competitorNotes}`);
      if (context.pricingNotes) contextLines.push(`Pricing: ${context.pricingNotes}`);
      if (context.capacityNotes) contextLines.push(`Capacity: ${context.capacityNotes}`);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are filling in a client intake form for a digital marketing agency. Based on the business context provided, generate a specific, accurate suggestion for one field. Only infer what is clearly supported by the context — do not speculate or invent. Be concise and practical. Return only the field content, no labels, no preamble.`,
          },
          {
            role: 'user',
            content: `BUSINESS CONTEXT:\n${contextLines.join('\n')}\n\nFIELD TO FILL: "${fieldLabel}"${fieldHint ? `\nField guidance: ${fieldHint}` : ''}\n\nWrite the content for this field only.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 300,
      });

      const suggestion = response.choices[0]?.message?.content?.trim() || '';
      res.json({ suggestion });
    } catch (error) {
      console.error('Error suggesting field:', error);
      res.status(500).json({ error: 'Failed to suggest field' });
    }
  });

  // Tidy speech-to-text dictation
  app.post("/api/clients/ai/tidy-dictation", async (req, res) => {
    try {
      const { text, fieldLabel } = req.body as { text: string; fieldLabel?: string };
      if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

      const context = fieldLabel ? ` The field is labelled "${fieldLabel}".` : '';
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You clean up speech-to-text dictation for a sales CRM used by digital marketing agencies.${context} Fix grammar and punctuation, remove filler words (um, uh, like, you know), correct obvious speech recognition errors, remove repetition, and make the text clear and readable as professional business notes. Preserve all factual content, numbers, names, and meaning. Return only the cleaned text with no introduction, preamble, or explanation.`,
          },
          { role: 'user', content: text.trim() },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const tidied = response.choices[0]?.message?.content?.trim() || text;
      res.json({ tidied });
    } catch (error) {
      console.error('Error tidying dictation:', error);
      res.status(500).json({ error: 'Failed to tidy dictation' });
    }
  });

  // Strategy Intelligence — AI suggest field for leads
  app.post("/api/leads/ai/suggest-field", async (req, res) => {
    try {
      const { fieldLabel, fieldHint, context } = req.body as {
        fieldLabel: string;
        fieldHint?: string;
        context: Record<string, string>;
      };

      const contextLines: string[] = [];
      if (context.companyName) contextLines.push(`Business Name: ${context.companyName}`);
      if (context.industry) contextLines.push(`Industry: ${context.industry}`);
      if (context.website) contextLines.push(`Website: ${context.website}`);
      if (context.location) contextLines.push(`Location: ${context.location}`);
      if (context.dealStage) contextLines.push(`Deal Stage: ${context.dealStage}`);
      if (context.businessOverview) contextLines.push(`Business Overview: ${context.businessOverview}`);
      if (context.coreServices) contextLines.push(`Core Services: ${context.coreServices}`);
      if (context.targetLocations) contextLines.push(`Target Locations: ${context.targetLocations}`);
      if (context.growthObjective) contextLines.push(`Growth Objective: ${context.growthObjective}`);
      if (context.conversationNotes) contextLines.push(`Conversation Notes: ${context.conversationNotes}`);
      if (context.conversationInsights) contextLines.push(`AI Conversation Insights: ${context.conversationInsights}`);
      if (context.dealSummary) contextLines.push(`AI Deal Summary: ${context.dealSummary}`);
      if (context.websiteContent) contextLines.push(`Website Content (crawled): ${context.websiteContent.slice(0, 600)}`);

      if (!contextLines.length) {
        return res.status(400).json({ error: 'No context provided' });
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are filling in a Strategy Intelligence discovery form for a digital marketing agency's CRM. Based on the business context provided (from conversations, website crawls, deal notes, and AI summaries), generate a specific, accurate suggestion for one field. Only infer what is clearly supported by the context — do not speculate or invent. Be concise and practical. For list fields like services or locations, use one item per line. Return only the field content, no labels, no preamble.`,
          },
          {
            role: 'user',
            content: `BUSINESS CONTEXT:\n${contextLines.join('\n')}\n\nFIELD TO FILL: "${fieldLabel}"${fieldHint ? `\nField guidance: ${fieldHint}` : ''}\n\nWrite the content for this field only.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 300,
      });

      const suggestion = response.choices[0]?.message?.content?.trim() || '';
      res.json({ suggestion });
    } catch (error) {
      console.error('Error suggesting field:', error);
      res.status(500).json({ error: 'Failed to suggest field' });
    }
  });

  // Strategy Intelligence — tidy dictation for leads
  app.post("/api/leads/ai/tidy-dictation", async (req, res) => {
    try {
      const { text, fieldLabel } = req.body as { text: string; fieldLabel?: string };
      if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

      const context = fieldLabel ? ` The field is labelled "${fieldLabel}".` : '';
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You clean up speech-to-text dictation for a sales CRM used by digital marketing agencies.${context} Fix grammar and punctuation, remove filler words (um, uh, like, you know), correct obvious speech recognition errors, remove repetition, and make the text clear and readable as professional business notes. Preserve all factual content, numbers, names, and meaning. Return only the cleaned text with no introduction, preamble, or explanation.`,
          },
          { role: 'user', content: text.trim() },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const tidied = response.choices[0]?.message?.content?.trim() || text;
      res.json({ tidied });
    } catch (error) {
      console.error('Error tidying dictation:', error);
      res.status(500).json({ error: 'Failed to tidy dictation' });
    }
  });

  // Auto-discover social media links from a website homepage
  app.post("/api/leads/discover-social", async (req, res) => {
    try {
      const { websiteUrl } = req.body as { websiteUrl: string };
      if (!websiteUrl?.trim()) return res.status(400).json({ error: 'No website URL provided' });

      const normalised = websiteUrl.trim().startsWith('http') ? websiteUrl.trim() : `https://${websiteUrl.trim()}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      let html = '';
      try {
        const response = await fetch(normalised, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-AU,en;q=0.9',
          },
        });
        clearTimeout(timeout);
        if (response.ok) html = await response.text();
      } catch {
        clearTimeout(timeout);
        // Try http fallback if https fails
        try {
          const fallback = normalised.replace(/^https:\/\//, 'http://');
          const r2 = await fetch(fallback, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
            signal: AbortSignal.timeout(10000),
          });
          if (r2.ok) html = await r2.text();
        } catch { /* ignore */ }
      }

      if (!html) return res.json({ facebookUrl: null, instagramUrl: null, linkedinUrl: null });

      // Extract all href values from <a> tags
      const hrefRegex = /href=["']([^"']+)["']/gi;
      const hrefs: string[] = [];
      let match;
      while ((match = hrefRegex.exec(html)) !== null) {
        hrefs.push(match[1]);
      }

      // Social media pattern matching — exclude sharing/login/generic pages
      const FACEBOOK_SKIP = /sharer|share|login|signup|sign-up|dialog|intent|watch|groups\/|events\/|hashtag|photo|video|plugins|pages\/create|business\/|ads\/|help\//i;
      const INSTAGRAM_SKIP = /explore|reel|story|p\/|tv\/|hashtag|accounts\/login/i;
      const LINKEDIN_SKIP = /share|login|signup|uas\/login|authwall|feed\/|jobs\/|learning\/|recruiter/i;

      const isValidFacebook = (url: string) => {
        try {
          const u = new URL(url);
          if (!/(facebook\.com|fb\.com)$/.test(u.hostname)) return false;
          if (FACEBOOK_SKIP.test(u.pathname)) return false;
          const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
          return parts.length === 1 && parts[0].length > 1;
        } catch { return false; }
      };

      const isValidInstagram = (url: string) => {
        try {
          const u = new URL(url);
          if (!u.hostname.includes('instagram.com')) return false;
          if (INSTAGRAM_SKIP.test(u.pathname)) return false;
          const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
          return parts.length === 1 && parts[0].length > 1;
        } catch { return false; }
      };

      const isValidLinkedIn = (url: string) => {
        try {
          const u = new URL(url);
          if (!u.hostname.includes('linkedin.com')) return false;
          if (LINKEDIN_SKIP.test(u.pathname)) return false;
          return /\/(company|in|school)\//.test(u.pathname);
        } catch { return false; }
      };

      const cleanUrl = (url: string, base: string) => {
        try {
          return new URL(url, base).href.split('?')[0].replace(/\/$/, '');
        } catch { return url; }
      };

      const facebookUrl = hrefs.map(h => cleanUrl(h, normalised)).find(isValidFacebook) || null;
      const instagramUrl = hrefs.map(h => cleanUrl(h, normalised)).find(isValidInstagram) || null;
      const linkedinUrl = hrefs.map(h => cleanUrl(h, normalised)).find(isValidLinkedIn) || null;

      res.json({ facebookUrl, instagramUrl, linkedinUrl });
    } catch (error) {
      console.error('Error discovering social links:', error);
      res.status(500).json({ error: 'Failed to discover social links' });
    }
  });

  // Parse a freetext "next step" into a structured task suggestion
  app.post("/api/leads/ai/parse-next-step", async (req, res) => {
    try {
      const { nextStep, leadName, companyName } = req.body as { nextStep: string; leadName?: string; companyName?: string };
      if (!nextStep?.trim()) return res.status(400).json({ error: 'No next step provided' });

      const today = new Date();
      const todayStr = today.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a sales CRM assistant. Today is ${todayStr} (DD/MM/YYYY). Parse a sales rep's "next step" note into a structured task. Respond ONLY with valid JSON, no markdown, no explanation. The JSON must have these fields:
- taskType: one of "follow_up" | "meeting" | "admin" | "prospecting" | "delivery"
- title: a short task title (max 60 chars), include the lead name and/or company if provided
- daysFromNow: integer number of days from today until the task is due. Use 0 for today, 1 for tomorrow, 7 for next week, 14 for two weeks, 30 for a month, etc. Parse natural language like "in two weeks", "next Friday", "end of month".
- notes: a brief one-line note about what to do (optional, can be empty string)

Rules:
- "call" → taskType "follow_up"  
- "email" or "send" → taskType "follow_up"
- "meeting" or "meet" → taskType "meeting"
- "proposal" or "quote" or "send" document → taskType "delivery"
- default → taskType "follow_up"
- If no time mentioned, default daysFromNow to 3`,
          },
          {
            role: 'user',
            content: `Next step: "${nextStep.trim()}"${companyName ? `\nCompany: ${companyName}` : ''}${leadName ? `\nContact: ${leadName}` : ''}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(raw);

      const daysFromNow = Math.max(0, Math.round(Number(parsed.daysFromNow) || 3));
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + daysFromNow);
      dueDate.setHours(9, 0, 0, 0);

      res.json({
        taskType: parsed.taskType || 'follow_up',
        title: parsed.title || nextStep.trim(),
        notes: parsed.notes || '',
        daysFromNow,
        dueDate: dueDate.toISOString(),
      });
    } catch (error) {
      console.error('Error parsing next step:', error);
      res.status(500).json({ error: 'Failed to parse next step' });
    }
  });

  // AI Onboarding & Team Handover — generate all outputs
  app.post("/api/clients/ai/onboarding-generate", async (req, res) => {
    try {
      const { clientName, location, data } = req.body as {
        clientName: string;
        location: string;
        data: Record<string, any>;
      };

      const products = (data.selectedProducts || []).join(', ') || 'Not specified';

      const hasSold = (p: string) => (data.selectedProducts || []).includes(p);
      const soldWebsite = hasSold('website');
      const soldSEO = hasSold('seo');
      const soldAds = hasSold('google_ads');
      const soldBoost = hasSold('performance_boost');
      const soldLocalSEO = hasSold('local_seo');
      const soldGBP = hasSold('gbp');

      const keywordBlock = data.keywordSummary
        ? `\n\nKEYWORD DATA (from uploaded Ahrefs/keyword planner file — CRITICAL: use these to identify every service + location combination that has search volume. These keywords must drive the sitemap — one page per keyword cluster that shows commercial intent. Prioritise "service suburb" combinations e.g. "chiropractor deception bay", "psychologist north lakes". Do NOT create generic category pages. Every sitemap page must map to a real keyword from this data or a clear search intent gap):\n${data.keywordSummary.slice(0, 4000)}`
        : data.manualKeywordNotes
        ? `\n\nKEYWORD NOTES:\n${data.manualKeywordNotes}`
        : '';

      const prompt = `You are a senior delivery strategist at a digital marketing agency. You have received a completed client intake form. Your job is NOT to summarise what the rep wrote. Your job is to SYNTHESISE all of this information into a practical, actionable internal delivery brief that the delivery team will use to start work immediately.

STRICT RULES:
- Do not restate or paraphrase the rep's notes. Synthesise them into delivery decisions.
- Every recommendation must be justified by the commercial context (pricing, capacity, conversion goals, local opportunity).
- If keyword data is provided, use it to drive specific page names, URL slugs, and campaign targets — not generic placeholders.
- Never write generic marketing advice. Every line must be specific to this client.
- If a product was not sold, omit that section entirely from the relevant output.
- Prioritise clarity, actionability, and commercial impact in every sentence.

═══ CLIENT INTAKE DATA ═══

CLIENT: ${clientName}
LOCATION / SERVICE AREAS: ${location}${data.locations ? `, ${data.locations}` : ''}
PRODUCTS SOLD: ${products || 'Not specified'}

BUSINESS MODEL & CONTEXT:
- What they do: ${data.businessOverview || 'N/A'}
- Who they serve (target customers): ${data.targetCustomers || 'N/A'}
- Key services (what they sell): ${data.keyServices || 'N/A'}
- Business goals: ${data.businessGoals || 'N/A'}
- Key differentiators: ${data.keyDifferentiators || 'N/A'}
- Competitor landscape: ${data.competitorNotes || 'N/A'}
- Brand / theme direction: ${data.brandDirection || 'N/A'}
- Operational notes: ${data.operationalNotes || 'N/A'}

COMMERCIAL MODEL:
- Pricing / average job value: ${data.pricingNotes || 'N/A'}
- Current capacity vs target capacity: ${data.capacityNotes || 'N/A'}
- Revenue opportunity / internal context: ${data.revenueNotes || 'N/A'}

PRODUCT SCOPE:
${soldWebsite ? `- WEBSITE: ${data.websitePageCount || '?'} pages. Objective: ${data.websiteObjective || 'N/A'}. CTA / booking preference: ${data.bookingCtaPreference || 'N/A'}` : ''}
${soldSEO ? `- SEO: Priority services to rank: ${data.seoServices || 'N/A'}. Priority locations: ${data.seoLocations || 'N/A'}` : ''}
${soldAds ? `- GOOGLE ADS: Focus services: ${data.adsServices || 'N/A'}. Monthly budget: ${data.monthlyBudget || 'N/A'}. Fastest commercial win: ${data.fastestWinService || 'N/A'}` : ''}
${soldBoost ? `- PERFORMANCE BOOST: Retargeting goal: ${data.retargetingGoal || 'N/A'}` : ''}
${soldLocalSEO ? `- LOCAL SEO: Included` : ''}
${soldGBP ? `- GBP OPTIMISATION: Included` : ''}

SEO / KEYWORD INTELLIGENCE:
- Website URL: ${data.currentWebsiteUrl || 'N/A'}
- Sitemap URL: ${data.currentSitemapUrl || 'N/A'}
- SEO objective: ${data.seoObjective || 'N/A'}
- Competitor keyword notes: ${data.competitorKeywordNotes || 'N/A'}${keywordBlock}

═══ OUTPUT INSTRUCTIONS ═══

Return a JSON object with exactly these four keys. Use markdown (## for headers, - for bullets, **bold** for emphasis). Each section must be substantive, specific, and decision-ready.

STRATEGY key — Delivery Strategy Brief:
Synthesise the business model, commercial goals, capacity targets, and product mix into a concise strategic brief. Include:
## Commercial Opportunity Analysis
(How does this business make money? What does capacity growth mean in dollar terms? What's the revenue upside of the campaign?)
## Service Priority Ranking
(Which services should be led with commercially, and why — based on pricing, demand signals, conversion likelihood)
## Location Opportunity
(Which locations/suburbs/regions have the most immediate ranking and lead-gen opportunity, and why)
## Fastest Commercial Win
(The single tactic with the quickest path to revenue — be specific and justify it)
## 12-Month Growth Trajectory
(What this business should look like in 12 months if delivery executes well — specific targets)

SITEMAP key — ${soldWebsite ? 'Recommended Website Sitemap — Keyword-Intent Driven' : 'N/A (Website not sold — write "Website not included in this package.")'}:
${soldWebsite ? `Design the sitemap based entirely on search intent from the keyword data provided. Every page must exist to rank for a specific search query — no generic category pages.

STRICT RULES:
- NEVER create pages like "Services Overview", "Psychological Services Overview", "Our Services", or any page without a specific ranking target
- EVERY page must have a clear ranking purpose tied to a real search term people type into Google
- Service + location combinations are the highest priority (e.g. "Chiropractor Deception Bay", "Psychologist North Lakes")
- Use the uploaded keyword data to identify which service + suburb combinations have search volume — prioritise those first
- If no keyword data is provided, derive service + suburb combinations from the client's services and locations

For each page, output in this exact format:
**Page:** [Page Name]
**URL:** /[url-slug]
**Target Keyword:** [exact keyword this page ranks for]
**Purpose:** Rank for "[target keyword]" — [one sentence on search intent and what the visitor wants]
**Priority:** High / Medium / Low (based on commercial value and search volume signals)

Sections:

## Core Pages
(Home, About, Contact, Booking — these get standard treatment but still need a primary keyword anchor)

## Service Pages — Pure Service Intent
(Only where the service alone has high search volume — e.g. "Chiropractor" or "Sports Physio". Skip if service + location pages cover this intent better)

## Service + Location Pages ← HIGHEST PRIORITY
(One page per service + suburb combination that has search demand. These are the pages that drive leads. Generate as many as the keyword data supports. Examples: "Chiropractor Deception Bay | /chiropractor-deception-bay | Target: chiropractor deception bay", "Psychologist North Lakes | /psychologist-north-lakes | Target: psychologist north lakes")

## Location Hub Pages (if warranted)
(Only create a location hub page for a suburb/region if there are 3+ service pages targeting that location — e.g. "Deception Bay" hub that links to all service + Deception Bay pages. Skip if unnecessary.)

## Supporting Pages
(FAQ, Reviews/Testimonials — only if they serve a specific search intent or conversion purpose. Blog only if the client has content capacity.)

## Conversion Architecture Notes
(CTAs placement, primary conversion action, friction reduction strategy)` : 'Write: "Website not included in this package."'}

MARKETING key — Channel Delivery Brief:
${soldSEO ? `## SEO Delivery Plan
(Which service + location page combinations to build and optimise first. Rank them by commercial priority. For each: target keyword cluster, search intent, why this page first, what the page must do to convert.)` : ''}
${soldAds ? `## Google Ads Delivery Plan
(Which campaigns to launch at go-live. For each campaign: service focus, target keywords or intent, recommended bid strategy, expected CPA based on pricing context, why this service first. Do not launch everything — prioritise by fastest commercial return.)` : ''}
${soldBoost ? `## Performance Boost / Retargeting Plan
(Who to retarget, what the message angle should be, what the creative hook is, what landing page to send them to, what action to drive. Be specific to this client's buyer journey.)` : ''}
${soldGBP || soldLocalSEO ? `## Local Presence Plan
(What needs to happen on GBP and local citations to drive map pack visibility. Specific actions, not generic advice.)` : ''}
## Conversion Strategy
(How the website, ads, and SEO work together to drive the client's specific conversion goal — be explicit about the user journey from ad/search to booked appointment/enquiry/call.)

HANDOVER key — Internal Team Handover Note (${clientName}):
This is the definitive brief the delivery team reads before touching anything. It must answer every question they will have. Include:
## Who This Client Is
(2–3 sentences: what they do, who they serve, what drives their revenue)
## What We Sold & Why
(Products, scope, and the commercial rationale for each product in this package)
## What Success Looks Like
(Specific, measurable — capacity targets, booking volume, ranking goals, revenue outcomes)
## Delivery Order & Priorities
(Step-by-step: what gets built first, in what sequence, and why that order matters commercially)
${soldWebsite ? `## Website Build Brief\n(Page list with purpose for each, CTA strategy, booking integration, design direction, performance requirements)` : ''}
${soldSEO ? `## SEO Execution Plan\n(Exact pages to build first with target keywords, on-page requirements, internal linking strategy, content angle for each priority page)` : ''}
${soldAds ? `## Google Ads Launch Plan\n(Campaign structure, starting budget split, priority services, negative keyword themes, conversion tracking requirements)` : ''}
${soldBoost ? `## Retargeting Brief\n(Audience segments, message variants, creative direction, landing page destination)` : ''}
## Commercial Context (Internal)
(Pricing, margins, capacity targets, revenue opportunity — keep this factual and useful for account management)
## Risks & Watch-Outs
(Anything that could cause friction, delay, or underperformance — operational constraints, competitive difficulty, client expectations to manage)`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert digital marketing delivery strategist specialising in local SEO and search intent architecture. You synthesise client intake data into precise, commercial, actionable delivery briefs. You never write generic advice. Every recommendation is justified by the commercial context provided. You write for a delivery team who will act on your output immediately.\n\nCRITICAL SITEMAP RULE: Never create generic pages like "Services Overview", "Our Services", or any category page without a specific ranking target. Every sitemap page must target a real search query. Prioritise "service + suburb" combinations (e.g. "Chiropractor Deception Bay", "Psychologist North Lakes") — these are the pages that drive organic leads. Use the keyword data to identify which combinations have search volume. One page = one target keyword = one ranking purpose.'
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 8000,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);
      // Normalize key casing variants the AI might return
      const handover = result.handover || result.HANDOVER || result.handover_note || result.handoverNote || '';
      res.json({ ...result, handover });
    } catch (error) {
      console.error('Error generating onboarding outputs:', error);
      res.status(500).json({ error: 'Failed to generate onboarding outputs' });
    }
  });

  // Dedicated Final Handover Note generator — clean, readable, team-facing
  app.post("/api/clients/ai/generate-handover", async (req, res) => {
    try {
      const { clientName, location, data } = req.body as {
        clientName: string;
        location: string;
        data: Record<string, any>;
      };

      const hasSold = (p: string) => (data.selectedProducts || []).includes(p);
      const soldWebsite = hasSold('website');
      const soldSEO = hasSold('seo');
      const soldAds = hasSold('google_ads');
      const soldBoost = hasSold('performance_boost');
      const soldLocalSEO = hasSold('local_seo');
      const soldGBP = hasSold('gbp');

      const productLabels: string[] = [];
      if (soldWebsite) productLabels.push(`${data.websitePageCount || '?'}-page website build`);
      if (soldSEO) productLabels.push('SEO campaign');
      if (soldAds) productLabels.push('Google Ads campaign');
      if (soldBoost) productLabels.push('Performance Boost / retargeting');
      if (soldLocalSEO) productLabels.push('Local SEO');
      if (soldGBP) productLabels.push('Google Business Profile optimisation');

      const keywordsSection = data.keywordSummary
        ? `\n\nKEYWORD DATA (from uploaded file — CRITICAL: scan this data for every "service + suburb" combination that has search volume, e.g. "chiropractor deception bay", "psychologist north lakes". Use these to populate the Website Sitemap and SEO Priority Pages sections. One page per keyword cluster. No generic category pages):\n${data.keywordSummary.slice(0, 3000)}`
        : data.manualKeywordNotes
        ? `\n\nKEYWORD NOTES (use to populate the Keyword Targets section):\n${data.manualKeywordNotes}`
        : '';

      const aiContext = [
        data.aiStrategyOutput ? `STRATEGY BRIEF (already generated):\n${data.aiStrategyOutput.slice(0, 1500)}` : '',
        data.aiSitemapOutput ? `SITEMAP (already generated):\n${data.aiSitemapOutput.slice(0, 1500)}` : '',
        data.aiMarketingOutput ? `MARKETING PLAN (already generated):\n${data.aiMarketingOutput.slice(0, 1000)}` : '',
      ].filter(Boolean).join('\n\n');

      const pageCount = soldWebsite ? (data.websitePageCount || '?') : null;

      const handoverPrompt = `You are writing an internal handover note for a digital marketing agency delivery team. Reproduce the EXACT format and tone of the example below — plain text only, no markdown, no hashtags, no asterisks, no bold.

CLIENT DATA:
- Client name: ${clientName}
- Location / primary area: ${location || data.locations || 'Not specified'}
- All service areas / suburbs: ${data.seoLocations || data.locations || 'Not specified'}
- Products sold: ${productLabels.join(', ') || 'Not specified'}
- Business overview: ${data.businessOverview || 'N/A'}
- Target customers: ${data.targetCustomers || 'N/A'}
- Key services offered: ${data.keyServices || 'N/A'}
- Business goals: ${data.businessGoals || 'N/A'}
- Operational notes: ${data.operationalNotes || 'N/A'}
- Website URL: ${data.currentWebsiteUrl || 'N/A'}
- Website page count: ${pageCount || 'N/A'}
- Website objective: ${data.websiteObjective || 'N/A'}
- CTA / booking preference: ${data.bookingCtaPreference || 'N/A'}
- SEO priority services: ${data.seoServices || 'N/A'}
- SEO priority locations: ${data.seoLocations || 'N/A'}
- Ads focus services: ${data.adsServices || 'N/A'}
- Ads monthly budget: ${data.monthlyBudget || 'N/A'}
- Ads fastest win service: ${data.fastestWinService || 'N/A'}
- Retargeting goal: ${data.retargetingGoal || 'N/A'}
- Brand direction: ${data.brandDirection || 'N/A'}${keywordsSection}

${aiContext ? `PREVIOUSLY GENERATED BRIEFS — extract sitemap pages, keyword clusters, and campaign details from these:\n${aiContext}` : ''}

━━━ EXACT OUTPUT FORMAT ━━━

Write the note using this exact structure and tone. Replace all [placeholders] with real content from the client data above.

${clientName}: ${productLabels.join(' + ')} Handover Notes

Hi Team,

Please see the handover notes for ${clientName}. This client is proceeding with [one sentence describing the package in plain English — e.g. "a 15-page website build focused on increasing local organic traffic for chiropractic and psychological services"].

Business Overview

[2-3 sentences: what this business does, who they serve, and what is driving this campaign. Be specific — name the services and commercial goals.]

Products Included
- [product 1 — write as a full sentence, e.g. "15-page website build"]
- [product 2 — e.g. "Google Search Ads campaign targeting chiropractic services in Deception Bay"]
[one line per product sold]

Website URL
${data.currentWebsiteUrl || 'TBC'}
${soldWebsite ? `
Website Sitemap

SITEMAP RULES (follow strictly):
- Page 1 is always Home, named as: Home - [Primary Service] [Primary Location] (e.g. "Home - Psychologist Moreton Bay")
- Then list SERVICE pages. Write a "Service:" label before this group (no number on the label).
  Each service page is named: [Service] - [Primary Location] (e.g. "Psychologist - Deception Bay")
  Under each service page, write "Anchor links to" then list the specific services, conditions, or topics on that page as bullet points using *
  Do NOT use generic page names like "Services Overview" or "Chiropractic Services" — name the page after the primary service + location
- Then list LOCATION pages. Write a "Locations" label before this group (no number on the label).
  Each location page is just the suburb name (e.g. "Rothwell", "North Lakes") — numbered sequentially continuing from service pages
  Use the seoLocations data to determine which suburbs to include. Exclude the primary location (already covered by service pages). Add as many location pages as needed to reach the total page count.
- End with core pages: About Us, Contact Us, Blog (numbered sequentially)
- Total pages must add up to ${pageCount || 'the page count sold'}

NUMBER every page (1, 2, 3...) across all groups — the numbering is continuous. Only the group labels ("Service:", "Locations") are not numbered.

Example format (use this exact layout):
1. Home - Psychologist Moreton Bay

Service:

2. Psychologist - Deception Bay

Anchor links to

* Emotional Regulation
* Anxiety
* Depression
* CBT
* Frequently Asked Questions About Psychology Services

3. Chiropractor - Deception Bay

Anchor links to

* Chiropractic Adjustments
* Sports Injury Chiropractic Care
* Conditions We Treat
* What to Expect at Your First Visit
* Frequently Asked Questions About Chiropractic Care

Locations

4. Rothwell
5. North Lakes
6. Kippa-Ring

14. About Us
15. Contact Us
16. Blog

Now write the actual sitemap for ${clientName} using the data above. Generate the right anchor links based on the specific services, modalities, conditions, or topics that this business offers.
` : ''}${soldAds ? `
Google Ads

[One sentence on what the ads campaign focuses on — e.g. "Focus on the Chiropractor in Deception Bay" or "Target [service] searches across [locations]"]
` : ''}${soldBoost ? `
PBoost

[One sentence on what the Performance Boost / retargeting campaign focuses on — e.g. "Focus on the Psychologists" or "Retarget website visitors who viewed [service] pages"]
` : ''}${soldGBP ? `
Google Business Profile

[One sentence on what needs to happen with GBP — optimisation, new listing, verification, etc.]
` : ''}${soldLocalSEO ? `
Local SEO

[One sentence on the local SEO focus — map pack, citation building, etc.]
` : ''}${data.operationalNotes ? `
Special Notes

[Any operational notes, watch-outs, or client-specific instructions the delivery team needs to know]
` : ''}
Thanks team

Please let me know if you need anything else`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You write internal team handover notes for a digital marketing agency. Output plain text only — absolutely no markdown, no ## headers, no asterisk bold, no hashtags. Use plain section headings (just the heading text on its own line), numbered lists for sitemap pages, and * bullet points only for anchor links under service pages.\n\nCRITICAL SITEMAP RULES:\n1. Home page is named "Home - [Primary Service] [Primary Location]"\n2. Service pages are named "[Service] - [Primary Location]" with "Anchor links to" bullet list beneath each\n3. Location pages are just suburb names, numbered sequentially\n4. NEVER create generic pages like "Services Overview", "Our Services", or any page without a specific ranking target\n5. Google Ads and PBoost sections are ONE sentence each — just the focus, nothing more\n6. End with: "Thanks team\\n\\nPlease let me know if you need anything else"' },
          { role: 'user', content: handoverPrompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      });

      const handover = response.choices[0]?.message?.content?.trim() || '';
      res.json({ handover });
    } catch (error) {
      console.error('Error generating handover:', error);
      res.status(500).json({ error: 'Failed to generate handover' });
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

  app.post("/api/clients/ai/suggest-scan-areas", async (req, res) => {
    try {
      const { keywords, businessName, businessAddress } = req.body;
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: "keywords array required" });
      }
      const keywordList = keywords.slice(0, 50).map((k: string) => `- ${k}`).join('\n');
      const prompt = `You are a local SEO expert. A business called "${businessName || 'this business'}" located at "${businessAddress || 'their location'}" has the following target keywords:\n\n${keywordList}\n\nAnalyse these keywords and identify the specific geographic areas/locations they are targeting (e.g. suburbs, cities, "near me"). Group the keywords by area and return a JSON object with this exact structure:\n{\n  "areas": [\n    {\n      "area": "Area name (e.g. Brisbane CBD, Gold Coast, Near Me)",\n      "keywords": ["keyword1", "keyword2"],\n      "priority": "high" | "medium" | "low",\n      "tip": "One sentence explaining why this area matters for GBP visibility"\n    }\n  ]\n}\n\nRules:\n- Only include areas that are explicitly or implicitly referenced in the keywords\n- "Near Me" is always high priority if any keywords contain "near me"\n- Sort by priority (high first)\n- Maximum 8 areas\n- Only return the JSON, no other text`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
      });
      const result = JSON.parse(completion.choices[0].message.content || '{"areas":[]}');
      res.json(result);
    } catch (err: any) {
      console.error('[suggest-scan-areas]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Draft a GBP post from a ranking action using AI
  app.post("/api/clients/ai/draft-gbp-post", async (req, res) => {
    try {
      const { action, area, businessName, currentStatus } = req.body;
      if (!action) return res.status(400).json({ error: 'action required' });
      const prompt = `You are a Google Business Profile expert writing a short post for a local business.\n\nBusiness: "${businessName || 'this business'}"\nTarget area: "${area || 'local area'}"\nCurrent ranking status: "${currentStatus || 'not provided'}"\nStrategy action to implement: "${action}"\n\nWrite a concise, engaging Google Business Profile post (under 300 characters) that naturally incorporates the target keyword(s) for the area. The post should sound authentic, not spammy. It should highlight a service, recent project, or local expertise relevant to that area.\n\nReturn ONLY the post text with no quotes, no preamble, no hashtags.`;
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
      });
      const text = (completion.choices[0].message.content || '').trim().replace(/^"|"$/g, '');
      res.json({ text });
    } catch (err: any) {
      console.error('[draft-gbp-post]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GBP Playbook: AI-draft optimised business description
  app.post("/api/clients/ai/gbp-description", async (req, res) => {
    try {
      const { businessName, address, keywords, services, targetLocations } = req.body;
      const prompt = `You are a Google Business Profile expert. Write a highly optimised GBP business description for:\n\nBusiness: ${businessName || 'this business'}\nAddress: ${address || ''}\nTarget keywords: ${(keywords || []).slice(0, 10).join(', ')}\nServices: ${(services || []).join(', ')}\nTarget locations: ${(targetLocations || []).join(', ')}\n\nThe description must:\n- Be under 750 characters\n- Include the primary service and main location in the first sentence\n- Naturally weave in 3-5 of the target keywords\n- Mention 3-5 target suburbs/locations\n- Sound professional and authentic, not spammy\n- End with a call to action\n\nReturn ONLY the description text, no quotes or preamble.`;
      const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 300 });
      res.json({ text: (completion.choices[0].message.content || '').trim() });
    } catch (err: any) { console.error('[gbp-description]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: Update GBP description via API
  app.post("/api/gbp/update-description", async (req, res) => {
    try {
      const { orgId, locationName, description } = req.body;
      if (!orgId || !locationName || !description) return res.status(400).json({ error: 'orgId, locationName, description required' });
      const token = await getGBPAccessToken(orgId);
      // Extract locations/{id} from accounts/{aid}/locations/{lid}
      const locPart = locationName.includes('/locations/') ? 'locations/' + locationName.split('/locations/')[1] : locationName;
      const r = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${locPart}?updateMask=description`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ description }) }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'GBP update failed');
      res.json({ success: true });
    } catch (err: any) { console.error('[gbp/update-description]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: AI-generate GBP services list
  app.post("/api/clients/ai/gbp-services", async (req, res) => {
    try {
      const { businessName, industry, keywords } = req.body;
      const prompt = `You are a Google Business Profile expert. Generate a list of 15-20 specific GBP services for:\n\nBusiness: ${businessName || 'this business'}\nIndustry: ${industry || 'local services'}\nKeywords: ${(keywords || []).slice(0, 15).join(', ')}\n\nEach service should:\n- Be a specific, searchable service name (3-6 words max)\n- Match real search terms people use\n- Cover all keyword variations\n- Include both general and specific services\n\nReturn a JSON object: { "services": ["service 1", "service 2", ...] }`;
      const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 400 });
      const result = JSON.parse(completion.choices[0].message.content || '{"services":[]}');
      res.json(result);
    } catch (err: any) { console.error('[gbp-services]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: AI-generate review request template
  app.post("/api/clients/ai/review-request-template", async (req, res) => {
    try {
      const { businessName, primaryService, primaryLocation, keywords } = req.body;
      const prompt = `You are a local SEO expert. Write a natural, friendly review request message for a business.\n\nBusiness: ${businessName || 'this business'}\nPrimary service: ${primaryService || 'our services'}\nLocation: ${primaryLocation || 'our area'}\nTarget keywords: ${(keywords || []).slice(0, 5).join(', ')}\n\nWrite a SHORT SMS message (under 160 chars) that:\n- Thanks the customer for their business\n- Asks them to leave a review\n- Subtly guides them to mention the service and location\n- Includes a line example of what a good review might say\n- Sounds human, not corporate\n\nReturn JSON: { "sms": "short SMS text", "email": "longer email version (2-3 sentences)", "exampleReview": "example of ideal review text that mentions service + location" }`;
      const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 400 });
      const result = JSON.parse(completion.choices[0].message.content || '{}');
      res.json(result);
    } catch (err: any) { console.error('[review-request-template]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: AI-generate service area suburbs
  app.post("/api/clients/ai/service-area-suburbs", async (req, res) => {
    try {
      const { businessName, address, keywords, existingSuburbs } = req.body;
      const prompt = `You are a local SEO expert. Generate a list of 25-30 suburbs/locations for a Google Business Profile service area.\n\nBusiness: ${businessName || 'this business'}\nBusiness address: ${address || ''}\nKeywords: ${(keywords || []).slice(0, 10).join(', ')}\nAlready listed: ${(existingSuburbs || []).join(', ')}\n\nRules:\n- Only include real Australian suburbs/cities\n- Prioritise suburbs within 30-50km of the business address\n- Include a mix of major cities and surrounding suburbs\n- Include suburbs mentioned in the keyword list if any\n- Don't duplicate existing suburbs\n\nReturn JSON: { "suburbs": ["Suburb 1", "Suburb 2", ...] }`;
      const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 400 });
      const result = JSON.parse(completion.choices[0].message.content || '{"suburbs":[]}');
      res.json(result);
    } catch (err: any) { console.error('[service-area-suburbs]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: AI-generate photo strategy
  app.post("/api/clients/ai/photo-strategy", async (req, res) => {
    try {
      const { businessName, industry, keywords, primaryLocation } = req.body;
      const prompt = `You are a local SEO expert. Create a GBP photo strategy for:\n\nBusiness: ${businessName || 'this business'}\nIndustry: ${industry || 'local services'}\nKeywords: ${(keywords || []).slice(0, 10).join(', ')}\nPrimary location: ${primaryLocation || 'local area'}\n\nGenerate:\n1. 15 geo-targeted photo filenames (keyword-location format, lowercase with hyphens, .jpg)\n2. A shooting guide of 8 photo categories to capture\n\nReturn JSON: { "filenames": ["file1.jpg", ...], "shootingGuide": ["Category: description of what to shoot", ...] }`;
      const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 500 });
      const result = JSON.parse(completion.choices[0].message.content || '{"filenames":[],"shootingGuide":[]}');
      res.json(result);
    } catch (err: any) { console.error('[photo-strategy]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: AI keyword intelligence plan
  app.post("/api/clients/ai/gbp-keyword-plan", async (req, res) => {
    try {
      const { businessName, address, keywords, industry } = req.body;
      const kwList = (keywords as Array<{ keyword: string; volume?: number; difficulty?: string }>);
      const kwText = kwList.map(k => `- "${k.keyword}"${k.volume ? ` (vol: ${k.volume})` : ''}${k.difficulty ? ` [diff: ${k.difficulty}]` : ''}`).join('\n');
      const prompt = `You are a Google Business Profile (GBP) local SEO strategist specialising in 3-pack rankings.

Analyse the following keyword list for a local business and build a strategic GBP optimisation plan that maps each keyword to the GBP signals that will improve its 3-pack ranking.

Business: ${businessName || 'this business'}
Location: ${address || 'Australia'}
Industry: ${industry || 'local services'}

Keywords (with monthly search volume where available):
${kwText}

GBP Signals available:
- category: Primary & secondary GBP categories
- description: GBP business description (750 chars)
- services: GBP services section
- serviceArea: Service area suburbs
- reviews: Review quantity, recency & keyword mentions in reviews
- citations: Directory listings (NAP consistency)
- engagement: Photos, posts, Q&A activity

Your task:
1. Group keywords into 3-5 strategic clusters (e.g. "High-Intent Core Services", "Location-Specific Terms", "Long-Tail Opportunities", "Supporting/Informational")
2. For each cluster: assign a priority (high/medium/low based on volume + intent), write a 1-sentence GBP strategy, and map each keyword to the GBP signals it needs + a specific action
3. Identify the top 5 highest-value keywords to prioritise first
4. List 5 quick wins (specific, actionable things to do this week)
5. Write a 2-sentence executive summary

Return JSON in exactly this shape:
{
  "summary": "...",
  "clusters": [
    {
      "name": "...",
      "priority": "high|medium|low",
      "strategy": "...",
      "keywords": [
        {
          "keyword": "...",
          "volume": 0,
          "signals": ["category","description"],
          "action": "specific action for this keyword"
        }
      ]
    }
  ],
  "topKeywords": ["kw1","kw2","kw3","kw4","kw5"],
  "quickWins": ["action1","action2","action3","action4","action5"]
}`;
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      });
      const result = JSON.parse(completion.choices[0].message.content || '{}');
      result.generatedAt = new Date().toISOString();
      res.json(result);
    } catch (err: any) { console.error('[gbp-keyword-plan]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: AI-generate audit score
  app.post("/api/clients/ai/gbp-audit", async (req, res) => {
    try {
      const { businessName, hasDescription, servicesCount, reviewCount, avgRating, hasCitations, serviceAreaCount, hasPhotos, hasWeeklyPosts, categorySet } = req.body;
      const prompt = `You are a Google Business Profile auditor. Score this GBP profile out of 100 across 7 signals.\n\nBusiness: ${businessName || 'this business'}\nData:\n- Description set: ${hasDescription ? 'Yes' : 'No'}\n- Services listed: ${servicesCount || 0}\n- Total reviews: ${reviewCount || 0}\n- Average rating: ${avgRating || 'unknown'}\n- Citations built: ${hasCitations ? 'Yes' : 'Unknown'}\n- Service area suburbs: ${serviceAreaCount || 0}\n- Has 100+ photos: ${hasPhotos ? 'Yes' : 'No'}\n- Posts weekly: ${hasWeeklyPosts ? 'Yes' : 'No'}\n- Primary category optimised: ${categorySet ? 'Yes' : 'No'}\n\nScore each signal 0-100:\n- category: primary category alignment\n- description: keyword-rich description\n- services: number and relevance of listed services\n- reviews: count, frequency, and quality\n- serviceArea: suburb coverage\n- citations: directory presence\n- engagement: photos, posts, activity\n\nReturn JSON: { "total": 0-100, "breakdown": { "category": 0-100, "description": 0-100, "services": 0-100, "reviews": 0-100, "serviceArea": 0-100, "citations": 0-100, "engagement": 0-100 }, "topGaps": ["gap 1", "gap 2", "gap 3"] }`;
      const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 400 });
      const result = JSON.parse(completion.choices[0].message.content || '{}');
      res.json(result);
    } catch (err: any) { console.error('[gbp-audit]', err); res.status(500).json({ error: err.message }); }
  });

  // GBP Playbook: Save playbook data to Firestore
  app.patch("/api/clients/:clientId/gbp-playbook", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: 'Firestore not available' });
      const { clientId } = req.params;
      const { orgId, patch } = req.body;
      if (!orgId) return res.status(400).json({ error: 'orgId required' });
      const ref = firestore.collection('orgs').doc(orgId).collection('clients').doc(clientId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Client not found' });
      const existing = snap.data()?.gbpPlaybook || {};
      await ref.update({ gbpPlaybook: { ...existing, ...patch, updatedAt: new Date().toISOString() } });
      res.json({ success: true });
    } catch (err: any) { console.error('[clients/gbp-playbook]', err); res.status(500).json({ error: err.message }); }
  });

  // Publish a Local Post to GBP
  app.post("/api/gbp/publish-post", async (req, res) => {
    try {
      const { orgId, locationName, text } = req.body;
      if (!orgId || !locationName || !text) return res.status(400).json({ error: 'orgId, locationName, text required' });
      const token = await getGBPAccessToken(orgId);
      const r = await fetch(
        `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ languageCode: 'en', summary: text, topicType: 'STANDARD' }),
        }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'Failed to publish post');
      res.json({ success: true, post: data });
    } catch (err: any) {
      console.error('[gbp/publish-post]', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/clients/ai/area-ranking-plan", async (req, res) => {
    try {
      const { businessName, businessAddress, scannedKeywords, unscannedKeywords } = req.body;
      if (!scannedKeywords?.length && !unscannedKeywords?.length) {
        return res.status(400).json({ error: "No keyword data provided" });
      }

      const scannedRows = (scannedKeywords || []).map((k: any) =>
        `- "${k.keyword}": Avg Rank #${k.arp !== null ? parseFloat(k.arp).toFixed(1) : '?'}, SoLV ${k.solv !== null ? parseFloat(k.solv).toFixed(0) + '%' : '?'}`
      ).join('\n');
      const unscannedRows = (unscannedKeywords || []).slice(0, 20).map((k: string) => `- "${k}" (not yet scanned)`).join('\n');

      const prompt = `You are a local GBP (Google Business Profile) SEO expert. A business called "${businessName || 'this business'}" at "${businessAddress || 'their location'}" has these GBP ranking results:\n\n${scannedRows || 'No scans yet.'}${unscannedRows ? '\n\nUnscanned target keywords:\n' + unscannedRows : ''}\n\nBased on these results, create a specific GBP ranking improvement plan. Group actions by geographic area/location found in the keywords. For each area return specific, actionable GBP optimisation steps.\n\nReturn a JSON object with this exact structure:\n{\n  "summary": "2-sentence overall assessment of current visibility",\n  "areas": [\n    {\n      "area": "Area name",\n      "currentStatus": "e.g. Ranking avg #8.2 — outside 3-pack",\n      "priority": "high" | "medium" | "low",\n      "actions": [\n        "Specific action 1 (e.g. Add a weekly Google Post using \'crane hire Brisbane\' in the first sentence)",\n        "Specific action 2"\n      ],\n      "timeframe": "e.g. 2-4 weeks to see movement"\n    }\n  ]\n}\n\nRules:\n- Actions must be specific to GBP (posts, photos, Q&A, categories, reviews, service areas, descriptions)\n- Reference the actual keywords and rank positions in your advice\n- High priority = keywords outside top 3 with high search volume or "near me"\n- Max 6 areas, max 4 actions per area\n- Only return valid JSON`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
      });
      const result = JSON.parse(completion.choices[0].message.content || '{"areas":[]}');
      res.json(result);
    } catch (err: any) {
      console.error('[area-ranking-plan]', err);
      res.status(500).json({ error: err.message });
    }
  });

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

  // Resolve a Google Maps URL or ChIJ Place ID to a Place record
  app.get("/api/google-places/from-url", async (req, res) => {
    try {
      const { url: rawUrl, name: nameHint } = req.query;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Google Places API key not configured." });
      if (!rawUrl || typeof rawUrl !== 'string') return res.status(400).json({ error: "url is required" });

      const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.nationalPhoneNumber,places.websiteUri';

      // Case 1: user pasted a ChIJ Place ID directly
      const placeIdMatch = rawUrl.match(/ChIJ[A-Za-z0-9_-]{20,}/);
      if (placeIdMatch) {
        const placeId = `places/${placeIdMatch[0]}`;
        const r = await fetch(`https://places.googleapis.com/v1/${placeId}`, {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,businessStatus',
          },
        });
        const d = await r.json();
        if (!r.ok) return res.status(400).json({ error: 'Could not find that Place ID. Double-check and try again.' });
        return res.json({
          placeId: d.id,
          name: d.displayName?.text || '',
          address: d.formattedAddress || '',
          rating: d.rating ?? null,
          reviewCount: d.userRatingCount ?? 0,
          phone: d.nationalPhoneNumber || null,
          website: d.websiteUri || null,
        });
      }

      // Case 2: Google Maps URL — prefer !3d{lat}!4d{lng} (actual business location) over @lat,lng (map center)
      const preciseMatch = rawUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      const centerMatch = rawUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const coordMatch = preciseMatch || centerMatch;
      if (!coordMatch) {
        return res.status(400).json({ error: 'Could not read coordinates from that URL. Make sure you copy the full Google Maps link for the business listing.' });
      }
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      console.log(`[GBP URL] Coordinates (${preciseMatch ? 'precise' : 'center'}): ${lat}, ${lng} — name hint: "${nameHint}"`);

      // Search by name + tight location bias (200m)
      const textQuery = typeof nameHint === 'string' && nameHint.trim() ? nameHint.trim() : 'business';
      const body = {
        textQuery,
        maxResultCount: 5,
        languageCode: 'en-AU',
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 500, // 500m — tight enough to be specific, wide enough for GPS drift
          },
        },
      };
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Google Places API error');
      const places = (d.places || []).filter((p: any) => p.businessStatus !== 'CLOSED_PERMANENTLY');
      if (places.length === 0) {
        // Fallback: try nearby search without text filter
        const nb = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify({
            maxResultCount: 5,
            locationRestriction: {
              circle: { center: { latitude: lat, longitude: lng }, radius: 500 },
            },
          }),
        });
        const nd = await nb.json();
        const nearby = (nd.places || []).filter((p: any) => p.businessStatus !== 'CLOSED_PERMANENTLY');
        if (nearby.length === 0) {
          return res.status(404).json({ error: 'No business found at that location. Try zooming into the exact business marker on Google Maps before copying the link.' });
        }
        const p = nearby[0];
        return res.json({ placeId: p.id, name: p.displayName?.text || '', address: p.formattedAddress || '', rating: p.rating ?? null, reviewCount: p.userRatingCount ?? 0, phone: p.nationalPhoneNumber || null, website: p.websiteUri || null });
      }
      const p = places[0];
      res.json({ placeId: p.id, name: p.displayName?.text || '', address: p.formattedAddress || '', rating: p.rating ?? null, reviewCount: p.userRatingCount ?? 0, phone: p.nationalPhoneNumber || null, website: p.websiteUri || null });
    } catch (error) {
      console.error("Error resolving Google Maps URL:", error);
      res.status(500).json({ error: "Failed to resolve that link. Please try again." });
    }
  });

  // Search for a business by name (for GBP lookup in Deal Intelligence Panel)
  app.get("/api/google-places/find", async (req, res) => {
    try {
      const { query, location } = req.query;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "Google Places API key not configured." });
      }
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: "query is required" });
      }

      const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.nationalPhoneNumber,places.websiteUri';

      // Major AU city centres with coordinates for 50km circle bias
      const AU_CITIES = [
        { name: 'Brisbane',  lat: -27.4698, lng: 153.0251 },
        { name: 'Sydney',    lat: -33.8688, lng: 151.2093 },
        { name: 'Melbourne', lat: -37.8136, lng: 144.9631 },
        { name: 'Perth',     lat: -31.9505, lng: 115.8605 },
        { name: 'Adelaide',  lat: -34.9285, lng: 138.6007 },
        { name: 'Gold Coast',lat: -28.0167, lng: 153.4000 },
        { name: 'Canberra',  lat: -35.2809, lng: 149.1300 },
        { name: 'Darwin',    lat: -12.4634, lng: 130.8456 },
        { name: 'Hobart',    lat: -42.8821, lng: 147.3272 },
      ];
      const MAX_CIRCLE_RADIUS = 50000; // Places API v1 hard limit

      const doSearchV1 = async (textQuery: string, cityBias?: { lat: number; lng: number }) => {
        const body: Record<string, any> = {
          textQuery,
          maxResultCount: 10,
          languageCode: 'en-AU',
          regionCode: 'AU',
        };
        if (cityBias) {
          body.locationBias = {
            circle: {
              center: { latitude: cityBias.lat, longitude: cityBias.lng },
              radius: MAX_CIRCLE_RADIUS,
            },
          };
        }
        console.log(`[GBP Find] v1 search: "${textQuery}" bias=${cityBias ? `${cityBias.lat},${cityBias.lng}` : 'none'}`);
        const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || 'Google Places API error');
        return (d.places || []) as any[];
      };

      const toResult = (p: any) => ({
        placeId: p.id,
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? 0,
        phone: p.nationalPhoneNumber || null,
        website: p.websiteUri || null,
      });

      const baseQuery = query.trim();
      const locationHint = typeof location === 'string' && location.trim() ? location.trim() : '';
      const websiteHint = typeof (req.query as any).website === 'string' ? (req.query as any).website.trim() : '';
      const phoneHint = typeof (req.query as any).phone === 'string' ? (req.query as any).phone.trim() : '';

      // S1: exact query with location hint, no city bias (region=AU helps ranking)
      const primaryQuery = locationHint ? `${baseQuery} ${locationHint}` : baseQuery;
      let places = await doSearchV1(primaryQuery);

      // S2: sweep every major AU city with 50km circle bias — catches service-area businesses
      if (places.length === 0) {
        for (const city of AU_CITIES) {
          places = await doSearchV1(baseQuery, city);
          if (places.length > 0) {
            console.log(`[GBP Find] Found in city bias: ${city.name}`);
            break;
          }
        }
      }

      // S3: phone number search (unique identifier — great for service-area businesses)
      if (places.length === 0 && phoneHint) {
        places = await doSearchV1(phoneHint);
      }

      // S4: website domain
      if (places.length === 0 && websiteHint) {
        const domain = websiteHint.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
        places = await doSearchV1(domain);
      }

      // S5: first 3 words with each city bias
      if (places.length === 0) {
        const shortName = baseQuery.split(' ').slice(0, 3).join(' ');
        if (shortName !== baseQuery) {
          for (const city of AU_CITIES.slice(0, 3)) {
            places = await doSearchV1(shortName, city);
            if (places.length > 0) break;
          }
        }
      }

      console.log(`[GBP Find] Final: ${places.length} results`);

      const results = places
        .filter((p: any) => p.business_status !== 'CLOSED_PERMANENTLY')
        .map(toResult);

      res.json({ results });
    } catch (error) {
      console.error("Error finding business by name:", error);
      res.status(500).json({ error: "Failed to search for business" });
    }
  });

  // ===============================
  // Ahrefs SEO Data Proxy
  // ===============================

  app.get("/api/ahrefs/metrics", async (req, res) => {
    try {
      const { target } = req.query;
      const apiKey = process.env.AHREFS_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "AHREFS_API_KEY not configured" });
      if (!target || typeof target !== 'string') return res.status(400).json({ error: "target is required" });

      const today = new Date().toISOString().split('T')[0];
      const params = new URLSearchParams({
        select: 'domain_rating,ahrefs_rank,backlinks,refdomains,org_keywords,org_traffic,paid_traffic',
        target: target.trim(),
        date: today,
        mode: 'domain',
      });

      const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/metrics?${params}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('[Ahrefs metrics]', resp.status, err);
        return res.status(resp.status).json({ error: (err as any).detail || (err as any).message || 'Ahrefs API error' });
      }

      const data = await resp.json();
      const m = data.metrics || {};

      res.json({
        domainRating: m.domain_rating ?? null,
        ahrefsRank: m.ahrefs_rank ?? null,
        backlinks: m.backlinks ?? null,
        refdomains: m.refdomains ?? null,
        organicKeywords: m.org_keywords ?? null,
        organicTraffic: m.org_traffic ?? null,
        paidTraffic: m.paid_traffic ?? null,
      });
    } catch (e: any) {
      console.error('[Ahrefs metrics] Error:', e.message);
      res.status(500).json({ error: e.message || 'Failed to fetch Ahrefs metrics' });
    }
  });

  app.get("/api/ahrefs/keywords", async (req, res) => {
    try {
      const { target } = req.query;
      const apiKey = process.env.AHREFS_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "AHREFS_API_KEY not configured" });
      if (!target || typeof target !== 'string') return res.status(400).json({ error: "target is required" });

      const today = new Date().toISOString().split('T')[0];
      const params = new URLSearchParams({
        select: 'keyword_merged,volume_merged,sum_traffic,best_position,keyword_difficulty_merged,cpc_merged',
        target: target.trim(),
        date: today,
        mode: 'domain',
        limit: '20',
        order_by: 'sum_traffic:desc',
      });

      const resp = await fetch(`https://api.ahrefs.com/v3/site-explorer/organic-keywords?${params}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return res.status(resp.status).json({ error: (err as any).detail || (err as any).message || 'Ahrefs API error' });
      }

      const data = await resp.json();
      const keywords = (data.keywords || []).map((k: any) => ({
        keyword: k.keyword_merged || k.keyword || '',
        volume: k.volume_merged ?? null,
        traffic: k.sum_traffic ?? null,
        position: k.best_position ?? null,
        difficulty: k.keyword_difficulty_merged ?? null,
        cpc: k.cpc_merged ?? null,
      }));

      res.json({ keywords });
    } catch (e: any) {
      console.error('[Ahrefs keywords] Error:', e.message);
      res.status(500).json({ error: e.message || 'Failed to fetch Ahrefs keywords' });
    }
  });

  // ===============================
  // Sitemap Fetch & Parse
  // ===============================

  app.get("/api/sitemap", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url is required" });
      }

      const MAX_PAGES = 500;
      const TIMEOUT_MS = 12000;
      const MAX_CHILD_SITEMAPS = 15;
      const MAX_DEPTH = 3;

      async function fetchXml(targetUrl: string): Promise<string> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
              'Accept': 'application/xml,text/xml,*/*',
            },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const text = await r.text();
          // Verify it looks like XML, not an HTML error page
          if (!text.trim().startsWith('<') && !text.includes('<?xml')) {
            throw new Error('Response is not XML');
          }
          return text;
        } finally {
          clearTimeout(timer);
        }
      }

      // Try primary URL, then fallback to http:// if https:// fails
      async function fetchXmlWithFallback(targetUrl: string): Promise<string> {
        try {
          return await fetchXml(targetUrl);
        } catch (err) {
          // If https failed, try http and vice versa
          const fallback = targetUrl.startsWith('https://')
            ? targetUrl.replace('https://', 'http://')
            : targetUrl.replace('http://', 'https://');
          if (fallback !== targetUrl) {
            return await fetchXml(fallback);
          }
          throw err;
        }
      }

      function extractTag(xml: string, tag: string): string | undefined {
        // Handle both <tag>value</tag> and CDATA <tag><![CDATA[value]]></tag>
        const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`));
        if (cdataMatch) return cdataMatch[1].trim();
        const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
        return m ? m[1].trim() : undefined;
      }

      function parseUrlset(xml: string): Array<{ url: string; lastmod?: string; changefreq?: string; priority?: string }> {
        const entries: Array<{ url: string; lastmod?: string; changefreq?: string; priority?: string }> = [];
        const urlBlocks = xml.match(/<url[\s>][\s\S]*?<\/url>/gi) || [];
        for (const block of urlBlocks) {
          const loc = extractTag(block, 'loc');
          if (loc) {
            entries.push({
              url: loc,
              lastmod: extractTag(block, 'lastmod'),
              changefreq: extractTag(block, 'changefreq'),
              priority: extractTag(block, 'priority'),
            });
          }
        }
        return entries;
      }

      function parseSitemapIndex(xml: string): string[] {
        const locs: string[] = [];
        const sitemapBlocks = xml.match(/<sitemap[\s>][\s\S]*?<\/sitemap>/gi) || [];
        for (const block of sitemapBlocks) {
          const loc = extractTag(block, 'loc');
          if (loc) locs.push(loc);
        }
        return locs;
      }

      // Recursively resolve a sitemap URL into pages, handling nested indexes
      async function resolvePages(
        targetUrl: string,
        depth: number,
        visited: Set<string>
      ): Promise<Array<{ url: string; lastmod?: string; changefreq?: string; priority?: string }>> {
        if (depth > MAX_DEPTH || visited.has(targetUrl)) return [];
        visited.add(targetUrl);
        let xml: string;
        try {
          xml = await fetchXmlWithFallback(targetUrl);
        } catch {
          return [];
        }
        if (/<sitemapindex/i.test(xml)) {
          const childUrls = parseSitemapIndex(xml).slice(0, MAX_CHILD_SITEMAPS);
          // Fetch all child sitemaps in parallel
          const results = await Promise.allSettled(
            childUrls.map(cu => resolvePages(cu, depth + 1, visited))
          );
          const merged: Array<{ url: string; lastmod?: string; changefreq?: string; priority?: string }> = [];
          for (const r of results) {
            if (r.status === 'fulfilled') merged.push(...r.value);
          }
          return merged;
        }
        return parseUrlset(xml);
      }

      // Also try common alternate sitemap locations if the root URL fails or returns 0 pages
      async function tryAlternateSitemapUrls(baseUrl: string): Promise<string[]> {
        const alts = ['/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml'];
        const origin = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`).origin;
        return alts.map(a => `${origin}${a}`);
      }

      const visited = new Set<string>();
      let pages = await resolvePages(url, 0, visited);

      // If zero pages and the URL was a direct sitemap.xml, try alternates
      if (pages.length === 0) {
        const alts = await tryAlternateSitemapUrls(url);
        for (const alt of alts) {
          if (visited.has(alt)) continue;
          const altPages = await resolvePages(alt, 0, visited);
          if (altPages.length > 0) {
            pages = altPages;
            break;
          }
        }
      }

      pages = pages.slice(0, MAX_PAGES);

      // Group URLs by top-level path section
      const sections: Record<string, number> = {};
      for (const p of pages) {
        try {
          const u = new URL(p.url);
          const parts = u.pathname.split('/').filter(Boolean);
          const section = parts[0] || '/';
          sections[section] = (sections[section] || 0) + 1;
        } catch { /* skip */ }
      }

      res.json({
        url,
        totalPages: pages.length,
        isSitemapIndex: pages.length > 0,
        pages,
        sections,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[Sitemap] Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to fetch sitemap" });
    }
  });

  // ===============================
  // Deep Page Crawler (SEO Signals)
  // ===============================

  app.post("/api/crawl-pages", async (req, res) => {
    try {
      const { urls, domain } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: "urls array is required" });
      }

      const HARD_CAP = 500; // absolute server-side safety limit
      const TIMEOUT_MS = 8000;

      // Prioritise high-value pages: service, location, about, contact, homepage
      function scorePath(url: string): number {
        const p = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); } })();
        if (p === '/' || p === '') return 100;
        const hi = ['service', 'location', 'area', 'suburb', 'city', 'region', 'product', 'about', 'contact'];
        const mid = ['blog', 'project', 'portfolio', 'work', 'gallery'];
        if (hi.some(k => p.includes(k))) return 80;
        if (mid.some(k => p.includes(k))) return 40;
        return 60;
      }

      const sorted = [...urls].sort((a, b) => scorePath(b) - scorePath(a)).slice(0, HARD_CAP);

      function stripHtml(html: string): string {
        return html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function extractTag(html: string, tag: string): string | undefined {
        const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
        return m ? stripHtml(m[1]).slice(0, 200).trim() || undefined : undefined;
      }

      function extractAllTags(html: string, tag: string, limit = 8): string[] {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
        const results: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null && results.length < limit) {
          const text = stripHtml(m[1]).slice(0, 120).trim();
          if (text) results.push(text);
        }
        return results;
      }

      async function crawlPage(pageUrl: string): Promise<{
        url: string; title?: string; metaDescription?: string; h1?: string;
        h2s?: string[]; h3s?: string[]; bodyText?: string; imageAlts?: string[];
        internalLinks?: string[]; schemaTypes?: string[]; status?: number; error?: string;
      }> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(pageUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; MomentumBot/1.0; +https://battlescore.com.au)',
              'Accept': 'text/html,application/xhtml+xml',
            },
          });
          clearTimeout(timer);
          if (!r.ok) return { url: pageUrl, status: r.status, error: `HTTP ${r.status}` };

          const html = await r.text();
          const status = r.status;

          // Title
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 160).trim() || undefined : undefined;

          // Meta description
          const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
            || html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i);
          const metaDescription = metaMatch ? metaMatch[1].trim() || undefined : undefined;

          // H1 (first)
          const h1 = extractTag(html, 'h1');

          // H2s and H3s
          const h2s = extractAllTags(html, 'h2', 6);
          const h3s = extractAllTags(html, 'h3', 6);

          // Body text (strip nav/header/footer heuristically, take first meaningful chunk)
          const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*)<\/body>/i);
          const rawBody = bodyMatch ? bodyMatch[1] : html;
          // Remove nav, header, footer, script, style blocks
          const cleanedBody = rawBody
            .replace(/<(nav|header|footer|script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const bodyText = cleanedBody.slice(0, 600) || undefined;

          // Image alt tags
          const altRe = /<img[^>]+alt=["']([^"']{2,120})["']/gi;
          const imageAlts: string[] = [];
          let altM: RegExpExecArray | null;
          while ((altM = altRe.exec(html)) !== null && imageAlts.length < 10) {
            const alt = altM[1].trim();
            if (alt && !['', 'image', 'photo', 'logo', 'icon'].includes(alt.toLowerCase())) {
              imageAlts.push(alt);
            }
          }

          // Internal links (href starting with / or same domain)
          const baseDomain = domain || (() => { try { return new URL(pageUrl).hostname; } catch { return ''; } })();
          const linkRe = /<a[^>]+href=["']([^"'#?]+)["']/gi;
          const internalPaths = new Set<string>();
          let linkM: RegExpExecArray | null;
          while ((linkM = linkRe.exec(html)) !== null && internalPaths.size < 20) {
            const href = linkM[1];
            if (href.startsWith('/')) {
              internalPaths.add(href);
            } else if (baseDomain && href.includes(baseDomain)) {
              try { internalPaths.add(new URL(href).pathname); } catch { /* skip */ }
            }
          }
          const internalLinks = [...internalPaths].slice(0, 15);

          // Schema markup types from JSON-LD
          const schemaTypes: string[] = [];
          const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
          let schemaM: RegExpExecArray | null;
          while ((schemaM = jsonLdRe.exec(html)) !== null) {
            try {
              const json = JSON.parse(schemaM[1]);
              const types = Array.isArray(json) ? json.map((j: any) => j['@type']).filter(Boolean) : [json['@type']].filter(Boolean);
              schemaTypes.push(...types.map((t: any) => String(t)));
            } catch { /* skip invalid JSON-LD */ }
          }

          return {
            url: pageUrl, status, title, metaDescription, h1,
            h2s: h2s.length ? h2s : undefined,
            h3s: h3s.length ? h3s : undefined,
            bodyText,
            imageAlts: imageAlts.length ? imageAlts : undefined,
            internalLinks: internalLinks.length ? internalLinks : undefined,
            schemaTypes: [...new Set(schemaTypes)].filter(Boolean).length ? [...new Set(schemaTypes)] : undefined,
          };
        } catch (err: any) {
          clearTimeout(timer);
          return { url: pageUrl, error: err.name === 'AbortError' ? 'Timeout' : (err.message || 'Failed') };
        }
      }

      // Crawl in batches of 10 for speed
      const results = [];
      for (let i = 0; i < sorted.length; i += 10) {
        const batch = sorted.slice(i, i + 10);
        const batchResults = await Promise.all(batch.map(crawlPage));
        results.push(...batchResults);
      }

      console.log(`[CrawlPages] Crawled ${results.length} pages (${results.filter(r => !r.error).length} success)`);
      res.json({ crawledPages: results, crawledAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("[CrawlPages] Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to crawl pages" });
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
  // AI: ATTEMPT FOLLOW-UP SUGGESTION
  // ===============================
  app.post("/api/leads/ai/suggest-attempt-followup", async (req, res) => {
    try {
      const {
        channel,
        companyName,
        contactName,
        stage,
        conversationStage,
        notes,
        recentLogs = [],
        attemptCount = 0,
        // Rich context fields
        industry,
        address,
        strategyIntelligence,
        digitalPresence,
      } = req.body;

      if (!channel || !companyName) {
        return res.status(400).json({ error: "channel and companyName are required" });
      }

      // Pick the best framework based on context
      let framework = 'NEPQ';
      let frameworkReason = 'Discovery and problem-awareness questions';

      const hasObjection = recentLogs.some((l: any) => l.outcome === 'objection' || (l.notes || '').toLowerCase().includes('objection'));
      const isEarly = !conversationStage || conversationStage === 'not_started' || conversationStage === 'attempted';
      const manyAttempts = attemptCount >= 3;

      if (hasObjection) {
        framework = 'Split the Difference';
        frameworkReason = 'Objection detected — use tactical empathy and calibrated questions';
      } else if (manyAttempts || isEarly) {
        framework = 'SWISH';
        frameworkReason = 'Multiple attempts with no connection — pattern interrupt required';
      } else if (conversationStage === 'discovery' || conversationStage === 'qualified') {
        framework = 'NEPQ';
        frameworkReason = 'In discovery — use consequence and implication questions';
      }

      const recentSummary = recentLogs
        .slice(0, 5)
        .map((l: any) => `- ${l.type === 'attempt' ? 'Attempt' : 'Conversation'} via ${l.channel}${l.outcome ? ` (${l.outcome})` : ''}${l.notes ? `: ${l.notes}` : ''}`)
        .join('\n');

      // Build digital presence intelligence block
      const dp = digitalPresence || {};
      const si = strategyIntelligence || {};
      const presenceLines: string[] = [];

      if (dp.website) presenceLines.push(`Website: ${dp.website}`);
      else presenceLines.push(`Website: NONE — no website detected`);

      if (dp.googleReviewCount > 0) {
        presenceLines.push(`Google Reviews: ${dp.googleReviewCount} reviews at ${dp.googleRating}/5 stars`);
      } else {
        presenceLines.push(`Google Reviews: NONE — zero reviews on record (major trust gap)`);
      }

      if (dp.hasFacebook) presenceLines.push(`Facebook: Active (${dp.facebookUrl})`);
      else presenceLines.push(`Facebook: NOT PRESENT`);

      if (dp.hasInstagram) presenceLines.push(`Instagram: Active (${dp.instagramUrl})`);
      else presenceLines.push(`Instagram: NOT PRESENT`);

      if (dp.hasLinkedin) presenceLines.push(`LinkedIn: Active (${dp.linkedinUrl})`);
      else presenceLines.push(`LinkedIn: NOT PRESENT`);

      if (dp.adSpend) presenceLines.push(`Paid Ads: Running Google Ads (est. $${dp.adSpend}/mo spend)`);
      else if (dp.adChannels) presenceLines.push(`Paid Ads: Active on ${dp.adChannels}`);
      else presenceLines.push(`Paid Ads: NOT RUNNING — no paid advertising detected`);

      if (dp.sitemapPageCount > 0) presenceLines.push(`Website pages: ${dp.sitemapPageCount} pages indexed`);

      if (dp.crawlSummary) presenceLines.push(`\nWEBSITE CONTENT EXTRACT:\n${dp.crawlSummary}`);

      const strategyContext: string[] = [];
      if (si.businessOverview) strategyContext.push(`Business Overview: ${si.businessOverview}`);
      if (si.idealCustomer) strategyContext.push(`Ideal Customer: ${si.idealCustomer}`);
      if (si.coreServices) strategyContext.push(`Core Services: ${si.coreServices}`);
      if (si.targetLocations) strategyContext.push(`Target Locations: ${si.targetLocations}`);
      if (si.growthObjective) strategyContext.push(`Growth Objective: ${si.growthObjective}`);
      if (si.discoveryNotes) strategyContext.push(`Discovery Notes: ${si.discoveryNotes}`);

      const channelLabel: Record<string, string> = {
        call: 'phone call script (opening line + first question)',
        sms: 'SMS text message',
        email: 'email with subject and body',
        meeting: 'meeting request message',
        dropin: 'drop-in conversation opener',
        video: 'video call invite message',
      };

      const systemPrompt = `You are an elite sales coach and copywriter who blends three world-class frameworks:

FRAMEWORKS:
1. **SWISH** (Situation → What do you want → Insight → Solution → How): Reframe resistance with pattern interrupts. Acknowledge the situation, uncover their real goal, share a counter-intuitive insight, offer a reframe, then invite action.
2. **NEPQ (New Economy Power Questions)** by Jeremy Miner: Never push, always pull. Use situation questions, problem-awareness questions, consequence questions, and solution-awareness questions that make the prospect feel understood and want to move forward.
3. **Split the Difference** (Chris Voss): Deploy tactical empathy, labelling ("It sounds like…"), calibrated questions ("How am I supposed to…?"), mirrors (repeat last words), and accusation audits to neutralise objections and create safety.

RULES:
- Be human, warm, and curiosity-driven — never robotic or salesy
- Use only ONE framework per message, chosen for maximum effect
- ${channel === 'sms' ? 'SMS: Max 160 characters (hard limit). One punchy sentence referencing a SPECIFIC observation from their digital presence, plus ONE soft CTA.' : ''}
- ${channel === 'email' ? 'Email: 3–5 sentences max. Subject line must reference a specific insight from their digital presence (e.g. their review count, website gap, no ads). Body must feel personally researched, not templated. End with ONE soft question.' : ''}
- ${channel === 'call' ? 'Call script: Opening line must reference a SPECIFIC observation from their website or digital presence (not generic). First question should uncover a pain related to what you observed. Goal is to get them talking, not pitch.' : ''}
- CRITICAL: Reference SPECIFIC details from their digital presence — their actual website, review count, social media presence, or content. Do NOT write generic messages. The prospect must feel you actually looked at their business.
- Use the prospect's first name if available
- Always end with a question or soft invitation — never a hard close
- Use Australian English (colour, favour, authorise)
- Never mention competitor names
- Dates in DD-MM-YYYY format

OUTPUT FORMAT (strict JSON):
${channel === 'email'
  ? '{ "subject": "...", "body": "..." }'
  : channel === 'call'
    ? '{ "openingLine": "...", "firstQuestion": "..." }'
    : '{ "message": "..." }'}`;

      const userPrompt = `Generate a ${channelLabel[channel] || channel} for this lead. You MUST reference specific details from their digital presence to make the message feel genuinely researched.

═══════════════════════════
LEAD PROFILE
═══════════════════════════
Company: ${companyName}${contactName ? ` | Contact: ${contactName}` : ''}
Industry: ${industry || 'Not specified'}
Location: ${address || 'Not specified'}
Pipeline Stage: ${stage || 'Unknown'}
Conversation Stage: ${conversationStage || 'Not started'}
Total Attempts: ${attemptCount}
Internal Notes: ${notes || 'None'}

═══════════════════════════
DIGITAL PRESENCE INTELLIGENCE
(What we found when we researched them online)
═══════════════════════════
${presenceLines.join('\n')}

${strategyContext.length > 0 ? `═══════════════════════════
STRATEGY INTELLIGENCE
═══════════════════════════
${strategyContext.join('\n')}` : ''}

═══════════════════════════
RECENT CONTACT HISTORY
═══════════════════════════
${recentSummary || 'No prior contact'}

═══════════════════════════
FRAMEWORK TO USE
═══════════════════════════
${framework} — ${frameworkReason}

Now generate the ${channel === 'email' ? 'email' : channel === 'call' ? 'call opener' : 'message'}. Hook into something SPECIFIC from their digital presence — their website, their lack of reviews, their social media gaps, or their website content. Make it clear you actually looked at their business online.`;

      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.75,
        response_format: { type: "json_object" },
      });

      const content = aiRes.choices[0]?.message?.content;
      if (!content) throw new Error("No AI response");
      const generated = JSON.parse(content);

      res.json({ framework, frameworkReason, ...generated });
    } catch (err) {
      console.error("[suggest-attempt-followup]", err);
      res.status(500).json({ error: "Failed to generate suggestion" });
    }
  });

  // ============================
  // AI: MOCK WEBSITE GENERATOR
  // ============================
  app.post("/api/leads/ai/mock-website", async (req, res) => {
    try {
      const { leadId, orgId } = req.body;
      if (!leadId || !orgId) return res.status(400).json({ error: "leadId and orgId required" });

      const leadDoc = await db.collection(`orgs/${orgId}/leads`).doc(leadId).get();
      if (!leadDoc.exists) return res.status(404).json({ error: "Lead not found" });
      const lead = leadDoc.data() as any;

      const si = lead.strategyIntelligence || {};
      const sd = lead.sourceData || {};

      const reviewStr = sd.googleReviewCount
        ? `${sd.googleReviewCount} Google reviews averaging ${sd.googleRating}/5`
        : 'No Google reviews on record';

      const crawlSummary = (lead.crawledPages || [])
        .slice(0, 3)
        .map((p: any) => `[${p.url}] ${(p.bodyText || '').slice(0, 400)}`)
        .join('\n---\n');

      const industry = lead.industry || sd.category || 'Business';
      const location = lead.address || si.targetLocations || '';

      // Pick industry-specific picsum seed for background photo
      // picsum.photos serves images directly (no redirect) and works reliably in srcDoc iframes
      const industryLower = industry.toLowerCase();
      let picsumSeed = 100; // generic office/business
      if (industryLower.includes('construct') || industryLower.includes('builder') || industryLower.includes('building') || industryLower.includes('general contractor')) picsumSeed = 200;
      else if (industryLower.includes('plumb')) picsumSeed = 210;
      else if (industryLower.includes('electr')) picsumSeed = 220;
      else if (industryLower.includes('landscap') || industryLower.includes('garden')) picsumSeed = 230;
      else if (industryLower.includes('roof')) picsumSeed = 240;
      else if (industryLower.includes('paint')) picsumSeed = 250;
      else if (industryLower.includes('clean')) picsumSeed = 260;
      else if (industryLower.includes('concrete') || industryLower.includes('concreet')) picsumSeed = 270;
      else if (industryLower.includes('hvac') || industryLower.includes('air con') || industryLower.includes('refriger')) picsumSeed = 280;
      else if (industryLower.includes('tile') || industryLower.includes('flooring')) picsumSeed = 290;
      else if (industryLower.includes('tree') || industryLower.includes('arb')) picsumSeed = 300;
      else if (industryLower.includes('pool')) picsumSeed = 310;
      else if (industryLower.includes('truck') || industryLower.includes('transport') || industryLower.includes('freight')) picsumSeed = 320;
      else if (industryLower.includes('mechanic') || industryLower.includes('auto') || industryLower.includes('car')) picsumSeed = 330;
      else if (industryLower.includes('restaurant') || industryLower.includes('cafe') || industryLower.includes('food')) picsumSeed = 340;
      else if (industryLower.includes('dental') || industryLower.includes('medical') || industryLower.includes('health')) picsumSeed = 350;
      else if (industryLower.includes('real estate') || industryLower.includes('property')) picsumSeed = 360;
      else if (industryLower.includes('solar')) picsumSeed = 370;

      // Pick brand colors based on industry
      let brandPrimary = '#1e3a5f', brandAccent = '#f97316', brandLight = '#fff7ed';
      if (industryLower.includes('landscap') || industryLower.includes('garden') || industryLower.includes('tree')) { brandPrimary = '#14532d'; brandAccent = '#22c55e'; brandLight = '#f0fdf4'; }
      else if (industryLower.includes('pool')) { brandPrimary = '#0c4a6e'; brandAccent = '#0ea5e9'; brandLight = '#f0f9ff'; }
      else if (industryLower.includes('solar')) { brandPrimary = '#1a1a2e'; brandAccent = '#f59e0b'; brandLight = '#fffbeb'; }
      else if (industryLower.includes('clean')) { brandPrimary = '#1e40af'; brandAccent = '#3b82f6'; brandLight = '#eff6ff'; }
      else if (industryLower.includes('restaurant') || industryLower.includes('cafe') || industryLower.includes('food')) { brandPrimary = '#7c2d12'; brandAccent = '#f97316'; brandLight = '#fff7ed'; }
      else if (industryLower.includes('dental') || industryLower.includes('medical') || industryLower.includes('health')) { brandPrimary = '#0f4c81'; brandAccent = '#0ea5e9'; brandLight = '#f0f9ff'; }

      const reviewCount = sd.googleReviewCount || 0;
      const reviewRating = sd.googleRating ? sd.googleRating.toFixed(1) : '5.0';
      const stars = '★'.repeat(Math.round(sd.googleRating || 5));
      const photoUrl = `https://picsum.photos/seed/${picsumSeed}/1920/1080`;

      // Parse city from location
      const cityMatch = location.match(/([A-Z][a-zA-Z\s]+?)(?:\s+(?:QLD|NSW|VIC|SA|WA|ACT|NT|TAS)\s+\d{4}|,|\s*$)/);
      const city = cityMatch ? cityMatch[1].trim() : (location.split(',')[0] || 'Australia');

      const prompt = `You are an elite Australian web developer and conversion rate optimisation expert. Your task is to build a STUNNING, pixel-perfect, high-converting local business website that would impress a prospect during a sales meeting.

STUDY THE FOLLOWING DESIGN PATTERN — replicate this exact visual style:
- Full-screen hero section with a real background photo (blurred/darkened overlay at 60% opacity)
- TWO-COLUMN hero layout: LEFT side = trust badge, massive bold headline, body text, primary CTA button, 3 bullet trust points, Google review badge; RIGHT side = glassmorphism quote request form card
- Bold, high-contrast typography — headline 54–68px, font-weight 900
- Industry-specific color scheme (PRIMARY: ${brandPrimary}, ACCENT: ${brandAccent})
- Sticky header with company logo/name on left, nav links in centre, large phone CTA button on right in accent color
- Below hero: services grid with emoji icons, Why Choose Us section, testimonials, service areas, full-width contact CTA, footer

═══════════════════════════════
BUSINESS DATA (use EVERY field)
═══════════════════════════════
Company Name: ${lead.companyName}
Industry: ${industry}
City / Primary Location: ${city}
Full Address: ${location}
Phone: ${lead.phone || '1300 XXX XXX'}
Email: ${lead.email || 'info@' + (lead.companyName || 'company').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com.au'}
Google Reviews: ${reviewCount > 0 ? `${reviewCount} reviews — ${reviewRating}/5 ★` : 'Growing review base'}
Business Overview: ${si.businessOverview || industry + ' specialists serving ' + city + ' and surrounds'}
Ideal Customer: ${si.idealCustomer || 'Local homeowners and businesses'}
Core Services: ${si.coreServices || industry + ' services'}
Target Suburbs: ${si.targetLocations || city + ' and surrounding suburbs'}
Growth Goal: ${si.growthObjective || 'Generate more qualified leads online'}
Discovery Notes: ${si.discoveryNotes || ''}

═══════════════════════════════
MANDATORY HTML ARCHITECTURE
═══════════════════════════════

Use this EXACT structure:

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Service] in [City] | [Company Name]</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* --- CSS VARIABLES --- */
    :root {
      --primary: ${brandPrimary};
      --accent: ${brandAccent};
      --light: ${brandLight};
      --dark: #0f0f0f;
      --white: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --radius: 8px;
      --shadow: 0 4px 24px rgba(0,0,0,0.12);
    }
    /* --- RESET --- */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', system-ui, sans-serif; color: var(--text); line-height: 1.6; }
    
    /* --- HEADER (sticky) --- */
    /* Make it: background white, box-shadow on scroll, height ~70px, flex justify-between */
    /* Logo: company name in var(--primary), font-weight 800, font-size 20px */
    /* Nav links: hidden on small screens, flex gap-8 on desktop */
    /* CTA: background var(--accent), color white, border-radius var(--radius), padding 10px 20px, font-weight 700, font-size 15px, includes phone number */
    
    /* --- HERO (full-screen with photo background) --- */
    /* background-image: linear-gradient(rgba(0,0,0,0.62), rgba(0,0,0,0.55)), url('${photoUrl}'); */
    /* background-size: cover; background-position: center; background-attachment: fixed; */
    /* min-height: 100vh; display: flex; align-items: center; */
    /* Inner: max-width 1200px, margin 0 auto, padding 80px 40px, display grid, grid-template-columns: 1fr 420px, gap 60px */
    
    /* --- HERO LEFT COLUMN --- */
    /* Trust badge: display inline-block, background var(--accent), color white, font-size 11px, font-weight 700, letter-spacing 0.12em, text-transform uppercase, padding 6px 14px, border-radius 20px, margin-bottom 24px */
    /* Headline: font-size clamp(42px, 5vw, 64px), font-weight 900, color white, line-height 1.08, margin-bottom 20px */
    /* Accent span in headline: color var(--accent) */
    /* Sub-headline: font-size 18px, color rgba(255,255,255,0.85), margin-bottom 32px, max-width 540px */
    /* Primary CTA button: background var(--accent), color white, font-size 16px, font-weight 800, padding 16px 36px, border-radius var(--radius), text-transform uppercase, letter-spacing 0.05em, border none, cursor pointer, display inline-block, text-decoration none, box-shadow 0 4px 15px rgba(0,0,0,0.3) */
    /* Bullet points: margin-top 32px, list-style none, display flex, flex-direction column, gap 12px */
    /* Each bullet: display flex, align-items center, gap 12px, color rgba(255,255,255,0.9), font-size 15px */
    /* Bullet icon: ▶ in var(--accent), font-size 10px */
    /* Google badge: margin-top 28px, display flex, align-items center, gap 10px, background rgba(255,255,255,0.12), backdrop-filter blur(8px), border-radius 40px, padding 8px 16px, width fit-content */
    /* Google G icon: colored circle with G text, font-size 18px, font-weight 900 */
    /* Stars: color #fbbf24, font-size 16px */
    /* Review text: color white, font-size 13px */
    
    /* --- HERO RIGHT: GLASS FORM CARD --- */
    /* background: rgba(255,255,255,0.12); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); */
    /* border: 1px solid rgba(255,255,255,0.25); border-radius: 16px; padding: 36px 32px; */
    /* Form heading: color white, font-size 22px, font-weight 700, margin-bottom 24px */
    /* Form inputs: width 100%, padding 12px 16px, border-radius var(--radius), border: 1px solid rgba(255,255,255,0.3), background rgba(255,255,255,0.9), font-size 14px, margin-bottom 12px, color var(--text) */
    /* Form labels: display block, color rgba(255,255,255,0.9), font-size 13px, font-weight 600, margin-bottom 4px */
    /* Submit button: width 100%, background var(--accent), color white, font-size 16px, font-weight 800, padding 14px, border none, border-radius var(--radius), cursor pointer, text-transform uppercase, letter-spacing 0.05em */
    
    /* --- SERVICES SECTION --- */
    /* padding 80px 40px, background var(--light) */
    /* Section title: text-align center, font-size 36px, font-weight 800, color var(--primary), margin-bottom 12px */
    /* Subtitle: text-align center, color var(--muted), font-size 17px, margin-bottom 48px */
    /* Grid: display grid, grid-template-columns repeat(3, 1fr), gap 28px, max-width 1200px, margin 0 auto */
    /* Card: background white, border-radius 12px, padding 32px 28px, box-shadow var(--shadow), border-top 4px solid var(--accent) */
    /* Icon: font-size 40px, margin-bottom 16px */
    /* Card title: font-size 19px, font-weight 700, color var(--primary), margin-bottom 10px */
    /* Card text: color var(--muted), font-size 14px, line-height 1.7 */
    
    /* --- WHY CHOOSE US --- */
    /* padding 80px 40px, background white */
    /* Inner: max-width 1100px, margin 0 auto, display grid, grid-template-columns 1fr 1fr, gap 60px, align-items center */
    /* Left: section heading + pillars list */
    /* Each pillar: display flex, gap 20px, margin-bottom 32px */
    /* Pillar icon circle: 52px x 52px, background var(--light), border-radius 50%, display flex, align-items center, justify-content center, font-size 22px, flex-shrink 0 */
    /* Right: large number stat blocks (e.g. 500+ Jobs, 10+ Years) */
    
    /* --- REVIEWS / TESTIMONIALS --- */
    /* padding 80px 40px, background var(--primary), color white */
    /* Grid: 3 cards, background rgba(255,255,255,0.08), border-radius 12px, padding 28px */
    /* Stars: color #fbbf24 */
    /* Quote text: font-size 15px, line-height 1.7, color rgba(255,255,255,0.88) */
    /* Reviewer: font-weight 700, color white, margin-top 16px */
    
    /* --- SERVICE AREAS --- */
    /* padding 60px 40px, background var(--light) */
    /* Area chips: display flex, flex-wrap wrap, gap 10px, justify-content center */
    /* Each chip: background white, border 2px solid var(--accent), color var(--primary), border-radius 20px, padding 6px 18px, font-size 14px, font-weight 600 */
    
    /* --- CONTACT CTA BANNER --- */
    /* background var(--accent), padding 80px 40px, text-align center */
    /* Heading: font-size 38px, font-weight 900, color white, margin-bottom 16px */
    /* Sub: color rgba(255,255,255,0.9), font-size 17px, margin-bottom 36px */
    /* Buttons: inline-flex gap 16px */
    /* Phone button: background white, color var(--accent), font-weight 800, padding 16px 40px, border-radius var(--radius), text-decoration none, font-size 18px */
    /* Quote button: background transparent, color white, border 2px solid white, font-weight 700, padding 16px 36px, border-radius var(--radius), text-decoration none, font-size 16px */
    
    /* --- FOOTER --- */
    /* background var(--dark), color rgba(255,255,255,0.6), padding 40px, text-align center, font-size 14px */
    /* Company name in white, font-weight 700 */
    
  </style>
</head>
<body>
  <!-- HEADER -->
  <!-- HERO (full-screen, 2-column: trust badge + massive headline + bullets + review badge LEFT | glass form card RIGHT) -->
  <!-- SERVICES (3–4 cards, emoji icons, bordered top in accent color) -->
  <!-- WHY CHOOSE US (left text + right stats) -->
  <!-- TESTIMONIALS (3 cards on dark background) -->
  <!-- SERVICE AREAS (suburb chips) -->
  <!-- CONTACT CTA (full-width accent background) -->
  <!-- FOOTER -->
</body>
</html>

═══════════════════════════════
CONTENT GUIDELINES
═══════════════════════════════
- Headline must name their primary service + "${city}" e.g. "Expert [Service] in ${city}"
- Accent ONE or TWO words in the headline with <span style="color:var(--accent)">
- Sub-headline: compelling 1–2 sentences about speed, reliability, and local expertise
- Services: create 3 realistic services from their core service data, write 2-sentence descriptions for each
- Trust points (3 bullets below headline): key selling points e.g. "Same-Day Response Available", "Fully Licensed & Insured", "Local ${city} Specialists"
- Testimonials: write 3 realistic 5-star testimonials from local ${city} customers mentioning a specific job
- Service areas: extract 6–10 specific suburbs from target locations data, or invent realistic local suburbs for ${city}
- Stats (Why Choose Us right column): use plausible numbers like "500+ Happy Customers", "10+ Years Experience", "100% Satisfaction Guarantee"
- Form fields: Name, Phone Number, Service Needed, When Do You Need It? — with a bright "Get My Free Quote" submit button
${reviewCount > 0 ? `- Google badge: show "${reviewCount} Reviews" with "${stars}" stars and rating "${reviewRating}/5" — use a coloured G logo` : '- Google badge: show "5.0 ★★★★★ (Growing)" to encourage them to get reviews'}

═══════════════════════════════
CRITICAL REQUIREMENTS
═══════════════════════════════
1. ALL links href="#" (mockup)
2. background-image for hero MUST use: url('${photoUrl}') with dark overlay 
3. Glass card MUST have backdrop-filter: blur(16px) on the right-column form
4. Make it BEAUTIFUL — this is a sales tool to show the prospect what they could have
5. No placeholder text (Lorem ipsum). All copy must be real and relevant to their business
6. The HTML must be 100% complete and self-contained — no external CSS files

Also identify 6–8 specific gaps their CURRENT website likely has. Be specific to their industry.

Return ONLY valid JSON (no markdown fences):
{"html":"complete HTML string here","gaps":["specific gap 1","specific gap 2"]}`;

      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 6000,
        temperature: 0.7,
      });

      const content = aiRes.choices[0]?.message?.content;
      if (!content) throw new Error("No AI response");

      const result = JSON.parse(content);
      if (!result.html) throw new Error("No HTML in response");

      await db.collection(`orgs/${orgId}/leads`).doc(leadId).update({
        mockWebsiteHtml: result.html,
        mockWebsiteGaps: result.gaps || [],
        mockWebsiteGeneratedAt: new Date(),
        updatedAt: new Date(),
      });

      res.json({ html: result.html, gaps: result.gaps || [] });
    } catch (err) {
      console.error("[mock-website]", err);
      res.status(500).json({ error: "Failed to generate mock website" });
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

  app.post("/api/auth/resolve-org", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "uid is required" });
      }

      if (!firestore) {
        return res.status(503).json({ error: "Firestore not available" });
      }

      const orgsSnapshot = await firestore.collection('orgs').get();

      for (const orgDoc of orgsSnapshot.docs) {
        const memberRef = firestore.collection('orgs').doc(orgDoc.id).collection('members').doc(uid);
        const memberSnap = await memberRef.get();
        
        if (memberSnap.exists) {
          const memberData = memberSnap.data();
          if (memberData?.active === true) {
            return res.json({
              orgId: orgDoc.id,
              role: memberData.role || 'member',
            });
          }
        }
      }

      return res.json({ orgId: null });
    } catch (error: any) {
      console.error("Error resolving org for user:", error);
      res.status(500).json({ error: "Failed to resolve organisation" });
    }
  });

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

        const userDocRef = firestore.collection('users').doc(userRecord.uid);
        const userDoc = await userDocRef.get();
        
        if (!userDoc.exists) {
          await userDocRef.set({
            orgId,
            role: validatedRole,
            email,
            displayName: userRecord.displayName || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
  // PROFILE PHOTO UPLOAD
  // ===============================

  app.post("/api/profile/upload-photo", async (req, res) => {
    try {
      const { uid, imageData, mimeType } = req.body;

      if (!uid || !imageData || !mimeType) {
        return res.status(400).json({ error: "uid, imageData, and mimeType are required" });
      }

      if (!isFirebaseAdminReady() || !bucket) {
        return res.status(503).json({ error: "Firebase Storage not available" });
      }

      // Decode base64 image data
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Generate a download token so the URL is accessible without makePublic()
      const { v4: uuidv4 } = await import('uuid');
      const downloadToken = uuidv4();

      // Upload to Firebase Storage using Admin SDK (bypasses security rules)
      const fileName = `users/${uid}/profile-photo`;
      const file = bucket.file(fileName);

      await file.save(imageBuffer, {
        metadata: {
          contentType: mimeType,
          cacheControl: 'public, max-age=3600',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      // Build a Firebase Storage download URL using the token
      const encodedPath = encodeURIComponent(fileName);
      const photoURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

      res.json({ success: true, photoURL });
    } catch (error: any) {
      console.error("Error uploading profile photo:", error);
      res.status(500).json({ error: error.message || "Failed to upload profile photo" });
    }
  });

  // ===============================
  // TWO-FACTOR AUTHENTICATION (TOTP)
  // ===============================

  // Generate a new TOTP secret + QR code (unauthenticated setup step)
  app.post("/api/2fa/setup", async (req, res) => {
    try {
      const { uid, orgId, email } = req.body;
      if (!uid || !orgId || !email) {
        return res.status(400).json({ error: "uid, orgId and email are required" });
      }

      const speakeasy = (await import('speakeasy')).default;
      const qrcode = await import('qrcode');

      const secret = speakeasy.generateSecret({
        name: `Momentum (${email})`,
        issuer: 'Momentum CRM',
        length: 20,
      });

      const qrDataURL = await qrcode.toDataURL(secret.otpauth_url!);

      res.json({ secret: secret.base32, qrDataURL });
    } catch (error: any) {
      console.error('[2FA] Setup error:', error);
      res.status(500).json({ error: 'Failed to generate 2FA secret' });
    }
  });

  // Enable 2FA: verify the code then save the secret to Firestore
  app.post("/api/2fa/enable", async (req, res) => {
    try {
      const { uid, orgId, secret, code } = req.body;
      if (!uid || !orgId || !secret || !code) {
        return res.status(400).json({ error: "uid, orgId, secret and code are required" });
      }

      if (!isFirebaseAdminReady() || !firestore) {
        return res.status(503).json({ error: 'Firebase not available' });
      }

      const speakeasy = (await import('speakeasy')).default;
      const valid = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 1,
      });

      if (!valid) {
        return res.status(400).json({ error: 'Invalid code — please try again' });
      }

      await firestore
        .collection('orgs').doc(orgId)
        .collection('members').doc(uid)
        .update({ totpSecret: secret, totpEnabled: true });

      res.json({ success: true });
    } catch (error: any) {
      console.error('[2FA] Enable error:', error);
      res.status(500).json({ error: 'Failed to enable 2FA' });
    }
  });

  // Disable 2FA: verify the current code then clear the secret
  app.post("/api/2fa/disable", async (req, res) => {
    try {
      const { uid, orgId, code } = req.body;
      if (!uid || !orgId || !code) {
        return res.status(400).json({ error: "uid, orgId and code are required" });
      }

      if (!isFirebaseAdminReady() || !firestore) {
        return res.status(503).json({ error: 'Firebase not available' });
      }

      const memberDoc = await firestore
        .collection('orgs').doc(orgId)
        .collection('members').doc(uid)
        .get();

      if (!memberDoc.exists) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const { totpSecret, totpEnabled } = memberDoc.data() || {};
      if (!totpEnabled || !totpSecret) {
        return res.status(400).json({ error: '2FA is not enabled' });
      }

      const speakeasy = (await import('speakeasy')).default;
      const valid = speakeasy.totp.verify({
        secret: totpSecret,
        encoding: 'base32',
        token: code,
        window: 1,
      });

      if (!valid) {
        return res.status(400).json({ error: 'Invalid code — please try again' });
      }

      const { FieldValue } = (await import('firebase-admin/firestore'));
      await firestore
        .collection('orgs').doc(orgId)
        .collection('members').doc(uid)
        .update({
          totpSecret: FieldValue.delete(),
          totpEnabled: false,
        });

      res.json({ success: true });
    } catch (error: any) {
      console.error('[2FA] Disable error:', error);
      res.status(500).json({ error: 'Failed to disable 2FA' });
    }
  });

  // Verify a TOTP code during login (user is already Firebase-authed)
  app.post("/api/2fa/verify", async (req, res) => {
    try {
      const { uid, orgId, code } = req.body;
      if (!uid || !orgId || !code) {
        return res.status(400).json({ error: "uid, orgId and code are required" });
      }

      if (!isFirebaseAdminReady() || !firestore) {
        return res.status(503).json({ error: 'Firebase not available' });
      }

      const memberDoc = await firestore
        .collection('orgs').doc(orgId)
        .collection('members').doc(uid)
        .get();

      if (!memberDoc.exists) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const { totpSecret, totpEnabled } = memberDoc.data() || {};
      if (!totpEnabled || !totpSecret) {
        // 2FA not configured — pass through
        return res.json({ success: true, required: false });
      }

      const speakeasy = (await import('speakeasy')).default;
      const valid = speakeasy.totp.verify({
        secret: totpSecret,
        encoding: 'base32',
        token: code,
        window: 1,
      });

      if (!valid) {
        return res.status(400).json({ error: 'Invalid code — please try again' });
      }

      res.json({ success: true, required: true });
    } catch (error: any) {
      console.error('[2FA] Verify error:', error);
      res.status(500).json({ error: 'Failed to verify 2FA code' });
    }
  });

  // Check whether 2FA is required for a given uid/orgId
  app.post("/api/2fa/status", async (req, res) => {
    try {
      const { uid, orgId } = req.body;
      if (!uid || !orgId) {
        return res.status(400).json({ error: "uid and orgId are required" });
      }

      if (!isFirebaseAdminReady() || !firestore) {
        return res.status(503).json({ error: 'Firebase not available' });
      }

      const memberDoc = await firestore
        .collection('orgs').doc(orgId)
        .collection('members').doc(uid)
        .get();

      if (!memberDoc.exists) {
        return res.json({ enabled: false });
      }

      const data = memberDoc.data() || {};
      res.json({ enabled: data.totpEnabled === true });
    } catch (error: any) {
      console.error('[2FA] Status error:', error);
      res.status(500).json({ error: 'Failed to check 2FA status' });
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
        facebookUrl, instagramUrl, linkedinUrl, industry,
        sitemapPageCount, sitemapSections,
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
        socialProfiles: (facebookUrl || instagramUrl || linkedinUrl) ? "detected" : "not detected",
      };

      // Build social profile summary
      const socialPlatforms: string[] = [];
      if (facebookUrl) socialPlatforms.push(`Facebook (${facebookUrl})`);
      if (instagramUrl) socialPlatforms.push(`Instagram (${instagramUrl})`);
      if (linkedinUrl) socialPlatforms.push(`LinkedIn (${linkedinUrl})`);

      // Build sitemap summary
      const sitemapSummary = sitemapPageCount
        ? `${sitemapPageCount} indexed pages found. Sections: ${Object.entries(sitemapSections || {}).map(([s, c]) => `/${s} (${c} pages)`).join(', ') || 'homepage only'}`
        : 'Not scanned';

      const prompt = `You are a sharp digital marketing analyst who has audited thousands of trade and service business websites. You are preparing intelligence for a sales consultant about to call ${businessName}.

Your job: produce a brutally honest, evidence-based audit using ONLY the data provided. Every point must cite a specific data fact. NO vague filler. NO generic observations.

=== BUSINESS DATA ===
Business: ${businessName}
Industry: ${industry || "Not specified"}
Location: ${location || "Not specified"}
Website: ${websiteUrl || "None"} (exists: ${hasWebsite})
Google Business Profile: ${hasGBP ? `Yes — ${googleMapsUrl}` : "No GBP found"}
Google Reviews: ${reviewCount != null ? `${reviewCount} reviews, ${rating} star average` : "unknown"}
GBP Photos: ${gbpPhotoCount != null ? gbpPhotoCount : "unknown"}
GBP Posts (30 days): ${gbpPostsLast30Days != null ? gbpPostsLast30Days : "unknown"}
Social Profiles: ${socialPlatforms.length > 0 ? socialPlatforms.join(', ') : "None detected"}
Website Content (sitemap): ${sitemapSummary}

=== ANALYSIS RULES ===
STRENGTHS — Only list real strengths backed by this specific data:
- If sitemap shows portfolio/work/projects section → strength: evidence of showcased work
- If sitemap shows service pages → strength: structured service content
- If sitemap shows areas/locations pages → strength: geographic targeting content
- If reviews exist → strength must cite exact count and star rating ("4.2★ from 5 reviews")
- If social platforms detected → strength must name the actual platforms found
- If sitemapPageCount > 10 → strength: substantial indexed web presence
- FORBIDDEN: Do not say "has a website", "geographical presence", "industry expertise", or any generic observation that applies to every business
- Each strength must be specific enough that it would NOT apply to a different business

GAPS — Only flag gaps with direct data evidence:
- No GBP → critical gap
- reviewCount < 15 → low review volume (cite the exact number)
- gbpPhotoCount < 10 → weak visual content (cite the exact number, only if known)
- gbpPostsLast30Days = 0 → no Google Posts activity (only if known)
- No social profiles → limited social reach
- sitemapPageCount < 5 → thin website content
- Only flag unknowns if the asset is confirmed missing (hasGBP = false, hasWebsite = false)

Respond with JSON only, no commentary:
{
  "whatTheyDo": "2 punchy sentences — what they build/do and who their clients are. Use industry signals from the sitemap sections if available.",
  "strengths": [
    "Specific strength with evidence e.g. 'Portfolio section with 8 project pages demonstrates completed work to prospects'",
    "Specific strength 2",
    "Specific strength 3 — if fewer than 3 genuine strengths exist, only return the ones that are real"
  ],
  "gaps": [
    { "title": "Specific gap title", "evidence": "The exact data point — cite numbers", "impact": "Why this is losing them leads or rankings right now" }
  ],
  "salesHook": "A natural 1-sentence conversation opener for the sales rep — should reference the most compelling gap and feel like something a human would actually say on a cold call, not a script"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
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

  // "How Google Sees Your Website" — Human View vs Google View analysis
  app.post("/api/ai/sales-engine/google-view", async (req, res) => {
    try {
      const { businessName, website, location, industry, sitemapPages, gbpLink, reviewCount, rating, keywordNotes, crawledPages } = req.body as {
        businessName: string;
        website?: string;
        location?: string;
        industry?: string;
        sitemapPages?: Array<{ url: string }>;
        gbpLink?: string;
        reviewCount?: number | null;
        rating?: number | null;
        keywordNotes?: string;
        crawledPages?: Array<{ url: string; title?: string; description?: string; h1?: string; h2s?: string[] }>;
      };

      const pageUrls = (sitemapPages || []).map(p => p.url);
      const pageCount = pageUrls.length;

      // Categorise pages
      const servicePages = pageUrls.filter(u => /service|treatment|specialist|procedure|therapy|repair|install|consult|product/i.test(u));
      const locationPages = pageUrls.filter(u => /location|suburb|area|city|region|local|near/i.test(u));
      const blogPages = pageUrls.filter(u => /blog|news|article|post|resource|guide|tip/i.test(u));
      const corePages = pageUrls.filter(u => /(home|about|contact|book|pricing|review|faq)/i.test(u));

      const crawlSummary = crawledPages?.slice(0, 12).map(p =>
        `${p.url}${p.title ? ` | Title: ${p.title}` : ''}${p.h1 ? ` | H1: ${p.h1}` : ''}${p.description ? ` | Meta: ${p.description.slice(0, 80)}` : ''}`
      ).join('\n') || '';

      const prompt = `You are a senior SEO strategist helping a sales rep explain the difference between what a human visitor sees and what Google evaluates when deciding whether to rank a business.

BUSINESS DATA:
- Business: ${businessName}
- Location: ${location || 'Not specified'}
- Industry: ${industry || 'Not specified'}
- Website: ${website || 'Not provided'}
- Google Business Profile: ${gbpLink ? `Yes — ${gbpLink}` : 'Not found'}
- Google Reviews: ${reviewCount != null ? `${reviewCount} reviews` : 'Unknown'}, Rating: ${rating != null ? `${rating}★` : 'Unknown'}

WEBSITE STRUCTURE DATA:
- Total pages detected: ${pageCount || 0}
- Service-related pages (${servicePages.length}): ${servicePages.slice(0, 8).join(', ') || 'None detected'}
- Location pages (${locationPages.length}): ${locationPages.slice(0, 6).join(', ') || 'None detected'}
- Blog/content pages (${blogPages.length}): ${blogPages.slice(0, 4).join(', ') || 'None'}
- Core pages: ${corePages.slice(0, 6).join(', ') || 'None confirmed'}
${crawlSummary ? `\nCRAWLED PAGE DATA (title, H1, meta):\n${crawlSummary}` : ''}
${keywordNotes ? `\nKEYWORD CONTEXT:\n${keywordNotes}` : ''}

TASK: Generate a precise, consultative analysis explaining the gap between what a human sees and what Google evaluates. This will be used by a sales rep during a discovery call to help the business owner understand why their site may not be performing despite looking good.

RULES:
- Be specific to this business — no generic advice
- Reference actual page counts, URL patterns, and observable gaps
- Use confident, consultative language — not salesy
- Every observation must be grounded in the data provided
- Score visibility 0-100 based on page depth, service coverage, location coverage, GBP presence, and content signals

Return a JSON object with exactly these keys:

{
  "humanView": {
    "headline": "one sentence describing what a customer sees when they visit the site",
    "observations": ["2-3 specific observations about the human experience — design, trust, clarity, navigation"]
  },
  "googleView": {
    "headline": "one sentence describing what Google actually evaluates about this site",
    "pageDepth": "specific observation about total page count and what it means for coverage",
    "serviceSignals": "how well Google can determine the full range of services offered — be specific",
    "locationSignals": "how clearly the site signals where this business operates",
    "contentClarity": "how well page titles, H1s, and meta descriptions align with search intent",
    "structuralSignals": "observations about internal linking, URL structure, and crawlability"
  },
  "visibilityScore": 0-100 integer,
  "visibilityLabel": "one of: Very Weak / Weak / Moderate / Strong / Very Strong",
  "gaps": [
    { "gap": "specific gap title", "detail": "specific detail grounded in this site's data", "severity": "critical|high|medium" }
  ],
  "whyItMatters": ["2-3 specific sentences about why these gaps hurt this business's ability to rank and win customers"],
  "recommendedActions": [
    { "action": "specific action", "impact": "what this will do for search visibility" }
  ],
  "salesAngle": "one powerful consultative sentence a rep can use verbatim to open the conversation about this business's SEO gap"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a senior SEO strategist and sales consultant. You produce precise, data-grounded website analyses that help sales reps explain Google\'s perspective to business owners. Every insight is specific — never generic.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || '{}';
      res.json(JSON.parse(content));
    } catch (error) {
      console.error('Error generating Google view analysis:', error);
      res.status(500).json({ error: 'Failed to generate analysis' });
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

      const prompt = `You are an elite sales coach trained in NEPQ (Neuro-Emotional Persuasion Questioning) by Jeremy Miner. You help digital marketing reps handle objections without defending, pitching, or pushing — only by asking questions that make the prospect feel their own pain and come to their own conclusions.

I sell digital marketing services to Australian small businesses.
${contextInfo}

For each of these objections:
${objectionList}

Apply the full NEPQ framework to each one. Respond in JSON with a "responses" array. Each item must have:
{
  "objection": "the original objection text",
  "realConcern": "The neuro-emotional state driving this objection — what they are really feeling or fearing underneath the surface. Be specific and empathetic, 1-2 sentences.",
  "response": "A NEPQ-style response: DO NOT defend, pitch, or explain features. Instead, use a softening opener then ask a Status Quo or Problem Awareness question that makes them reflect on their current situation. Sound calm, curious, and peer-level — not salesy. 2-3 sentences max.",
  "regainControlQuestion": "A single sharp Consequence Question — something that surfaces the cost or risk of staying where they are. This should create a moment of internal discomfort without being pushy. Start with phrases like 'What happens if...', 'How long have you...', 'What's it costing you...', 'If nothing changes...'"
}

Rules:
- Never say "I understand" or "That's a great point" — it sounds scripted
- Never mention your product first — always lead with their situation
- NEPQ Response must contain at least one question
- Consequence Question must create emotional weight around inaction
- Sound like a calm, confident peer — not a closer`;

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

  const audioFileFilter = (_req: any, file: any, cb: any) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/mp3', 'audio/aac', 'audio/flac', 'video/webm'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  };
  fs.mkdirSync('/tmp/uploads/', { recursive: true });
  const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: audioFileFilter });

  app.post("/api/ai/sales-engine/transcribe-meeting", (req: any, res: any, next: any) => {
    upload.single('audio')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: "File too large. Maximum size is 25MB." });
        }
        return res.status(400).json({ error: err.message || "File upload failed" });
      }
      next();
    });
  }, async (req: any, res: any) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      const filePath = file.path;

      // Reject files that are too small to be real audio
      if (file.size < 500) {
        fs.unlink(filePath, () => {});
        return res.status(400).json({ error: "Recording is too short. Please record for at least 2 seconds." });
      }

      // Determine extension from MIME type — multer saves without extension, Whisper needs it
      const mimeToExt: Record<string, string> = {
        'audio/webm': '.webm', 'video/webm': '.webm',
        'audio/mp4': '.mp4', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3',
        'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/flac': '.flac',
        'audio/x-m4a': '.m4a', 'audio/aac': '.aac',
      };
      const baseMime = (file.mimetype || '').split(';')[0].trim();
      const ext = mimeToExt[baseMime] || path.extname(file.originalname || '') || '.webm';
      const namedPath = `${filePath}${ext}`;
      try { fs.renameSync(filePath, namedPath); } catch { /* already renamed or missing */ }

      let transcript: string;
      try {
        console.log(`[Whisper] Transcribing ${namedPath} (${file.mimetype}, ${file.size} bytes)`);
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(namedPath) as any,
          model: "whisper-1",
          language: "en",
        });
        transcript = transcription.text;
        if (!transcript || transcript.trim() === '') {
          transcript = '';
          console.log('[Whisper] Empty transcript returned');
        } else {
          console.log(`[Whisper] Success: "${transcript.slice(0, 80)}..."`);
        }
      } catch (whisperErr: any) {
        const whisperMsg = whisperErr?.error?.message || whisperErr?.message || String(whisperErr);
        console.error("[Whisper] Transcription error:", whisperMsg);
        fs.unlink(namedPath, () => {});
        if (whisperMsg.includes('too short') || whisperMsg.includes('minimum')) {
          return res.status(400).json({ error: "Recording is too short. Please record for at least 2 seconds." });
        }
        return res.status(500).json({ error: `Transcription failed: ${whisperMsg}` });
      }

      fs.unlink(namedPath, () => {});

      const analysisPrompt = `You are a sales conversation analyst. Analyse this meeting transcript from a digital marketing sales call.

TRANSCRIPT:
${transcript}

Extract structured conversation intelligence. Respond with JSON:
{
  "summary": "2-3 sentence summary of the conversation",
  "painPoints": ["Pain point mentioned by the prospect"],
  "servicesDiscussed": ["Service mentioned or discussed"],
  "opportunities": ["Opportunity identified from the conversation"],
  "objections": ["Objection or concern raised by the prospect"],
  "nextSteps": ["Agreed or suggested next step"],
  "sentiment": "positive|neutral|negative",
  "keyQuotes": ["Important quote from the prospect (max 3)"]
}

Rules:
- Only extract what was actually said in the transcript
- Keep each item concise (1-2 sentences max)
- If a category has no items, return an empty array
- Focus on actionable sales intelligence`;

      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: analysisPrompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const analysisContent = analysisResponse.choices[0]?.message?.content || "{}";
      let insights;
      try {
        insights = JSON.parse(analysisContent);
        if (!insights.summary) throw new Error("Invalid");
      } catch {
        insights = {
          summary: "Transcript processed but analysis could not be completed.",
          painPoints: [],
          servicesDiscussed: [],
          opportunities: [],
          objections: [],
          nextSteps: [],
          sentiment: "neutral",
          keyQuotes: [],
        };
      }

      res.json({ transcript, insights });
    } catch (error) {
      console.error("Error transcribing meeting:", error);
      res.status(500).json({ error: "Failed to process audio recording" });
    }
  });

  app.post("/api/ai/sales-engine/follow-up", async (req, res) => {
    try {
      const { business, industry, location, meetingNotes, servicesDiscussed, nextStep, conversationInsights, strategyDiagnosis, hasGrowthPlan } = req.body;

      if (!business) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const insightsContext = conversationInsights ? `
=== CONVERSATION INTELLIGENCE (extracted from recorded call) ===
Pain Points Identified: ${conversationInsights.painPoints?.join('; ') || 'None identified'}
Services They Showed Interest In: ${conversationInsights.servicesDiscussed?.join(', ') || 'Not specified'}
Opportunities Detected: ${conversationInsights.opportunities?.join('; ') || 'None'}
Objections / Concerns Raised: ${conversationInsights.objections?.join('; ') || 'None'}
Key Quotes from the Call: ${conversationInsights.keyQuotes?.join(' | ') || 'None captured'}
Sentiment: ${conversationInsights.sentiment || 'Unknown'}
Next Steps Agreed: ${conversationInsights.nextSteps?.join(', ') || 'Not specified'}
` : '';

      const strategyContext = strategyDiagnosis ? `
=== STRATEGY DIAGNOSIS (from AI website analysis) ===
Growth Readiness Score: ${strategyDiagnosis.readinessScore}/100
Key Insight: ${strategyDiagnosis.insightSentence}
Google Clarity: ${strategyDiagnosis.currentPosition?.googleClarity || 'unknown'}
Current Position: ${strategyDiagnosis.currentPosition?.summary || ''}
Top Gaps:
${strategyDiagnosis.gaps?.slice(0, 3).map((g: any) => `- [${g.severity}] ${g.title}: ${g.evidence}`).join('\n') || 'Not available'}
Top Priority: ${strategyDiagnosis.priorities?.[0]?.action || 'Not specified'}
Growth Potential: ${strategyDiagnosis.growthPotential?.summary || ''}
Forecast: ${strategyDiagnosis.growthPotential?.forecastBand ? `${strategyDiagnosis.growthPotential.forecastBand.additionalVisitors} additional visitors/mo, ${strategyDiagnosis.growthPotential.forecastBand.additionalEnquiries} enquiries/mo` : 'Not calculated'}
` : '';

      const growthPlanNote = (hasGrowthPlan || strategyDiagnosis) ? `
IMPORTANT: You have a real AI-generated strategy diagnosis for this business — a Growth Readiness Score and gap analysis. Reference the strategy in the email naturally. Say something like "I've already run an analysis on your website — I'd love to walk you through what I found." Do NOT make up numbers. If you reference the score or forecast, use the actual numbers provided above.` : '';

      const prompt = `You are a senior account executive who has just completed a sales discovery call. You are writing follow-up content to send within the hour.

=== CALL SUMMARY ===
Business: ${business}
Industry: ${industry || 'Not specified'}
Location: ${location || 'Not specified'}
What was discussed: ${meetingNotes || 'General interest in digital marketing services'}
Services discussed: ${servicesDiscussed || 'Digital marketing services'}
Agreed next step: ${nextStep || 'Follow up with more information'}
${insightsContext}${strategyContext}${growthPlanNote}

=== WRITING RULES ===
- Use ONLY information from this brief. Do not invent pain points, quotes, or details.
- Every sentence should be specific to this business, not generic filler.
- The email should feel like it was written by a human within an hour of the call, not a template.
- Reference specific things they said or that the analysis found — make them feel heard.
- Do NOT use corporate buzzwords like "leverage", "synergy", "holistic", "streamline".
- Keep the email concise — under 200 words in the body.
- The SMS must be under 160 characters, conversational, reference the call directly.
- The proposal intro should be 2-3 tight paragraphs positioned around their actual problems.

Generate follow-up content in this exact JSON format:
{
  "email": {
    "subject": "Short, specific subject line that references something real from the call",
    "body": "The email body only — no greeting or sign-off needed in this field"
  },
  "sms": {
    "message": "SMS under 160 characters, conversational, references the call and next step"
  },
  "proposalIntro": {
    "opening": "2-3 paragraph proposal introduction built around their actual pain points and opportunities"
  }
}`;

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
        if (!result.email || !result.sms || !result.proposalIntro) {
          throw new Error("Invalid response structure");
        }
      } catch (e) {
        const diagnosisHint = strategyDiagnosis ? `I've already completed an analysis of your website that I'd like to walk you through.` : '';
        result = {
          email: {
            subject: `Great chatting today — next steps for ${business}`,
            body: `Thanks for taking the time today — really enjoyed learning about what you're building at ${business}.\n\n${diagnosisHint}\n\nAs we discussed, I'll put together a brief on how we'd approach ${servicesDiscussed || 'improving your local search visibility'}. Would ${nextStep || 'a follow-up call later this week'} work?\n\nLooking forward to it.`
          },
          sms: {
            message: `Hey, great chat about ${business} today. I'll send through what we discussed. Talk soon!`
          },
          proposalIntro: {
            opening: `Thank you for the opportunity to discuss how we can help ${business} grow in ${location || 'your area'}. Based on our conversation, it's clear there's a strong opportunity to increase your visibility for ${servicesDiscussed || 'your core services'}.\n\nWe've identified several areas where targeted digital marketing can drive measurable results, and I've already begun analysing your current position.`
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
      const {
        businessName, websiteUrl, location, industry,
        serpData, xrayData,
        crawledPages, crawledCompetitors,
        strategyDiagnosis, sitemapPages,
        conversationNotes, dealStage, ahrefsData, strategyIntelligence,
      } = req.body;
      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }

      // Build rich prospect crawl context
      const crawled: Array<any> = crawledPages || [];
      const prospectCrawlContext = crawled.length > 0
        ? `=== PROSPECT WEBSITE — ACTUAL CRAWLED CONTENT ===\n` +
          crawled.filter(cp => !cp.error).slice(0, 20).map((cp: any) => {
            const path = (() => { try { return new URL(cp.url).pathname || '/'; } catch { return cp.url; } })();
            const parts: string[] = [`[${path}]`];
            if (cp.title) parts.push(`  Title: ${cp.title}`);
            if (cp.h1) parts.push(`  H1: ${cp.h1}`);
            if (cp.h2s?.length) parts.push(`  H2s: ${cp.h2s.slice(0, 4).join(' | ')}`);
            if (cp.h3s?.length) parts.push(`  H3s: ${cp.h3s.slice(0, 3).join(' | ')}`);
            if (cp.metaDescription) parts.push(`  Meta: ${cp.metaDescription.slice(0, 150)}`);
            if (cp.bodyText) parts.push(`  Content: ${cp.bodyText.slice(0, 300)}`);
            if (cp.schemaTypes?.length) parts.push(`  Schema: ${cp.schemaTypes.join(', ')}`);
            return parts.join('\n');
          }).join('\n\n')
        : '';

      // Build rich competitor crawl context
      const competitorsCrawled: Array<any> = crawledCompetitors || [];
      const competitorCrawlContext = competitorsCrawled.length > 0
        ? `=== COMPETITOR WEBSITES — ACTUAL CRAWLED CONTENT ===\n` +
          competitorsCrawled.map((comp: any) => {
            const okPages = (comp.crawledPages || []).filter((p: any) => !p.error);
            const SERVICE_RE = /service|solution|offer|what-we-do|build|construct|repair|design|renovati/i;
            const LOCATION_RE = /location|area|suburb|city|serve|service-area|near/i;
            const BLOG_RE = /blog|news|article|guide|tip|resource/i;
            const servicePages = okPages.filter((p: any) => { try { return SERVICE_RE.test(new URL(p.url).pathname); } catch { return false; } });
            const locationPages = okPages.filter((p: any) => { try { return LOCATION_RE.test(new URL(p.url).pathname); } catch { return false; } });
            const blogPages = okPages.filter((p: any) => { try { return BLOG_RE.test(new URL(p.url).pathname); } catch { return false; } });
            const schemas = [...new Set(okPages.flatMap((p: any) => p.schemaTypes || []))];
            const topPages = okPages.slice(0, 10).map((p: any) => {
              const path = (() => { try { return new URL(p.url).pathname || '/'; } catch { return p.url; } })();
              const parts: string[] = [`  [${path}]`];
              if (p.title) parts.push(`    Title: ${p.title}`);
              if (p.h1) parts.push(`    H1: ${p.h1}`);
              if (p.h2s?.length) parts.push(`    H2s: ${p.h2s.slice(0, 3).join(' | ')}`);
              if (p.bodyText) parts.push(`    Content: ${p.bodyText.slice(0, 250)}`);
              if (p.schemaTypes?.length) parts.push(`    Schema: ${p.schemaTypes.join(', ')}`);
              return parts.join('\n');
            }).join('\n');
            return `--- ${comp.domain} ---\nTotal pages: ${comp.totalPages || okPages.length}\nService pages: ${servicePages.length}\nLocation pages: ${locationPages.length}\nBlog/content pages: ${blogPages.length}\nSchema types: ${schemas.join(', ') || 'none'}\nCrawled pages:\n${topPages}`;
          }).join('\n\n')
        : '';

      // Diagnosis context
      const diagContext = strategyDiagnosis
        ? `=== EXISTING STRATEGY DIAGNOSIS ===\nReadiness Score: ${strategyDiagnosis.readinessScore}/100\nKey finding: ${strategyDiagnosis.insightSentence}\nGoogle clarity: ${strategyDiagnosis.currentPosition?.googleClarity}\nGaps: ${strategyDiagnosis.gaps?.map((g: any) => `[${g.severity}] ${g.title}`).join('; ') || 'None'}\n`
        : '';

      // Ahrefs context
      const ahrefsContext = ahrefsData?.topKeywords?.length
        ? `=== KEYWORD MARKET DATA ===\nTop keyword opportunities (monthly searches):\n${ahrefsData.topKeywords.slice(0, 12).map((k: any) => `  ${k.keyword}: ${k.volume}/mo (difficulty ${k.difficulty}, CPC $${k.cpc})`).join('\n')}\n`
        : '';

      // Conversation context
      const convContext = conversationNotes
        ? `=== CONVERSATION INTELLIGENCE ===\nSales notes from conversation with ${businessName}:\n${conversationNotes}\n`
        : '';

      // Sitemap summary
      const pages: Array<{ url: string }> = sitemapPages || [];
      const sitemapSummary = pages.length > 0
        ? `Total sitemap pages: ${pages.length}\nURLs: ${pages.slice(0, 20).map((p: any) => { try { return new URL(p.url).pathname; } catch { return p.url; } }).join(', ')}\n`
        : '';

      // Build Strategy Intelligence context for competitor gap
      const gapSIContext = (() => {
        if (!strategyIntelligence) return '';
        const si = strategyIntelligence as Record<string, string>;
        const parts: string[] = [];
        if (si.businessOverview?.trim()) parts.push(`Business Overview: ${si.businessOverview}`);
        if (si.idealCustomer?.trim()) parts.push(`Ideal Customer: ${si.idealCustomer}`);
        if (si.coreServices?.trim()) parts.push(`Core Revenue Services:\n${si.coreServices}`);
        if (si.targetLocations?.trim()) parts.push(`Target Locations:\n${si.targetLocations}`);
        if (si.growthObjective?.trim()) parts.push(`Growth Objective: ${si.growthObjective}`);
        if (si.discoveryNotes?.trim()) parts.push(`Discovery Notes: ${si.discoveryNotes}`);
        return parts.length > 0
          ? `\n=== STRATEGY INTELLIGENCE (owner's stated goals — use to focus the gap analysis on what matters to THEM) ===\n${parts.join('\n')}\n`
          : '';
      })();

      const prompt = `You are a senior competitive intelligence analyst specialising in digital visibility for Australian businesses. You are analysing the competitive landscape for ${businessName} — a ${industry || 'local'} business in ${location || 'Australia'}.

Your job is to produce a deep competitive gap analysis using REAL crawled website content from both the prospect and their competitors. Do not estimate — use the actual data provided.

=== BUSINESS CONTEXT ===
Business: ${businessName}
Industry: ${industry || 'Not specified'}
Location: ${location || 'Not specified'}
Website: ${websiteUrl || 'Not provided'}
Deal Stage: ${dealStage || 'Discovery'}
Website pages in sitemap: ${sitemapSummary || 'Unknown'}

${gapSIContext}
${diagContext}
${ahrefsContext}
${convContext}
${prospectCrawlContext}
${competitorCrawlContext}

=== ANALYSIS RULES ===
- Use the actual crawled page content to assess each competitor's content depth, messaging, and topic coverage
- Identify specific pages competitors have that the prospect lacks — cite the URL pattern and page purpose
- Identify content themes competitors cover (e.g. "sloping block builds", "knockdown rebuild", "suburb name") that the prospect does not
- Look at competitor H1s, H2s, and body text to understand what buyer questions they're answering — note where the prospect is silent on the same topics
- Identify strategic white space: topics, suburbs, and buyer questions that NO competitor adequately covers
- Base prospect service/location page counts on actual sitemap/crawl data, not estimates

Respond with JSON:
{
  "prospect": {
    "servicePages": number_from_actual_data,
    "locationPages": number_from_actual_data,
    "contentDepth": "thin|moderate|strong",
    "internalLinking": "weak|moderate|strong",
    "reviewSignals": "low|moderate|strong",
    "keyWeaknesses": ["specific weakness with evidence", "..."]
  },
  "competitorAverage": {
    "servicePages": number,
    "locationPages": number,
    "contentDepth": "thin|moderate|strong",
    "internalLinking": "weak|moderate|strong",
    "reviewSignals": "low|moderate|strong"
  },
  "competitors": [
    {
      "name": "domain name",
      "servicePages": number_from_crawl,
      "locationPages": number_from_crawl,
      "contentDepth": "thin|moderate|strong",
      "strengths": ["specific strength from crawled content", "..."],
      "topicsCovered": ["topic they cover that prospect doesn't", "..."],
      "contentAdvantage": "one sentence on their biggest content edge"
    }
  ],
  "insights": [
    "Evidence-based insight referencing specific page data or content",
    "..."
  ],
  "strategicWhiteSpace": [
    {
      "opportunity": "Specific gap no competitor has captured",
      "evidence": "Why this is an uncaptured opportunity (data-backed)",
      "suggestedMove": "Specific page or content to create"
    }
  ],
  "contentGaps": [
    {
      "topic": "Topic competitors cover but prospect does not",
      "competitorExample": "Which competitor covers it and how",
      "buyerIntent": "What the buyer is searching for when they find this",
      "priority": "high|medium|low"
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = JSON.parse(content);
        if (!result.prospect || !result.competitorAverage) throw new Error("Invalid");
      } catch {
        result = {
          prospect: { servicePages: 1, locationPages: 0, contentDepth: "thin", internalLinking: "weak", reviewSignals: "low", keyWeaknesses: [] },
          competitorAverage: { servicePages: 5, locationPages: 3, contentDepth: "moderate", internalLinking: "moderate", reviewSignals: "moderate" },
          competitors: [],
          insights: ["Unable to generate full competitive analysis. Please try again."],
          strategicWhiteSpace: [],
          contentGaps: [],
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

  app.post("/api/ai/growth-plan/strategy-diagnosis", async (req, res) => {
    try {
      const {
        businessName, websiteUrl, industry, location,
        sitemapPages, hasGBP, gbpLink, reviewCount, rating,
        facebookUrl, instagramUrl, linkedinUrl, crawledPages, crawledCompetitors,
        conversationNotes, conversationInsights, objections,
        dealStage, mrr, adSpend, ahrefsData, strategyIntelligence,
      } = req.body;

      if (!businessName) return res.status(400).json({ error: "Business name is required" });

      // Classify sitemap pages into intent types
      const pages: Array<{ url: string }> = sitemapPages || [];
      const classified: Record<string, string[]> = { portfolio: [], services: [], locations: [], blog: [], core: [], other: [] };
      const SERVICE_RE = /service|what-we-do|solution|offer|repair|install|maintenance|consult|design|build|renovati|construct|plumb|electr|paint|landscap|clean|concrete|cabinet|flooring|render|waterproof|demolish/i;
      const LOCATION_RE = /area|location|suburb|city|region|local|serve|service-area|near|brisbane|sydney|melbourne|perth|adelaide|gold-coast|sunshine/i;
      const PORTFOLIO_RE = /portfolio|project|work|case-stud|gallery|showcase|completed|example|before-after|past-work/i;
      const BLOG_RE = /blog|news|article|post|insight|resource|update|tip|guide/i;
      const CORE_RE = /about|contact|team|faq|privacy|terms|sitemap|careers|testimonial|review/i;

      for (const p of pages) {
        try {
          const slug = new URL(p.url).pathname.toLowerCase();
          if (PORTFOLIO_RE.test(slug)) classified.portfolio.push(p.url);
          else if (SERVICE_RE.test(slug)) classified.services.push(p.url);
          else if (LOCATION_RE.test(slug)) classified.locations.push(p.url);
          else if (BLOG_RE.test(slug)) classified.blog.push(p.url);
          else if (CORE_RE.test(slug) || slug === '/' || slug === '') classified.core.push(p.url);
          else classified.other.push(p.url);
        } catch { classified.other.push(p.url); }
      }

      const sitemapSummary = Object.entries(classified)
        .filter(([, v]) => v.length > 0)
        .map(([k, v]) => `  ${k} pages: ${v.length} (e.g. ${v.slice(0, 3).join(', ')})`)
        .join('\n');
      const pageExamples = pages.slice(0, 25).map(p => `  ${p.url}`).join('\n');

      const socialPlatforms: string[] = [];
      if (facebookUrl) socialPlatforms.push('Facebook');
      if (instagramUrl) socialPlatforms.push('Instagram');
      if (linkedinUrl) socialPlatforms.push('LinkedIn');

      // Build crawled page content summary for the prompt
      const crawled: Array<any> = crawledPages || [];
      const crawledSummary = crawled.length > 0
        ? crawled.filter(cp => !cp.error).slice(0, 20).map((cp: any) => {
            const path = (() => { try { return new URL(cp.url).pathname || '/'; } catch { return cp.url; } })();
            const parts: string[] = [`URL: ${path}`];
            if (cp.title) parts.push(`  Title: ${cp.title}`);
            if (cp.h1) parts.push(`  H1: ${cp.h1}`);
            if (cp.h2s?.length) parts.push(`  H2s: ${cp.h2s.slice(0, 4).join(' | ')}`);
            if (cp.h3s?.length) parts.push(`  H3s: ${cp.h3s.slice(0, 3).join(' | ')}`);
            if (cp.metaDescription) parts.push(`  Meta: ${cp.metaDescription.slice(0, 150)}`);
            if (cp.bodyText) parts.push(`  Body: ${cp.bodyText.slice(0, 300)}`);
            if (cp.schemaTypes?.length) parts.push(`  Schema: ${cp.schemaTypes.join(', ')}`);
            if (cp.imageAlts?.length) parts.push(`  Image alts: ${cp.imageAlts.slice(0, 3).join(' | ')}`);
            return parts.join('\n');
          }).join('\n\n')
        : null;

      // Build crawled competitor context with full page content
      const competitorsCrawled: Array<any> = crawledCompetitors || [];
      const competitorCrawlContext = competitorsCrawled.length > 0
        ? `\n=== COMPETITOR DEEP ANALYSIS (actual HTML extracted from rival sites) ===\n` +
          competitorsCrawled.map((comp: any) => {
            const okPages = (comp.crawledPages || []).filter((p: any) => !p.error);
            const servicePagesCount = okPages.filter((p: any) => /service|solution|offer|build|construct|design|renovati/i.test((() => { try { return new URL(p.url).pathname; } catch { return p.url; } })())).length;
            const locationPagesCount = okPages.filter((p: any) => /location|area|suburb|city|serve/i.test((() => { try { return new URL(p.url).pathname; } catch { return p.url; } })())).length;
            const blogPagesCount = okPages.filter((p: any) => /blog|news|article|guide/i.test((() => { try { return new URL(p.url).pathname; } catch { return p.url; } })())).length;
            const schemas = [...new Set(okPages.flatMap((p: any) => p.schemaTypes || []))];
            const topPages = okPages.slice(0, 10).map((p: any) => {
              const path = (() => { try { return new URL(p.url).pathname || '/'; } catch { return p.url; } })();
              const parts: string[] = [`  [${path}]`];
              if (p.title) parts.push(`    Title: ${p.title}`);
              if (p.h1) parts.push(`    H1: ${p.h1}`);
              if (p.h2s?.length) parts.push(`    H2s: ${p.h2s.slice(0, 3).join(' | ')}`);
              if (p.bodyText) parts.push(`    Content: ${p.bodyText.slice(0, 200)}`);
              if (p.schemaTypes?.length) parts.push(`    Schema: ${p.schemaTypes.join(', ')}`);
              return parts.join('\n');
            }).join('\n');
            return `Competitor: ${comp.domain}\n  Total site pages: ${comp.totalPages || okPages.length}\n  Service pages: ${servicePagesCount}\n  Location pages: ${locationPagesCount}\n  Blog/content pages: ${blogPagesCount}\n  Schema types: ${schemas.join(', ') || 'none'}\n  Crawled pages:\n${topPages}`;
          }).join('\n\n')
        : '';

      // Build conversation intelligence context
      const convIntelContext = (() => {
        const parts: string[] = [];
        if (conversationNotes) parts.push(`Sales notes: ${conversationNotes}`);
        if (conversationInsights?.painPoints?.length) parts.push(`Pain points raised: ${conversationInsights.painPoints.join('; ')}`);
        if (conversationInsights?.servicesDiscussed?.length) parts.push(`Services discussed: ${conversationInsights.servicesDiscussed.join(', ')}`);
        if (conversationInsights?.nextSteps?.length) parts.push(`Next steps: ${conversationInsights.nextSteps.join('; ')}`);
        if (objections?.length) parts.push(`Objections noted: ${Array.isArray(objections) ? objections.join('; ') : objections}`);
        return parts.length > 0 ? `\n=== CONVERSATION INTELLIGENCE ===\n${parts.join('\n')}\n` : '';
      })();

      // Build deal intelligence context
      const dealIntelContext = (() => {
        const parts: string[] = [];
        if (dealStage) parts.push(`Deal stage: ${dealStage}`);
        if (mrr) parts.push(`MRR potential: $${mrr}/mo`);
        if (adSpend) parts.push(`Current ad spend: ${typeof adSpend === 'object' ? `$${adSpend.spend}/${adSpend.period} on ${adSpend.channel}` : `$${adSpend}/mo`}`);
        return parts.length > 0 ? `\n=== DEAL INTELLIGENCE ===\n${parts.join('\n')}\n` : '';
      })();

      // Build Ahrefs keyword market context
      const ahrefsContext = ahrefsData?.topKeywords?.length
        ? `\n=== KEYWORD MARKET DATA (top search opportunities) ===\n${ahrefsData.topKeywords.slice(0, 15).map((k: any) => `  ${k.keyword}: ${k.volume}/mo volume, difficulty ${k.difficulty}/100, CPC $${k.cpc}`).join('\n')}\n`
        : '';

      // Build Strategy Intelligence context
      const siContext = (() => {
        if (!strategyIntelligence) return '';
        const si = strategyIntelligence as Record<string, string>;
        const parts: string[] = [];
        if (si.businessOverview?.trim()) parts.push(`Business Overview: ${si.businessOverview}`);
        if (si.idealCustomer?.trim()) parts.push(`Ideal Customer: ${si.idealCustomer}`);
        if (si.coreServices?.trim()) parts.push(`Core Revenue Services: ${si.coreServices}`);
        if (si.targetLocations?.trim()) parts.push(`Target Locations: ${si.targetLocations}`);
        if (si.growthObjective?.trim()) parts.push(`Growth Objective: ${si.growthObjective}`);
        if (si.discoveryNotes?.trim()) parts.push(`Discovery Notes: ${si.discoveryNotes}`);
        return parts.length > 0 ? `\n=== STRATEGY INTELLIGENCE (direct from discovery conversation) ===\n${parts.join('\n')}\nIMPORTANT: This is what the business owner has told the sales rep directly. Every analysis section must be framed around these stated goals and target customers.\n` : '';
      })();

      const prompt = `You are a senior digital visibility strategist with deep expertise in local business SEO and digital marketing. You are producing an evidence-based strategy diagnosis for a sales rep preparing to advise ${businessName} on their digital growth.

CRITICAL INSTRUCTION: Every insight must follow Evidence → Interpretation → Strategic Implication → Recommended Move.
Avoid generic phrases like "improve SEO", "optimise keywords", "build backlinks". Use specific evidence from the data.

Your diagnosis must incorporate ALL available data:
1. Strategy Intelligence (stated goals, ideal customers, target locations — this is the MOST important context)
2. Website structure and crawled content (actual page copy, headings, schema)
3. Competitor website content (actual crawled data — not estimates)
4. Conversation intelligence (what the client has said their goals are)
5. Deal intelligence (stage and context)
6. Keyword market data (real search volumes)
7. Google Business Profile signals

=== BUSINESS PROFILE ===
Business: ${businessName}
Industry: ${industry || 'Not specified'}
Location: ${location || 'Not specified'}
Website: ${websiteUrl || 'Not provided'}
Google Business Profile: ${hasGBP ? `Yes — ${gbpLink}` : 'Not found'}
Google Reviews: ${reviewCount != null ? `${reviewCount} reviews, ${rating}★ average` : 'Unknown'}
Social Profiles: ${socialPlatforms.length > 0 ? socialPlatforms.join(', ') : 'None detected'}
${siContext}${convIntelContext}${dealIntelContext}${ahrefsContext}
=== WEBSITE STRUCTURE (from sitemap) ===
Total indexed pages: ${pages.length || 0}
Page classification:
${sitemapSummary || '  No sitemap data available'}

Actual URLs found:
${pageExamples || '  None'}
${crawledSummary ? `\n=== DEEP PAGE ANALYSIS (actual HTML content extracted) ===
The following is REAL content crawled from the prospect's website. Use this to assess what messages the website sends to buyers, keyword targeting, content quality, and structural gaps.

${crawledSummary}` : ''}
${competitorCrawlContext ? `\n${competitorCrawlContext}\n\nUse competitor body text to identify: what topics they cover, what buyer questions they answer, what services/suburbs they rank for — and where ${businessName} is absent.` : ''}

=== SCORING RULES ===
Score each out of 100. Be honest and calibrated — low scores are expected for businesses with poor structure.

Service Clarity Score: Based on dedicated service pages (slug-level AND crawled body content evidence). 0 = no service pages detected. 30 = 1-2 service pages. 60 = 3-5 service pages. 80+ = 6+ well-structured service pages.

Location Relevance Score: Based on suburb/location pages. 0 = zero location pages. 30 = 1 location page. 60 = 3-5 location pages. 80+ = 6+ location pages or strong area targeting evidence.

Content Coverage Score: Based on total indexed pages, diversity of content types, AND what crawled body text actually communicates to buyers. Heavy portfolio-only sites score low (max 35) even with many pages, because portfolio pages don't help search visibility.

GBP Alignment Score: 0 = no GBP. 40 = GBP exists but few reviews. 70 = GBP with moderate reviews (5-30). 90+ = strong GBP with 30+ reviews.

Authority/Trust Score: Based on review count, social profiles, and content depth signals. Moderate scores unless review count is strong.

Digital Visibility Score (0-100): An overall score representing how discoverable and trustworthy the business appears online. Calculate from 5 weighted components:
- Search Relevance (30%): How well the site's content signals match what buyers search for
- Market Coverage (25%): How many service + location combinations are covered vs. the opportunity
- Authority Signals (20%): Review count, quality, social proof, backlinks
- Local Discovery (15%): GBP completeness, local schema, suburb targeting
- Buyer Confidence (10%): Site quality, messaging clarity, trust signals from crawled body text

=== CONVERSATION INTELLIGENCE RULES ===
If conversation notes or client insights are provided:
- Frame the "currentPosition" summary around the client's stated goals, not just SEO structure
- The "insightSentence" should connect the SEO gap to what the client said they want
- The "strategicImplication" in each gap should reference the client's goals
- Do NOT write generic SEO advice — write as if you know what this client is trying to achieve

=== DEAL STAGE RULES ===
- Discovery/Meeting → focus on diagnosing the biggest constraint and the growth opportunity
- Proposal → emphasise roadmap, ROI, and projected outcomes
- Qualified → show concrete next steps and quick wins

=== OUTPUT RULES ===
- Be honest. Do not inflate scores.
- If portfolio pages dominate, explicitly call this out as the key structural gap.
- Do not flag GBP as missing if hasGBP = true.
- Do not guess at page content beyond what crawled data and URLs reveal.
- Forecast must use bands — avoid false precision unless data supports it.
- Gap evidence must cite specific data (page counts, review numbers, URL patterns, body text signals).
- Strategic white space = opportunities NO competitor has captured yet.

Respond with JSON only:
{
  "readinessScore": 0-100,
  "confidence": "low|medium|high",
  "insightSentence": "One sharp sentence for the rep to say on the call — grounded in the data and client goals",
  "clientGoalContext": "1-2 sentences connecting their stated goals (from conversation if available) to the digital visibility opportunity",
  "digitalVisibilityScore": {
    "overall": 0-100,
    "components": {
      "searchRelevance": { "score": 0-100, "label": "Search Relevance", "explanation": "Why this score — cite specific evidence" },
      "marketCoverage": { "score": 0-100, "label": "Market Coverage", "explanation": "Why this score — services × locations covered" },
      "authoritySignals": { "score": 0-100, "label": "Authority Signals", "explanation": "Why this score — reviews, social, trust" },
      "localDiscovery": { "score": 0-100, "label": "Local Discovery", "explanation": "Why this score — GBP, schema, suburb targeting" },
      "buyerConfidence": { "score": 0-100, "label": "Buyer Confidence", "explanation": "Why this score — site messaging, clarity, CTA strength" }
    }
  },
  "subscores": {
    "serviceClarityScore": 0-100,
    "locationRelevanceScore": 0-100,
    "contentCoverageScore": 0-100,
    "gbpAlignmentScore": 0-100,
    "authorityScore": 0-100
  },
  "currentPosition": {
    "summary": "2-3 sentences — what Google currently understands about this business, and what the website communicates to buyers. Connect to client's stated goals if conversation notes provided.",
    "googleClarity": "low|moderate|strong",
    "websiteMessage": "1 sentence: what does the website primarily communicate to a buyer who lands on it?",
    "pageBreakdown": [
      { "type": "Portfolio/Project Pages", "count": 0, "searchIntent": "low" },
      { "type": "Service Pages", "count": 0, "searchIntent": "high" },
      { "type": "Location Pages", "count": 0, "searchIntent": "high" },
      { "type": "Core Pages (About/Contact)", "count": 0, "searchIntent": "low" },
      { "type": "Blog/Content Pages", "count": 0, "searchIntent": "medium" }
    ]
  },
  "growthPotential": {
    "summary": "2-3 sentences about the realistic opportunity if key gaps are fixed — frame around client's goals if known",
    "opportunities": [
      "Specific opportunity 1 — what it would unlock",
      "Specific opportunity 2",
      "Specific opportunity 3"
    ],
    "forecastBand": {
      "additionalImpressions": "e.g. +800–1,500/mo",
      "additionalVisitors": "e.g. +60–120/mo",
      "additionalEnquiries": "e.g. +5–12/mo",
      "confidence": "low|moderate|strong"
    }
  },
  "strategicWhiteSpace": [
    {
      "opportunity": "Specific uncaptured market opportunity",
      "evidence": "Why this is open — cite competitor data or keyword gaps",
      "suggestedMove": "Specific page or content to create to capture it",
      "searchDemand": "Estimated monthly searches for this opportunity"
    }
  ],
  "gaps": [
    {
      "title": "Specific gap title",
      "evidence": "The data point — cite URL patterns, page counts, numbers",
      "impact": "Why this is costing them rankings and leads right now",
      "severity": "high|medium|low"
    }
  ],
  "priorities": [
    {
      "rank": 1,
      "action": "Short action title",
      "description": "What to build/fix and why it moves the needle",
      "examples": ["e.g. /custom-home-builder-brisbane", "/home-builder-eight-mile-plains"]
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 3500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const result = JSON.parse(content);
      // Attach the raw page classification for reference
      result.pageClassification = classified;
      result.totalPages = pages.length;
      res.json(result);
    } catch (err: any) {
      console.error("[growth-plan/strategy-diagnosis]", err);
      res.status(500).json({ error: "Failed to generate strategy diagnosis" });
    }
  });

  app.post("/api/ai/growth-plan/twelve-month-strategy", async (req, res) => {
    try {
      const {
        businessName, websiteUrl, industry, location,
        strategyDiagnosis, sitemapPages, crawledPages, crawledCompetitors: crawledCompetitorsInput, reviewCount, rating, gbpLink,
        facebookUrl, instagramUrl, linkedinUrl, competitors,
        conversationNotes, conversationInsights, objections, dealStage, mrr, adSpend, ahrefsData, strategyIntelligence,
      } = req.body;

      if (!businessName) return res.status(400).json({ error: "Business name is required" });

      const pages: Array<{ url: string }> = sitemapPages || [];
      const SERVICE_RE = /service|what-we-do|solution|offer|repair|install|maintenance|consult|design|build|renovati|construct|plumb|electr|paint|landscap|clean|concrete|cabinet|flooring|render|waterproof|demolish/i;
      const LOCATION_RE = /area|location|suburb|city|region|local|serve|service-area|near|brisbane|sydney|melbourne|perth|adelaide|gold-coast|sunshine/i;
      const PORTFOLIO_RE = /portfolio|project|work|case-stud|gallery|showcase|completed|example|before-after|past-work/i;
      const classified: Record<string, string[]> = { portfolio: [], services: [], locations: [], other: [] };
      for (const p of pages) {
        try {
          const slug = new URL(p.url).pathname.toLowerCase();
          if (PORTFOLIO_RE.test(slug)) classified.portfolio.push(p.url);
          else if (SERVICE_RE.test(slug)) classified.services.push(p.url);
          else if (LOCATION_RE.test(slug)) classified.locations.push(p.url);
          else classified.other.push(p.url);
        } catch { classified.other.push(p.url); }
      }

      const diagContext = strategyDiagnosis ? `
=== AI STRATEGY DIAGNOSIS (already completed) ===
Growth Readiness Score: ${strategyDiagnosis.readinessScore}/100
Digital Visibility Score: ${strategyDiagnosis.digitalVisibilityScore?.overall || 'N/A'}/100
Key Finding: ${strategyDiagnosis.insightSentence}
Client Goal Context: ${strategyDiagnosis.clientGoalContext || ''}
Google Clarity: ${strategyDiagnosis.currentPosition?.googleClarity}
Website Message to Buyers: ${strategyDiagnosis.currentPosition?.websiteMessage || ''}
Current Position Summary: ${strategyDiagnosis.currentPosition?.summary}

Sub-scores:
- Service Clarity: ${strategyDiagnosis.subscores?.serviceClarityScore}/100
- Location Signals: ${strategyDiagnosis.subscores?.locationRelevanceScore}/100  
- Content Coverage: ${strategyDiagnosis.subscores?.contentCoverageScore}/100
- GBP Alignment: ${strategyDiagnosis.subscores?.gbpAlignmentScore}/100
- Authority: ${strategyDiagnosis.subscores?.authorityScore}/100

Top Gaps:
${strategyDiagnosis.gaps?.map((g: any) => `- [${g.severity}] ${g.title}: ${g.evidence}. Impact: ${g.impact}`).join('\n') || 'None'}

Strategic White Space (uncaptured opportunities):
${strategyDiagnosis.strategicWhiteSpace?.map((s: any) => `- ${s.opportunity}: ${s.evidence} → ${s.suggestedMove}`).join('\n') || 'None'}

Top Priorities:
${strategyDiagnosis.priorities?.map((p: any) => `${p.rank}. ${p.action}: ${p.description}${p.examples?.length ? ' (e.g. ' + p.examples.slice(0, 2).join(', ') + ')' : ''}`).join('\n') || 'None'}

Growth Potential: ${strategyDiagnosis.growthPotential?.summary}
Forecast: ${strategyDiagnosis.growthPotential?.forecastBand ? JSON.stringify(strategyDiagnosis.growthPotential.forecastBand) : 'Not calculated'}
` : '';

      // Build Strategy Intelligence context
      const strat12SIContext = (() => {
        if (!strategyIntelligence) return '';
        const si = strategyIntelligence as Record<string, string>;
        const parts: string[] = [];
        if (si.businessOverview?.trim()) parts.push(`Business Overview: ${si.businessOverview}`);
        if (si.idealCustomer?.trim()) parts.push(`Ideal Customer: ${si.idealCustomer}`);
        if (si.coreServices?.trim()) parts.push(`Core Revenue Services:\n${si.coreServices}`);
        if (si.targetLocations?.trim()) parts.push(`Target Locations:\n${si.targetLocations}`);
        if (si.growthObjective?.trim()) parts.push(`Growth Objective: ${si.growthObjective}`);
        if (si.discoveryNotes?.trim()) parts.push(`Discovery Notes: ${si.discoveryNotes}`);
        return parts.length > 0
          ? `\n=== STRATEGY INTELLIGENCE (owner's stated goals — use as the primary frame for the entire strategy) ===\n${parts.join('\n')}\n`
          : '';
      })();

      // Build conversation + deal intelligence context
      const strat12ConvContext = (() => {
        const parts: string[] = [];
        if (conversationNotes) parts.push(`Sales notes: ${conversationNotes}`);
        if (conversationInsights?.painPoints?.length) parts.push(`Client pain points: ${conversationInsights.painPoints.join('; ')}`);
        if (conversationInsights?.servicesDiscussed?.length) parts.push(`Services discussed: ${conversationInsights.servicesDiscussed.join(', ')}`);
        if (objections?.length) parts.push(`Objections raised: ${Array.isArray(objections) ? objections.map((o: any) => o.objection || o).join('; ') : objections}`);
        if (dealStage) parts.push(`Deal stage: ${dealStage}`);
        if (mrr) parts.push(`MRR potential: $${mrr}/mo`);
        if (adSpend) parts.push(`Current ad spend: ${typeof adSpend === 'object' ? `$${adSpend.spend}/${adSpend.period} on ${adSpend.channel}` : `$${adSpend}/mo`}`);
        return parts.length > 0 ? `\n=== CONVERSATION & DEAL INTELLIGENCE ===\n${parts.join('\n')}\nIMPORTANT: The strategy narrative must frame recommendations around the client's stated goals and deal stage. Do not write generic strategy — write for THIS client's specific situation.\n` : '';
      })();

      // Ahrefs keyword context — include ALL uploaded keywords, compute real totals
      const allKeywords: Array<any> = ahrefsData?.topKeywords || [];
      const totalKwVolume = allKeywords.reduce((sum: number, k: any) => sum + (parseInt(k.volume) || 0), 0);
      const strat12AhrefsContext = allKeywords.length > 0
        ? `\n=== UPLOADED KEYWORD DATA (${allKeywords.length} keywords — USE THESE EXACT KEYWORDS, do not invent new ones) ===\nTotal combined monthly search volume: ${totalKwVolume.toLocaleString()}\n${allKeywords.map((k: any, i: number) => `  ${i + 1}. ${k.keyword}: ${k.volume}/mo, difficulty ${k.difficulty}/100, CPC $${k.cpc}, rank ${k.position > 0 ? '#' + k.position : 'not ranking'}`).join('\n')}\n`
        : '';

      const crawled: Array<any> = crawledPages || [];
      const crawledContext = crawled.length > 0
        ? `\n=== DEEP PAGE ANALYSIS (actual HTML extracted) ===\n` +
          crawled.filter(cp => !cp.error).slice(0, 15).map((cp: any) => {
            const path = (() => { try { return new URL(cp.url).pathname || '/'; } catch { return cp.url; } })();
            const parts: string[] = [`URL: ${path}`];
            if (cp.title) parts.push(`  Title: ${cp.title}`);
            if (cp.h1) parts.push(`  H1: ${cp.h1}`);
            if (cp.h2s?.length) parts.push(`  H2s: ${cp.h2s.slice(0, 3).join(' | ')}`);
            if (cp.metaDescription) parts.push(`  Meta: ${cp.metaDescription.slice(0, 120)}`);
            if (cp.bodyText) parts.push(`  Content: ${cp.bodyText.slice(0, 250)}`);
            if (cp.schemaTypes?.length) parts.push(`  Schema: ${cp.schemaTypes.join(', ')}`);
            return parts.join('\n');
          }).join('\n\n')
        : '';

      const sitemapContext = pages.length > 0 ? `
=== WEBSITE STRUCTURE (from sitemap) ===
Total pages: ${pages.length}
Service pages: ${classified.services.length} (${classified.services.slice(0, 3).join(', ') || 'none'})
Location/area pages: ${classified.locations.length} (${classified.locations.slice(0, 3).join(', ') || 'none'})  
Portfolio/project pages: ${classified.portfolio.length} (${classified.portfolio.slice(0, 3).join(', ') || 'none'})
Other pages: ${classified.other.length}
${crawledContext}
` : crawledContext ? `\n=== WEBSITE STRUCTURE ===\n${crawledContext}\n` : '';

      // Build crawled competitor context for twelve-month strategy
      const crawledCompsList: Array<any> = crawledCompetitorsInput || [];
      const crawledCompsContext = crawledCompsList.length > 0
        ? `\n=== COMPETITOR DEEP ANALYSIS ===\n` +
          crawledCompsList.map((comp: any) => {
            const okPages = (comp.crawledPages || []).filter((p: any) => !p.error);
            const servicePages = okPages.filter((p: any) => /service|solution|offer/i.test((() => { try { return new URL(p.url).pathname; } catch { return p.url; } })()));
            const locationPages = okPages.filter((p: any) => /location|area|suburb|city/i.test((() => { try { return new URL(p.url).pathname; } catch { return p.url; } })()));
            const schemas = [...new Set(okPages.flatMap((p: any) => p.schemaTypes || []))];
            const keyPages = okPages.slice(0, 6).map((p: any) => {
              const path = (() => { try { return new URL(p.url).pathname || '/'; } catch { return p.url; } })();
              return `  ${path}${p.title ? ' — ' + p.title : ''}${p.h1 ? ' [H1: ' + p.h1 + ']' : ''}`;
            }).join('\n');
            return `${comp.domain}: ${comp.totalPages} total pages, ${servicePages.length} service pages, ${locationPages.length} location pages, schema: ${schemas.join(', ') || 'none'}\nKey pages:\n${keyPages}`;
          }).join('\n\n')
        : '';

      const competitorContext = competitors?.length > 0 ? `
=== COMPETITORS TO BENCHMARK AGAINST ===
${competitors.join(', ')}
These are real competitors ranking in the same market. Factor their typical keyword patterns into the opportunity analysis.
${crawledCompsContext}
` : crawledCompsContext ? `\n=== COMPETITOR ANALYSIS ===\n${crawledCompsContext}\n` : '';

      const socialProfiles = [facebookUrl && 'Facebook', instagramUrl && 'Instagram', linkedinUrl && 'LinkedIn'].filter(Boolean).join(', ');

      const prompt = `You are a senior digital marketing strategist producing a 12-month growth strategy for a sales presentation. This strategy must feel like a strategic advisor wrote it — not an SEO report. Every insight must follow: Evidence → Interpretation → Strategic Implication → Recommended Move.

CRITICAL: If conversation notes or client goals are provided, the strategy narrative must be framed around what the client wants to achieve — not generic SEO tactics. Reference their stated goals throughout.

=== BUSINESS PROFILE ===
Business: ${businessName}
Industry: ${industry || 'Not specified'}
Location: ${location || 'Not specified'}
Website: ${websiteUrl || 'Not provided'}
Google Business Profile: ${gbpLink ? 'Yes — ' + gbpLink : 'Not found'}
Google Reviews: ${reviewCount != null ? reviewCount + ' reviews, ' + rating + '★' : 'Unknown'}
Social: ${socialProfiles || 'None detected'}
${strat12SIContext}${strat12ConvContext}${strat12AhrefsContext}${diagContext}${sitemapContext}${competitorContext}

=== DIGITAL VISIBILITY STRATEGY RULES ===
- Frame ALL insights as: Evidence → Interpretation → Strategic Implication → Recommended Move
- Frame this as a "Digital Visibility Strategy" — NOT an SEO audit or keyword report
- KEYWORD RULE: Use EXACT uploaded keywords in marketOpportunity.keywords — do not invent new ones
- VOLUME RULE: totalMonthlySearches = ${totalKwVolume > 0 ? totalKwVolume : 'sum of uploaded keyword volumes or estimate realistically'}
- All evidence must be grounded in the provided data — no generic filler
- Do NOT write: "improve SEO", "optimise keywords", "build backlinks", "enhance online presence"
- DO write: "buyers searching for X cannot find this business because Y", "the website signals Z to search engines instead of W"
- The strategy must feel like a senior consultant wrote it, not a marketing report

Respond with this EXACT JSON (be specific and evidence-based in every field):
{
  "oneSentenceStrategy": "Under 30 words using business language — position [business] as more discoverable for [service] across [location] by [strategic direction]",
  "strategyConfidence": { "level": "High|Moderate|Low", "explanation": "1-2 sentences grounded in keyword demand + competition + website readiness signals" },
  "digitalVisibilityTriangle": {
    "relevance": { "score": 0-100, "evidence": "Specific sitemap/page/content evidence about how well search understands what this business does", "interpretation": "What this means for discoverability" },
    "authority": { "score": 0-100, "evidence": "DR/backlinks/citations/referring domains evidence from provided data", "interpretation": "What this means for ranking trust" },
    "trust": { "score": 0-100, "evidence": "Reviews/GBP/social proof/testimonials evidence", "interpretation": "What this means for buyer confidence" }
  },
  "discoveryPath": [
    { "stage": "Search Entry", "strength": "strong|partial|weak", "issue": "Specific bottleneck preventing this stage from working well", "impact": "Business impact of this weakness" },
    { "stage": "Visibility", "strength": "strong|partial|weak", "issue": "...", "impact": "..." },
    { "stage": "Website Experience", "strength": "strong|partial|weak", "issue": "...", "impact": "..." },
    { "stage": "Trust Signals", "strength": "strong|partial|weak", "issue": "...", "impact": "..." },
    { "stage": "Enquiry", "strength": "strong|partial|weak", "issue": "...", "impact": "..." }
  ],
  "buyerRealityGap": {
    "buyerExpects": ["3-4 things buyers expect when searching for this type of business"],
    "currentReality": ["3-4 things the current website/presence actually signals to those buyers"],
    "topGap": "The single most critical gap between buyer expectation and current reality — 1 sentence",
    "implication": "Why this gap directly costs enquiries — be specific"
  },
  "intentGaps": [
    { "category": "Service Intent", "coverage": "strong|partial|missing", "evidence": "What exists or is missing on the site to address this", "suggestedMove": "Specific recommended action" },
    { "category": "Location Intent", "coverage": "strong|partial|missing", "evidence": "...", "suggestedMove": "..." },
    { "category": "Problem/Need Intent", "coverage": "strong|partial|missing", "evidence": "...", "suggestedMove": "..." },
    { "category": "Comparison Intent", "coverage": "strong|partial|missing", "evidence": "...", "suggestedMove": "..." },
    { "category": "Decision Intent", "coverage": "strong|partial|missing", "evidence": "...", "suggestedMove": "..." }
  ],
  "momentumMoment": {
    "summary": "2-3 sentences: the demand that exists in this market, the current visibility gap, and the competitive opportunity that remains",
    "clientQuestion": "One NEPQ-style reflective question — helps the client realise: if the opportunity exists, why aren't we capturing more of it? Thoughtful, not salesy"
  },
  "growthPhases": [
    { "phase": "Phase 1 — Foundations", "months": "Month 1–3", "objective": "Specific objective for this phase", "whyMatters": "Why this phase is critical", "whatShifts": "What changes in the market/search/buyer experience", "expectedImpact": "Directional impact at end of phase" },
    { "phase": "Phase 2 — Visibility Expansion", "months": "Month 4–8", "objective": "...", "whyMatters": "...", "whatShifts": "...", "expectedImpact": "..." },
    { "phase": "Phase 3 — Market Capture", "months": "Month 9–12", "objective": "...", "whyMatters": "...", "whatShifts": "...", "expectedImpact": "..." }
  ],
  "costOfInaction": {
    "missedMonthlySearches": ${totalKwVolume > 0 ? totalKwVolume : 1000},
    "missedEnquiriesNote": "At ~2% capture rate, approximately X enquiries per month are currently going to competitors",
    "competitorNote": "1-2 sentences about how competitor advantage compounds over time if nothing changes",
    "businessImpact": "Annual revenue opportunity currently being missed — expressed in business terms"
  },
  "insightSnapshots": [
    { "headline": "Concise strategic insight headline", "metric": "Key number or finding", "explanation": "1-2 sentence strategic explanation" },
    { "headline": "...", "metric": "...", "explanation": "..." },
    { "headline": "...", "metric": "...", "explanation": "..." }
  ],
  "executiveSummary": {
    "businessName": "${businessName}",
    "location": "${location || 'Not specified'}",
    "coreServices": ["3-5 specific services from sitemap/industry"],
    "currentChallenge": "Core visibility problem in 1-2 sentences",
    "primaryGoal": "1 clear 12-month goal",
    "growthTarget": "Specific measurable growth target",
    "primaryChannels": ["relevant channels for this industry"]
  },
  "marketOpportunity": {
    "totalMonthlySearches": ${totalKwVolume > 0 ? totalKwVolume : 1200},
    "currentCapture": "Estimated current capture % based on readiness",
    "potentialCapture": "Potential capture with key fixes — include lead estimate",
    "keyInsight": "1 punchy insight the rep can use on the call",
    "keywords": [{ "keyword": "...", "monthlySearches": "...", "currentRank": "...", "opportunity": "high|medium|low", "intent": "commercial|informational" }]
  },
  "digitalAudit": {
    "website": { "score": 0-100, "strengths": ["specific strengths from sitemap"], "gaps": ["specific gaps from diagnosis data"] },
    "gbp": { "score": 0-100, "status": "found|not found", "reviews": ${reviewCount ?? 0}, "rating": ${rating ?? 0}, "strengths": ["..."], "gaps": ["..."] },
    "authority": { "score": 0-100, "socialProfiles": ${JSON.stringify(socialProfiles ? socialProfiles.split(', ') : [])}, "gaps": ["..."] }
  },
  "growthPillars": [
    { "number": 1, "title": "Industry-specific pillar title", "goal": "What this achieves", "timeframe": "Month X–X", "actions": [{ "action": "Specific action", "detail": "Why and how", "examples": ["e.g. page-slug"] }] }
  ],
  "projectedOutcomes": [
    { "month": "Month 3", "estimatedLeads": "5-10", "rankingKeywords": "3-5", "confidence": "low" },
    { "month": "Month 6", "estimatedLeads": "12-20", "rankingKeywords": "8-12", "confidence": "medium" },
    { "month": "Month 12", "estimatedLeads": "30-50", "rankingKeywords": "20-30", "confidence": "medium" }
  ],
  "kpis": [
    { "metric": "Inbound Enquiries", "baseline": "current estimate", "target12Month": "target" },
    { "metric": "Google Ranking Keywords", "baseline": "current", "target12Month": "target" },
    { "metric": "Maps Pack Appearance", "baseline": "current", "target12Month": "target" },
    { "metric": "Google Review Count", "baseline": "${reviewCount ?? 0}", "target12Month": "target" }
  ],
  "repTalkingPoints": ["3-5 evidence-grounded one-liners for the call"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const result = JSON.parse(content);

      // Compute searchEngineView server-side from sitemap + crawl data (no AI needed)
      const pageBreakdown = (() => {
        const total = pages.length;
        if (total === 0) return null;
        return {
          totalPages: total,
          servicePages: classified.services.length,
          locationPages: classified.locations.length,
          portfolioPages: classified.portfolio.length,
          otherPages: classified.other.length,
          servicePageUrls: classified.services.slice(0, 5),
          locationPageUrls: classified.locations.slice(0, 5),
          portfolioPageUrls: classified.portfolio.slice(0, 5),
        };
      })();
      if (pageBreakdown) result.searchEngineView = pageBreakdown;

      // Compute marketCaptureMap from keyword clusters server-side
      if (allKeywords.length > 0) {
        const clusters: Record<string, { volume: number; keywords: string[] }> = {};
        for (const kw of allKeywords) {
          const parts = kw.keyword.split(' ');
          const loc = parts.find((w: string) => /brisbane|sydney|melbourne|perth|adelaide|gold.coast|sunshine/i.test(w));
          const clusterKey = loc ? `${loc.charAt(0).toUpperCase() + loc.slice(1)} searches` : 'General searches';
          if (!clusters[clusterKey]) clusters[clusterKey] = { volume: 0, keywords: [] };
          clusters[clusterKey].volume += parseInt(kw.volume) || 0;
          clusters[clusterKey].keywords.push(kw.keyword);
        }
        result.marketCaptureMap = {
          totalMonthlyDemand: totalKwVolume,
          clusters: Object.entries(clusters).map(([name, data]) => ({
            name,
            volume: data.volume,
            keywordCount: data.keywords.length,
            topKeywords: data.keywords.slice(0, 3),
          })),
        };
      }

      // Override keyword data with real uploaded values — never let AI fabricate these
      if (allKeywords.length > 0 && result.marketOpportunity) {
        result.marketOpportunity.totalMonthlySearches = totalKwVolume;
        result.marketOpportunity.keywords = allKeywords.map((k: any) => ({
          keyword: k.keyword,
          monthlySearches: String(k.volume),
          currentRank: k.position > 0 ? `#${k.position}` : 'not ranking',
          opportunity: (k.difficulty || 0) < 30 ? 'high' : (k.difficulty || 0) < 60 ? 'medium' : 'low',
          intent: 'commercial',
          difficulty: k.difficulty,
          cpc: k.cpc,
        }));
      }

      res.json(result);
    } catch (err: any) {
      console.error("[twelve-month-strategy]", err);
      res.status(500).json({ error: "Failed to generate 12-month strategy" });
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

  // ============================================
  // Client Report Endpoints (shareable public URL)
  // ============================================

  // ─── AI Client Growth Engine ──────────────────────────────────────────────

  app.post("/api/ai/client-growth/account-intelligence", async (req, res) => {
    try {
      const { businessName, location, products, channelStatus, healthStatus, churnRiskScore, lastContactDate, website, totalMRR, healthReasons } = req.body;
      if (!businessName) return res.status(400).json({ error: "businessName required" });

      const servicesList = Array.isArray(products) ? products.map((p: any) => `${p.productType} ($${p.monthlyValue}/mo)`).join(', ') : 'Not specified';
      const channelStr = channelStatus ? Object.entries(channelStatus).map(([k, v]) => `${k}: ${v}`).join(', ') : 'Not specified';
      const daysSinceContact = lastContactDate ? Math.floor((Date.now() - new Date(lastContactDate).getTime()) / 86400000) : null;

      const prompt = `You are an AI account manager helping a digital marketing agency understand and grow a client account.

CLIENT DATA:
Business: ${businessName}
Location: ${location || 'Not specified'}
Website: ${website || 'Not specified'}
MRR: $${totalMRR || 0}/mo
Services: ${servicesList}
Channels: ${channelStr}
Health: ${healthStatus} (churn risk score: ${churnRiskScore || 0}/100)
Health Reasons: ${Array.isArray(healthReasons) ? healthReasons.join(', ') : 'None'}
Days Since Contact: ${daysSinceContact !== null ? daysSinceContact : 'Unknown'}

Respond with JSON in this format:
{
  "accountSummary": "2-3 sentences describing this client's business and current digital marketing situation",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "growthGaps": [
    { "title": "Gap title", "description": "Why this matters", "opportunity": "What to do about it" }
  ],
  "retentionRisks": ["risk 1", "risk 2"],
  "conversationStarter": "A natural, value-focused opening for your next client call"
}

Keep it practical and specific to their actual situation.`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 900,
        response_format: { type: "json_object" },
      });
      const content = resp.choices[0]?.message?.content || "{}";
      let result;
      try { result = JSON.parse(content); } catch { result = { accountSummary: `${businessName} is a valued client.`, strengths: [], growthGaps: [], retentionRisks: [], conversationStarter: `Hi, I wanted to check in on how things are going for ${businessName}.` }; }
      res.json(result);
    } catch (error) {
      console.error("Error generating account intelligence:", error);
      res.status(500).json({ error: "Failed to generate account intelligence" });
    }
  });

  app.post("/api/ai/client-growth/conversation-builder", async (req, res) => {
    try {
      const { businessName, location, products, healthStatus, healthReasons, totalMRR, website } = req.body;
      if (!businessName) return res.status(400).json({ error: "businessName required" });

      const servicesList = Array.isArray(products) ? products.map((p: any) => p.productType).join(', ') : 'Not specified';
      const prompt = `You are helping a digital marketing account manager prepare for a growth conversation with an existing client.

CLIENT:
Business: ${businessName}
Location: ${location || 'Not specified'}
Current Services: ${servicesList}
MRR: $${totalMRR || 0}/mo
Health Status: ${healthStatus}
Health Reasons: ${Array.isArray(healthReasons) ? healthReasons.join(', ') : 'None'}

Generate a growth expansion conversation guide. Respond with JSON:
{
  "clientGoalHypothesis": "What you believe this client's main business goal is right now",
  "smartQuestions": ["Question 1 to uncover growth needs", "Question 2", "Question 3", "Question 4"],
  "upsellAngle": "The most natural upsell or expansion pitch for this client right now",
  "expansionOpportunities": [
    { "service": "Service name", "rationale": "Why this makes sense for them", "estimatedValue": "$X/mo" }
  ]
}`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 800,
        response_format: { type: "json_object" },
      });
      const content = resp.choices[0]?.message?.content || "{}";
      let result;
      try { result = JSON.parse(content); } catch { result = { clientGoalHypothesis: "Generate more leads from digital channels", smartQuestions: ["What results have you seen so far?", "What services are you looking to grow?"], upsellAngle: "Based on your current services, expanding into additional channels could increase leads.", expansionOpportunities: [] }; }
      res.json(result);
    } catch (error) {
      console.error("Error generating conversation builder:", error);
      res.status(500).json({ error: "Failed to generate conversation builder" });
    }
  });

  app.post("/api/ai/client-growth/follow-up", async (req, res) => {
    try {
      const { businessName, contactName, notes, products } = req.body;
      if (!businessName) return res.status(400).json({ error: "businessName required" });

      const servicesList = Array.isArray(products) ? products.map((p: any) => p.productType).join(', ') : 'Not specified';
      const prompt = `You are helping a digital marketing account manager write a client follow-up communication.

CLIENT: ${businessName}
CONTACT: ${contactName || 'the business owner'}
SERVICES: ${servicesList}
CALL/MEETING NOTES: ${notes || 'Check in on account performance and discuss growth opportunities.'}

Write a professional follow-up. Respond with JSON:
{
  "email": {
    "subject": "Subject line",
    "body": "Full email body - warm, professional, value-focused. Use paragraphs. Sign off as [Your Name]."
  },
  "sms": "Short follow-up SMS (max 160 chars)",
  "keyTakeaway": "One-line summary of the main value point from this follow-up"
}`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 700,
        response_format: { type: "json_object" },
      });
      const content = resp.choices[0]?.message?.content || "{}";
      let result;
      try { result = JSON.parse(content); } catch { result = { email: { subject: `Following up — ${businessName}`, body: `Hi ${contactName || 'there'},\n\nI wanted to follow up on our recent conversation.\n\n[Your Name]` }, sms: `Hi, following up from our chat about ${businessName}. Happy to connect. - [Your Name]`, keyTakeaway: "Continue building the relationship" }; }
      res.json(result);
    } catch (error) {
      console.error("Error generating client follow-up:", error);
      res.status(500).json({ error: "Failed to generate follow-up" });
    }
  });

  app.post("/api/ai/client-growth/growth-plan", async (req, res) => {
    try {
      const { businessName, location, products, totalMRR, healthStatus, website, healthReasons } = req.body;
      if (!businessName) return res.status(400).json({ error: "businessName required" });

      const servicesList = Array.isArray(products) ? products.map((p: any) => `${p.productType} ($${p.monthlyValue}/mo)`).join(', ') : 'Not specified';
      const prompt = `You are a senior digital marketing strategist creating a growth plan for an existing client.

CLIENT:
Business: ${businessName}
Location: ${location || 'Not specified'}
Website: ${website || 'Not specified'}
Current Services: ${servicesList}
MRR: $${totalMRR || 0}/mo
Account Health: ${healthStatus}
Notes: ${Array.isArray(healthReasons) ? healthReasons.join(', ') : 'None'}

Create a structured growth plan. Respond with JSON:
{
  "thirtyDay": [
    { "action": "Action title", "why": "Why this is the priority", "impact": "Expected impact" }
  ],
  "ninetyDay": [
    { "action": "Action title", "why": "Why this", "impact": "Expected impact" }
  ],
  "twelveMonth": [
    { "quarter": "Q1", "focus": "Focus area", "goal": "Target outcome" },
    { "quarter": "Q2", "focus": "Focus area", "goal": "Target outcome" },
    { "quarter": "Q3", "focus": "Focus area", "goal": "Target outcome" },
    { "quarter": "Q4", "focus": "Focus area", "goal": "Target outcome" }
  ],
  "accountGrowthTarget": "Estimated MRR growth opportunity"
}

Keep actions specific and achievable for a marketing agency managing this account.`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" },
      });
      const content = resp.choices[0]?.message?.content || "{}";
      let result;
      try { result = JSON.parse(content); } catch { result = { thirtyDay: [], ninetyDay: [], twelveMonth: [], accountGrowthTarget: "Review services and identify expansion areas" }; }
      res.json(result);
    } catch (error) {
      console.error("Error generating client growth plan:", error);
      res.status(500).json({ error: "Failed to generate growth plan" });
    }
  });

  app.post("/api/ai/client-growth/referral-engine", async (req, res) => {
    try {
      const { businessName, location, products } = req.body;
      if (!businessName) return res.status(400).json({ error: "businessName required" });

      const servicesList = Array.isArray(products) ? products.map((p: any) => p.productType).join(', ') : 'Not specified';
      const prompt = `You are helping a digital marketing account manager identify referral opportunities from an existing satisfied client.

CLIENT:
Business: ${businessName}
Location: ${location || 'Not specified'}
Services: ${servicesList}

Identify referral partners and opportunities. Respond with JSON:
{
  "referralPartners": [
    { "partnerType": "Type of business", "why": "Why they'd be a good referral source", "introScript": "How to ask this client for the referral" }
  ],
  "referralAsk": "A natural, non-pushy way to ask this client for referrals on your next call",
  "incentiveIdea": "A simple incentive or offer to encourage referrals"
}

Make it specific to their industry and location.`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 700,
        response_format: { type: "json_object" },
      });
      const content = resp.choices[0]?.message?.content || "{}";
      let result;
      try { result = JSON.parse(content); } catch { result = { referralPartners: [], referralAsk: `Would you know of any other businesses that might benefit from what we do for you?`, incentiveIdea: "Offer a month's service credit for any successful referral" }; }
      res.json(result);
    } catch (error) {
      console.error("Error generating referral engine:", error);
      res.status(500).json({ error: "Failed to generate referral engine" });
    }
  });

  // Create a report (authenticated)
  app.post("/api/reports", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorised" });

      const token = authHeader.split(' ')[1];
      let uid: string;
      try {
        const adminModule = (await import('./firebase')).default;
        const decoded = await adminModule.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const reportData = req.body;
      if (!reportData.clientName || !reportData.orgId) {
        return res.status(400).json({ error: "clientName and orgId are required" });
      }

      const reportRef = firestore.collection('reports').doc();
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 365);

      await reportRef.set({
        ...reportData,
        id: reportRef.id,
        createdAt: now,
        createdBy: uid,
        expiresAt,
      });

      res.json({ id: reportRef.id, url: `/report/${reportRef.id}` });
    } catch (error) {
      console.error("Error creating report:", error);
      res.status(500).json({ error: "Failed to create report" });
    }
  });

  // Get a report by ID (public, no auth required)
  app.get("/api/reports/:reportId", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });

      const { reportId } = req.params;
      const reportDoc = await firestore.collection('reports').doc(reportId).get();

      if (!reportDoc.exists) {
        return res.status(404).json({ error: "Report not found" });
      }

      const data = reportDoc.data()!;
      const now = new Date();
      if (data.expiresAt && data.expiresAt.toDate() < now) {
        return res.status(410).json({ error: "Report has expired" });
      }

      res.json({ ...data, id: reportDoc.id });
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // List reports for a client (authenticated)
  app.get("/api/reports/client/:clientId", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });

      const { clientId } = req.params;
      const snapshot = await firestore.collection('reports')
        .where('clientId', '==', clientId)
        .limit(20)
        .get();

      const reports = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 10);
      res.json(reports);
    } catch (error) {
      console.error("Error listing reports:", error);
      res.status(500).json({ error: "Failed to list reports" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Strategy Reports — prospect-facing 12-month strategy landing pages
  // ──────────────────────────────────────────────────────────────────────────

  function generateSlug(businessName: string): string {
    return businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-growth-plan';
  }

  async function findUniqueSlug(fs: FirebaseFirestore.Firestore, baseSlug: string, orgId: string, excludeId?: string): Promise<string> {
    let slug = baseSlug;
    let attempt = 1;
    while (true) {
      const q = await fs.collection('strategyReports')
        .where('publicSlug', '==', slug)
        .where('orgId', '==', orgId)
        .limit(1).get();
      const conflict = q.docs.find(d => d.id !== excludeId);
      if (!conflict) return slug;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }
  }

  app.post("/api/strategy-reports", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorised" });
      const token = authHeader.split(' ')[1];
      let uid: string;
      try {
        const adminModule = (await import('./firebase')).default;
        const decoded = await adminModule.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }
      const reportData = req.body;
      if (!reportData.businessName) return res.status(400).json({ error: "businessName required" });
      const orgId = reportData.orgId || uid;
      const baseSlug = generateSlug(reportData.businessName);
      const publicSlug = await findUniqueSlug(firestore, baseSlug, orgId);
      const ref = firestore.collection('strategyReports').doc();
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 365);
      await ref.set({ ...reportData, id: ref.id, publicSlug, orgId, type: 'strategy', createdAt: now, createdBy: uid, expiresAt });
      res.json({ id: ref.id, publicSlug, url: `/strategy/${ref.id}` });
    } catch (err) {
      console.error("[strategy-reports POST]", err);
      res.status(500).json({ error: "Failed to create strategy report" });
    }
  });

  // Check slug availability (must come before /:reportId)
  app.get("/api/strategy-reports/check-slug", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });
      const { slug, orgId, excludeId } = req.query as Record<string, string>;
      if (!slug || !orgId) return res.status(400).json({ error: "slug and orgId required" });
      const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!clean) return res.json({ available: false, slug: clean });
      const q = await firestore.collection('strategyReports')
        .where('publicSlug', '==', clean).where('orgId', '==', orgId).limit(1).get();
      const conflict = q.docs.find(d => d.id !== excludeId);
      res.json({ available: !conflict, slug: clean });
    } catch (err) {
      console.error("[check-slug]", err);
      res.status(500).json({ error: "Check failed" });
    }
  });

  // Resolve by publicSlug (must come before /:reportId)
  app.get("/api/strategy-reports/by-slug/:slug", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });
      const { slug } = req.params;
      const { orgId } = req.query as { orgId?: string };
      let q;
      if (orgId) {
        q = await firestore.collection('strategyReports')
          .where('publicSlug', '==', slug).where('orgId', '==', orgId).limit(1).get();
      } else {
        q = await firestore.collection('strategyReports')
          .where('publicSlug', '==', slug).limit(1).get();
      }
      if (q.empty) return res.status(404).json({ error: "Strategy not found" });
      const doc = q.docs[0];
      const data = doc.data();
      if (data.expiresAt && data.expiresAt.toDate() < new Date()) return res.status(410).json({ error: "Strategy has expired" });
      res.json({ ...data, id: doc.id });
    } catch (err) {
      console.error("[by-slug]", err);
      res.status(500).json({ error: "Failed to resolve slug" });
    }
  });

  // Update publicSlug for an existing report
  app.put("/api/strategy-reports/:reportId/slug", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: "Unauthorised" });
      const token = authHeader.split(' ')[1];
      try {
        const adminModule = (await import('./firebase')).default;
        await adminModule.auth().verifyIdToken(token);
      } catch { return res.status(401).json({ error: "Invalid token" }); }
      const { reportId } = req.params;
      const { slug } = req.body as { slug: string };
      if (!slug) return res.status(400).json({ error: "slug required" });
      const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!clean) return res.status(400).json({ error: "Invalid slug" });
      const doc = await firestore.collection('strategyReports').doc(reportId).get();
      if (!doc.exists) return res.status(404).json({ error: "Report not found" });
      const orgId = doc.data()!.orgId || '';
      const uniqueSlug = await findUniqueSlug(firestore, clean, orgId, reportId);
      await firestore.collection('strategyReports').doc(reportId).update({ publicSlug: uniqueSlug });
      res.json({ publicSlug: uniqueSlug });
    } catch (err) {
      console.error("[update-slug]", err);
      res.status(500).json({ error: "Failed to update slug" });
    }
  });

  // AI-generated prospect follow-up email
  app.post("/api/ai/strategy-email", async (req, res) => {
    try {
      const { businessName, industry, location, website, repName, repEmail,
        strategyDiagnosis, strategy, conversationNotes, servicesDiscussed,
        painPoints, strategyUrl } = req.body as Record<string, any>;

      const diagnosis = strategyDiagnosis || {};
      const readinessScore = diagnosis.readinessScore ?? null;
      const insightSentence = diagnosis.insightSentence || '';
      const gaps = (diagnosis.gaps || []).slice(0, 3)
        .map((g: any) => `- ${g.title || g.gap}: ${g.evidence || g.detail || ''}`)
        .join('\n');
      const currentPosition = diagnosis.currentPosition?.summary || '';
      const growthPotential = diagnosis.growthPotential?.summary || '';
      const execSummary = strategy?.executiveSummary?.summary || strategy?.executiveSummary?.headline || '';
      const pillars = (strategy?.growthPillars || []).slice(0, 3)
        .map((p: any) => p.pillar || p.title || '').filter(Boolean).join(', ');

      const prompt = `You are a senior digital marketing consultant writing a follow-up email to a business owner after a discovery call. Style: NEPQ problem-focused + Chris Voss calm authority. Never pushy, no hype.

CONTEXT:
- Business: ${businessName || 'Not specified'}
- Industry: ${industry || 'Not specified'}
- Location: ${location || 'Not specified'}
- Website: ${website || 'Not specified'}
${readinessScore !== null ? `- Growth Readiness Score: ${readinessScore}/100` : ''}
${insightSentence ? `- Key Insight: ${insightSentence}` : ''}
${currentPosition ? `- Current Position: ${currentPosition}` : ''}
${growthPotential ? `- Growth Potential: ${growthPotential}` : ''}
${gaps ? `\nGAPS FOUND:\n${gaps}` : ''}
${conversationNotes ? `\nCONVERSATION NOTES:\n${conversationNotes}` : ''}
${servicesDiscussed ? `SERVICES DISCUSSED: ${servicesDiscussed}` : ''}
${painPoints ? `PAIN POINTS: ${painPoints}` : ''}
${execSummary ? `STRATEGY SUMMARY: ${execSummary}` : ''}
${pillars ? `GROWTH PILLARS: ${pillars}` : ''}
STRATEGY PAGE: ${strategyUrl}
REP: ${repName || 'Your consultant'} ${repEmail ? `<${repEmail}>` : ''}

EMAIL STRUCTURE (follow in order):
1. Open acknowledging the conversation — reference something specific
2. Reflect their goals back — show you understood what they actually want
3. Share one key insight about their online presence — specific, data-grounded
4. Frame cost of inaction — what staying the same means for their business
5. Introduce the strategy page link — not a sales pitch, frame as a resource they can review
6. Close with ONE Voss-style open question ("What would it mean for your business if...?")

RULES:
- No exclamation marks. No "excited to share". No "game-changing". No pressure language.
- Under 250 words. Plain text paragraphs. No bullet points in the email body.
- Use first name if inferable, otherwise business name.

Return JSON:
{
  "subject": "specific subject line referencing their business or a real observation",
  "firstName": "name used in greeting",
  "body": "full email body — plain text, paragraphs separated by \\n\\n, include the strategy URL in-line"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You write consultative, NEPQ-influenced follow-up emails for a digital marketing agency. Specific, human, never generic.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content || '{}';
      res.json(JSON.parse(content));
    } catch (err) {
      console.error("[strategy-email]", err);
      res.status(500).json({ error: "Failed to generate email" });
    }
  });

  app.get("/api/strategy-reports/:reportId", async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: "Firestore not available" });
      const { reportId } = req.params;
      const doc = await firestore.collection('strategyReports').doc(reportId).get();
      if (!doc.exists) return res.status(404).json({ error: "Report not found" });
      const data = doc.data()!;
      if (data.expiresAt && data.expiresAt.toDate() < new Date()) return res.status(410).json({ error: "Report has expired" });
      res.json({ ...data, id: doc.id });
    } catch (err) {
      console.error("[strategy-reports GET]", err);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // ============================================
  // Google Business Profile (GBP) OAuth + API
  // ============================================

  const GBP_SCOPES = 'https://www.googleapis.com/auth/business.manage';

  // Helper: derive the redirect URI from the current request — supports custom domains
  function getGBPRedirectUri(req: any): string {
    // Prefer an explicit env var override (set this in production if needed)
    if (process.env.GBP_REDIRECT_URI) return process.env.GBP_REDIRECT_URI;
    // Otherwise derive from the incoming request host
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || (req.secure ? 'https' : 'https');
    const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host || '';
    return `${proto}://${host}/api/gbp/callback`;
  }

  // Helper: get or refresh an access token for an org
  async function getGBPAccessToken(orgId: string): Promise<string> {
    if (!firestore) throw new Error('Firestore not available');
    const docRef = firestore.collection('orgs').doc(orgId).collection('settings').doc('gbp');
    const snap = await docRef.get();
    if (!snap.exists) throw new Error('GBP not connected for this org');
    const data = snap.data()!;
    if (!data.refreshToken) throw new Error('No refresh token');
    // Return existing access token if still valid
    if (data.accessToken && data.tokenExpiry && data.tokenExpiry > Date.now() + 60_000) {
      return data.accessToken;
    }
    // Refresh it
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_GBP_CLIENT_ID!,
        client_secret: process.env.GOOGLE_GBP_CLIENT_SECRET!,
        refresh_token: data.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const tokens = await r.json();
    if (tokens.error) throw new Error(`Token refresh failed: ${tokens.error_description || tokens.error}`);
    await docRef.update({
      accessToken: tokens.access_token,
      tokenExpiry: Date.now() + (tokens.expires_in || 3600) * 1000,
    });
    return tokens.access_token;
  }

  // Helper: GBP v4 API needs accounts/{id}/locations/{id}; Business Info API returns just locations/{id}.
  async function resolveV4LocationName(locationName: string, token: string): Promise<string> {
    if (locationName.startsWith('accounts/')) return locationName;
    const acctResp = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const acctData = await acctResp.json();
    const accounts: { name: string }[] = acctData.accounts || [];
    if (accounts.length === 0) throw new Error('No GBP accounts found');
    const locId = locationName.replace(/^locations\//, '');
    return `${accounts[0].name}/locations/${locId}`;
  }

  // Check whether GBP OAuth credentials are configured server-side
  app.get('/api/gbp/credentials-check', (req, res) => {
    const hasCredentials = !!(process.env.GOOGLE_GBP_CLIENT_ID && process.env.GOOGLE_GBP_CLIENT_SECRET);
    const redirectUri = getGBPRedirectUri(req);
    res.json({ hasCredentials, redirectUri });
  });

  // Initiate GBP OAuth — redirect to Google
  app.get('/api/gbp/connect', (req, res) => {
    const orgId = req.query.orgId as string;
    if (!orgId) return res.status(400).send('orgId required');
    if (!process.env.GOOGLE_GBP_CLIENT_ID || !process.env.GOOGLE_GBP_CLIENT_SECRET) {
      return res.redirect('/settings?tab=integrations&gbp=error&reason=credentials_not_configured');
    }
    const redirectUri = getGBPRedirectUri(req);
    // Store redirectUri in state so callback uses the exact same value
    const state = Buffer.from(JSON.stringify({ orgId, redirectUri })).toString('base64');
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_GBP_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GBP_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // GBP OAuth callback
  app.get('/api/gbp/callback', async (req, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;
      if (error) return res.redirect(`/settings?tab=integrations&gbp=error&reason=${encodeURIComponent(error)}`);
      if (!code || !state) return res.redirect('/settings?tab=integrations&gbp=error&reason=missing_params');
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
      const { orgId } = parsed;
      // Use the exact redirect URI that was used in the auth request (stored in state)
      const redirectUri = parsed.redirectUri || getGBPRedirectUri(req);
      // Exchange code for tokens
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_GBP_CLIENT_ID!,
          client_secret: process.env.GOOGLE_GBP_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });
      const tokens = await r.json();
      if (tokens.error || !tokens.refresh_token) {
        console.error('[GBP callback] token error:', tokens);
        return res.redirect(`/settings?tab=integrations&gbp=error&reason=${encodeURIComponent(tokens.error_description || tokens.error || 'no_refresh_token')}`);
      }
      if (!firestore) return res.redirect('/settings?tab=integrations&gbp=error&reason=no_firestore');
      // Save tokens to Firestore
      await firestore.collection('orgs').doc(orgId).collection('settings').doc('gbp').set({
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        tokenExpiry: Date.now() + (tokens.expires_in || 3600) * 1000,
        connectedAt: new Date().toISOString(),
        redirectUri,
      }, { merge: true });
      res.redirect('/settings?tab=integrations&gbp=connected');
    } catch (err: any) {
      console.error('[GBP callback]', err);
      res.redirect(`/settings?tab=integrations&gbp=error&reason=${encodeURIComponent(err.message)}`);
    }
  });

  // Check GBP connection status
  app.get('/api/gbp/status', async (req, res) => {
    try {
      if (!firestore) return res.json({ connected: false });
      const orgId = req.query.orgId as string;
      if (!orgId) return res.status(400).json({ error: 'orgId required' });
      const snap = await firestore.collection('orgs').doc(orgId).collection('settings').doc('gbp').get();
      if (!snap.exists || !snap.data()?.refreshToken) return res.json({ connected: false });
      res.json({ connected: true, connectedAt: snap.data()?.connectedAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Disconnect GBP
  app.post('/api/gbp/disconnect', async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: 'Firestore not available' });
      const { orgId } = req.body;
      if (!orgId) return res.status(400).json({ error: 'orgId required' });
      await firestore.collection('orgs').doc(orgId).collection('settings').doc('gbp').delete();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List GBP accounts
  app.get('/api/gbp/accounts', async (req, res) => {
    try {
      const orgId = req.query.orgId as string;
      if (!orgId) return res.status(400).json({ error: 'orgId required' });
      const token = await getGBPAccessToken(orgId);
      const r = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'GBP API error');
      res.json(data);
    } catch (err: any) {
      console.error('[gbp/accounts]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Auto-detect best matching GBP location for a business name across all accounts
  app.get('/api/gbp/auto-detect', async (req, res) => {
    try {
      const { orgId, businessName } = req.query as Record<string, string>;
      if (!orgId || !businessName) return res.status(400).json({ error: 'orgId and businessName required' });
      const token = await getGBPAccessToken(orgId);

      // 1. Fetch accounts
      const acctResp = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const acctData = await acctResp.json();
      if (!acctResp.ok) throw new Error(acctData.error?.message || 'Failed to fetch accounts');
      const accounts: { name: string }[] = acctData.accounts || [];

      const needle = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 2. Fetch locations for each account and find best match
      for (const acct of accounts) {
        const locResp = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title,phoneNumbers,websiteUri,metadata&pageSize=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const locData = await locResp.json();
        const locations: { name: string; title: string; metadata?: { mapsUri?: string } }[] = locData.locations || [];

        // Exact match first, then fuzzy
        let match = locations.find(l => l.title.toLowerCase().replace(/[^a-z0-9]/g, '') === needle);
        if (!match) match = locations.find(l => l.title.toLowerCase().replace(/[^a-z0-9]/g, '').includes(needle));
        if (!match) match = locations.find(l => needle.includes(l.title.toLowerCase().replace(/[^a-z0-9]/g, '')));

        if (match) {
          return res.json({ found: true, locationName: match.name, title: match.title, mapsUri: match.metadata?.mapsUri });
        }
      }

      // 3. If no match, return first location as suggestion
      for (const acct of accounts) {
        const locResp = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title,metadata&pageSize=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const locData = await locResp.json();
        const locations: { name: string; title: string; metadata?: { mapsUri?: string } }[] = locData.locations || [];
        if (locations.length > 0) {
          return res.json({ found: false, suggestion: { locationName: locations[0].name, title: locations[0].title }, allLocations: locations.map(l => ({ locationName: l.name, title: l.title })) });
        }
      }

      res.json({ found: false });
    } catch (err: any) {
      console.error('[gbp/auto-detect]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // List GBP locations for an account
  app.get('/api/gbp/locations', async (req, res) => {
    try {
      const { orgId, accountName } = req.query as Record<string, string>;
      if (!orgId || !accountName) return res.status(400).json({ error: 'orgId and accountName required' });
      const token = await getGBPAccessToken(orgId);
      const readMask = 'name,title,phoneNumbers,websiteUri,metadata,profile';
      const r = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=${encodeURIComponent(readMask)}&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'GBP API error');
      res.json(data);
    } catch (err: any) {
      console.error('[gbp/locations]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get GBP reviews for a location
  app.get('/api/gbp/reviews', async (req, res) => {
    try {
      const { orgId, locationName } = req.query as Record<string, string>;
      if (!orgId || !locationName) return res.status(400).json({ error: 'orgId and locationName required' });
      const token = await getGBPAccessToken(orgId);

      // v4 API requires accounts/{accountId}/locations/{locationId} format
      const fullLocationName = await resolveV4LocationName(locationName, token);

      const r = await fetch(
        `https://mybusiness.googleapis.com/v4/${fullLocationName}/reviews?pageSize=50&orderBy=updateTime%20desc`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'GBP API error');
      res.json(data);
    } catch (err: any) {
      console.error('[gbp/reviews]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GBP Performance Insights (last 30 days)
  app.get('/api/gbp/insights', async (req, res) => {
    try {
      const { orgId, locationName } = req.query as Record<string, string>;
      if (!orgId || !locationName) return res.status(400).json({ error: 'orgId and locationName required' });
      const token = await getGBPAccessToken(orgId);

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);

      const metrics = [
        'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS',
        'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
        'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
        'BUSINESS_BOOKINGS',
      ];
      const metricsParam = metrics.map(m => `dailyMetrics=${m}`).join('&');
      const dateParam = `dailyRange.startDate.year=${start.getFullYear()}&dailyRange.startDate.month=${start.getMonth() + 1}&dailyRange.startDate.day=${start.getDate()}&dailyRange.endDate.year=${end.getFullYear()}&dailyRange.endDate.month=${end.getMonth() + 1}&dailyRange.endDate.day=${end.getDate()}`;
      const url = `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${metricsParam}&${dateParam}`;

      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'Insights API error');

      // Aggregate each metric into a single total
      const totals: Record<string, number> = {};
      for (const series of (data.multiDailyMetricTimeSeries || [])) {
        for (const ts of (series.dailyMetricTimeSeries || [])) {
          const metric = ts.dailyMetric as string;
          let sum = 0;
          for (const pt of (ts.timeSeries?.datedValues || [])) {
            sum += (pt.value != null ? Number(pt.value) : 0);
          }
          totals[metric] = (totals[metric] || 0) + sum;
        }
      }

      const phoneCalls = totals['CALL_CLICKS'] || 0;
      const websiteClicks = totals['WEBSITE_CLICKS'] || 0;
      const directionRequests = totals['BUSINESS_DIRECTION_REQUESTS'] || 0;
      const bookingClicks = totals['BUSINESS_BOOKINGS'] || 0;
      const searchImpressions = (totals['BUSINESS_IMPRESSIONS_DESKTOP_SEARCH'] || 0) + (totals['BUSINESS_IMPRESSIONS_MOBILE_SEARCH'] || 0);
      const mapsImpressions = (totals['BUSINESS_IMPRESSIONS_DESKTOP_MAPS'] || 0) + (totals['BUSINESS_IMPRESSIONS_MOBILE_MAPS'] || 0);
      const totalInteractions = phoneCalls + websiteClicks + directionRequests + bookingClicks;

      res.json({ phoneCalls, websiteClicks, directionRequests, bookingClicks, searchImpressions, mapsImpressions, totalInteractions, periodDays: 30 });
    } catch (err: any) {
      console.error('[gbp/insights]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Reply to a GBP review
  app.put('/api/gbp/reviews/:locationName/reply', async (req, res) => {
    try {
      const { orgId, reviewId, comment } = req.body;
      const locationName = decodeURIComponent(req.params.locationName);
      if (!orgId || !reviewId || !comment) return res.status(400).json({ error: 'orgId, reviewId, comment required' });
      const token = await getGBPAccessToken(orgId);
      const fullLocationName = await resolveV4LocationName(locationName, token);
      const r = await fetch(
        `https://mybusiness.googleapis.com/v4/${fullLocationName}/reviews/${reviewId}/reply`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment }),
        }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'Reply failed');
      res.json(data);
    } catch (err: any) {
      console.error('[gbp/reply]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // AI-suggest a GBP review reply (SEO-optimised with local keywords)
  app.post('/api/gbp/suggest-reply', async (req, res) => {
    try {
      const { reviewerName, starRating, reviewText, businessName, businessCategory, serviceAreaSummary } = req.body;
      const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[starRating as string] ?? 5;
      const prompt = `You are an expert local SEO strategist. Write a professional, warm, and genuine Google Business Profile review reply for the business owner.

Business: ${businessName || 'this business'}
Category: ${businessCategory || 'local service business'}
Service areas: ${serviceAreaSummary || 'local area'}
Reviewer: ${reviewerName}
Star rating: ${stars}/5
Review text: "${reviewText || '(no comment left)'}"

Guidelines:
- Reply as the business owner in first person
- Acknowledge the specific details mentioned in the review naturally (don't be generic)
- Weave in 1-2 local SEO keywords naturally (e.g. "${businessCategory || 'service'} ${serviceAreaSummary || 'Brisbane'}" or similar location+service phrases) — they must sound natural, not forced
- For 4-5 star reviews: thank them warmly, reference specifics, invite them back
- For 1-3 star reviews: apologise sincerely, address the concern, offer to resolve it
- Keep it 3-5 sentences — concise and professional
- Do NOT use templated phrases like "We value your feedback" or "Thank you for your review"
- End with an invitation to return or contact them

Return ONLY the reply text. No quotes, no labels, no explanation.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      });
      const suggestion = completion.choices[0]?.message?.content?.trim() || '';
      res.json({ suggestion });
    } catch (err: any) {
      console.error('[gbp/suggest-reply]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Save GBP location link on a client
  app.patch('/api/clients/:clientId/gbp-location', async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: 'Firestore not available' });
      const { clientId } = req.params;
      const { orgId, gbpLocationName } = req.body;
      if (!orgId) return res.status(400).json({ error: 'orgId required' });
      await firestore.collection('orgs').doc(orgId).collection('clients').doc(clientId).update({ gbpLocationName: gbpLocationName || null });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[clients/gbp-location]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch a full GBP location snapshot (category, description, services, service area, reviews summary)
  app.get('/api/gbp/location-snapshot', async (req, res) => {
    try {
      const { orgId, locationName } = req.query as Record<string, string>;
      if (!orgId || !locationName) return res.status(400).json({ error: 'orgId and locationName required' });
      const token = await getGBPAccessToken(orgId);

      const readMask = [
        'name', 'title', 'primaryCategory', 'additionalCategories',
        'profile', 'serviceArea', 'serviceItems',
        'regularHours', 'phoneNumbers', 'websiteUri', 'metadata',
      ].join(',');

      const [locResp, reviewResp] = await Promise.all([
        fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=${encodeURIComponent(readMask)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        fetch(
          `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).catch(() => null),
      ]);

      const loc = await locResp.json();
      if (!locResp.ok) throw new Error(loc.error?.message || 'GBP location fetch failed');

      let reviewSummary: { avgRating: number; totalCount: number } | null = null;
      if (reviewResp?.ok) {
        const rv = await reviewResp.json();
        const reviews: any[] = rv.reviews || [];
        if (reviews.length) {
          const avg = reviews.reduce((s: number, r: any) => {
            const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
            return s + (map[r.starRating] ?? 0);
          }, 0) / reviews.length;
          reviewSummary = { avgRating: Math.round(avg * 10) / 10, totalCount: rv.totalReviewCount || reviews.length };
        }
      }

      // Extract service area suburb names
      const serviceAreaRegions: string[] = [];
      const sa = loc.serviceArea;
      if (sa?.places?.placeInfos) {
        sa.places.placeInfos.forEach((p: any) => { if (p.placeName) serviceAreaRegions.push(p.placeName); });
      }

      // Extract services
      const services: string[] = (loc.serviceItems || []).map((si: any) =>
        si.structuredServiceItem?.displayName || si.freeFormServiceItem?.label?.displayName || ''
      ).filter(Boolean);

      const snapshot = {
        category: loc.primaryCategory?.displayName || null,
        categoryId: loc.primaryCategory?.name || null,
        additionalCategories: (loc.additionalCategories || []).map((c: any) => c.displayName),
        description: loc.profile?.description || null,
        descriptionLength: (loc.profile?.description || '').length,
        services,
        serviceAreaRegions,
        reviewSummary,
        hasWebsite: !!loc.websiteUri,
        websiteUri: loc.websiteUri || null,
        hasPhone: !!(loc.phoneNumbers?.primaryPhone),
        phone: loc.phoneNumbers?.primaryPhone || null,
        title: loc.title || null,
      };

      res.json(snapshot);
    } catch (err: any) {
      console.error('[gbp/location-snapshot]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Google Places API fallback lookup — uses existing GOOGLE_PLACES_API_KEY
  // Returns partial GBP snapshot (rating, reviews, category, website) without GBP OAuth
  app.get('/api/gbp/places-lookup', async (req, res) => {
    try {
      const { businessName, address } = req.query as Record<string, string>;
      if (!businessName) return res.status(400).json({ error: 'businessName required' });
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY not configured' });

      const query = address ? `${businessName} ${address}` : businessName;
      const searchResp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.types,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,places.primaryType',
        },
        body: JSON.stringify({ textQuery: query, languageCode: 'en', regionCode: 'AU', maxResultCount: 1 }),
      });
      if (!searchResp.ok) {
        const e = await searchResp.json();
        throw new Error(e.error?.message || 'Places API error');
      }
      const { places } = await searchResp.json();
      if (!places || !places.length) return res.json({ found: false });

      const p = places[0];
      const primaryType = p.primaryType || (p.types?.[0] ?? null);
      // Convert snake_case type to human-readable: "crane_service" → "Crane Service"
      const categoryLabel = primaryType ? primaryType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null;

      res.json({
        found: true,
        title: p.displayName?.text || businessName,
        category: categoryLabel,
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? null,
        hasWebsite: !!p.websiteUri,
        websiteUri: p.websiteUri || null,
        hasPhone: !!p.nationalPhoneNumber,
        phone: p.nationalPhoneNumber || null,
        formattedAddress: p.formattedAddress || null,
        source: 'google_places',
      });
    } catch (err: any) {
      console.error('[gbp/places-lookup]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // Nominatim Proxy (suburb search + reverse geocode)
  // ============================================

  const NOMINATIM_HEADERS = {
    'User-Agent': 'MomentumAgent/1.0 (momentum@battlescore.com.au)',
    'Accept-Language': 'en',
  };

  app.get('/api/nominatim/search', async (req, res) => {
    try {
      const { q, polygon_geojson, limit, addressdetails } = req.query as Record<string, string>;
      if (!q) return res.status(400).json({ error: 'q required' });
      const query = q.toLowerCase().includes('australia') ? q : `${q}, Australia`;
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('polygon_geojson', polygon_geojson || '1');
      url.searchParams.set('limit', limit || '10');
      url.searchParams.set('addressdetails', addressdetails || '1');
      const r = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
      if (!r.ok) return res.status(r.status).json({ error: 'Nominatim error' });
      res.json(await r.json());
    } catch (err: any) {
      console.error('[nominatim/search]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/nominatim/reverse', async (req, res) => {
    try {
      const { lat, lon, zoom } = req.query as Record<string, string>;
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('lat', lat);
      url.searchParams.set('lon', lon);
      url.searchParams.set('format', 'json');
      url.searchParams.set('zoom', zoom || '13');
      url.searchParams.set('addressdetails', '1');
      const r = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
      if (!r.ok) return res.status(r.status).json({ error: 'Nominatim error' });
      res.json(await r.json());
    } catch (err: any) {
      console.error('[nominatim/reverse]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // Local Falcon — GBP Rank Tracking
  // ============================================

  const LOCAL_FALCON_BASE = 'https://api.localfalcon.com';

  async function localFalconPost(path: string, body: Record<string, string | number>) {
    const apiKey = process.env.LOCAL_FALCON_API_KEY;
    if (!apiKey) throw new Error('LOCAL_FALCON_API_KEY not set');
    const params = new URLSearchParams({ api_key: apiKey, ...Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])) });
    const resp = await fetch(`${LOCAL_FALCON_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`[localFalconPost] ${path} → ${resp.status}:`, errText);
      let detail = '';
      try { detail = JSON.parse(errText)?.message || JSON.parse(errText)?.error || errText; } catch { detail = errText; }
      throw new Error(`Local Falcon API error: ${resp.status}${detail ? ' — ' + detail : ''}`);
    }
    return resp.json();
  }

  // List all connected locations in Local Falcon account
  app.get('/api/local-falcon/locations', async (req, res) => {
    try {
      const query = req.query.query as string || '';
      const data = await localFalconPost('/v1/locations/', { limit: 100, ...(query ? { query } : {}) });
      res.json(data);
    } catch (err: any) {
      console.error('[local-falcon/locations]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Search for a business by name via Google Places (fallback when no LF locations exist)
  app.get('/api/local-falcon/search-place', async (req, res) => {
    try {
      const { query } = req.query as Record<string, string>;
      if (!query || query.trim().length < 2) return res.json({ places: [] });
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'GOOGLE_PLACES_API_KEY not set' });
      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({ textQuery: query, languageCode: 'en' }),
      });
      if (!resp.ok) throw new Error(`Google Places error: ${resp.status}`);
      const data = await resp.json();
      const places = (data.places || []).slice(0, 8).map((p: any) => ({
        id: p.id,
        place_id: p.id,
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        lat: p.location?.latitude || 0,
        lng: p.location?.longitude || 0,
        rating: p.rating ? String(p.rating) : '0',
        reviews: p.userRatingCount || 0,
      }));
      res.json({ places });
    } catch (err: any) {
      console.error('[local-falcon/search-place]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // List scan reports for a specific place_id
  app.get('/api/local-falcon/reports', async (req, res) => {
    try {
      const { placeId, limit = '10' } = req.query as Record<string, string>;
      if (!placeId) return res.status(400).json({ error: 'placeId required' });
      const data = await localFalconPost('/v1/reports/', { limit: parseInt(limit), place_id: placeId, platform: 'google' });
      res.json(data);
    } catch (err: any) {
      console.error('[local-falcon/reports]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get a single report with full grid data
  app.get('/api/local-falcon/reports/:reportKey', async (req, res) => {
    try {
      const { reportKey } = req.params;
      const apiKey = process.env.LOCAL_FALCON_API_KEY;
      if (!apiKey) return res.status(503).json({ error: 'LOCAL_FALCON_API_KEY not set' });
      const params = new URLSearchParams({ api_key: apiKey, report_key: reportKey });
      const resp = await fetch(`${LOCAL_FALCON_BASE}/v1/reports/${reportKey}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!resp.ok) throw new Error(`Local Falcon API error: ${resp.status}`);
      res.json(await resp.json());
    } catch (err: any) {
      console.error('[local-falcon/reports/single]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Run a new scan
  app.post('/api/local-falcon/run-scan', async (req, res) => {
    try {
      const { placeId, keyword, lat, lng, gridSize = '7', radius = '3', measurement = 'km', businessName = '' } = req.body;
      if (!placeId || !keyword || !lat || !lng) return res.status(400).json({ error: 'placeId, keyword, lat, lng required' });

      const scanPayload = {
        place_id: placeId,
        keyword,
        lat,
        lng,
        grid_size: parseInt(String(gridSize), 10) || 7,
        radius: parseFloat(String(radius)) || 3,
        measurement,
      };

      // Try scan — if the location isn't saved in Local Falcon yet, add it first then retry
      try {
        const data = await localFalconPost('/v2/run-scan/', scanPayload);
        return res.json(data);
      } catch (firstErr: any) {
        const msg = (firstErr.message || '').toLowerCase();
        const isNotSaved = msg.includes("hasn't been added") || msg.includes('not been added') || msg.includes('saved locations') || msg.includes('not found') || msg.includes('invalid location');
        if (!isNotSaved) throw firstErr; // unrelated error — propagate

        // Location not in Local Falcon — attempt to add it then retry
        console.log('[local-falcon/run-scan] Location not in saved locations — adding place_id:', placeId);
        try {
          const addPayload: Record<string, string | number> = { place_id: placeId };
          if (businessName) addPayload.label = String(businessName).slice(0, 80);
          await localFalconPost('/v1/locations/add/', addPayload);
          console.log('[local-falcon/run-scan] Location added — waiting 4s before retry scan...');
        } catch (addErr: any) {
          console.error('[local-falcon/run-scan] Failed to add location:', addErr.message);
          return res.status(400).json({
            error: `This business hasn't been added to your Local Falcon account yet. Go to localfalcon.com, add "${businessName || placeId}", then try scanning again.`
          });
        }

        // Wait for Local Falcon to process the newly added location
        await new Promise(r => setTimeout(r, 4000));

        try {
          const data = await localFalconPost('/v2/run-scan/', scanPayload);
          return res.json(data);
        } catch (retryErr: any) {
          console.error('[local-falcon/run-scan] Retry scan failed after add:', retryErr.message);
          return res.status(400).json({
            error: `Location was added to Local Falcon but the scan still failed. Please wait a moment and try again. (${retryErr.message})`
          });
        }
      }
    } catch (err: any) {
      console.error('[local-falcon/run-scan]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Save/update localFalconPlaceId on a client
  app.patch('/api/clients/:clientId/local-falcon-place', async (req, res) => {
    try {
      if (!firestore) return res.status(503).json({ error: 'Firestore not available' });
      const { clientId } = req.params;
      const { orgId, localFalconPlaceId } = req.body;
      if (!orgId) return res.status(400).json({ error: 'orgId required' });
      await firestore.collection('orgs').doc(orgId).collection('clients').doc(clientId).update({ localFalconPlaceId: localFalconPlaceId || null });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[clients/local-falcon-place]', err);
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
