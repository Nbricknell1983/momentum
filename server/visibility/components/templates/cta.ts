// =============================================================================
// COMPONENT TEMPLATES — PRIMARY CTA SECTION + STICKY CTA BAR
// =============================================================================

import type { CTAPrimaryData } from '../types';
import { esc, tel } from '../utils';

// ============================================================
// PRIMARY CTA SECTION
// ============================================================

export function ctaPrimaryProofMachine(data: CTAPrimaryData): string {
  return `
<section class="py-16 bg-gray-50 border-y border-gray-200">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
    ${data.badge ? `
    <div class="inline-flex items-center gap-2 mb-5">
      <span class="text-yellow-400 text-xl">★★★★★</span>
      <span class="text-sm font-medium text-gray-600">${esc(data.badge)}</span>
    </div>` : ''}
    <h2 class="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
    ${data.subheadline ? `<p class="text-lg text-gray-600 mb-8 max-w-xl mx-auto">${esc(data.subheadline)}</p>` : '<div class="mb-6"></div>'}
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold text-white shadow-lg hover:opacity-90" style="background-color:var(--c-primary)">
        ${esc(data.ctaText)}
      </a>
      <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-base font-bold border-2 bg-white text-gray-800 hover:bg-gray-50" style="border-color:var(--c-primary)">
        <svg class="w-5 h-5" style="color:var(--c-primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
        ${esc(data.phone)}
      </a>
    </div>
    ${data.supportText ? `<p class="mt-4 text-sm text-gray-500">${esc(data.supportText)}</p>` : ''}
  </div>
</section>`;
}

export function ctaPrimaryLocalAnchor(data: CTAPrimaryData): string {
  return `
<section class="py-16 text-white" style="background-color:var(--c-primary)">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white bg-opacity-20 text-sm font-medium mb-5">
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
      Local &amp; ready when you need us
    </div>
    <h2 class="text-3xl md:text-4xl font-extrabold mb-3" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
    ${data.subheadline ? `<p class="text-lg opacity-90 mb-8 max-w-xl mx-auto">${esc(data.subheadline)}</p>` : '<div class="mb-6"></div>'}
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold bg-white shadow-lg hover:bg-gray-50" style="color:var(--c-primary)">
        ${esc(data.ctaText)}
      </a>
      <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-base font-bold border-2 border-white border-opacity-50 text-white hover:bg-white hover:bg-opacity-10">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
        ${esc(data.phone)}
      </a>
    </div>
    ${data.urgency ? `<p class="mt-4 text-sm opacity-80">${esc(data.urgency)}</p>` : ''}
  </div>
</section>`;
}

export function ctaPrimaryAuthorityExpert(data: CTAPrimaryData): string {
  return `
<section class="py-16 bg-gray-900 text-white">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-10 items-center">
      <div>
        <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
        ${data.subheadline ? `<p class="text-gray-300 text-lg mb-6">${esc(data.subheadline)}</p>` : ''}
        <div class="flex flex-wrap gap-4 text-sm text-gray-400">
          <span class="flex items-center gap-2"><svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>Licensed &amp; certified</span>
          <span class="flex items-center gap-2"><svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>Specialist expertise</span>
          <span class="flex items-center gap-2"><svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>Proven outcomes</span>
        </div>
      </div>
      <div class="flex flex-col gap-4">
        <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold text-white shadow-lg hover:opacity-90" style="background-color:var(--c-primary)">
          ${esc(data.ctaText)}
          <svg class="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </a>
        <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-base font-bold border border-gray-600 text-gray-200 hover:border-gray-400">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
          Speak with an expert: ${esc(data.phone)}
        </a>
        ${data.supportText ? `<p class="text-sm text-gray-500 text-center">${esc(data.supportText)}</p>` : ''}
      </div>
    </div>
  </div>
</section>`;
}

export function ctaPrimaryValueChallenger(data: CTAPrimaryData): string {
  return `
<section class="py-16 bg-white border-y border-gray-200">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
    ${data.urgency ? `
    <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white mb-5" style="background-color:var(--c-accent)">
      ⏰ ${esc(data.urgency)}
    </div>` : ''}
    <h2 class="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
    ${data.subheadline ? `<p class="text-lg text-gray-600 mb-8 max-w-xl mx-auto">${esc(data.subheadline)}</p>` : '<div class="mb-6"></div>'}
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-white shadow-lg hover:opacity-90" style="background-color:var(--c-primary)">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        ${esc(data.ctaText)} — 100% Free
      </a>
      <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-base font-bold border border-gray-200 text-gray-700 hover:border-gray-300">
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
        ${esc(data.phone)}
      </a>
    </div>
    <p class="mt-4 text-sm text-gray-400">${esc(data.supportText || 'No obligation · No hidden fees · Reply within 2 hours')}</p>
  </div>
</section>`;
}

export function ctaPrimaryTrustBuilder(data: CTAPrimaryData): string {
  const guarantee = data.guarantee || '100% Satisfaction Guaranteed or We Come Back Free';
  return `
<section class="py-16 bg-green-50 border-y border-green-200">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
    <div class="inline-flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-green-200 px-5 py-3 mb-6">
      <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background-color:var(--c-primary)">
        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      </div>
      <span class="text-sm font-semibold text-gray-800">${esc(guarantee)}</span>
    </div>
    <h2 class="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
    ${data.subheadline ? `<p class="text-lg text-gray-600 mb-8 max-w-xl mx-auto">${esc(data.subheadline)}</p>` : '<div class="mb-6"></div>'}
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold text-white shadow-lg hover:opacity-90" style="background-color:var(--c-primary)">
        ${esc(data.ctaText)}
      </a>
      <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-base font-bold border border-gray-200 bg-white text-gray-800 hover:border-gray-300">
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
        ${esc(data.phone)}
      </a>
    </div>
    ${data.supportText ? `<p class="mt-4 text-sm text-gray-500">${esc(data.supportText)}</p>` : ''}
  </div>
</section>`;
}

export const CTA_PRIMARY_TEMPLATES = {
  proof_machine:    ctaPrimaryProofMachine,
  local_anchor:     ctaPrimaryLocalAnchor,
  authority_expert: ctaPrimaryAuthorityExpert,
  value_challenger: ctaPrimaryValueChallenger,
  trust_builder:    ctaPrimaryTrustBuilder,
} as const;

// ============================================================
// STICKY CTA BAR (mobile-fixed bottom bar)
// ============================================================

export function stickyCtaBar(phone: string, ctaText: string, ctaUrl: string): string {
  return `
<div class="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-2xl md:hidden">
  <div class="flex">
    <a href="tel:${tel(phone)}" class="flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold border-r border-gray-200" style="color:var(--c-primary)">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
      Call Now
    </a>
    <a href="${esc(ctaUrl)}" class="flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold text-white" style="background-color:var(--c-primary)">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      ${esc(ctaText)}
    </a>
  </div>
</div>`;
}
