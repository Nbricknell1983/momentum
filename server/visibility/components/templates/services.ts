// =============================================================================
// COMPONENT TEMPLATES — SERVICES + PROCESS STEPS + STATS BAR
// =============================================================================

import type { ServiceGridData, ProcessStepsData, StatsBarData } from '../types';
import { esc } from '../utils';

// ============================================================
// SERVICE GRID
// ============================================================

function serviceIcon(): string {
  return `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:var(--c-primary)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>`;
}

export function serviceGridProofMachine(data: ServiceGridData): string {
  return `
<section class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `
    <div class="text-center mb-12">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
      ${data.subheadline ? `<p class="text-gray-500 max-w-2xl mx-auto">${esc(data.subheadline)}</p>` : ''}
    </div>` : ''}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${data.services.map(s => `
      <a href="${esc(s.url || '#')}" class="group block bg-white rounded-2xl border border-gray-200 p-6 hover:border-transparent hover:shadow-lg transition-all">
        <div class="mb-4">${serviceIcon()}</div>
        <h3 class="font-bold text-gray-900 text-lg mb-2 group-hover:opacity-80">${esc(s.name)}</h3>
        ${s.description ? `<p class="text-gray-500 text-sm leading-relaxed mb-3">${esc(s.description)}</p>` : ''}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1 text-xs text-yellow-600">
            ★★★★★ <span class="text-gray-500">Highly rated</span>
          </div>
          <span class="text-sm font-semibold" style="color:var(--c-primary)">Learn more →</span>
        </div>
      </a>`).join('')}
    </div>
  </div>
</section>`;
}

export function serviceGridLocalAnchor(data: ServiceGridData): string {
  return `
<section class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `
    <div class="text-center mb-12">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
      ${data.subheadline ? `<p class="text-gray-500 max-w-2xl mx-auto">${esc(data.subheadline)}</p>` : ''}
    </div>` : ''}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${data.services.map(s => `
      <a href="${esc(s.url || '#')}" class="group block bg-white rounded-2xl border-l-4 p-6 shadow-sm hover:shadow-md transition-all" style="border-color:var(--c-primary)">
        <div class="mb-4">${serviceIcon()}</div>
        <h3 class="font-bold text-gray-900 text-lg mb-2">${esc(s.name)}</h3>
        ${s.description ? `<p class="text-gray-500 text-sm leading-relaxed mb-3">${esc(s.description)}</p>` : ''}
        <div class="flex items-center gap-1 text-sm" style="color:var(--c-primary)">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
          Available in your area
        </div>
      </a>`).join('')}
    </div>
  </div>
</section>`;
}

export function serviceGridAuthorityExpert(data: ServiceGridData): string {
  return `
<section class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `
    <div class="mb-12">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
      ${data.subheadline ? `<p class="text-gray-600 max-w-2xl">${esc(data.subheadline)}</p>` : ''}
    </div>` : ''}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      ${data.services.map(s => `
      <a href="${esc(s.url || '#')}" class="group flex gap-5 p-6 bg-gray-50 rounded-xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-gray-200">
        <div class="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style="background-color:var(--c-primary)">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
        </div>
        <div>
          <h3 class="font-bold text-gray-900 text-base mb-1">${esc(s.name)}</h3>
          ${s.description ? `<p class="text-gray-500 text-sm leading-relaxed">${esc(s.description)}</p>` : ''}
          <span class="inline-flex items-center gap-1 mt-2 text-sm font-semibold" style="color:var(--c-primary)">View service <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg></span>
        </div>
      </a>`).join('')}
    </div>
  </div>
</section>`;
}

export function serviceGridValueChallenger(data: ServiceGridData): string {
  return `
<section class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `
    <div class="text-center mb-12">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
      ${data.subheadline ? `<p class="text-gray-500">${esc(data.subheadline)}</p>` : ''}
    </div>` : ''}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${data.services.map(s => `
      <a href="${esc(s.url || '#')}" class="group block bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-all">
        <div class="mb-4">${serviceIcon()}</div>
        <h3 class="font-bold text-gray-900 text-lg mb-2">${esc(s.name)}</h3>
        ${s.description ? `<p class="text-gray-500 text-sm mb-3 leading-relaxed">${esc(s.description)}</p>` : ''}
        <div class="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          ${s.priceFrom ? `<span class="text-sm font-bold" style="color:var(--c-primary)">From ${esc(s.priceFrom)}</span>` : '<span></span>'}
          <span class="text-sm font-semibold text-gray-700 group-hover:underline">Get a quote →</span>
        </div>
      </a>`).join('')}
    </div>
  </div>
</section>`;
}

