export type CalcMode = 'budget' | 'market';
export type DigitalChannel = 'paid_search' | 'seo' | 'local_gbp';

export interface GrowthPlanInputs {
  // --- Shared ---
  calculatorMode: CalcMode;
  industry: string | null;
  targetLocation: string | null;
  averageJobValue: number | null;
  closeRate: number | null;
  notes: string | null;

  // --- Paid Search ---
  keywordCluster: string | null;
  monthlyPackagePrice: number | null;
  managementFee: number | null;
  netAdSpend: number | null;
  avgCpc: number | null;
  lowCpc: number | null;
  highCpc: number | null;
  competition: 'low' | 'medium' | 'high' | null;
  totalMonthlySearches: number | null;
  ctr: number | null;
  impressionShare: number | null;
  cvrLow: number | null;
  cvrMid: number | null;
  cvrHigh: number | null;
  landingPageExists: boolean | null;
  pageRelevanceScore: number | null;
  seoCoverageStatus: 'missing' | 'weak' | 'moderate' | 'strong' | null;
  paidCampaignActive: boolean | null;

  // --- SEO ---
  seoKeywordTheme: string | null;
  seoMonthlySearchVolume: number | null;
  currentOrganicRanking: number | null;
  currentOrganicTraffic: number | null;
  organicCvr: number | null;
  seoTargetPagesCount: number | null;
  seoDomainAuthority: number | null;
  seoTimeToRankMonths: number | null;
  seoContentGaps: string | null;

  // --- Local & GBP ---
  gbpRating: number | null;
  gbpReviewCount: number | null;
  gbpPhotoCount: number | null;
  gbpPostsPerMonth: number | null;
  gbpServicesListed: boolean | null;
  gbpQaAnswered: boolean | null;
  socialFacebookActive: boolean | null;
  socialInstagramActive: boolean | null;
  socialLinkedinActive: boolean | null;
  socialPostingFrequency: 'none' | 'low' | 'medium' | 'high' | null;
  emailMarketingActive: boolean | null;
  emailListSize: number | null;
}

export interface GrowthPlanCalculations {
  // Paid Search
  estimatedClicks: number | null;
  leadsLow: number | null;
  leadsMid: number | null;
  leadsHigh: number | null;
  cpaLow: number | null;
  cpaMid: number | null;
  cpaHigh: number | null;
  customersLow: number | null;
  customersMid: number | null;
  customersHigh: number | null;
  revenueLow: number | null;
  revenueMid: number | null;
  revenueHigh: number | null;
  roiLow: number | null;
  roiMid: number | null;
  roiHigh: number | null;
  totalInvestment: number | null;
  breakEvenCustomers: number | null;
  breakEvenLeads: number | null;
  reachableDemand: number | null;
  untappedDemand: number | null;
  opportunityScore: number | null;
  // SEO
  organicTrafficOpportunity: number | null;
  organicLeadsMid: number | null;
  organicRevenueMid: number | null;
  organicOpportunityScore: number | null;
  // Local & GBP
  gbpHealthScore: number | null;
  localOpportunityScore: number | null;
}

export interface GrowthPlanInsights {
  summaryHeadline: string | null;
  summaryBody: string | null;
  warnings: string[];
  commentary: string[];
  strengths: string[];
  gaps: string[];
  assumptions: string[];
}

export interface GrowthPlanRecommendation {
  title: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  expectedImpact: string;
}

export interface GrowthPlanRoadmap {
  q1: string[];
  q2: string[];
  q3: string[];
  q4: string[];
}

export interface GrowthPlanExportSection {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PaidSearchGrowthPlan {
  isActive: boolean;
  inputs: GrowthPlanInputs;
  calculations: GrowthPlanCalculations;
  insights: GrowthPlanInsights;
  recommendations: GrowthPlanRecommendation[];
  roadmap: GrowthPlanRoadmap;
  export: {
    executiveSummary: string | null;
    shortSummary: string | null;
    pdfSections: GrowthPlanExportSection[];
    publicPageSections: GrowthPlanExportSection[];
  };
  metadata: {
    generatedAt: string | null;
    updatedAt: string | null;
    basedOnLiveData: boolean;
    missingFields: string[];
  };
}

export const EMPTY_INPUTS: GrowthPlanInputs = {
  // Shared
  calculatorMode: 'budget',
  industry: null,
  targetLocation: null,
  averageJobValue: null,
  closeRate: null,
  notes: null,
  // Paid Search
  keywordCluster: null,
  monthlyPackagePrice: null,
  managementFee: null,
  netAdSpend: null,
  avgCpc: null,
  lowCpc: null,
  highCpc: null,
  competition: null,
  totalMonthlySearches: null,
  ctr: null,
  impressionShare: null,
  cvrLow: null,
  cvrMid: null,
  cvrHigh: null,
  landingPageExists: null,
  pageRelevanceScore: null,
  seoCoverageStatus: null,
  paidCampaignActive: null,
  // SEO
  seoKeywordTheme: null,
  seoMonthlySearchVolume: null,
  currentOrganicRanking: null,
  currentOrganicTraffic: null,
  organicCvr: null,
  seoTargetPagesCount: null,
  seoDomainAuthority: null,
  seoTimeToRankMonths: null,
  seoContentGaps: null,
  // Local & GBP
  gbpRating: null,
  gbpReviewCount: null,
  gbpPhotoCount: null,
  gbpPostsPerMonth: null,
  gbpServicesListed: null,
  gbpQaAnswered: null,
  socialFacebookActive: null,
  socialInstagramActive: null,
  socialLinkedinActive: null,
  socialPostingFrequency: null,
  emailMarketingActive: null,
  emailListSize: null,
};

export const EMPTY_CALCULATIONS: GrowthPlanCalculations = {
  estimatedClicks: null,
  leadsLow: null,
  leadsMid: null,
  leadsHigh: null,
  cpaLow: null,
  cpaMid: null,
  cpaHigh: null,
  customersLow: null,
  customersMid: null,
  customersHigh: null,
  revenueLow: null,
  revenueMid: null,
  revenueHigh: null,
  roiLow: null,
  roiMid: null,
  roiHigh: null,
  totalInvestment: null,
  breakEvenCustomers: null,
  breakEvenLeads: null,
  reachableDemand: null,
  untappedDemand: null,
  opportunityScore: null,
  organicTrafficOpportunity: null,
  organicLeadsMid: null,
  organicRevenueMid: null,
  organicOpportunityScore: null,
  gbpHealthScore: null,
  localOpportunityScore: null,
};
