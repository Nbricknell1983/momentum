// =============================================================================
// COMPONENT LIBRARY — DATA TYPES
// =============================================================================
// Typed data contracts for each component. Templates receive these shapes.
// All fields sourced from GBP, SERP, crawl, or AI generation.
// =============================================================================

// Conversion archetypes — self-contained in this module (different from visibility/types.ts)
export type ConversionArchetype =
  | 'proof_machine'
  | 'local_anchor'
  | 'authority_expert'
  | 'value_challenger'
  | 'trust_builder';

// Component type — self-contained in this module (more granular than visibility/types.ts)
export type ComponentType =
  | 'nav' | 'hero' | 'trust_bar' | 'service_grid' | 'testimonial_carousel'
  | 'testimonial_grid' | 'cta_primary' | 'cta_sticky' | 'contact_form' | 'footer'
  | 'process_steps' | 'stats_bar' | 'faq_accordion' | 'location_map' | 'local_schema'
  | 'breadcrumb' | 'before_after' | 'team_grid' | 'gallery_masonry' | 'pricing_table'
  | 'comparison_table' | 'video_embed' | 'award_strip' | 'related_pages';

export interface NavData {
  businessName: string;
  logoUrl?: string;
  phone: string;
  navLinks: { label: string; url: string }[];
  ctaText?: string;
  ctaUrl?: string;
  isSticky?: boolean;
}

export interface HeroData {
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaUrl: string;
  phone: string;
  location?: string;
  suburb?: string;
  reviewCount?: number;
  reviewRating?: number;
  reviewPlatform?: string;
  trustStats?: Array<{ value: string; label: string }>;
  backgroundImageUrl?: string;
  badge?: string;
  guarantee?: string;
  yearsInBusiness?: number;
  priceFrom?: string;
  savingsClaim?: string;
}

export interface TrustBarData {
  reviewCount?: number;
  reviewRating?: number;
  reviewPlatform?: string;
  yearsInBusiness?: number;
  completedJobs?: number;
  badges?: string[];
  licenseNumber?: string;
  guaranteeText?: string;
  responseTime?: string;
}

export interface ServiceGridData {
  headline?: string;
  subheadline?: string;
  services: Array<{
    name: string;
    description?: string;
    url?: string;
    icon?: string;
    priceFrom?: string;
  }>;
}

export interface TestimonialData {
  testimonials: Array<{
    name: string;
    text: string;
    rating: number;
    location?: string;
    date?: string;
    platform?: string;
    jobType?: string;
  }>;
  headline?: string;
  subheadline?: string;
}

export interface CTAPrimaryData {
  headline: string;
  subheadline?: string;
  ctaText: string;
  ctaUrl: string;
  phone: string;
  supportText?: string;
  badge?: string;
  guarantee?: string;
  urgency?: string;
}

export interface ContactFormData {
  businessName: string;
  phone: string;
  email?: string;
  address?: string;
  suburb?: string;
  formTitle?: string;
  formSubtitle?: string;
  responsePromise?: string;
  fields?: Array<{
    name: string;
    label: string;
    type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
    required?: boolean;
    options?: string[];
    placeholder?: string;
  }>;
}

export interface FooterData {
  businessName: string;
  phone: string;
  email?: string;
  address?: string;
  suburb?: string;
  licenseNumber?: string;
  abn?: string;
  navLinks?: { label: string; url: string }[];
  services?: string[];
  serviceAreas?: string[];
  socialLinks?: { platform: string; url: string }[];
  copyrightYear?: number;
  tagline?: string;
}

export interface ProcessStepsData {
  headline?: string;
  subheadline?: string;
  steps: Array<{
    number?: string;
    title: string;
    description: string;
    icon?: string;
  }>;
  ctaText?: string;
  ctaUrl?: string;
}

export interface StatsBarData {
  stats: Array<{
    value: string;
    label: string;
  }>;
  background?: 'light' | 'dark' | 'brand';
}

export interface FAQData {
  headline?: string;
  subheadline?: string;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
}

export interface BeforeAfterData {
  headline?: string;
  subheadline?: string;
  pairs: Array<{
    beforeImageUrl: string;
    afterImageUrl: string;
    caption?: string;
    jobType?: string;
  }>;
}

// Union of all component data shapes
export type ComponentData =
  | NavData
  | HeroData
  | TrustBarData
  | ServiceGridData
  | TestimonialData
  | CTAPrimaryData
  | ContactFormData
  | FooterData
  | ProcessStepsData
  | StatsBarData
  | FAQData
  | BeforeAfterData;

// Minimal brand token shape consumed by templates
export interface TemplateBrandTokens {
  primary: string;       // hex e.g. '#1a56db'
  secondary: string;     // hex
  accent: string;        // hex
  text: string;          // hex
  background: string;    // hex
  fontHeading: string;   // Google Font name
  fontBody: string;      // Google Font name
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  logoUrl?: string;
}

// Maps borderRadius token → Tailwind class
export const RADIUS_CLASS: Record<TemplateBrandTokens['borderRadius'], string> = {
  none: 'rounded-none',
  sm:   'rounded',
  md:   'rounded-md',
  lg:   'rounded-lg',
  xl:   'rounded-xl',
  full: 'rounded-full',
};
