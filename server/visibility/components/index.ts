// =============================================================================
// COMPONENT LIBRARY — PUBLIC API
// =============================================================================
// Route handlers import ONLY from this file.
// =============================================================================

// Primary render API
export {
  renderComponent,
  renderStickyCtaBar,
  renderPageShell,
  listAvailableComponents,
  isComponentAvailable,
} from './renderer';
export type {
  RenderComponentOptions,
  PageShellOptions,
} from './renderer';

// Data types + component/archetype types (self-contained in this module)
export type {
  ComponentType,
  ConversionArchetype,
  NavData,
  HeroData,
  TrustBarData,
  ServiceGridData,
  TestimonialData,
  CTAPrimaryData,
  ContactFormData,
  FooterData,
  ProcessStepsData,
  StatsBarData,
  FAQData,
  BeforeAfterData,
  ComponentData,
  TemplateBrandTokens,
} from './types';
export { RADIUS_CLASS } from './types';

// Registry (metadata only, for Page Blueprint Engine)
export {
  COMPONENT_REGISTRY,
  getComponentDef,
  getRequiredSlots,
  rankComponents,
} from './registry';
export type {
  ComponentDefinition,
  VariantDefinition,
  DataSlot,
} from './registry';

// Utilities (used internally; exported for testing)
export { esc, tel, renderStars, starSVGs, fmtDate, truncate, buildBrandStyleBlock, googleFontsLink } from './utils';
