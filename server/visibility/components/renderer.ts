// =============================================================================
// COMPONENT RENDERER
// =============================================================================
// Single entry point: renderComponent(type, archetype, data, brand) → HTML string
// Route handlers import ONLY from here.
// =============================================================================

import type { ConversionArchetype, ComponentType, TemplateBrandTokens } from './types';
import { buildBrandStyleBlock, googleFontsLink } from './utils';

import { NAV_TEMPLATES } from './templates/nav';
import { HERO_TEMPLATES } from './templates/hero';
import {
  TRUST_BAR_TEMPLATES,
  TESTIMONIAL_CAROUSEL_TEMPLATES,
  TESTIMONIAL_GRID_TEMPLATES,
} from './templates/trust';
import {
  SERVICE_GRID_TEMPLATES,
  PROCESS_STEPS_TEMPLATES,
  STATS_BAR_TEMPLATES,
} from './templates/services';
import { CTA_PRIMARY_TEMPLATES, stickyCtaBar } from './templates/cta';
import {
  CONTACT_FORM_TEMPLATES,
  FOOTER_TEMPLATES,
  FAQ_TEMPLATES,
} from './templates/contact';

// ---------------------------------------------------------------------------
// Template dispatch map
// ---------------------------------------------------------------------------
// Each entry maps ComponentType → Record<ConversionArchetype, (data) => string>
// ---------------------------------------------------------------------------
type TemplateMap = Record<string, Record<string, (data: never) => string>>;

const TEMPLATE_MAP: TemplateMap = {
  nav:                   NAV_TEMPLATES                as unknown as TemplateMap[string],
  hero:                  HERO_TEMPLATES               as unknown as TemplateMap[string],
  trust_bar:             TRUST_BAR_TEMPLATES          as unknown as TemplateMap[string],
  testimonial_carousel:  TESTIMONIAL_CAROUSEL_TEMPLATES as unknown as TemplateMap[string],
  testimonial_grid:      TESTIMONIAL_GRID_TEMPLATES   as unknown as TemplateMap[string],
  service_grid:          SERVICE_GRID_TEMPLATES       as unknown as TemplateMap[string],
  process_steps:         PROCESS_STEPS_TEMPLATES      as unknown as TemplateMap[string],
  stats_bar:             STATS_BAR_TEMPLATES          as unknown as TemplateMap[string],
  cta_primary:           CTA_PRIMARY_TEMPLATES        as unknown as TemplateMap[string],
  contact_form:          CONTACT_FORM_TEMPLATES       as unknown as TemplateMap[string],
  footer:                FOOTER_TEMPLATES             as unknown as TemplateMap[string],
  faq_accordion:         FAQ_TEMPLATES                as unknown as TemplateMap[string],
};

// Components not yet templated — return empty string with comment
const UNIMPLEMENTED = new Set<ComponentType>([
  'location_map',
  'local_schema',
  'breadcrumb',
  'cta_sticky',
  'before_after',
  'team_grid',
  'gallery_masonry',
  'pricing_table',
  'comparison_table',
  'video_embed',
  'award_strip',
  'related_pages',
]);

// ---------------------------------------------------------------------------
// Core render function
// ---------------------------------------------------------------------------

export interface RenderComponentOptions {
  type: ComponentType;
  archetype: ConversionArchetype;
  data: Record<string, unknown>;
  brand?: TemplateBrandTokens;
  /** If true, wraps output in brand <style> block — only for standalone preview */
  withBrandStyles?: boolean;
}

/**
 * Render a single component section to an HTML string.
 * Brand CSS variables are injected inline via style attributes in every template.
 * Call with withBrandStyles=true only for standalone preview/testing.
 */
export function renderComponent(opts: RenderComponentOptions): string {
  const { type, archetype, data, brand, withBrandStyles } = opts;

  if (UNIMPLEMENTED.has(type)) {
    return `<!-- component:${type} not yet implemented -->`;
  }

  const templates = TEMPLATE_MAP[type];
  if (!templates) {
    return `<!-- component:${type} unknown -->`;
  }

  const templateFn = templates[archetype] ?? templates['proof_machine'];
  if (typeof templateFn !== 'function') {
    return `<!-- component:${type} archetype:${archetype} missing -->`;
  }

  let html: string;
  try {
    html = templateFn(data as never);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<!-- render error ${type}/${archetype}: ${msg} -->`;
  }

  if (withBrandStyles && brand) {
    const fonts = googleFontsLink(brand.fontHeading, brand.fontBody);
    const style = buildBrandStyleBlock(brand);
    return `${fonts}\n${style}\n${html}`;
  }

  return html;
}

// ---------------------------------------------------------------------------
// Render a sticky CTA bar (special — not archetype-variant)
// ---------------------------------------------------------------------------
export function renderStickyCtaBar(
  phone: string,
  ctaText: string,
  ctaUrl: string,
): string {
  return stickyCtaBar(phone, ctaText, ctaUrl);
}

// ---------------------------------------------------------------------------
// Render a full page HTML shell with injected brand tokens
// ---------------------------------------------------------------------------
export interface PageShellOptions {
  title: string;
  metaDescription?: string;
  canonical?: string;
  brand: TemplateBrandTokens;
  bodyHtml: string;
  stickyBar?: boolean;
  phone?: string;
  ctaText?: string;
  ctaUrl?: string;
  extraHead?: string;
}

export function renderPageShell(opts: PageShellOptions): string {
  const {
    title, metaDescription, canonical, brand,
    bodyHtml, stickyBar, phone, ctaText, ctaUrl, extraHead,
  } = opts;

  const fonts = googleFontsLink(brand.fontHeading, brand.fontBody);
  const brandStyle = buildBrandStyleBlock(brand);
  const sticky = stickyBar && phone
    ? stickyCtaBar(phone, ctaText || 'Get a Quote', ctaUrl || '#contact')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${metaDescription ? `<meta name="description" content="${metaDescription}">` : ''}
  ${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fonts}
  <script src="https://cdn.tailwindcss.com"></script>
  ${brandStyle}
  <style>
    *,::before,::after{box-sizing:border-box}
    html{scroll-behavior:smooth}
    [style*="--c-primary"]{transition:opacity 0.15s}
    :focus-visible{outline:2px solid var(--c-primary);outline-offset:2px}
  </style>
  ${extraHead || ''}
</head>
<body>
${bodyHtml}
${sticky}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// List available component types
// ---------------------------------------------------------------------------
export function listAvailableComponents(): ComponentType[] {
  return Object.keys(TEMPLATE_MAP) as ComponentType[];
}

export function isComponentAvailable(type: ComponentType): boolean {
  return !UNIMPLEMENTED.has(type) && type in TEMPLATE_MAP;
}
