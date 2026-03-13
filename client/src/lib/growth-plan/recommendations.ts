import { GrowthPlanInputs, GrowthPlanCalculations, GrowthPlanRecommendation } from './types';

export function generateRecommendations(
  inputs: GrowthPlanInputs,
  calc: GrowthPlanCalculations
): GrowthPlanRecommendation[] {
  const recs: GrowthPlanRecommendation[] = [];

  if (!inputs.totalMonthlySearches && !inputs.avgCpc) {
    recs.push({
      title: 'Add keyword & market data',
      reason: 'Without demand data, the opportunity size cannot be modelled accurately.',
      priority: 'high',
      category: 'Research',
      expectedImpact: 'Unlocks full opportunity forecast and market sizing.',
    });
  }

  if (inputs.landingPageExists === false) {
    const uplift =
      calc.leadsMid !== null
        ? `Could lift leads from ${Math.round(calc.leadsMid)} to ~${Math.round(calc.leadsMid * 1.4)}/mo.`
        : 'Typically improves CVR by 30–60%.';
    recs.push({
      title: 'Create a dedicated landing page',
      reason: 'A targeted landing page typically improves CVR by 30–60% vs a generic homepage.',
      priority: 'high',
      category: 'Conversion',
      expectedImpact: uplift,
    });
  }

  if (!inputs.paidCampaignActive) {
    recs.push({
      title: 'Launch a paid search campaign',
      reason: 'No active campaign means zero paid visibility in this market right now.',
      priority: 'high',
      category: 'Visibility',
      expectedImpact: 'Establishes baseline traffic and lead data within 30 days.',
    });
  }

  if (inputs.impressionShare !== null && inputs.impressionShare < 0.3) {
    recs.push({
      title: 'Increase budget to capture more demand',
      reason: `At ${(inputs.impressionShare * 100).toFixed(0)}% impression share, most searches are currently missed.`,
      priority: 'medium',
      category: 'Budget',
      expectedImpact: 'Scaling to 50%+ impression share could double lead volume.',
    });
  }

  if (inputs.seoCoverageStatus === 'missing' || inputs.seoCoverageStatus === 'weak') {
    recs.push({
      title: 'Strengthen SEO coverage for this theme',
      reason: 'Organic signals reinforce paid quality scores and reduce long-term CPC.',
      priority: 'medium',
      category: 'SEO',
      expectedImpact: 'Improved quality score can reduce CPC by 15–25%.',
    });
  }

  if (inputs.closeRate !== null && inputs.closeRate < 0.15) {
    recs.push({
      title: 'Improve lead follow-up and close rate',
      reason: `At ${(inputs.closeRate * 100).toFixed(0)}% close rate, most leads are not converting to customers.`,
      priority: 'medium',
      category: 'Sales Process',
      expectedImpact:
        calc.revenueMid !== null
          ? `Doubling close rate could nearly double revenue to ~$${Math.round(calc.revenueMid * 2).toLocaleString()}/mo.`
          : 'Doubling close rate doubles revenue without increasing ad spend.',
    });
  }

  if (inputs.paidCampaignActive && inputs.netAdSpend && inputs.netAdSpend > 0) {
    recs.push({
      title: 'Split campaigns by search intent',
      reason:
        'Branded, commercial, and informational intents convert at very different rates.',
      priority: 'low',
      category: 'Campaign Structure',
      expectedImpact: 'Improves CVR by 10–20% through better message-to-intent match.',
    });
    recs.push({
      title: 'Track calls and forms as separate conversions',
      reason:
        'Unified tracking obscures which keywords and campaigns are generating real leads.',
      priority: 'low',
      category: 'Measurement',
      expectedImpact: 'Enables accurate budget allocation and optimisation.',
    });
  }

  if (inputs.avgCpc !== null && inputs.highCpc !== null && inputs.avgCpc > inputs.highCpc * 0.8) {
    recs.push({
      title: 'Tighten local keyword targeting',
      reason: 'CPC is close to the high estimate — broader targeting may be driving up costs.',
      priority: 'low',
      category: 'Campaign Structure',
      expectedImpact: 'More specific targeting typically reduces CPC by 10–20%.',
    });
  }

  return recs.slice(0, 6);
}
