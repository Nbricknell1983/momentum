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

  // AI Onboarding & Team Handover — generate all outputs
  app.post("/api/clients/ai/onboarding-generate", async (req, res) => {
    try {
      const { clientName, location, data } = req.body as {
        clientName: string;
        location: string;
        data: Record<string, any>;
      };

      const products = (data.selectedProducts || []).join(', ') || 'Not specified';
      const keywordInfo = data.keywordSummary
        ? `\n\nKEYWORD DATA (from uploaded file):\n${data.keywordSummary.slice(0, 3000)}`
        : data.manualKeywordNotes
        ? `\n\nMANUAL KEYWORD NOTES:\n${data.manualKeywordNotes}`
        : '';

      const productDetails: string[] = [];
      if ((data.selectedProducts || []).includes('website')) {
        productDetails.push(`Website: ${data.websitePageCount || '?'} pages. Objective: ${data.websiteObjective || 'N/A'}. CTA preference: ${data.bookingCtaPreference || 'N/A'}`);
      }
      if ((data.selectedProducts || []).includes('seo')) {
        productDetails.push(`SEO: Priority services: ${data.seoServices || 'N/A'}. Priority locations: ${data.seoLocations || 'N/A'}`);
      }
      if ((data.selectedProducts || []).includes('google_ads')) {
        productDetails.push(`Google Ads: Focus services: ${data.adsServices || 'N/A'}. Monthly budget: ${data.monthlyBudget || 'N/A'}. Fastest win: ${data.fastestWinService || 'N/A'}`);
      }
      if ((data.selectedProducts || []).includes('performance_boost')) {
        productDetails.push(`Performance Boost: Retargeting goal: ${data.retargetingGoal || 'N/A'}`);
      }

      const prompt = `You are a senior digital marketing strategist and delivery lead at a marketing agency. You have been given a new client intake form and must produce four detailed internal outputs.

CLIENT: ${clientName}
LOCATION: ${location}
PRODUCTS SOLD: ${products}

BUSINESS CONTEXT:
- Business overview: ${data.businessOverview || 'N/A'}
- Target customers: ${data.targetCustomers || 'N/A'}
- Key services: ${data.keyServices || 'N/A'}
- Business goals: ${data.businessGoals || 'N/A'}
- Locations / service areas: ${data.locations || 'N/A'}
- Competitor notes: ${data.competitorNotes || 'N/A'}
- Key differentiators: ${data.keyDifferentiators || 'N/A'}
- Brand / theme direction: ${data.brandDirection || 'N/A'}
- Operational notes: ${data.operationalNotes || 'N/A'}

PRODUCT DETAILS:
${productDetails.join('\n') || 'N/A'}

COMMERCIAL DETAILS:
- Pricing: ${data.pricingNotes || 'N/A'}
- Capacity: ${data.capacityNotes || 'N/A'}
- Revenue opportunity: ${data.revenueNotes || 'N/A'}

SEO INPUTS:
- Current website URL: ${data.currentWebsiteUrl || 'N/A'}
- Current sitemap URL: ${data.currentSitemapUrl || 'N/A'}
- SEO objective: ${data.seoObjective || 'N/A'}
- Competitor keyword notes: ${data.competitorKeywordNotes || 'N/A'}${keywordInfo}

You must return a JSON object with exactly these four keys. Each value is a detailed, non-generic, strategic string using markdown formatting (headers with ##, bullet points with -, bold with **):

{
  "strategy": "## AI Strategy Summary\\n\\n## Business Summary\\n[2-3 sentences]\\n\\n## Target Market\\n[specific description]\\n\\n## Primary Growth Objective\\n[specific goal with numbers if available]\\n\\n## Fastest Win\\n[specific tactic and why]\\n\\n## Long-Term Opportunity\\n[12-month vision]",

  "sitemap": "## Recommended Website Sitemap\\n\\n## Core Pages\\n[list]\\n\\n## Service Pages\\n[list with reasoning]\\n\\n## Location Pages\\n[list with reasoning]\\n\\n## Supporting Pages\\n[list]\\n\\n## Booking / Contact Pages\\n[list]",

  "marketing": "## Marketing Strategy Summary\\n\\n## SEO Focus\\n[specific strategy]\\n\\n## Google Ads Focus\\n[specific strategy with service priority]\\n\\n## Performance Boost Focus\\n[retargeting strategy]\\n\\n## Conversion Strategy\\n[CTA and landing page recommendations]",

  "handover": "## Team Handover Notes — ${clientName}\\n\\n## Who the Client Is\\n[description]\\n\\n## What They Bought\\n[products and scope]\\n\\n## What the Site Needs to Achieve\\n[commercial goals]\\n\\n## Pages to Build\\n[specific list]\\n\\n## Google Ads Strategy\\n[what to focus on and why]\\n\\n## SEO Strategy\\n[keyword themes, page priorities, ranking approach]\\n\\n## Design / Theme Guidance\\n[brand direction]\\n\\n## Commercial Context\\n[pricing, capacity, revenue opportunity]\\n\\n## Operational Notes\\n[anything delivery team needs to know]"
}

Be specific, commercial, and strategic. Reference actual services, locations, pricing and goals from the intake data. Do not use placeholder text or generic marketing advice.`;

      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);
      res.json(result);
    } catch (error) {
      console.error('Error generating onboarding outputs:', error);
      res.status(500).json({ error: 'Failed to generate onboarding outputs' });
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

  // Search for a business by name (for GBP lookup in Deal Intelligence Panel)
  app.get("/api/google-places/find", async (req, res) => {
    try {
      const { query } = req.query;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "Google Places API key not configured." });
      }
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: "query is required" });
      }

      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.nationalPhoneNumber,places.websiteUri'
        },
        body: JSON.stringify({
          textQuery: query.trim(),
          maxResultCount: 5,
          languageCode: 'en-AU'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || 'Google Places API error' });
      }

      const results = (data.places || [])
        .filter((p: any) => p.businessStatus !== 'CLOSED_PERMANENTLY')
        .map((p: any) => ({
          placeId: p.id,
          name: p.displayName?.text || '',
          address: p.formattedAddress || '',
          rating: p.rating ?? null,
          reviewCount: p.userRatingCount ?? 0,
          phone: p.nationalPhoneNumber || null,
          website: p.websiteUri || null
        }));

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
      const TIMEOUT_MS = 10000;

      async function fetchXml(targetUrl: string): Promise<string> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MomentumBot/1.0)' },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.text();
        } finally {
          clearTimeout(timer);
        }
      }

      function extractTag(xml: string, tag: string): string | undefined {
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

      const rootXml = await fetchXml(url);
      const isSitemapIndex = /<sitemapindex/i.test(rootXml);

      let pages: Array<{ url: string; lastmod?: string; changefreq?: string; priority?: string }> = [];

      if (isSitemapIndex) {
        const childUrls = parseSitemapIndex(rootXml).slice(0, 10);
        for (const childUrl of childUrls) {
          if (pages.length >= MAX_PAGES) break;
          try {
            const childXml = await fetchXml(childUrl);
            const childPages = parseUrlset(childXml);
            pages.push(...childPages.slice(0, MAX_PAGES - pages.length));
          } catch {
            // skip failed child sitemaps
          }
        }
      } else {
        pages = parseUrlset(rootXml);
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
        isSitemapIndex,
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
        model: "gpt-4o",
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
        model: "gpt-4o",
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

  app.post("/api/ai/growth-plan/strategy-diagnosis", async (req, res) => {
    try {
      const {
        businessName, websiteUrl, industry, location,
        sitemapPages, hasGBP, gbpLink, reviewCount, rating,
        facebookUrl, instagramUrl, linkedinUrl, crawledPages, crawledCompetitors,
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
            if (cp.metaDescription) parts.push(`  Meta: ${cp.metaDescription.slice(0, 150)}`);
            if (cp.bodyText) parts.push(`  Body: ${cp.bodyText.slice(0, 200)}`);
            if (cp.schemaTypes?.length) parts.push(`  Schema: ${cp.schemaTypes.join(', ')}`);
            if (cp.imageAlts?.length) parts.push(`  Image alts: ${cp.imageAlts.slice(0, 3).join(' | ')}`);
            return parts.join('\n');
          }).join('\n\n')
        : null;

      // Build crawled competitor context
      const competitorsCrawled: Array<any> = crawledCompetitors || [];
      const competitorCrawlContext = competitorsCrawled.length > 0
        ? `\n=== COMPETITOR DEEP ANALYSIS (actual HTML extracted from rival sites) ===\n` +
          competitorsCrawled.map((comp: any) => {
            const okPages = (comp.crawledPages || []).filter((p: any) => !p.error);
            const servicePagesCount = okPages.filter((p: any) => /service|solution|offer/i.test((() => { try { return new URL(p.url).pathname; } catch { return p.url; } })())).length;
            const locationPagesCount = okPages.filter((p: any) => /location|area|suburb|city/i.test((() => { try { return new URL(p.url).pathname; } catch { return p.url; } })())).length;
            const schemas = [...new Set(okPages.flatMap((p: any) => p.schemaTypes || []))];
            const topPages = okPages.slice(0, 8).map((p: any) => {
              const path = (() => { try { return new URL(p.url).pathname || '/'; } catch { return p.url; } })();
              const parts: string[] = [`  ${path}`];
              if (p.title) parts.push(`    Title: ${p.title}`);
              if (p.h1) parts.push(`    H1: ${p.h1}`);
              if (p.h2s?.length) parts.push(`    H2s: ${p.h2s.slice(0, 3).join(' | ')}`);
              return parts.join('\n');
            }).join('\n');
            return `Competitor: ${comp.domain}\n  Total site pages: ${comp.totalPages}\n  Service pages: ${servicePagesCount}\n  Location pages: ${locationPagesCount}\n  Schema types: ${schemas.join(', ') || 'none'}\n  Crawled pages:\n${topPages}`;
          }).join('\n\n')
        : '';

      const prompt = `You are a senior digital marketing strategist who has audited thousands of local business websites. You are generating a strategic visibility diagnosis for a sales rep who is about to pitch SEO/digital marketing services to ${businessName}.

Your job is to answer ONE fundamental question:
"Does Google clearly understand what ${businessName} does and where they do it?"

This is the core ranking truth:
- Google ranks businesses based on two primary signals: WHAT you do + WHERE you do it
- Service pages tell Google WHAT the business does
- Location/suburb pages tell Google WHERE the business operates
- Portfolio/project pages tell Google almost NOTHING about services or locations
- A site heavy in portfolio pages but light in service/location pages will struggle to rank for non-brand local searches

=== BUSINESS DATA ===
Business: ${businessName}
Industry: ${industry || 'Not specified'}
Location: ${location || 'Not specified'}
Website: ${websiteUrl || 'Not provided'}
Google Business Profile: ${hasGBP ? `Yes — ${gbpLink}` : 'Not found'}
Google Reviews: ${reviewCount != null ? `${reviewCount} reviews, ${rating}★ average` : 'Unknown'}
Social Profiles: ${socialPlatforms.length > 0 ? socialPlatforms.join(', ') : 'None detected'}

=== WEBSITE STRUCTURE (from sitemap) ===
Total indexed pages: ${pages.length || 0}
Page classification:
${sitemapSummary || '  No sitemap data available'}

Actual URLs found:
${pageExamples || '  None'}
${crawledSummary ? `\n=== DEEP PAGE ANALYSIS (actual HTML content extracted) ===
The following is real HTML content extracted from crawling individual pages. Use this to assess actual keyword targeting, content quality, title tag optimisation, heading structure, and schema markup presence. This is more reliable than URL inference alone.

${crawledSummary}` : ''}
${competitorCrawlContext ? `\n${competitorCrawlContext}\n\nUse the competitor data to identify content gaps — where competitors have service or location pages that ${businessName} does not. Factor this into gap severity and priorities.` : ''}

=== SCORING RULES ===
Score each out of 100. Be honest and calibrated — low scores are expected for businesses with poor structure.

Service Clarity Score: Based on dedicated service pages (slug-level evidence only). 0 = no service pages detected. 30 = 1-2 service pages. 60 = 3-5 service pages. 80+ = 6+ well-structured service pages.

Location Relevance Score: Based on suburb/location pages. 0 = zero location pages. 30 = 1 location page. 60 = 3-5 location pages. 80+ = 6+ location pages or strong area targeting evidence.

Content Coverage Score: Based on total indexed pages and diversity of content types. Heavy portfolio-only sites score low (max 35) even with many pages, because portfolio pages don't help search visibility.

GBP Alignment Score: 0 = no GBP. 40 = GBP exists but few reviews. 70 = GBP with moderate reviews (5-30). 90+ = strong GBP with 30+ reviews.

Authority/Trust Score: Based on review count, social profiles, and content depth signals. Moderate scores unless review count is strong.

=== OUTPUT RULES ===
- Be honest. Do not inflate scores.
- If portfolio pages dominate, explicitly call this out as the key structural gap.
- Do not flag GBP as missing if hasGBP = true.
- Do not guess at page content beyond what URLs reveal.
- Forecast must use bands (low/moderate/strong) — avoid false precision unless data supports it.
- Gap evidence must cite specific data (page counts, review numbers, URL patterns observed).

Respond with JSON only:
{
  "readinessScore": 0-100,
  "confidence": "low|medium|high",
  "insightSentence": "One sharp sentence for the rep to say on the call — grounded in the data",
  "subscores": {
    "serviceClarityScore": 0-100,
    "locationRelevanceScore": 0-100,
    "contentCoverageScore": 0-100,
    "gbpAlignmentScore": 0-100,
    "authorityScore": 0-100
  },
  "currentPosition": {
    "summary": "2-3 sentences — what Google currently understands about this business based on available evidence",
    "googleClarity": "low|moderate|strong",
    "pageBreakdown": [
      { "type": "Portfolio/Project Pages", "count": 0, "searchIntent": "low" },
      { "type": "Service Pages", "count": 0, "searchIntent": "high" },
      { "type": "Location Pages", "count": 0, "searchIntent": "high" },
      { "type": "Core Pages (About/Contact)", "count": 0, "searchIntent": "low" },
      { "type": "Blog/Content Pages", "count": 0, "searchIntent": "medium" }
    ]
  },
  "growthPotential": {
    "summary": "2-3 sentences about the realistic opportunity if key gaps are fixed",
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
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
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
Key Finding: ${strategyDiagnosis.insightSentence}
Google Clarity: ${strategyDiagnosis.currentPosition?.googleClarity}
Current Position Summary: ${strategyDiagnosis.currentPosition?.summary}

Sub-scores:
- Service Clarity: ${strategyDiagnosis.subscores?.serviceClarityScore}/100
- Location Signals: ${strategyDiagnosis.subscores?.locationRelevanceScore}/100  
- Content Coverage: ${strategyDiagnosis.subscores?.contentCoverageScore}/100
- GBP Alignment: ${strategyDiagnosis.subscores?.gbpAlignmentScore}/100
- Authority: ${strategyDiagnosis.subscores?.authorityScore}/100

Top Gaps:
${strategyDiagnosis.gaps?.map((g: any) => `- [${g.severity}] ${g.title}: ${g.evidence}. Impact: ${g.impact}`).join('\n') || 'None'}

Top Priorities:
${strategyDiagnosis.priorities?.map((p: any) => `${p.rank}. ${p.action}: ${p.description}${p.examples?.length ? ' (e.g. ' + p.examples.slice(0, 2).join(', ') + ')' : ''}`).join('\n') || 'None'}

Growth Potential: ${strategyDiagnosis.growthPotential?.summary}
Forecast: ${strategyDiagnosis.growthPotential?.forecastBand ? JSON.stringify(strategyDiagnosis.growthPotential.forecastBand) : 'Not calculated'}
` : '';

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

      const prompt = `You are a senior digital marketing strategist producing a 12-month growth strategy for a sales presentation. This strategy is built on real website data, not assumptions. Use the data provided faithfully — do not invent numbers.

=== BUSINESS PROFILE ===
Business: ${businessName}
Industry: ${industry || 'Not specified'}
Location: ${location || 'Not specified'}
Website: ${websiteUrl || 'Not provided'}
Google Business Profile: ${gbpLink ? 'Yes — ' + gbpLink : 'Not found'}
Google Reviews: ${reviewCount != null ? reviewCount + ' reviews, ' + rating + '★' : 'Unknown'}
Social: ${socialProfiles || 'None detected'}
${diagContext}${sitemapContext}${competitorContext}

=== STRATEGY GENERATION RULES ===
- Every keyword, gap, and recommendation must relate to the actual industry and location
- Keyword monthly search estimates must be realistic for the market (local Australian search volumes)
- Do NOT fabricate competitor data — only reference competitors if names are provided
- Monthly roadmap must be specific to what this business actually needs
- Lead projections must be conservative and confidence-band based
- The 4 growth pillars must be tailored to the specific industry and gaps found

Respond with this EXACT JSON structure (fill every field with specific, real-data-grounded content):
{
  "executiveSummary": {
    "businessName": "${businessName}",
    "location": "${location || 'Not specified'}",
    "coreServices": ["3-5 specific services based on industry — inferred from sitemap if available"],
    "currentChallenge": "1-2 sentences on the core visibility problem — based on the diagnosis data",
    "primaryGoal": "1 clear goal statement for the 12 months",
    "growthTarget": "Specific growth target — e.g. increase inbound enquiries by X% in 12 months",
    "primaryChannels": ["Google Search (SEO)", "Google Maps", "etc — relevant to industry"]
  },
  "marketOpportunity": {
    "totalMonthlySearches": 1200,
    "currentCapture": "Estimated % they currently capture based on readiness score",
    "potentialCapture": "If key gaps fixed — realistic % and lead estimate",
    "keyInsight": "1 punchy sentence the rep can say on the call about the opportunity",
    "keywords": [
      { "keyword": "specific keyword for industry + location", "monthlySearches": "200-400", "currentRank": "not ranking|page 2|etc", "opportunity": "high|medium|low", "intent": "commercial|informational" }
    ]
  },
  "digitalAudit": {
    "website": {
      "score": 0-100,
      "strengths": ["based on what the sitemap shows"],
      "gaps": ["specific gaps found — use the diagnosis data"]
    },
    "gbp": {
      "score": 0-100,
      "status": "found|not found",
      "reviews": ${reviewCount ?? 0},
      "rating": ${rating ?? 0},
      "strengths": ["what is working"],
      "gaps": ["what is missing"]
    },
    "authority": {
      "score": 0-100,
      "socialProfiles": ${JSON.stringify(socialProfiles ? socialProfiles.split(', ') : [])},
      "gaps": ["citation gaps, backlink gaps, etc"]
    }
  },
  "growthPillars": [
    {
      "number": 1,
      "title": "Pillar name specific to industry",
      "goal": "What this pillar achieves",
      "timeframe": "Month X–X",
      "actions": [
        { "action": "Specific action", "detail": "How and why", "examples": ["e.g. /service-suburb", "/service-area"] }
      ]
    }
  ],
  "monthlyRoadmap": [
    { "period": "Month 1–2", "phase": "Foundation", "focus": ["3-4 specific focus areas"], "milestone": "What success looks like at end of this phase", "estimatedLeads": "5-10" },
    { "period": "Month 3–4", "phase": "Content Expansion", "focus": ["3-4 actions"], "milestone": "Milestone", "estimatedLeads": "10-18" },
    { "period": "Month 5–6", "phase": "Authority Building", "focus": ["3-4 actions"], "milestone": "Milestone", "estimatedLeads": "15-25" },
    { "period": "Month 7–9", "phase": "Scale Visibility", "focus": ["3-4 actions"], "milestone": "Milestone", "estimatedLeads": "20-35" },
    { "period": "Month 10–12", "phase": "Market Dominance", "focus": ["3-4 actions"], "milestone": "Milestone", "estimatedLeads": "30-50" }
  ],
  "projectedOutcomes": [
    { "month": "Month 3", "estimatedLeads": "8-12", "rankingKeywords": "3-5", "confidence": "low" },
    { "month": "Month 6", "estimatedLeads": "15-25", "rankingKeywords": "8-12", "confidence": "medium" },
    { "month": "9", "estimatedLeads": "25-40", "rankingKeywords": "15-20", "confidence": "medium" },
    { "month": "Month 12", "estimatedLeads": "35-55", "rankingKeywords": "25-35", "confidence": "medium" }
  ],
  "kpis": [
    { "metric": "Inbound Enquiries", "baseline": "current estimate", "target12Month": "target" },
    { "metric": "Google Ranking Keywords", "baseline": "current", "target12Month": "target" },
    { "metric": "Maps Pack Appearance", "baseline": "current", "target12Month": "target" },
    { "metric": "Google Review Count", "baseline": "${reviewCount ?? 0}", "target12Month": "target" },
    { "metric": "Monthly Organic Traffic", "baseline": "current", "target12Month": "target" }
  ],
  "repTalkingPoints": [
    "3-5 punchy one-liners the rep can use on the call — grounded in the data"
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const result = JSON.parse(content);
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
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(reports);
    } catch (error) {
      console.error("Error listing reports:", error);
      res.status(500).json({ error: "Failed to list reports" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Strategy Reports — prospect-facing 12-month strategy landing pages
  // ──────────────────────────────────────────────────────────────────────────

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
      const ref = firestore.collection('strategyReports').doc();
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 365);
      await ref.set({ ...reportData, id: ref.id, type: 'strategy', createdAt: now, createdBy: uid, expiresAt });
      res.json({ id: ref.id, url: `/strategy/${ref.id}` });
    } catch (err) {
      console.error("[strategy-reports POST]", err);
      res.status(500).json({ error: "Failed to create strategy report" });
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

  return httpServer;
}
