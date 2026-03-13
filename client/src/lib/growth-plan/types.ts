export type CalcMode = 'budget' | 'market';

export interface GrowthPlanInputs {
  calculatorMode: CalcMode;
  industry: string | null;
  targetLocation: string | null;
  keywordCluster: string | null;
  monthlyPackagePrice: number | null;
  managementFee: number | null;
  netAdSpend: number | null;
  averageJobValue: number | null;
  closeRate: number | null;
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
  notes: string | null;
}

export interface GrowthPlanCalculations {
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
  calculatorMode: 'budget',
  industry: null,
  targetLocation: null,
  keywordCluster: null,
  monthlyPackagePrice: null,
  managementFee: null,
  netAdSpend: null,
  averageJobValue: null,
  closeRate: null,
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
  notes: null,
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
};
