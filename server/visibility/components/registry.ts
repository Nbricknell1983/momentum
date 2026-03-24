// =============================================================================
// COMPONENT LIBRARY — REGISTRY
// =============================================================================
// Metadata, data slot contracts, and archetype variant definitions.
// No HTML lives here — see templates/ directory.
// =============================================================================

import type { ConversionArchetype, ComponentType } from './types';

// ---------------------------------------------------------------------------
// Data slot definition
// ---------------------------------------------------------------------------
export interface DataSlot {
  key: string;
  type: 'string' | 'string[]' | 'number' | 'boolean' | 'object' | 'object[]';
  source: 'gbp' | 'serp' | 'crawl' | 'manual' | 'ai_generated' | 'derived';
  required: boolean;
  description: string;
  fallback?: string;
}

// ---------------------------------------------------------------------------
// Variant definition (per archetype)
// ---------------------------------------------------------------------------
export interface VariantDefinition {
  variantId: string;
  name: string;
  description: string;
  trustSignals: string[];     // which trust elements this variant foregrounds
  conversionMechanism: string; // how this variant drives action
}

// ---------------------------------------------------------------------------
// Full component definition
// ---------------------------------------------------------------------------
export interface ComponentDefinition {
  type: ComponentType;
  displayName: string;
  description: string;
  seoWeight: number;           // 0–1 contribution to on-page SEO
  conversionWeight: number;    // 0–1 contribution to conversion
  gbpSignals: string[];        // GBP fields consumed by this component
  dataSlots: DataSlot[];
  archetypeVariants: Record<ConversionArchetype, VariantDefinition>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const COMPONENT_REGISTRY: Record<ComponentType, ComponentDefinition> = {

  nav: {
    type: 'nav',
    displayName: 'Navigation Bar',
    description: 'Top navigation with logo, links, phone, and CTA button',
    seoWeight: 0.1,
    conversionWeight: 0.6,
    gbpSignals: ['name', 'phoneNumbers'],
    dataSlots: [
      { key: 'businessName', type: 'string', source: 'gbp', required: true, description: 'Business name', fallback: 'Our Business' },
      { key: 'logoUrl', type: 'string', source: 'manual', required: false, description: 'Logo image URL' },
      { key: 'phone', type: 'string', source: 'gbp', required: true, description: 'Primary phone number' },
      { key: 'navLinks', type: 'object[]', source: 'ai_generated', required: true, description: 'Navigation link label/url pairs' },
      { key: 'ctaText', type: 'string', source: 'ai_generated', required: false, description: 'CTA button label', fallback: 'Get a Quote' },
      { key: 'ctaUrl', type: 'string', source: 'ai_generated', required: false, description: 'CTA button destination', fallback: '#contact' },
      { key: 'isSticky', type: 'boolean', source: 'manual', required: false, description: 'Whether nav sticks to top on scroll', fallback: 'true' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'nav-proof',     name: 'Social Proof Nav',    description: 'Rating badge in nav bar beside CTA',               trustSignals: ['star_rating', 'review_count'],        conversionMechanism: 'Rating in nav increases CTA clicks by anchoring social proof' },
      local_anchor:     { variantId: 'nav-local',     name: 'Local Authority Nav', description: 'Suburb tag beneath logo, local phone prominent',   trustSignals: ['local_presence', 'phone'],            conversionMechanism: 'Local identifier triggers "they know my area" trust' },
      authority_expert: { variantId: 'nav-authority', name: 'Expert Nav',          description: 'Credentials badge / years in nav utility bar',     trustSignals: ['credentials', 'years_experience'],   conversionMechanism: 'Authority signals reduce bounce before reading content' },
      value_challenger: { variantId: 'nav-value',     name: 'Value Nav',           description: 'Promo ribbon above nav, price anchor in CTA',      trustSignals: ['price_transparency', 'offer'],        conversionMechanism: 'Offer visibility drives immediate engagement' },
      trust_builder:    { variantId: 'nav-trust',     name: 'Guarantee Nav',       description: 'Satisfaction guarantee badge in utility bar',      trustSignals: ['guarantee', 'license'],               conversionMechanism: 'Risk elimination immediately visible reduces hesitation' },
    },
  },

  hero: {
    type: 'hero',
    displayName: 'Hero Section',
    description: 'Above-the-fold primary value proposition section',
    seoWeight: 0.8,
    conversionWeight: 0.9,
    gbpSignals: ['name', 'phoneNumbers', 'serviceArea', 'rating', 'userRatingCount'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: true, description: 'H1 headline', fallback: 'Expert Service You Can Trust' },
      { key: 'subheadline', type: 'string', source: 'ai_generated', required: true, description: 'Supporting paragraph' },
      { key: 'ctaText', type: 'string', source: 'ai_generated', required: true, description: 'Primary CTA label', fallback: 'Get a Free Quote' },
      { key: 'ctaUrl', type: 'string', source: 'ai_generated', required: true, description: 'Primary CTA destination', fallback: '#contact' },
      { key: 'phone', type: 'string', source: 'gbp', required: true, description: 'Clickable phone number' },
      { key: 'location', type: 'string', source: 'gbp', required: false, description: 'Service area / location' },
      { key: 'reviewCount', type: 'number', source: 'gbp', required: false, description: 'Total review count' },
      { key: 'reviewRating', type: 'number', source: 'gbp', required: false, description: 'Average star rating (1–5)' },
      { key: 'trustStats', type: 'object[]', source: 'ai_generated', required: false, description: 'Stats array {value, label}' },
      { key: 'backgroundImageUrl', type: 'string', source: 'manual', required: false, description: 'Hero background image' },
      { key: 'badge', type: 'string', source: 'ai_generated', required: false, description: 'Small trust badge text' },
      { key: 'guarantee', type: 'string', source: 'ai_generated', required: false, description: 'Guarantee claim text' },
      { key: 'yearsInBusiness', type: 'number', source: 'gbp', required: false, description: 'Years trading' },
      { key: 'priceFrom', type: 'string', source: 'manual', required: false, description: 'Starting price anchor' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'hero-proof',     name: 'Reviews-First Hero',    description: 'Star rating and review count above H1',              trustSignals: ['star_rating', 'review_count', 'platform'],  conversionMechanism: 'Social proof above fold establishes credibility before value prop' },
      local_anchor:     { variantId: 'hero-local',     name: 'Local Area Hero',       description: 'Suburb-specific headline, map pin, service area list', trustSignals: ['local_presence', 'service_area'],           conversionMechanism: 'Hyperlocal framing creates "they serve MY area" belonging' },
      authority_expert: { variantId: 'hero-authority', name: 'Expert Credentials Hero', description: 'License, accreditation, years front-and-centre',     trustSignals: ['credentials', 'certifications', 'years'],   conversionMechanism: 'Expert positioning justifies premium and reduces comparison shopping' },
      value_challenger: { variantId: 'hero-value',     name: 'Price-Forward Hero',    description: 'Starting price prominent, savings claim, comparison',  trustSignals: ['price_transparency', 'value_guarantee'],    conversionMechanism: 'Price anchoring beats competitor pages on cost-conscious searches' },
      trust_builder:    { variantId: 'hero-trust',     name: 'Guarantee-First Hero',  description: 'Satisfaction guarantee banner, risk-free framing',     trustSignals: ['guarantee', 'no_risk', 'license'],          conversionMechanism: 'Removing risk objection first accelerates decision for cautious buyers' },
    },
  },

