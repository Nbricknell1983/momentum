import { GrowthPlanInputs, GrowthPlanCalculations } from './types';

function n(v: number | null | undefined): number | null {
  return v != null && !isNaN(v as number) ? (v as number) : null;
}

export function runCalculations(inputs: GrowthPlanInputs): GrowthPlanCalculations {
  const {
    calculatorMode,
    netAdSpend,
    managementFee,
    avgCpc,
    totalMonthlySearches,
    impressionShare,
    ctr,
    cvrLow,
    cvrMid,
    cvrHigh,
    averageJobValue,
    closeRate,
    seoCoverageStatus,
    landingPageExists,
    paidCampaignActive,
  } = inputs;

  // Estimated Clicks
  let estimatedClicks: number | null = null;
  if (calculatorMode === 'budget') {
    const spend = n(netAdSpend);
    const cpc = n(avgCpc);
    if (spend !== null && cpc !== null && cpc > 0) {
      estimatedClicks = spend / cpc;
    }
  } else {
    const searches = n(totalMonthlySearches);
    const impShare = n(impressionShare);
    const clickRate = n(ctr);
    if (searches !== null && impShare !== null && clickRate !== null) {
      estimatedClicks = searches * impShare * clickRate;
    }
  }

  // Total Investment
  const spend = n(netAdSpend);
  const fee = n(managementFee);
  const rawInvestment = (spend ?? 0) + (fee ?? 0);
  const totalInvestment = rawInvestment > 0 ? rawInvestment : null;

  // Leads
  const clicks = estimatedClicks;
  const cvLow = n(cvrLow);
  const cvMid = n(cvrMid);
  const cvHigh = n(cvrHigh);
  const leadsLow = clicks !== null && cvLow !== null ? clicks * cvLow : null;
  const leadsMid = clicks !== null && cvMid !== null ? clicks * cvMid : null;
  const leadsHigh = clicks !== null && cvHigh !== null ? clicks * cvHigh : null;

  // CPA
  const cpaLow = spend !== null && leadsLow !== null && leadsLow > 0 ? spend / leadsLow : null;
  const cpaMid = spend !== null && leadsMid !== null && leadsMid > 0 ? spend / leadsMid : null;
  const cpaHigh = spend !== null && leadsHigh !== null && leadsHigh > 0 ? spend / leadsHigh : null;

  // Customers
  const cr = n(closeRate);
  const customersLow = leadsLow !== null && cr !== null ? leadsLow * cr : null;
  const customersMid = leadsMid !== null && cr !== null ? leadsMid * cr : null;
  const customersHigh = leadsHigh !== null && cr !== null ? leadsHigh * cr : null;

  // Revenue
  const jobValue = n(averageJobValue);
  const revenueLow = customersLow !== null && jobValue !== null ? customersLow * jobValue : null;
  const revenueMid = customersMid !== null && jobValue !== null ? customersMid * jobValue : null;
  const revenueHigh = customersHigh !== null && jobValue !== null ? customersHigh * jobValue : null;

  // ROI
  const invest = totalInvestment;
  const roiLow = revenueLow !== null && invest !== null && invest > 0 ? revenueLow / invest : null;
  const roiMid = revenueMid !== null && invest !== null && invest > 0 ? revenueMid / invest : null;
  const roiHigh = revenueHigh !== null && invest !== null && invest > 0 ? revenueHigh / invest : null;

  // Break-even
  const breakEvenCustomers =
    invest !== null && jobValue !== null && jobValue > 0 ? invest / jobValue : null;
  const breakEvenLeads =
    breakEvenCustomers !== null && cr !== null && cr > 0 ? breakEvenCustomers / cr : null;

  // Market opportunity
  const searches = n(totalMonthlySearches);
  const impShare = n(impressionShare);
  const reachableDemand = searches !== null && impShare !== null ? searches * impShare : null;
  const untappedDemand =
    searches !== null && impShare !== null ? searches * (1 - impShare) : null;

  // Opportunity Score (0–100)
  let opportunityScore: number | null = null;
  {
    let score = 0;
    let factors = 0;

    if (searches !== null && searches > 0) {
      score += Math.min((searches / 5000) * 20, 20);
      factors++;
    }
    if (impShare !== null) {
      score += (1 - impShare) * 20;
      factors++;
    }
    if (seoCoverageStatus) {
      const seoMap: Record<string, number> = { missing: 20, weak: 14, moderate: 6, strong: 0 };
      score += seoMap[seoCoverageStatus] ?? 0;
      factors++;
    }
    if (paidCampaignActive !== null) {
      score += paidCampaignActive ? 0 : 15;
      factors++;
    }
    if (landingPageExists !== null) {
      score += landingPageExists ? 0 : 15;
      factors++;
    }

    if (factors >= 2) {
      opportunityScore = Math.min(Math.round(score), 100);
    }
  }

  const r1 = (v: number | null, dp = 1) =>
    v !== null ? Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp) : null;
  const r0 = (v: number | null) => (v !== null ? Math.round(v) : null);

  return {
    estimatedClicks: r0(estimatedClicks),
    leadsLow: r1(leadsLow),
    leadsMid: r1(leadsMid),
    leadsHigh: r1(leadsHigh),
    cpaLow: r0(cpaLow),
    cpaMid: r0(cpaMid),
    cpaHigh: r0(cpaHigh),
    customersLow: r1(customersLow),
    customersMid: r1(customersMid),
    customersHigh: r1(customersHigh),
    revenueLow: r0(revenueLow),
    revenueMid: r0(revenueMid),
    revenueHigh: r0(revenueHigh),
    roiLow: r1(roiLow, 2),
    roiMid: r1(roiMid, 2),
    roiHigh: r1(roiHigh, 2),
    totalInvestment: r0(totalInvestment),
    breakEvenCustomers: r1(breakEvenCustomers),
    breakEvenLeads: r1(breakEvenLeads),
    reachableDemand: r0(reachableDemand),
    untappedDemand: r0(untappedDemand),
    opportunityScore,
  };
}

export function getMissingFields(inputs: GrowthPlanInputs): string[] {
  const missing: string[] = [];
  if (!inputs.netAdSpend && inputs.calculatorMode === 'budget') missing.push('Net Ad Spend');
  if (!inputs.avgCpc && inputs.calculatorMode === 'budget') missing.push('Average CPC');
  if (!inputs.totalMonthlySearches && inputs.calculatorMode === 'market')
    missing.push('Total Monthly Searches');
  if (!inputs.impressionShare && inputs.calculatorMode === 'market') missing.push('Impression Share');
  if (!inputs.ctr && inputs.calculatorMode === 'market') missing.push('CTR');
  if (!inputs.cvrMid) missing.push('Conversion Rate');
  if (!inputs.averageJobValue) missing.push('Average Job Value');
  if (!inputs.closeRate) missing.push('Close Rate');
  if (inputs.landingPageExists === null) missing.push('Landing Page Status');
  return missing;
}
