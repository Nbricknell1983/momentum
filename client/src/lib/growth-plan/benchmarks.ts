export interface IndustryBenchmark {
  label: string;
  cvrLow: number;
  cvrMid: number;
  cvrHigh: number;
  ctr: number;
  impressionShare: number;
}

export const INDUSTRY_BENCHMARKS: Record<string, IndustryBenchmark> = {
  dentist: { label: 'Dentist', cvrLow: 0.14, cvrMid: 0.20, cvrHigh: 0.25, ctr: 0.05, impressionShare: 0.35 },
  dental: { label: 'Dental', cvrLow: 0.14, cvrMid: 0.20, cvrHigh: 0.25, ctr: 0.05, impressionShare: 0.35 },
  builder: { label: 'Builder', cvrLow: 0.05, cvrMid: 0.08, cvrHigh: 0.12, ctr: 0.04, impressionShare: 0.28 },
  general_contractor: { label: 'General Contractor', cvrLow: 0.05, cvrMid: 0.08, cvrHigh: 0.12, ctr: 0.04, impressionShare: 0.28 },
  contractor: { label: 'Contractor', cvrLow: 0.05, cvrMid: 0.08, cvrHigh: 0.12, ctr: 0.04, impressionShare: 0.28 },
  electrician: { label: 'Electrician', cvrLow: 0.12, cvrMid: 0.18, cvrHigh: 0.24, ctr: 0.06, impressionShare: 0.40 },
  electrical: { label: 'Electrical', cvrLow: 0.12, cvrMid: 0.18, cvrHigh: 0.24, ctr: 0.06, impressionShare: 0.40 },
  plumber: { label: 'Plumber', cvrLow: 0.10, cvrMid: 0.16, cvrHigh: 0.22, ctr: 0.06, impressionShare: 0.38 },
  plumbing: { label: 'Plumbing', cvrLow: 0.10, cvrMid: 0.16, cvrHigh: 0.22, ctr: 0.06, impressionShare: 0.38 },
  landscaper: { label: 'Landscaper', cvrLow: 0.06, cvrMid: 0.10, cvrHigh: 0.15, ctr: 0.04, impressionShare: 0.30 },
  landscaping: { label: 'Landscaping', cvrLow: 0.06, cvrMid: 0.10, cvrHigh: 0.15, ctr: 0.04, impressionShare: 0.30 },
  roofer: { label: 'Roofer', cvrLow: 0.08, cvrMid: 0.12, cvrHigh: 0.18, ctr: 0.05, impressionShare: 0.32 },
  roofing: { label: 'Roofing', cvrLow: 0.08, cvrMid: 0.12, cvrHigh: 0.18, ctr: 0.05, impressionShare: 0.32 },
  hvac: { label: 'HVAC / Air Con', cvrLow: 0.10, cvrMid: 0.15, cvrHigh: 0.22, ctr: 0.05, impressionShare: 0.35 },
  air_conditioning: { label: 'Air Conditioning', cvrLow: 0.10, cvrMid: 0.15, cvrHigh: 0.22, ctr: 0.05, impressionShare: 0.35 },
  legal: { label: 'Law Firm', cvrLow: 0.06, cvrMid: 0.10, cvrHigh: 0.15, ctr: 0.04, impressionShare: 0.28 },
  lawyer: { label: 'Lawyer', cvrLow: 0.06, cvrMid: 0.10, cvrHigh: 0.15, ctr: 0.04, impressionShare: 0.28 },
  accounting: { label: 'Accountant', cvrLow: 0.05, cvrMid: 0.09, cvrHigh: 0.14, ctr: 0.04, impressionShare: 0.30 },
  accountant: { label: 'Accountant', cvrLow: 0.05, cvrMid: 0.09, cvrHigh: 0.14, ctr: 0.04, impressionShare: 0.30 },
  ecommerce: { label: 'Ecommerce', cvrLow: 0.02, cvrMid: 0.03, cvrHigh: 0.05, ctr: 0.03, impressionShare: 0.25 },
  real_estate: { label: 'Real Estate', cvrLow: 0.04, cvrMid: 0.07, cvrHigh: 0.11, ctr: 0.04, impressionShare: 0.30 },
  healthcare: { label: 'Healthcare', cvrLow: 0.08, cvrMid: 0.13, cvrHigh: 0.19, ctr: 0.05, impressionShare: 0.32 },
  pest_control: { label: 'Pest Control', cvrLow: 0.12, cvrMid: 0.18, cvrHigh: 0.25, ctr: 0.07, impressionShare: 0.42 },
  cleaning: { label: 'Cleaning', cvrLow: 0.08, cvrMid: 0.13, cvrHigh: 0.18, ctr: 0.05, impressionShare: 0.33 },
  tiling: { label: 'Tiling', cvrLow: 0.06, cvrMid: 0.10, cvrHigh: 0.15, ctr: 0.04, impressionShare: 0.28 },
  painting: { label: 'Painting', cvrLow: 0.07, cvrMid: 0.11, cvrHigh: 0.17, ctr: 0.05, impressionShare: 0.30 },
  solar: { label: 'Solar', cvrLow: 0.04, cvrMid: 0.07, cvrHigh: 0.11, ctr: 0.04, impressionShare: 0.28 },
  default: { label: 'General', cvrLow: 0.05, cvrMid: 0.10, cvrHigh: 0.18, ctr: 0.05, impressionShare: 0.30 },
};

export const INDUSTRY_LABELS = Object.entries(INDUSTRY_BENCHMARKS)
  .filter(([key]) => key !== 'default')
  .map(([key, val]) => ({ key, label: val.label }))
  .filter((item, index, self) => self.findIndex(i => i.label === item.label) === index)
  .sort((a, b) => a.label.localeCompare(b.label));

export function getBenchmarkForIndustry(industry: string | null): IndustryBenchmark {
  if (!industry) return INDUSTRY_BENCHMARKS.default;
  const key = industry.toLowerCase().replace(/[\s-/]+/g, '_').replace(/[^a-z_]/g, '');
  if (INDUSTRY_BENCHMARKS[key]) return INDUSTRY_BENCHMARKS[key];
  for (const [bKey, val] of Object.entries(INDUSTRY_BENCHMARKS)) {
    if (bKey !== 'default' && (industry.toLowerCase().includes(bKey) || bKey.includes(industry.toLowerCase()))) {
      return val;
    }
  }
  return INDUSTRY_BENCHMARKS.default;
}
