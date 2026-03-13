import { GrowthPlanInputs, GrowthPlanCalculations } from './types';

function n(v: number | null | undefined): number | null {
  return v != null && !isNaN(v as number) ? (v as number) : null;
}

// Organic CTR curve by position
function organicCtrForPosition(pos: number | null): number {
  if (pos === null || pos < 1) return 0;
  const ctrs: Record<number, number> = {
    1: 0.285, 2: 0.157, 3: 0.11, 4: 0.08, 5: 0.07,
    6: 0.055, 7: 0.045, 8: 0.038, 9: 0.032, 10: 0.027,
  };
  if (pos <= 10) return ctrs[Math.round(pos)] ?? 0.027;
  return 0; // beyond page 1 = negligible
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
    // SEO
    seoMonthlySearchVolume,
    currentOrganicRanking,
    currentOrganicTraffic,
    organicCvr,
    seoDomainAuthority,
    seoTargetPagesCount,
    // GBP
    gbpRating,
    gbpReviewCount,
    gbpPhotoCount,
    gbpPostsPerMonth,
    gbpServicesListed,
    gbpQaAnswered,
    socialFacebookActive,
    socialInstagramActive,
    socialLinkedinActive,
    socialPostingFrequency,
    emailMarketingActive,
  } = inputs;

  // ── PAID SEARCH ─────────────────────────────────────────────────────────────

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

  const spend = n(netAdSpend);
  const feeRate = n(managementFee);
  const managementFeeAmount = spend !== null && feeRate !== null ? spend * feeRate : 0;
  const rawInvestment = (spend ?? 0) + managementFeeAmount;
  const totalInvestment = rawInvestment > 0 ? rawInvestment : null;

  const clicks = estimatedClicks;
  const cvLow = n(cvrLow);
  const cvMid = n(cvrMid);
  const cvHigh = n(cvrHigh);
  const leadsLow = clicks !== null && cvLow !== null ? clicks * cvLow : null;
  const leadsMid = clicks !== null && cvMid !== null ? clicks * cvMid : null;
  const leadsHigh = clicks !== null && cvHigh !== null ? clicks * cvHigh : null;

  const cpaLow = spend !== null && leadsLow !== null && leadsLow > 0 ? spend / leadsLow : null;
  const cpaMid = spend !== null && leadsMid !== null && leadsMid > 0 ? spend / leadsMid : null;
  const cpaHigh = spend !== null && leadsHigh !== null && leadsHigh > 0 ? spend / leadsHigh : null;

  const cr = n(closeRate);
  const customersLow = leadsLow !== null && cr !== null ? leadsLow * cr : null;
  const customersMid = leadsMid !== null && cr !== null ? leadsMid * cr : null;
  const customersHigh = leadsHigh !== null && cr !== null ? leadsHigh * cr : null;

  const jobValue = n(averageJobValue);
  const revenueLow = customersLow !== null && jobValue !== null ? customersLow * jobValue : null;
  const revenueMid = customersMid !== null && jobValue !== null ? customersMid * jobValue : null;
  const revenueHigh = customersHigh !== null && jobValue !== null ? customersHigh * jobValue : null;

  const invest = totalInvestment;
  const roiLow = revenueLow !== null && invest !== null && invest > 0 ? revenueLow / invest : null;
  const roiMid = revenueMid !== null && invest !== null && invest > 0 ? revenueMid / invest : null;
  const roiHigh = revenueHigh !== null && invest !== null && invest > 0 ? revenueHigh / invest : null;

  const breakEvenCustomers =
    invest !== null && jobValue !== null && jobValue > 0 ? invest / jobValue : null;
  const breakEvenLeads =
    breakEvenCustomers !== null && cr !== null && cr > 0 ? breakEvenCustomers / cr : null;

  const searches = n(totalMonthlySearches);
  const impShare = n(impressionShare);
  const reachableDemand = searches !== null && impShare !== null ? searches * impShare : null;
  const untappedDemand =
    searches !== null && impShare !== null ? searches * (1 - impShare) : null;

  let opportunityScore: number | null = null;
  {
    let score = 0;
    let factors = 0;
    if (searches !== null && searches > 0) { score += Math.min((searches / 5000) * 20, 20); factors++; }
    if (impShare !== null) { score += (1 - impShare) * 20; factors++; }
    if (seoCoverageStatus) {
      const seoMap: Record<string, number> = { missing: 20, weak: 14, moderate: 6, strong: 0 };
      score += seoMap[seoCoverageStatus] ?? 0; factors++;
    }
    if (paidCampaignActive !== null) { score += paidCampaignActive ? 0 : 15; factors++; }
    if (landingPageExists !== null) { score += landingPageExists ? 0 : 15; factors++; }
    if (factors >= 2) opportunityScore = Math.min(Math.round(score), 100);
  }

  // ── SEO ──────────────────────────────────────────────────────────────────────

  const seoSearchVol = n(seoMonthlySearchVolume) ?? n(totalMonthlySearches);
  const currentPos = n(currentOrganicRanking);
  const orgCvr = n(organicCvr);

  const currentCtr = organicCtrForPosition(currentPos);
  const targetCtr = 0.285; // position 1

  let organicTrafficOpportunity: number | null = null;
  let organicLeadsMid: number | null = null;
  let organicRevenueMid: number | null = null;

  if (seoSearchVol !== null) {
    const trafficGap = seoSearchVol * (targetCtr - currentCtr);
    organicTrafficOpportunity = Math.max(0, Math.round(trafficGap));
    if (orgCvr !== null) {
      organicLeadsMid = Math.round(organicTrafficOpportunity * orgCvr * 10) / 10;
      if (cr !== null && jobValue !== null) {
        organicRevenueMid = Math.round(organicLeadsMid * cr * jobValue);
      }
    }
  }

  let organicOpportunityScore: number | null = null;
  {
    let score = 0;
    let factors = 0;
    if (seoSearchVol !== null) { score += Math.min((seoSearchVol / 3000) * 25, 25); factors++; }
    if (currentPos !== null) {
      // Higher score the worse the current ranking (more room to improve)
      score += currentPos > 10 ? 30 : Math.max(0, (currentPos - 1) * 3);
      factors++;
    }
    if (seoCoverageStatus) {
      const map: Record<string, number> = { missing: 25, weak: 18, moderate: 8, strong: 0 };
      score += map[seoCoverageStatus] ?? 0; factors++;
    }
    const da = n(seoDomainAuthority);
    if (da !== null) {
      score += da < 20 ? 20 : da < 40 ? 12 : da < 60 ? 5 : 0; factors++;
    }
    if (factors >= 2) organicOpportunityScore = Math.min(Math.round(score), 100);
  }

  // ── LOCAL & GBP ──────────────────────────────────────────────────────────────

  let gbpHealthScore: number | null = null;
  {
    let score = 0;
    let factors = 0;
    const rating = n(gbpRating);
    const reviews = n(gbpReviewCount);
    const photos = n(gbpPhotoCount);
    const posts = n(gbpPostsPerMonth);

    if (reviews !== null) {
      score += Math.min((Math.log10(Math.max(reviews, 1)) / Math.log10(200)) * 30, 30);
      factors++;
    }
    if (rating !== null) {
      score += Math.max(0, ((rating - 3) / 2) * 25);
      factors++;
    }
    if (photos !== null) {
      score += Math.min((photos / 50) * 20, 20);
      factors++;
    }
    if (posts !== null) {
      score += Math.min((posts / 8) * 15, 15);
      factors++;
    }
    if (gbpServicesListed !== null) { score += gbpServicesListed ? 5 : 0; factors++; }
    if (gbpQaAnswered !== null) { score += gbpQaAnswered ? 5 : 0; factors++; }
    if (factors >= 2) gbpHealthScore = Math.min(Math.round(score), 100);
  }

  let localOpportunityScore: number | null = null;
  {
    let score = 0;
    let factors = 0;
    if (gbpHealthScore !== null) {
      score += (100 - gbpHealthScore) * 0.4;
      factors++;
    }
    const postFreqMap: Record<string, number> = { none: 20, low: 14, medium: 6, high: 0 };
    if (socialPostingFrequency) { score += postFreqMap[socialPostingFrequency] ?? 0; factors++; }
    const socialCount = [socialFacebookActive, socialInstagramActive, socialLinkedinActive].filter(v => v === false).length;
    score += socialCount * 8; factors += socialCount > 0 ? 1 : 0;
    if (!emailMarketingActive) { score += 12; factors++; }
    if (factors >= 2) localOpportunityScore = Math.min(Math.round(score), 100);
  }

  // ── ROUNDING ─────────────────────────────────────────────────────────────────
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
    organicTrafficOpportunity: r0(organicTrafficOpportunity),
    organicLeadsMid: r1(organicLeadsMid),
    organicRevenueMid: r0(organicRevenueMid),
    organicOpportunityScore,
    gbpHealthScore,
    localOpportunityScore,
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
  return missing;
}
