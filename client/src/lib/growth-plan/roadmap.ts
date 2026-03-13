import { GrowthPlanInputs, GrowthPlanCalculations, GrowthPlanRoadmap } from './types';

export function generateRoadmap(
  inputs: GrowthPlanInputs,
  calc: GrowthPlanCalculations
): GrowthPlanRoadmap {
  const q1: string[] = [];
  const q2: string[] = [];
  const q3: string[] = [];
  const q4: string[] = [];

  // Q1 — Foundations
  if (!inputs.totalMonthlySearches && !inputs.avgCpc) {
    q1.push('Research and import keyword planner data for target themes');
  }
  if (inputs.landingPageExists === false) {
    q1.push('Build a dedicated, conversion-optimised landing page for primary theme');
  }
  if (inputs.seoCoverageStatus === 'missing') {
    q1.push('Align existing service pages with paid search themes for quality score improvement');
  }
  if (!inputs.paidCampaignActive) {
    q1.push('Launch initial Google Ads campaign with conservative daily budget');
  } else {
    q1.push('Audit and restructure existing campaign for intent-based ad group structure');
  }
  q1.push('Set up call tracking and form tracking as separate conversion actions');
  if (inputs.landingPageExists !== false) {
    q1.push('Establish baseline CTR, CVR, and CPA benchmarks from live data');
  }

  // Q2 — Demand Capture
  if (inputs.impressionShare !== null && inputs.impressionShare < 0.4) {
    q2.push(`Scale budget to capture 40–50% impression share (currently ${(inputs.impressionShare * 100).toFixed(0)}%)`);
  } else {
    q2.push('Review impression share data and identify budget scaling opportunities');
  }
  q2.push('Launch retargeting campaigns for website visitors who did not convert');
  q2.push('A/B test landing page headlines, CTA buttons, and social proof elements');
  if (inputs.seoCoverageStatus === 'weak' || inputs.seoCoverageStatus === 'missing') {
    q2.push('Publish supporting SEO content to reinforce paid keyword themes');
  }
  q2.push('Refine negative keyword list to eliminate irrelevant clicks');
  q2.push('Implement ad extensions: call, location, review, and sitelinks');

  // Q3 — Expansion
  const highRoi = calc.roiHigh !== null && calc.roiHigh > 2;
  const midRoiOk = calc.roiMid !== null && calc.roiMid >= 1.2;
  if (highRoi && midRoiOk) {
    q3.push('Scale budget on best-performing campaigns and keyword clusters');
    q3.push('Expand geographic targeting to nearby suburbs and regions');
    q3.push('Introduce Performance Max campaigns for broader automated coverage');
  } else {
    q3.push('Optimise for conversion rate before scaling budget further');
    q3.push('Tighten local keyword targeting to reduce wasted spend');
    q3.push('Review landing page experience and reduce friction in the lead form');
  }
  q3.push('Add display and YouTube remarketing for brand awareness building');
  q3.push('Analyse competitor search strategies and adjust positioning accordingly');

  // Q4 — Domination
  q4.push('Plan next-year strategy and budget based on 9 months of proven ROI data');
  q4.push('Build seasonal campaign variations for peak demand periods');
  q4.push('Explore additional keyword themes and service lines for expansion');
  q4.push('Quarterly strategy review and updated market sizing with fresh keyword data');
  q4.push('Set year-2 targets for leads, CPA, and revenue based on actuals');

  return { q1, q2, q3, q4 };
}
