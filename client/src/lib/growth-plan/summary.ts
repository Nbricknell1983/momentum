import { PaidSearchGrowthPlan, GrowthPlanExportSection } from './types';

export function generatePlainSummary(plan: PaidSearchGrowthPlan, businessName: string): string {
  const { calculations: calc, insights } = plan;

  if (insights.summaryBody) return insights.summaryBody;

  if (calc.leadsMid === null && calc.reachableDemand === null) {
    return `${businessName} — Paid search opportunity model. Add market and business inputs to generate a full forecast.`;
  }

  const leadStr =
    calc.leadsMid !== null
      ? `${Math.round(calc.leadsMid ?? 0)}–${Math.round(calc.leadsHigh ?? 0)} leads/mo`
      : null;
  const roiStr =
    calc.roiLow !== null
      ? `ROI of ${calc.roiLow.toFixed(1)}x–${calc.roiHigh?.toFixed(1) ?? '—'}x`
      : null;
  const parts = [businessName, '—'];
  if (leadStr) parts.push(`Based on current assumptions: ${leadStr}.`);
  if (roiStr) parts.push(`Estimated ${roiStr}.`);
  if (!leadStr && !roiStr) parts.push('Add full inputs to generate a forecast.');
  return parts.join(' ');
}

export function generateExportSections(
  plan: PaidSearchGrowthPlan,
  businessName: string
): GrowthPlanExportSection[] {
  const { inputs, calculations: calc, insights, recommendations, roadmap } = plan;
  const sections: GrowthPlanExportSection[] = [];

  // Executive Summary
  sections.push({
    id: 'executive-summary',
    title: 'Executive Summary',
    body: generatePlainSummary(plan, businessName),
    data: {
      leadsMid: calc.leadsMid,
      leadsHigh: calc.leadsHigh,
      roiLow: calc.roiLow,
      roiHigh: calc.roiHigh,
    },
  });

  // Business Context
  sections.push({
    id: 'business-context',
    title: 'Business Context',
    body: [
      businessName,
      inputs.industry ? `operates in the ${inputs.industry} sector` : null,
      inputs.targetLocation ? `Target market: ${inputs.targetLocation}.` : null,
      inputs.averageJobValue
        ? `Average job value: $${inputs.averageJobValue.toLocaleString()}.`
        : null,
      inputs.closeRate
        ? `Close rate: ${(inputs.closeRate * 100).toFixed(0)}%.`
        : null,
      inputs.monthlyPackagePrice
        ? `Monthly package: $${inputs.monthlyPackagePrice.toLocaleString()}.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
  });

  // Market Demand
  if (inputs.totalMonthlySearches) {
    sections.push({
      id: 'market-demand',
      title: 'Market Demand',
      body: `Total monthly searches: ${inputs.totalMonthlySearches.toLocaleString()}${inputs.keywordCluster ? ` for "${inputs.keywordCluster}"` : ''}. Reachable demand: ${calc.reachableDemand?.toLocaleString() ?? '—'} impressions. Untapped demand: ${calc.untappedDemand?.toLocaleString() ?? '—'} searches currently not captured.`,
      data: {
        totalMonthlySearches: inputs.totalMonthlySearches,
        reachableDemand: calc.reachableDemand,
        untappedDemand: calc.untappedDemand,
        opportunityScore: calc.opportunityScore,
      },
    });
  }

  // Demand vs Coverage
  sections.push({
    id: 'demand-coverage',
    title: 'Demand vs Coverage',
    body: [
      inputs.seoCoverageStatus
        ? `SEO coverage: ${inputs.seoCoverageStatus}.`
        : 'SEO coverage: not assessed.',
      inputs.paidCampaignActive !== null
        ? `Paid campaign: ${inputs.paidCampaignActive ? 'active' : 'not active'}.`
        : null,
      inputs.landingPageExists !== null
        ? `Landing page: ${inputs.landingPageExists ? 'exists' : 'missing'}.`
        : null,
      calc.untappedDemand !== null
        ? `Untapped demand: ${calc.untappedDemand.toLocaleString()} searches/mo.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
    data: {
      seoCoverageStatus: inputs.seoCoverageStatus,
      paidCampaignActive: inputs.paidCampaignActive,
      landingPageExists: inputs.landingPageExists,
    },
  });

  // Forecast Scenarios
  sections.push({
    id: 'forecast-scenarios',
    title: 'Forecast Scenarios',
    body: `Low: ${calc.leadsLow ?? '—'} leads → ${calc.customersLow ?? '—'} customers → $${calc.revenueLow?.toLocaleString() ?? '—'} revenue (ROI ${calc.roiLow?.toFixed(1) ?? '—'}x).\nMid: ${calc.leadsMid ?? '—'} leads → ${calc.customersMid ?? '—'} customers → $${calc.revenueMid?.toLocaleString() ?? '—'} revenue (ROI ${calc.roiMid?.toFixed(1) ?? '—'}x).\nHigh: ${calc.leadsHigh ?? '—'} leads → ${calc.customersHigh ?? '—'} customers → $${calc.revenueHigh?.toLocaleString() ?? '—'} revenue (ROI ${calc.roiHigh?.toFixed(1) ?? '—'}x).`,
    data: {
      scenarios: {
        low: {
          leads: calc.leadsLow,
          customers: calc.customersLow,
          revenue: calc.revenueLow,
          roi: calc.roiLow,
        },
        mid: {
          leads: calc.leadsMid,
          customers: calc.customersMid,
          revenue: calc.revenueMid,
          roi: calc.roiMid,
        },
        high: {
          leads: calc.leadsHigh,
          customers: calc.customersHigh,
          revenue: calc.revenueHigh,
          roi: calc.roiHigh,
        },
      },
    },
  });

  // Financial Return
  sections.push({
    id: 'financial-return',
    title: 'Financial Return',
    body: `Total monthly investment: $${calc.totalInvestment?.toLocaleString() ?? '—'}. ROI range: ${calc.roiLow?.toFixed(1) ?? '—'}x–${calc.roiHigh?.toFixed(1) ?? '—'}x. Break-even at ${calc.breakEvenLeads ?? '—'} leads or ${calc.breakEvenCustomers ?? '—'} customers per month.`,
    data: {
      totalInvestment: calc.totalInvestment,
      roiLow: calc.roiLow,
      roiHigh: calc.roiHigh,
      breakEvenLeads: calc.breakEvenLeads,
      breakEvenCustomers: calc.breakEvenCustomers,
    },
  });

  // Strategic Gaps
  if (insights.gaps.length > 0) {
    sections.push({
      id: 'strategic-gaps',
      title: 'Strategic Gaps',
      body: insights.gaps.join('\n'),
    });
  }

  // Priority Recommendations
  if (recommendations.length > 0) {
    sections.push({
      id: 'recommendations',
      title: 'Priority Recommendations',
      body: recommendations
        .slice(0, 3)
        .map((r, i) => `${i + 1}. ${r.title}: ${r.reason}`)
        .join('\n'),
      data: { recommendations },
    });
  }

  // 12-Month Roadmap
  sections.push({
    id: 'roadmap',
    title: '12-Month Growth Roadmap',
    body: [
      `Q1 — Foundations:\n${roadmap.q1.map(s => `• ${s}`).join('\n')}`,
      `Q2 — Demand Capture:\n${roadmap.q2.map(s => `• ${s}`).join('\n')}`,
      `Q3 — Expansion:\n${roadmap.q3.map(s => `• ${s}`).join('\n')}`,
      `Q4 — Domination:\n${roadmap.q4.map(s => `• ${s}`).join('\n')}`,
    ].join('\n\n'),
    data: { roadmap },
  });

  return sections;
}