export function serviceGridTrustBuilder(data: ServiceGridData): string {
  return `
<section class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `
    <div class="text-center mb-12">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
      ${data.subheadline ? `<p class="text-gray-500">${esc(data.subheadline)}</p>` : ''}
    </div>` : ''}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${data.services.map(s => `
      <a href="${esc(s.url || '#')}" class="group block bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all">
        <div class="mb-4">${serviceIcon()}</div>
        <h3 class="font-bold text-gray-900 text-lg mb-2">${esc(s.name)}</h3>
        ${s.description ? `<p class="text-gray-500 text-sm mb-4 leading-relaxed">${esc(s.description)}</p>` : ''}
        <div class="flex items-center gap-2 text-xs text-green-700 font-medium">
          <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          Satisfaction guaranteed
        </div>
      </a>`).join('')}
    </div>
  </div>
</section>`;
}

export const SERVICE_GRID_TEMPLATES = {
  proof_machine:    serviceGridProofMachine,
  local_anchor:     serviceGridLocalAnchor,
  authority_expert: serviceGridAuthorityExpert,
  value_challenger: serviceGridValueChallenger,
  trust_builder:    serviceGridTrustBuilder,
} as const;

// ============================================================
// PROCESS STEPS
// ============================================================

export function processSteps(data: ProcessStepsData, archetype: string): string {
  const stepBadgeColor = archetype === 'value_challenger' ? 'var(--c-accent)' : 'var(--c-primary)';
  return `
<section class="py-16 bg-white">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `
    <div class="text-center mb-12">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
      ${data.subheadline ? `<p class="text-gray-500">${esc(data.subheadline)}</p>` : ''}
    </div>` : ''}
    <div class="relative">
      <!-- Connector line -->
      <div class="absolute top-8 left-8 right-8 h-0.5 bg-gray-200 hidden md:block" style="z-index:0"></div>
      <div class="grid grid-cols-1 md:grid-cols-${Math.min(data.steps.length, 4)} gap-8 relative" style="z-index:1">
        ${data.steps.map((step, i) => `
        <div class="flex flex-col items-center text-center">
          <div class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-extrabold mb-4 shadow-md" style="background-color:${stepBadgeColor}">
            ${step.number || String(i + 1)}
          </div>
          <h3 class="font-bold text-gray-900 text-base mb-2">${esc(step.title)}</h3>
          <p class="text-gray-500 text-sm leading-relaxed">${esc(step.description)}</p>
          ${archetype === 'trust_builder' ? `
          <div class="mt-3 flex items-center gap-1 text-xs text-green-600 font-medium">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
            Risk free
          </div>` : ''}
        </div>`).join('')}
      </div>
    </div>
    ${data.ctaUrl ? `
    <div class="text-center mt-10">
      <a href="${esc(data.ctaUrl)}" class="inline-flex items-center px-7 py-3.5 rounded-xl text-base font-bold text-white shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
        ${esc(data.ctaText || 'Get Started')}
        <svg class="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
      </a>
    </div>` : ''}
  </div>
</section>`;
}

export const PROCESS_STEPS_TEMPLATES = {
  proof_machine:    (d: ProcessStepsData) => processSteps(d, 'proof_machine'),
  local_anchor:     (d: ProcessStepsData) => processSteps(d, 'local_anchor'),
  authority_expert: (d: ProcessStepsData) => processSteps(d, 'authority_expert'),
  value_challenger: (d: ProcessStepsData) => processSteps(d, 'value_challenger'),
  trust_builder:    (d: ProcessStepsData) => processSteps(d, 'trust_builder'),
} as const;

// ============================================================
// STATS BAR
// ============================================================

export function statsBar(data: StatsBarData, archetype: string): string {
  const bg = data.background === 'dark'
    ? 'bg-gray-900 text-white'
    : data.background === 'brand'
    ? 'text-white'
    : 'bg-white text-gray-900 border-y border-gray-200';
  const bgStyle = data.background === 'brand' ? `style="background-color:var(--c-primary)"` : '';
  const valColor = data.background === 'light' ? 'style="color:var(--c-primary)"' : '';
  const labelColor = data.background === 'light' ? 'text-gray-500' : 'opacity-80';

  return `
<div class="${bg} py-10" ${bgStyle}>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-2 md:grid-cols-${Math.min(data.stats.length, 4)} gap-8 text-center">
      ${data.stats.map(s => `
      <div>
        <div class="text-4xl font-extrabold mb-1" ${valColor}>${esc(s.value)}</div>
        <div class="text-sm ${labelColor}">${esc(s.label)}</div>
      </div>`).join('')}
    </div>
  </div>
</div>`;
}

export const STATS_BAR_TEMPLATES = {
  proof_machine:    (d: StatsBarData) => statsBar(d, 'proof_machine'),
  local_anchor:     (d: StatsBarData) => statsBar(d, 'local_anchor'),
  authority_expert: (d: StatsBarData) => statsBar(d, 'authority_expert'),
  value_challenger: (d: StatsBarData) => statsBar(d, 'value_challenger'),
  trust_builder:    (d: StatsBarData) => statsBar(d, 'trust_builder'),
} as const;
