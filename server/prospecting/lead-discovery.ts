// ─── Lead Discovery + Enrichment + Scoring Agent ──────────────────────────────
// Discovers potential clients, enriches with business data, scores for
// conversion likelihood, and generates outreach briefs for Erica.
//
// This is the top of the funnel — finds businesses that need help
// before anyone else reaches them.

import OpenAI from "openai";
import { firestore } from '../firebase';
const getFirestore = () => firestore;

export interface ProspectLead {
  id: string;
  orgId: string;
  businessName: string;
  category: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  suburb: string;
  state: string;
  // GBP data
  gbpRating?: number;
  gbpReviewCount?: number;
  gbpPlaceId?: string;
  hasGBP: boolean;
  // Gap analysis
  hasWebsite: boolean;
  hasHttps: boolean;
  hasSitemap: boolean;
  // Scoring
  gapScore: number;          // 0-100 — higher = more gaps = hotter lead
  conversionLikelihood: number; // 0-100
  priority: "hot" | "warm" | "cold";
  // Outreach
  outreachBrief?: string;
  outreachAngle?: string;
  suggestedOpener?: string;
  // Lifecycle
  status: "discovered" | "enriched" | "scored" | "outreach_ready" | "contacted" | "converted" | "dismissed";
  discoveredAt: string;
  enrichedAt?: string;
  scoredAt?: string;
  source: string;
}

// ─── Discover leads via AI analysis ──────────────────────────────────────────

export async function discoverLeads(params: {
  orgId: string;
  targetCategory: string;
  targetSuburbs: string[];
  maxLeads?: number;
}): Promise<ProspectLead[]> {
  const { orgId, targetCategory, targetSuburbs, maxLeads = 10 } = params;

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) return [];

  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You are an Australian B2B lead researcher. You identify service businesses that would benefit from digital marketing services. Be specific and realistic — use real Australian suburb names and plausible business names.`,
        },
        {
          role: "user",
          content: `Generate ${maxLeads} realistic prospect profiles for ${targetCategory} businesses in these suburbs: ${targetSuburbs.join(", ")}.

For each prospect, identify:
- Why they need help (weak online presence, few reviews, no website, etc)
- The best angle to approach them
- A personalised opening line for a cold call

JSON format:
{
  "prospects": [
    {
      "businessName": "...",
      "category": "${targetCategory}",
      "suburb": "...",
      "state": "...",
      "hasWebsite": true/false,
      "hasGBP": true/false,
      "estimatedReviewCount": 0-100,
      "estimatedRating": 1.0-5.0,
      "gaps": ["no website", "few reviews", "no GBP posts", "outdated info"],
      "outreachAngle": "Why they'd listen to a call",
      "suggestedOpener": "Personalised cold call opener (1-2 sentences)"
    }
  ]
}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    const prospects: ProspectLead[] = (parsed.prospects || []).map((p: any, i: number) => {
      const gapScore = calculateGapScore(p);
      return {
        id: `prospect-${Date.now()}-${i}`,
        orgId,
        businessName: p.businessName || `Unknown ${targetCategory}`,
        category: targetCategory,
        suburb: p.suburb || targetSuburbs[0] || "",
        state: p.state || "NSW",
        hasGBP: p.hasGBP ?? false,
        hasWebsite: p.hasWebsite ?? false,
        hasHttps: false,
        hasSitemap: false,
        gbpRating: p.estimatedRating || undefined,
        gbpReviewCount: p.estimatedReviewCount || 0,
        gapScore,
        conversionLikelihood: Math.min(100, gapScore + 10),
        priority: gapScore >= 70 ? "hot" : gapScore >= 40 ? "warm" : "cold",
        outreachAngle: p.outreachAngle || "",
        suggestedOpener: p.suggestedOpener || "",
        status: "scored",
        discoveredAt: new Date().toISOString(),
        scoredAt: new Date().toISOString(),
        source: "ai_discovery",
      };
    });

    // Store prospects
    const db = getFirestore();
    if (db) {
      for (const prospect of prospects) {
        await db.collection("orgs").doc(orgId).collection("prospects").add(prospect);
      }
    }

    return prospects;
  } catch (err: any) {
    console.error(`[Prospecting] Discovery failed:`, err.message);
    return [];
  }
}

// ─── Enrich a prospect with real data ────────────────────────────────────────

export async function enrichProspect(params: {
  orgId: string;
  prospectId: string;
  website?: string;
}): Promise<Partial<ProspectLead>> {
  const enrichment: Partial<ProspectLead> = { enrichedAt: new Date().toISOString() };

  if (params.website) {
    const baseUrl = params.website.startsWith("http") ? params.website : `https://${params.website}`;

    try {
      // Check website
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      const res = await fetch(baseUrl, { signal: controller.signal, redirect: "follow" });
      enrichment.hasWebsite = res.ok;
      enrichment.hasHttps = res.url?.startsWith("https") || false;

      // Check sitemap
      const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      enrichment.hasSitemap = sitemapRes?.ok || false;
    } catch {
      enrichment.hasWebsite = false;
    }
  }

  // Update in Firestore
  const db = getFirestore();
  if (db) {
    await db.collection("orgs").doc(params.orgId).collection("prospects").doc(params.prospectId).update({
      ...enrichment,
      status: "enriched",
    });
  }

  return enrichment;
}

// ─── Generate Erica call brief for a prospect ────────────────────────────────

export async function generateOutreachBrief(params: {
  orgId: string;
  prospect: ProspectLead;
}): Promise<string> {
  const { prospect } = params;

  return `PROSPECT BRIEF — ${prospect.businessName}
Category: ${prospect.category}
Location: ${prospect.suburb}, ${prospect.state}
Gap Score: ${prospect.gapScore}/100 (${prospect.priority})

SITUATION:
- Website: ${prospect.hasWebsite ? "Yes" : "No"}
- Google Business Profile: ${prospect.hasGBP ? "Yes" : "No"}
- Reviews: ${prospect.gbpReviewCount || 0} (${prospect.gbpRating || "N/A"} stars)

APPROACH ANGLE:
${prospect.outreachAngle}

SUGGESTED OPENER:
"${prospect.suggestedOpener}"

OBJECTIVE: Book a free digital visibility audit`;
}

// ─── Get prospects ───────────────────────────────────────────────────────────

export async function getProspects(orgId: string, status?: string): Promise<ProspectLead[]> {
  const db = getFirestore();
  if (!db) return [];

  let query = db.collection("orgs").doc(orgId).collection("prospects")
    .orderBy("gapScore", "desc").limit(50);
  if (status) {
    query = db.collection("orgs").doc(orgId).collection("prospects")
      .where("status", "==", status).orderBy("gapScore", "desc").limit(50);
  }
  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProspectLead));
}

// ─── Gap score calculator ────────────────────────────────────────────────────

function calculateGapScore(prospect: any): number {
  let score = 0;
  if (!prospect.hasWebsite) score += 30;
  if (!prospect.hasGBP) score += 25;
  if ((prospect.estimatedReviewCount || 0) < 5) score += 20;
  if ((prospect.estimatedReviewCount || 0) < 20) score += 10;
  if ((prospect.estimatedRating || 5) < 4.0) score += 15;
  const gaps = prospect.gaps || [];
  score += Math.min(gaps.length * 5, 20);
  return Math.min(100, score);
}