  trust_bar: {
    type: 'trust_bar',
    displayName: 'Trust Bar',
    description: 'Horizontal strip of trust signals — reviews, badges, stats',
    seoWeight: 0.1,
    conversionWeight: 0.7,
    gbpSignals: ['rating', 'userRatingCount', 'attributes'],
    dataSlots: [
      { key: 'reviewCount', type: 'number', source: 'gbp', required: false, description: 'Total reviews' },
      { key: 'reviewRating', type: 'number', source: 'gbp', required: false, description: 'Average rating' },
      { key: 'reviewPlatform', type: 'string', source: 'gbp', required: false, description: 'Review platform name', fallback: 'Google' },
      { key: 'yearsInBusiness', type: 'number', source: 'derived', required: false, description: 'Years operating' },
      { key: 'completedJobs', type: 'number', source: 'manual', required: false, description: 'Jobs completed count' },
      { key: 'badges', type: 'string[]', source: 'gbp', required: false, description: 'Accreditation / badge names' },
      { key: 'licenseNumber', type: 'string', source: 'manual', required: false, description: 'License number to display' },
      { key: 'guaranteeText', type: 'string', source: 'ai_generated', required: false, description: 'Guarantee copy' },
      { key: 'responseTime', type: 'string', source: 'manual', required: false, description: 'Response time claim', fallback: 'Same-day response' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'trust-proof',     name: 'Review-Led Trust Bar',      description: 'Big star rating centre, review count, platform logo',   trustSignals: ['star_rating', 'review_count'],  conversionMechanism: 'Amplifies proof already signalled in hero' },
      local_anchor:     { variantId: 'trust-local',     name: 'Local Credibility Bar',     description: 'Service areas listed, local awards, years local',       trustSignals: ['local_presence', 'years'],      conversionMechanism: 'Reinforces local authority after hero claim' },
      authority_expert: { variantId: 'trust-authority', name: 'Credentials Strip',         description: 'Accreditation logos, licence number, insurance badges',  trustSignals: ['credentials', 'certifications'], conversionMechanism: 'Validates expert claim with verifiable signals' },
      value_challenger: { variantId: 'trust-value',     name: 'Value Proof Bar',           description: 'Jobs done count, average saving, response time',        trustSignals: ['jobs_count', 'response_time'],  conversionMechanism: 'Demonstrates volume = reliability at good price' },
      trust_builder:    { variantId: 'trust-builder',   name: 'Guarantee & Safety Bar',    description: 'Satisfaction guarantee, insurance, safe payment icons',  trustSignals: ['guarantee', 'insurance'],       conversionMechanism: 'Systematically removes every risk objection' },
    },
  },

  service_grid: {
    type: 'service_grid',
    displayName: 'Service Grid',
    description: 'Grid of service cards linking to individual service pages',
    seoWeight: 0.7,
    conversionWeight: 0.6,
    gbpSignals: ['services'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'subheadline', type: 'string', source: 'ai_generated', required: false, description: 'Section subheadline' },
      { key: 'services', type: 'object[]', source: 'gbp', required: true, description: 'Service array {name, description, url, icon, priceFrom}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'services-proof',     name: 'Review-Tagged Services',   description: 'Each service card shows mini star rating / job count',  trustSignals: ['per_service_rating'],         conversionMechanism: 'Proof attached to each service reduces category-level hesitation' },
      local_anchor:     { variantId: 'services-local',     name: 'Local Services Grid',      description: 'Service cards mention local suburbs served',           trustSignals: ['local_presence'],             conversionMechanism: 'Local anchoring on service level makes each card feel personal' },
      authority_expert: { variantId: 'services-authority', name: 'Expert Services Grid',     description: 'Technical service names, complexity levels shown',      trustSignals: ['expertise', 'complexity'],    conversionMechanism: 'Technical language positions as specialist vs generalist' },
      value_challenger: { variantId: 'services-value',     name: 'Priced Services Grid',     description: 'Starting price on each service card',                  trustSignals: ['price_transparency'],         conversionMechanism: 'Price visibility eliminates "call for quote" friction' },
      trust_builder:    { variantId: 'services-trust',     name: 'Guaranteed Services Grid', description: 'Each service shows guarantee / no-risk badge',          trustSignals: ['per_service_guarantee'],      conversionMechanism: 'Service-level guarantee reduces commitment anxiety' },
    },
  },

