import { GrowthPlanInputs, GrowthPlanCalculations, GrowthPlanInsights } from './types';

export function generateInsights(
  inputs: GrowthPlanInputs,
  calc: GrowthPlanCalculations
): GrowthPlanInsights {
  const warnings: string[] = [];
  const commentary: string[] = [];
  const strengths: string[] = [];
  const gaps: string[] = [];
  const assumptions: string[] = [];

  // --- WARNINGS ---
  if (!inputs.avgCpc && inputs.calculatorMode === 'budget') {
    warnings.push('Add average CPC to calculate click forecast.');
  }
  if (!inputs.netAdSpend && inputs.calculatorMode === 'budget') {
    warnings.push('Add net ad spend to calculate budget forecast.');
  }
  if (!inputs.averageJobValue) {
    warnings.push('Add average job value to calculate revenue and ROI.');
  }
  if (inputs.calculatorMode === 'market' && !inputs.totalMonthlySearches) {
    warnings.push('Enter market demand data to unlock market opportunity mode.');
  }
  if (calc.leadsLow !== null && calc.leadsLow < 15) {
    warnings.push('Low scenario lead volume is under 15. Consider increasing budget or improving CVR.');
  }
  if (calc.roiLow !== null && calc.roiLow < 1) {
    warnings.push('Low scenario ROI is below break-even. Review CPC, job value, or close rate.');
  }
  if (inputs.landingPageExists === false) {
    warnings.push('No dedicated landing page is currently flagged for this theme.');
  }
  if (
    inputs.cvrLow !== null &&
    inputs.cvrMid !== null &&
    inputs.cvrHigh !== null &&
    !(inputs.cvrLow <= inputs.cvrMid && inputs.cvrMid <= inputs.cvrHigh)
  ) {
    warnings.push('CVR values are inconsistent: Low should be ≤ Mid ≤ High.');
  }

  // --- COMMENTARY ---
  if (calc.leadsMid !== null && calc.leadsHigh !== null) {
    commentary.push(
      `At current assumptions, this model forecasts ${Math.round(calc.leadsMid ?? 0)}–${Math.round(calc.leadsHigh ?? 0)} leads per month.`
    );
  }
  if (calc.roiMid !== null) {
    const roiStr = `${calc.roiLow?.toFixed(1) ?? '—'}x to ${calc.roiHigh?.toFixed(1) ?? '—'}x`;
    commentary.push(
      `Estimated ROI range: ${roiStr}. ${
        calc.roiMid < 1.5
          ? 'Margin is thin — conversion rate and job value improvements will have outsized impact.'
          : 'Solid commercial upside if assumptions hold.'
      }`
    );
  }
  if (inputs.impressionShare !== null && inputs.impressionShare < 0.3) {
    commentary.push(
      `At ${(inputs.impressionShare * 100).toFixed(0)}% impression share, most available demand is not being captured.`
    );
  }
  if (inputs.seoCoverageStatus === 'missing' || inputs.seoCoverageStatus === 'weak') {
    commentary.push(
      'Website coverage appears weak for this theme — organic alignment will amplify paid performance.'
    );
  }
  if (inputs.calculatorMode === 'budget' && inputs.netAdSpend && inputs.avgCpc && calc.estimatedClicks) {
    commentary.push(
      `Budget of $${inputs.netAdSpend.toLocaleString()}/mo at $${inputs.avgCpc} avg CPC forecasts ~${calc.estimatedClicks.toLocaleString()} clicks.`
    );
  }
  if (inputs.calculatorMode === 'market' && calc.reachableDemand && calc.untappedDemand) {
    commentary.push(
      `Reachable demand: ${calc.reachableDemand.toLocaleString()} impressions/mo. Untapped demand: ${calc.untappedDemand.toLocaleString()} searches currently not captured.`
    );
  }
  if (calc.opportunityScore !== null) {
    const label =
      calc.opportunityScore >= 70
        ? 'high'
        : calc.opportunityScore >= 40
        ? 'moderate'
        : 'limited';
    commentary.push(
      `Opportunity score: ${calc.opportunityScore}/100 — ${label} opportunity based on market size, visibility, and coverage gaps.`
    );
  }

  // --- STRENGTHS ---
  if (inputs.paidCampaignActive) {
    strengths.push('Active paid campaign already running — baseline data available.');
  }
  if (inputs.landingPageExists) {
    strengths.push('Dedicated landing page exists — a key conversion point is in place.');
  }
  if (inputs.seoCoverageStatus === 'strong' || inputs.seoCoverageStatus === 'moderate') {
    strengths.push('Website SEO coverage provides organic support alongside paid activity.');
  }
  if (calc.roiMid !== null && calc.roiMid > 2) {
    strengths.push(`Mid-scenario ROI of ${calc.roiMid.toFixed(1)}x — strong commercial case for investment.`);
  }
  if (inputs.averageJobValue !== null && inputs.averageJobValue > 5000) {
    strengths.push(
      `High average job value ($${inputs.averageJobValue.toLocaleString()}) means each conversion carries significant commercial weight.`
    );
  }
  if (inputs.impressionShare !== null && inputs.impressionShare > 0.5) {
    strengths.push(`Strong impression share of ${(inputs.impressionShare * 100).toFixed(0)}% — good market visibility.`);
  }

  // --- GAPS ---
  if (inputs.landingPageExists === false) {
    gaps.push('No dedicated landing page — generic pages likely reducing conversion rate.');
  }
  if (inputs.seoCoverageStatus === 'missing') {
    gaps.push('No SEO coverage for this commercial theme — organic signals missing.');
  } else if (inputs.seoCoverageStatus === 'weak') {
    gaps.push('Weak SEO coverage — content does not strongly support this theme.');
  }
  if (!inputs.paidCampaignActive) {
    gaps.push('No active paid campaign — zero paid visibility in this market currently.');
  }
  if (inputs.impressionShare !== null && inputs.impressionShare < 0.25) {
    gaps.push(
      `Very low impression share (${(inputs.impressionShare * 100).toFixed(0)}%) — the majority of demand is being missed.`
    );
  }
  if (!inputs.totalMonthlySearches && !inputs.avgCpc) {
    gaps.push('Market and keyword data not yet entered — opportunity size cannot be fully modelled.');
  }

  // --- ASSUMPTIONS ---
  if (inputs.closeRate !== null) {
    assumptions.push(`Close rate: ${(inputs.closeRate * 100).toFixed(0)}%`);
  }
  if (inputs.cvrMid !== null) {
    assumptions.push(`CVR (mid): ${(inputs.cvrMid * 100).toFixed(1)}%`);
  }
  if (inputs.avgCpc !== null) {
    assumptions.push(`Avg CPC: $${inputs.avgCpc}`);
  }
  if (inputs.averageJobValue !== null) {
    assumptions.push(`Avg job value: $${inputs.averageJobValue.toLocaleString()}`);
  }
  if (inputs.managementFee !== null) {
    assumptions.push(`Management fee: $${inputs.managementFee.toLocaleString()}/mo`);
  }

  // --- HEADLINE ---
  let summaryHeadline: string | null = null;
  let summaryBody: string | null = null;

  if (calc.leadsMid !== null && calc.roiMid !== null) {
    const roiStr =
      calc.roiMid >= 1 ? `${calc.roiMid.toFixed(1)}x ROI` : 'below break-even';
    summaryHeadline = `~${Math.round(calc.leadsMid ?? 0)} leads/mo · ${roiStr}`;
    const mainGap = gaps[0] ? gaps[0].toLowerCase().replace(/^no\s/, 'addressing ') : null;
    summaryBody = `Based on current assumptions, this opportunity could generate ${Math.round(calc.leadsMid ?? 0)}–${Math.round(calc.leadsHigh ?? 0)} leads per month with an estimated ROI range of ${calc.roiLow?.toFixed(1) ?? '—'}x to ${calc.roiHigh?.toFixed(1) ?? '—'}x. ${mainGap ? `The clearest growth lever is ${mainGap}.` : 'The fundamentals look strong for this opportunity.'}`;
  } else if (gaps.length > 0) {
    summaryHeadline = 'Incomplete — add inputs to generate forecast';
    summaryBody =
      'Add business and market inputs to generate a full paid search opportunity forecast.';
  }

  return {
    summaryHeadline,
    summaryBody,
    warnings,
    commentary,
    strengths,
    gaps,
    assumptions,
  };
}