  testimonial_carousel: {
    type: 'testimonial_carousel',
    displayName: 'Testimonial Carousel',
    description: 'Auto-advancing or scrollable testimonial display',
    seoWeight: 0.4,
    conversionWeight: 0.8,
    gbpSignals: ['reviews'],
    dataSlots: [
      { key: 'testimonials', type: 'object[]', source: 'gbp', required: true, description: 'Review objects {name, text, rating, location, date, platform}' },
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'subheadline', type: 'string', source: 'ai_generated', required: false, description: 'Section subheadline' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'testimonials-proof',     name: 'Google Reviews Carousel',   description: 'Full Google review cards with stars and dates',        trustSignals: ['star_rating', 'platform_badge', 'date'],  conversionMechanism: 'Verified platform source makes proof irrefutable' },
      local_anchor:     { variantId: 'testimonials-local',     name: 'Neighbour Reviews Carousel', description: 'Reviews filtered by suburb, map pin on each card',    trustSignals: ['local_presence', 'neighbour_signal'],     conversionMechanism: '"People in MY suburb use them" creates strongest local proof' },
      authority_expert: { variantId: 'testimonials-authority', name: 'Expert Outcome Carousel',   description: 'Reviews focused on expertise / technical outcomes',    trustSignals: ['expertise_validation'],                   conversionMechanism: 'Peer validation of expert claim from real customers' },
      value_challenger: { variantId: 'testimonials-value',     name: 'Value Proof Carousel',      description: 'Reviews mentioning price, savings, or value for money', trustSignals: ['price_validation', 'value_signal'],       conversionMechanism: 'Real customers confirming value claim beats your own copy' },
      trust_builder:    { variantId: 'testimonials-trust',     name: 'Reassurance Carousel',      description: 'Reviews emphasising reliability, care, and follow-through', trustSignals: ['reliability', 'care'],                conversionMechanism: 'Emotional reassurance from past customers for anxious buyers' },
    },
  },

  testimonial_grid: {
    type: 'testimonial_grid',
    displayName: 'Testimonial Grid',
    description: 'Static 3-column grid of testimonial cards',
    seoWeight: 0.4,
    conversionWeight: 0.7,
    gbpSignals: ['reviews'],
    dataSlots: [
      { key: 'testimonials', type: 'object[]', source: 'gbp', required: true, description: 'Review objects' },
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'tgrid-proof',     name: 'Masonry Review Grid',      description: 'Varied-height cards, Google badge on each',         trustSignals: ['volume', 'platform_badge'],    conversionMechanism: 'Volume of cards creates overwhelming social proof' },
      local_anchor:     { variantId: 'tgrid-local',     name: 'Community Grid',           description: 'Suburb labels on each card, local feel',            trustSignals: ['local_presence'],             conversionMechanism: 'Geographic diversity proves coverage of the area' },
      authority_expert: { variantId: 'tgrid-authority', name: 'Expert Outcome Grid',      description: 'Cards highlight technical expertise',                trustSignals: ['expertise_validation'],       conversionMechanism: 'Reinforces specialist positioning' },
      value_challenger: { variantId: 'tgrid-value',     name: 'Value Testimonial Grid',   description: 'Quote badges highlighting value claims',             trustSignals: ['value_signal'],               conversionMechanism: 'Multiple sources confirming value is more persuasive than one' },
      trust_builder:    { variantId: 'tgrid-trust',     name: 'Reliability Grid',         description: 'Cards focus on follow-through, care, reliability',   trustSignals: ['reliability'],                conversionMechanism: 'Pattern of reliability across many customers builds confidence' },
    },
  },

  cta_primary: {
    type: 'cta_primary',
    displayName: 'Primary CTA Section',
    description: 'Full-width call-to-action section mid-page or end-page',
    seoWeight: 0.2,
    conversionWeight: 0.9,
    gbpSignals: ['phoneNumbers'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: true, description: 'CTA headline' },
      { key: 'subheadline', type: 'string', source: 'ai_generated', required: false, description: 'Supporting copy' },
      { key: 'ctaText', type: 'string', source: 'ai_generated', required: true, description: 'Button label', fallback: 'Get a Free Quote' },
      { key: 'ctaUrl', type: 'string', source: 'ai_generated', required: true, description: 'Button URL', fallback: '#contact' },
      { key: 'phone', type: 'string', source: 'gbp', required: true, description: 'Phone number' },
      { key: 'supportText', type: 'string', source: 'ai_generated', required: false, description: 'Below-button micro-copy' },
      { key: 'badge', type: 'string', source: 'ai_generated', required: false, description: 'Trust badge label' },
      { key: 'guarantee', type: 'string', source: 'ai_generated', required: false, description: 'Guarantee claim' },
      { key: 'urgency', type: 'string', source: 'ai_generated', required: false, description: 'Urgency/scarcity line' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'cta-proof',     name: 'Proof-Anchored CTA',   description: 'Review count beside CTA button',                  trustSignals: ['star_rating', 'review_count'], conversionMechanism: 'Last-mile proof before commitment' },
      local_anchor:     { variantId: 'cta-local',     name: 'Local Response CTA',   description: 'Same-day response promise, suburb-specific copy',  trustSignals: ['local_response', 'speed'],    conversionMechanism: 'Speed + local relevance = lowest friction decision' },
      authority_expert: { variantId: 'cta-authority', name: 'Expert Consultation CTA', description: 'Frame CTA as expert consultation, not just quote',trustSignals: ['expertise'],                  conversionMechanism: 'Elevates action from commodity to specialist engagement' },
      value_challenger: { variantId: 'cta-value',     name: 'Value CTA',            description: 'Price anchor, savings claim, no-obligation copy',  trustSignals: ['price_transparency', 'no_risk'], conversionMechanism: 'Removes both cost and commitment objections simultaneously' },
      trust_builder:    { variantId: 'cta-trust',     name: 'Risk-Free CTA',        description: 'Guarantee front and centre on CTA block',          trustSignals: ['guarantee', 'no_risk'],       conversionMechanism: 'Eliminates final hesitation by removing downside risk' },
    },
  },

  contact_form: {
    type: 'contact_form',
    displayName: 'Contact Form',
    description: 'Lead capture form with business contact details',
    seoWeight: 0.3,
    conversionWeight: 1.0,
    gbpSignals: ['phoneNumbers', 'websiteUri'],
    dataSlots: [
      { key: 'businessName', type: 'string', source: 'gbp', required: true, description: 'Business name' },
      { key: 'phone', type: 'string', source: 'gbp', required: true, description: 'Phone number' },
      { key: 'email', type: 'string', source: 'gbp', required: false, description: 'Contact email' },
      { key: 'address', type: 'string', source: 'gbp', required: false, description: 'Business address' },
      { key: 'formTitle', type: 'string', source: 'ai_generated', required: false, description: 'Form section headline' },
      { key: 'formSubtitle', type: 'string', source: 'ai_generated', required: false, description: 'Form supporting copy' },
      { key: 'responsePromise', type: 'string', source: 'ai_generated', required: false, description: 'Response time promise', fallback: 'We reply within 2 hours' },
      { key: 'fields', type: 'object[]', source: 'ai_generated', required: false, description: 'Custom form fields' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'form-proof',     name: 'Social Proof Form',      description: 'Review count beside form to reduce last-step hesitation', trustSignals: ['star_rating'],           conversionMechanism: 'Proof at point of commitment is highest-impact placement' },
      local_anchor:     { variantId: 'form-local',     name: 'Local Contact Form',     description: 'Suburb field prominent, local response promise',          trustSignals: ['local_response'],        conversionMechanism: 'Personalised local touch at contact stage' },
      authority_expert: { variantId: 'form-authority', name: 'Consultation Request',   description: 'Form positioned as booking an expert consultation',       trustSignals: ['expertise'],             conversionMechanism: 'Premium framing of form reduces commodity feel' },
      value_challenger: { variantId: 'form-value',     name: 'Free Quote Form',        description: 'Zero-cost framing, price range promise on response',     trustSignals: ['free', 'price_range'],   conversionMechanism: 'Removes cost-of-enquiry objection' },
      trust_builder:    { variantId: 'form-trust',     name: 'Secure Enquiry Form',    description: 'Privacy assurance, no-spam badge, response guarantee',   trustSignals: ['privacy', 'guarantee'],  conversionMechanism: 'Addresses data / commitment anxiety at submission' },
    },
  },

  footer: {
    type: 'footer',
    displayName: 'Footer',
    description: 'Site footer with nav, contact, and legal information',
    seoWeight: 0.5,
    conversionWeight: 0.3,
    gbpSignals: ['name', 'phoneNumbers', 'regularHours', 'address'],
    dataSlots: [
      { key: 'businessName', type: 'string', source: 'gbp', required: true, description: 'Business name' },
      { key: 'phone', type: 'string', source: 'gbp', required: true, description: 'Phone number' },
      { key: 'email', type: 'string', source: 'gbp', required: false, description: 'Email address' },
      { key: 'address', type: 'string', source: 'gbp', required: false, description: 'Physical address' },
      { key: 'licenseNumber', type: 'string', source: 'manual', required: false, description: 'Trade licence number' },
      { key: 'abn', type: 'string', source: 'manual', required: false, description: 'ABN' },
      { key: 'navLinks', type: 'object[]', source: 'ai_generated', required: false, description: 'Footer navigation links' },
      { key: 'services', type: 'string[]', source: 'gbp', required: false, description: 'Service names for footer SEO' },
      { key: 'serviceAreas', type: 'string[]', source: 'gbp', required: false, description: 'Service areas for local SEO' },
      { key: 'tagline', type: 'string', source: 'ai_generated', required: false, description: 'Brand tagline' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'footer-proof',     name: 'Social Proof Footer',  description: 'Rating summary in footer beside contact',    trustSignals: ['star_rating'],         conversionMechanism: 'Proof even at exit point, last chance to convert' },
      local_anchor:     { variantId: 'footer-local',     name: 'Local Areas Footer',   description: 'Service areas grid, local signals prominent', trustSignals: ['service_areas'],       conversionMechanism: 'Internal links to area pages boost local SEO' },
      authority_expert: { variantId: 'footer-authority', name: 'Credentials Footer',   description: 'Accreditations, license, and insurer shown',  trustSignals: ['credentials'],         conversionMechanism: 'Credential reinforcement at close of page' },
      value_challenger: { variantId: 'footer-value',     name: 'Value Footer',         description: 'Price guarantee and promise statements',      trustSignals: ['value_guarantee'],     conversionMechanism: 'Value promise closure after consuming content' },
      trust_builder:    { variantId: 'footer-trust',     name: 'Trust Foundation Footer', description: 'Safety, privacy, guarantee in footer bar', trustSignals: ['guarantee', 'safety'], conversionMechanism: 'Systematic trust closure at bottom of every page' },
    },
  },

  process_steps: {
    type: 'process_steps',
    displayName: 'Process Steps',
    description: 'How-it-works numbered process, reduces friction',
    seoWeight: 0.3,
    conversionWeight: 0.6,
    gbpSignals: [],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'steps', type: 'object[]', source: 'ai_generated', required: true, description: 'Steps {number, title, description}' },
      { key: 'ctaText', type: 'string', source: 'ai_generated', required: false, description: 'CTA after steps' },
      { key: 'ctaUrl', type: 'string', source: 'ai_generated', required: false, description: 'CTA URL' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'process-proof',     name: 'Proven Process',      description: 'Steps show review collection / satisfaction',    trustSignals: ['process_transparency'],  conversionMechanism: 'Transparency about process reduces uncertainty' },
      local_anchor:     { variantId: 'process-local',     name: 'Local Process',       description: 'Steps show responsiveness to local area',       trustSignals: ['local_response'],        conversionMechanism: 'Local framing of process reinforces area commitment' },
      authority_expert: { variantId: 'process-authority', name: 'Expert Method',       description: 'Steps show technical rigour and methodology',    trustSignals: ['expertise', 'rigour'],   conversionMechanism: 'Methodology detail justifies premium positioning' },
      value_challenger: { variantId: 'process-value',     name: 'Simple Fast Process', description: 'Steps emphasise speed and ease = value',         trustSignals: ['speed', 'simplicity'],   conversionMechanism: 'Effortless process is itself a value proposition' },
      trust_builder:    { variantId: 'process-trust',     name: 'Safe & Guaranteed Process', description: 'Each step has a safety/guarantee note',      trustSignals: ['guarantee', 'safety'],   conversionMechanism: 'Risk-removal at every stage of the journey' },
    },
  },

  stats_bar: {
    type: 'stats_bar',
    displayName: 'Stats Bar',
    description: 'Horizontal row of key business statistics',
    seoWeight: 0.1,
    conversionWeight: 0.5,
    gbpSignals: ['userRatingCount'],
    dataSlots: [
      { key: 'stats', type: 'object[]', source: 'derived', required: true, description: 'Stats array {value, label}' },
      { key: 'background', type: 'string', source: 'manual', required: false, description: 'Background style: light/dark/brand', fallback: 'brand' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'stats-proof',     name: 'Review Stats Bar',      description: 'Review count, rating, jobs as stats',       trustSignals: ['volume', 'rating'],     conversionMechanism: 'Quantified proof at a glance' },
      local_anchor:     { variantId: 'stats-local',     name: 'Local Coverage Stats',  description: 'Suburbs served, years local, response time', trustSignals: ['local_coverage'],       conversionMechanism: 'Local scale numbers create credibility' },
      authority_expert: { variantId: 'stats-authority', name: 'Expertise Stats Bar',   description: 'Years experience, certifications, projects',  trustSignals: ['experience', 'scale'],  conversionMechanism: 'Experience numbers convey mastery concisely' },
      value_challenger: { variantId: 'stats-value',     name: 'Value Stats Bar',       description: 'Average saving, jobs done, price match count', trustSignals: ['savings', 'volume'],   conversionMechanism: 'Value claims quantified are more persuasive' },
      trust_builder:    { variantId: 'stats-trust',     name: 'Trust Numbers Bar',     description: 'Guarantee claims, insurance value, licence age', trustSignals: ['guarantee', 'safety'], conversionMechanism: 'Risk-related numbers reassure anxious buyers' },
    },
  },

  faq_accordion: {
    type: 'faq_accordion',
    displayName: 'FAQ Accordion',
    description: 'Expandable FAQ section with FAQPage schema',
    seoWeight: 0.9,
    conversionWeight: 0.5,
    gbpSignals: ['questionsAndAnswers'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'FAQ section headline' },
      { key: 'faqs', type: 'object[]', source: 'ai_generated', required: true, description: 'FAQ pairs {question, answer}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'faq-proof',     name: 'Social Proof FAQ',    description: 'FAQs reference reviews and outcomes',           trustSignals: ['social_proof_in_answers'],   conversionMechanism: 'Answers that reference real results are more convincing' },
      local_anchor:     { variantId: 'faq-local',     name: 'Local FAQs',         description: 'FAQs target local search queries and areas',    trustSignals: ['local_relevance'],           conversionMechanism: 'Local FAQs capture "near me" and suburb searches' },
      authority_expert: { variantId: 'faq-authority', name: 'Expert FAQ',         description: 'Technical questions demonstrating depth',        trustSignals: ['expertise_depth'],           conversionMechanism: 'Technical answers validate expert claim' },
      value_challenger: { variantId: 'faq-value',     name: 'Pricing FAQ',        description: 'Cost questions answered with transparency',      trustSignals: ['price_transparency'],        conversionMechanism: 'Transparent pricing answers remove enquiry barrier' },
      trust_builder:    { variantId: 'faq-trust',     name: 'Reassurance FAQ',    description: 'Risk / guarantee / insurance questions addressed', trustSignals: ['risk_reduction'],           conversionMechanism: 'Pre-empting objections in FAQ reduces call uncertainty' },
    },
  },

  location_map: {
    type: 'location_map',
    displayName: 'Location Map',
    description: 'Service area map with suburb list',
    seoWeight: 0.6,
    conversionWeight: 0.4,
    gbpSignals: ['latlng', 'serviceArea', 'address'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'serviceAreas', type: 'string[]', source: 'gbp', required: true, description: 'Suburb / area names' },
      { key: 'address', type: 'string', source: 'gbp', required: false, description: 'Business address' },
      { key: 'lat', type: 'number', source: 'gbp', required: false, description: 'Latitude' },
      { key: 'lng', type: 'number', source: 'gbp', required: false, description: 'Longitude' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'map-proof',     name: 'Proof Map',          description: 'Map with review pins or job-count overlays',   trustSignals: ['service_volume'],  conversionMechanism: 'Visual proof of reach across the area' },
      local_anchor:     { variantId: 'map-local',     name: 'Local Area Map',     description: 'Full suburb grid, prominent map, local tagline', trustSignals: ['local_coverage'],  conversionMechanism: 'Geographic coverage is core value prop for local anchor' },
      authority_expert: { variantId: 'map-authority', name: 'Coverage Map',       description: 'Clean professional map, precise coverage lines', trustSignals: ['precision'],        conversionMechanism: 'Precise coverage signals professional operation' },
      value_challenger: { variantId: 'map-value',     name: 'Wide Coverage Map',  description: 'Emphasises breadth of area = more competitive', trustSignals: ['reach'],            conversionMechanism: 'Wide coverage implies operational scale and cost efficiency' },
      trust_builder:    { variantId: 'map-trust',     name: 'Local Trust Map',    description: 'Suburbs with year-established marker',          trustSignals: ['tenure', 'local'],  conversionMechanism: 'Long-standing local presence is a credibility signal' },
    },
  },

  local_schema: {
    type: 'local_schema',
    displayName: 'Local Business Schema',
    description: 'JSON-LD LocalBusiness structured data injection',
    seoWeight: 1.0,
    conversionWeight: 0.0,
    gbpSignals: ['name', 'phoneNumbers', 'address', 'regularHours', 'rating', 'userRatingCount', 'primaryCategory'],
    dataSlots: [
      { key: 'businessName', type: 'string', source: 'gbp', required: true, description: 'Business name' },
      { key: 'phone', type: 'string', source: 'gbp', required: true, description: 'Phone number' },
      { key: 'address', type: 'string', source: 'gbp', required: false, description: 'Street address' },
      { key: 'suburb', type: 'string', source: 'gbp', required: false, description: 'Suburb / locality' },
      { key: 'state', type: 'string', source: 'gbp', required: false, description: 'State code' },
      { key: 'postcode', type: 'string', source: 'gbp', required: false, description: 'Postcode' },
      { key: 'country', type: 'string', source: 'gbp', required: false, description: 'Country code', fallback: 'AU' },
      { key: 'reviewRating', type: 'number', source: 'gbp', required: false, description: 'Average rating' },
      { key: 'reviewCount', type: 'number', source: 'gbp', required: false, description: 'Review count' },
      { key: 'schemaType', type: 'string', source: 'derived', required: false, description: 'Schema.org business type', fallback: 'LocalBusiness' },
      { key: 'serviceAreas', type: 'string[]', source: 'gbp', required: false, description: 'Area names for areaServed' },
      { key: 'siteUrl', type: 'string', source: 'crawl', required: false, description: 'Website URL' },
      { key: 'logoUrl', type: 'string', source: 'manual', required: false, description: 'Logo URL' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'schema-proof',     name: 'AggregateRating Schema', description: 'AggregateRating nested, review count prominent',   trustSignals: [],  conversionMechanism: 'Rich snippet stars in SERP drive higher CTR' },
      local_anchor:     { variantId: 'schema-local',     name: 'Full Local Schema',      description: 'areaServed expanded, GeoCoordinates included',      trustSignals: [],  conversionMechanism: 'Full local context improves Maps Pack ranking' },
      authority_expert: { variantId: 'schema-authority', name: 'Expert Schema',          description: 'knowsAbout, hasCredential, award properties added', trustSignals: [],  conversionMechanism: 'Expertise signals readable by Google' },
      value_challenger: { variantId: 'schema-value',     name: 'Offer Schema',           description: 'Offer / priceRange nested in schema',               trustSignals: [],  conversionMechanism: 'Price range shown in rich snippets for cost-focused queries' },
      trust_builder:    { variantId: 'schema-trust',     name: 'Trust Schema',           description: 'paymentAccepted, openingHours, sameAs properties',  trustSignals: [],  conversionMechanism: 'Comprehensive schema = complete entity understanding by Google' },
    },
  },

  breadcrumb: {
    type: 'breadcrumb',
    displayName: 'Breadcrumb',
    description: 'Navigation breadcrumb with BreadcrumbList schema',
    seoWeight: 0.5,
    conversionWeight: 0.1,
    gbpSignals: [],
    dataSlots: [
      { key: 'crumbs', type: 'object[]', source: 'derived', required: true, description: 'Breadcrumb pairs {label, url}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'bc-proof',     name: 'Proof Breadcrumb',     description: 'Standard breadcrumb',  trustSignals: [], conversionMechanism: 'Navigation clarity' },
      local_anchor:     { variantId: 'bc-local',     name: 'Local Breadcrumb',     description: 'Area in crumb path',   trustSignals: [], conversionMechanism: 'Local path reinforcement' },
      authority_expert: { variantId: 'bc-authority', name: 'Authority Breadcrumb', description: 'Service in crumb',     trustSignals: [], conversionMechanism: 'Expertise path clarity' },
      value_challenger: { variantId: 'bc-value',     name: 'Value Breadcrumb',     description: 'Standard breadcrumb', trustSignals: [], conversionMechanism: 'Navigation clarity' },
      trust_builder:    { variantId: 'bc-trust',     name: 'Trust Breadcrumb',     description: 'Standard breadcrumb', trustSignals: [], conversionMechanism: 'Navigation clarity' },
    },
  },

  cta_sticky: {
    type: 'cta_sticky',
    displayName: 'Sticky CTA Bar',
    description: 'Fixed bottom bar with call and quote buttons on mobile',
    seoWeight: 0.0,
    conversionWeight: 0.8,
    gbpSignals: ['phoneNumbers'],
    dataSlots: [
      { key: 'phone', type: 'string', source: 'gbp', required: true, description: 'Phone number' },
      { key: 'ctaText', type: 'string', source: 'ai_generated', required: false, description: 'Quote CTA label', fallback: 'Get a Quote' },
      { key: 'ctaUrl', type: 'string', source: 'ai_generated', required: false, description: 'Quote CTA URL', fallback: '#contact' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'sticky-proof',     name: 'Proof Sticky Bar',     description: 'Rating on sticky bar',         trustSignals: ['star_rating'],  conversionMechanism: 'Always-visible proof + action' },
      local_anchor:     { variantId: 'sticky-local',     name: 'Local Sticky Bar',     description: 'Area-specific copy on bar',    trustSignals: ['local'],        conversionMechanism: 'Local context even on scroll' },
      authority_expert: { variantId: 'sticky-authority', name: 'Expert Sticky Bar',    description: 'Consultation framing',         trustSignals: ['expertise'],    conversionMechanism: 'Premium feel even in mobile bar' },
      value_challenger: { variantId: 'sticky-value',     name: 'Free Quote Sticky',    description: 'Free / no-obligation framing', trustSignals: ['free'],         conversionMechanism: 'Removes cost-of-enquiry barrier' },
      trust_builder:    { variantId: 'sticky-trust',     name: 'Guarantee Sticky Bar', description: 'Guarantee message on bar',     trustSignals: ['guarantee'],    conversionMechanism: 'Risk elimination always visible' },
    },
  },

  before_after: {
    type: 'before_after',
    displayName: 'Before & After Gallery',
    description: 'Side-by-side job outcome photography',
    seoWeight: 0.3,
    conversionWeight: 0.7,
    gbpSignals: ['media'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'pairs', type: 'object[]', source: 'manual', required: true, description: 'Image pairs {beforeImageUrl, afterImageUrl, caption}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'ba-proof',     name: 'Proof Gallery',     description: 'Job outcomes with review snippet overlay',   trustSignals: ['visual_proof'],   conversionMechanism: 'Visual evidence is highest-trust proof type' },
      local_anchor:     { variantId: 'ba-local',     name: 'Local Jobs Gallery', description: 'Before/after tagged with suburb name',       trustSignals: ['local_work'],     conversionMechanism: 'Proof from same suburb as viewer' },
      authority_expert: { variantId: 'ba-authority', name: 'Expert Work Gallery', description: 'Technical job complexity shown in captions', trustSignals: ['work_quality'],   conversionMechanism: 'Work quality is the expert credential' },
      value_challenger: { variantId: 'ba-value',     name: 'Value Gallery',      description: 'Dramatic transformations showing value',     trustSignals: ['transformation'], conversionMechanism: 'Outcome size justifies cost' },
      trust_builder:    { variantId: 'ba-trust',     name: 'Care Gallery',       description: 'Clean site, careful work shown in process',  trustSignals: ['care', 'detail'], conversionMechanism: 'Care signals build trust for cautious buyers' },
    },
  },

  team_grid: {
    type: 'team_grid',
    displayName: 'Team Grid',
    description: 'Staff profiles with name, role, and credentials',
    seoWeight: 0.2,
    conversionWeight: 0.4,
    gbpSignals: [],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'members', type: 'object[]', source: 'manual', required: true, description: 'Team members {name, role, bio, imageUrl, credentials}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'team-proof',     name: 'Review-Tied Team',    description: 'Team members with review quotes',         trustSignals: ['human_faces', 'social_proof'], conversionMechanism: 'Named humans with proof are more trustworthy' },
      local_anchor:     { variantId: 'team-local',     name: 'Local Team',          description: 'Team members with suburb/area shown',     trustSignals: ['local_humans'],                conversionMechanism: 'Local people = local trust' },
      authority_expert: { variantId: 'team-authority', name: 'Expert Team',         description: 'Credentials and qualifications prominent', trustSignals: ['credentials'],                 conversionMechanism: 'Named experts with credentials is strongest authority signal' },
      value_challenger: { variantId: 'team-value',     name: 'Your Team',           description: 'Approachable, friendly team focus',        trustSignals: ['approachability'],             conversionMechanism: 'Friendly faces reduce intimidation of engaging' },
      trust_builder:    { variantId: 'team-trust',     name: 'Background-Checked Team', description: 'Police check / insurance badges on profiles', trustSignals: ['safety', 'credentials'],   conversionMechanism: 'Safety credentials on individuals are maximum trust signal' },
    },
  },

  gallery_masonry: {
    type: 'gallery_masonry',
    displayName: 'Work Gallery',
    description: 'Masonry photo grid of completed jobs',
    seoWeight: 0.3,
    conversionWeight: 0.5,
    gbpSignals: ['media'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'images', type: 'object[]', source: 'manual', required: true, description: 'Image array {url, alt, caption}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'gallery-proof',     name: 'Proof Gallery',       description: 'Volume of work shown',              trustSignals: ['volume'],         conversionMechanism: 'Many jobs = experience and reliability' },
      local_anchor:     { variantId: 'gallery-local',     name: 'Local Work Gallery',  description: 'Suburb-tagged job photos',           trustSignals: ['local_work'],     conversionMechanism: 'Local proof is most persuasive for local audience' },
      authority_expert: { variantId: 'gallery-authority', name: 'Quality Gallery',     description: 'High-quality, complex job showcase',  trustSignals: ['work_quality'],   conversionMechanism: 'Quality over quantity for expert positioning' },
      value_challenger: { variantId: 'gallery-value',     name: 'Results Gallery',     description: 'Dramatic transformations',           trustSignals: ['transformation'], conversionMechanism: 'Results evidence justifies price' },
      trust_builder:    { variantId: 'gallery-trust',     name: 'Process Gallery',     description: 'Care and clean work in progress',    trustSignals: ['care'],           conversionMechanism: 'Process transparency builds comfort' },
    },
  },

  pricing_table: {
    type: 'pricing_table',
    displayName: 'Pricing Table',
    description: 'Service tiers or flat-rate pricing display',
    seoWeight: 0.4,
    conversionWeight: 0.7,
    gbpSignals: [],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'tiers', type: 'object[]', source: 'manual', required: true, description: 'Pricing tiers {name, price, features[], cta}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'price-proof',     name: 'Review-Validated Pricing', description: 'Review count validates each tier price',   trustSignals: ['social_proof'],      conversionMechanism: 'Social proof reduces sticker shock' },
      local_anchor:     { variantId: 'price-local',     name: 'Local Pricing',            description: 'Area-specific pricing framing',            trustSignals: ['local_relevance'],   conversionMechanism: 'Local market positioning reduces comparison' },
      authority_expert: { variantId: 'price-authority', name: 'Expert Pricing',           description: 'Tier names reflect expertise levels',      trustSignals: ['expertise'],         conversionMechanism: 'Premium framing justifies prices' },
      value_challenger: { variantId: 'price-value',     name: 'Transparent Pricing',      description: 'Flat rates, no hidden fees emphasis',      trustSignals: ['transparency'],      conversionMechanism: 'Price transparency is the core value proposition' },
      trust_builder:    { variantId: 'price-trust',     name: 'Guaranteed Pricing',       description: 'Price guarantee and fixed-fee promise',    trustSignals: ['price_guarantee'],   conversionMechanism: 'No-surprise pricing removes financial anxiety' },
    },
  },

  comparison_table: {
    type: 'comparison_table',
    displayName: 'Comparison Table',
    description: 'Us vs. competitors feature comparison',
    seoWeight: 0.3,
    conversionWeight: 0.6,
    gbpSignals: [],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'rows', type: 'object[]', source: 'ai_generated', required: true, description: 'Rows {feature, us: bool, them: bool}' },
      { key: 'competitorLabel', type: 'string', source: 'ai_generated', required: false, description: 'Competitor column label', fallback: 'Others' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'compare-proof',     name: 'Proof Comparison',     description: 'Reviews / proof as a row in comparison',    trustSignals: ['social_proof_row'],    conversionMechanism: 'Makes proof advantage concrete vs competitors' },
      local_anchor:     { variantId: 'compare-local',     name: 'Local Comparison',     description: 'Local knowledge as key differentiator row',  trustSignals: ['local_advantage'],     conversionMechanism: 'Turns local knowledge into explicit advantage' },
      authority_expert: { variantId: 'compare-authority', name: 'Expertise Comparison', description: 'Qualification rows vs generalists',          trustSignals: ['expertise_advantage'], conversionMechanism: 'Makes technical advantage explicit' },
      value_challenger: { variantId: 'compare-value',     name: 'Value Comparison',     description: 'Price rows and hidden fee comparisons',      trustSignals: ['price_advantage'],     conversionMechanism: 'Direct price comparison is strongest value signal' },
      trust_builder:    { variantId: 'compare-trust',     name: 'Trust Comparison',     description: 'Guarantee / insurance rows vs competitors',  trustSignals: ['trust_advantage'],     conversionMechanism: 'Safety advantage made explicit beats price concerns' },
    },
  },

  video_embed: {
    type: 'video_embed',
    displayName: 'Video Embed',
    description: 'YouTube / Vimeo video testimonial or explainer',
    seoWeight: 0.4,
    conversionWeight: 0.6,
    gbpSignals: [],
    dataSlots: [
      { key: 'videoUrl', type: 'string', source: 'manual', required: true, description: 'Video embed URL' },
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'description', type: 'string', source: 'ai_generated', required: false, description: 'Video description' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'video-proof',     name: 'Video Testimonial',   description: 'Customer video review',         trustSignals: ['video_social_proof'],  conversionMechanism: 'Video proof is highest-conversion format' },
      local_anchor:     { variantId: 'video-local',     name: 'Local Story Video',   description: 'Local customer story',          trustSignals: ['local_human'],         conversionMechanism: 'Local story creates belonging' },
      authority_expert: { variantId: 'video-authority', name: 'Explainer Video',     description: 'Expert knowledge showcase',     trustSignals: ['expertise'],           conversionMechanism: 'Authority demonstrated in video content' },
      value_challenger: { variantId: 'video-value',     name: 'Value Demo Video',    description: 'Process / value demonstration', trustSignals: ['transparency'],        conversionMechanism: 'Seeing the process reduces risk perception' },
      trust_builder:    { variantId: 'video-trust',     name: 'About Us Video',      description: 'Team / culture / values',       trustSignals: ['human_faces'],         conversionMechanism: 'Seeing real people is strongest trust builder' },
    },
  },

  award_strip: {
    type: 'award_strip',
    displayName: 'Award Strip',
    description: 'Horizontal bar of logos: accreditations, awards, associations',
    seoWeight: 0.1,
    conversionWeight: 0.5,
    gbpSignals: ['attributes'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section label', fallback: 'Trusted and accredited' },
      { key: 'badges', type: 'object[]', source: 'manual', required: true, description: 'Badges {name, imageUrl, url}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'awards-proof',     name: 'Social Proof Strip',  description: 'Platform logos (Google, Hipages, etc.)',  trustSignals: ['platform_badges'],    conversionMechanism: 'Recognised platform presence = established business' },
      local_anchor:     { variantId: 'awards-local',     name: 'Local Assoc Strip',   description: 'Local association and chamber logos',     trustSignals: ['community_badges'],   conversionMechanism: 'Community membership signals rootedness' },
      authority_expert: { variantId: 'awards-authority', name: 'Accreditation Strip', description: 'Technical accreditation logos',           trustSignals: ['credentials'],        conversionMechanism: 'Third-party credential logos are most trusted proof' },
      value_challenger: { variantId: 'awards-value',     name: 'Awards Strip',        description: 'Best value / industry award badges',      trustSignals: ['awards'],             conversionMechanism: 'Third-party award is strongest value validator' },
      trust_builder:    { variantId: 'awards-trust',     name: 'Safety Badge Strip',  description: 'Insurance, police check, licence logos',  trustSignals: ['safety_badges'],      conversionMechanism: 'Formal safety credentials maximise trust' },
    },
  },

  related_pages: {
    type: 'related_pages',
    displayName: 'Related Pages',
    description: 'Internal link grid to related service or area pages',
    seoWeight: 0.7,
    conversionWeight: 0.3,
    gbpSignals: ['services', 'serviceArea'],
    dataSlots: [
      { key: 'headline', type: 'string', source: 'ai_generated', required: false, description: 'Section headline' },
      { key: 'links', type: 'object[]', source: 'derived', required: true, description: 'Links {label, url, description}' },
    ],
    archetypeVariants: {
      proof_machine:    { variantId: 'related-proof',     name: 'Proof-Tagged Links',  description: 'Related pages with review count tags',   trustSignals: ['per_page_proof'],  conversionMechanism: 'Proof on internal links improves click-through' },
      local_anchor:     { variantId: 'related-local',     name: 'Area Links',          description: 'Suburb-focused internal link grid',       trustSignals: ['local_coverage'],  conversionMechanism: 'Area page links is core local SEO strategy' },
      authority_expert: { variantId: 'related-authority', name: 'Service Depth Links', description: 'Service specialisation links',             trustSignals: ['service_depth'],   conversionMechanism: 'Depth of service pages signals specialist' },
      value_challenger: { variantId: 'related-value',     name: 'Service Price Links', description: 'Related pages with price anchors',         trustSignals: ['price_anchor'],    conversionMechanism: 'Price-tagged links attract value searchers' },
      trust_builder:    { variantId: 'related-trust',     name: 'Guaranteed Services', description: 'Related pages with guarantee badge',       trustSignals: ['guarantee'],       conversionMechanism: 'Guarantee on every page link maintains trust signal' },
    },
  },

};

// ---------------------------------------------------------------------------
// Helper: get a component's metadata
// ---------------------------------------------------------------------------
export function getComponentDef(type: ComponentType): ComponentDefinition {
  const def = COMPONENT_REGISTRY[type];
  if (!def) throw new Error(`Unknown component type: ${type}`);
  return def;
}

// ---------------------------------------------------------------------------
// Helper: get all data slots for a component
// ---------------------------------------------------------------------------
export function getRequiredSlots(type: ComponentType): DataSlot[] {
  return getComponentDef(type).dataSlots.filter(s => s.required);
}

// ---------------------------------------------------------------------------
// Helper: rank components by combined seo+conversion weight for a given purpose
// ---------------------------------------------------------------------------
export function rankComponents(purpose: 'seo' | 'conversion' | 'balanced'): ComponentType[] {
  return (Object.values(COMPONENT_REGISTRY) as ComponentDefinition[])
    .sort((a, b) => {
      if (purpose === 'seo') return b.seoWeight - a.seoWeight;
      if (purpose === 'conversion') return b.conversionWeight - a.conversionWeight;
      return (b.seoWeight + b.conversionWeight) - (a.seoWeight + a.conversionWeight);
    })
    .map(d => d.type);
}
