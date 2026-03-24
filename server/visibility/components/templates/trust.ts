// =============================================================================
// COMPONENT TEMPLATES — TRUST BAR + TESTIMONIALS
// Covers: trust_bar, testimonial_carousel, testimonial_grid
// =============================================================================

import type { TrustBarData, TestimonialData } from '../types';
import { esc, tel, renderStars, starSVGs, fmtDate, truncate } from '../utils';

// ============================================================
// TRUST BAR
// ============================================================

function trustIcon(type: 'star' | 'check' | 'shield' | 'pin' | 'jobs' | 'clock'): string {
  const icons: Record<string, string> = {
    star:   `<svg class="w-5 h-5" fill="#FBBF24" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`,
    check:  `<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
    shield: `<svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
    pin:    `<svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>`,
    jobs:   `<svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
    clock:  `<svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  };
  return icons[type] || icons.check;
}

export function trustBarProofMachine(data: TrustBarData): string {
  return `
<div class="bg-gray-50 border-y border-gray-200 py-4">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap justify-center md:justify-between items-center gap-6">
      ${data.reviewCount ? `
      <div class="flex items-center gap-2">
        <div class="flex">${starSVGs(data.reviewRating || 5, 18)}</div>
        <span class="font-bold text-gray-900">${data.reviewRating?.toFixed(1) || '5.0'}</span>
        <span class="text-gray-500 text-sm">${data.reviewCount.toLocaleString()} ${esc(data.reviewPlatform || 'Google')} reviews</span>
      </div>` : ''}
      ${data.completedJobs ? `
      <div class="flex items-center gap-2">
        ${trustIcon('jobs')}
        <span class="font-semibold text-gray-800">${data.completedJobs.toLocaleString()}+ jobs completed</span>
      </div>` : ''}
      ${data.yearsInBusiness ? `
      <div class="flex items-center gap-2">
        ${trustIcon('check')}
        <span class="font-semibold text-gray-800">Est. ${new Date().getFullYear() - data.yearsInBusiness} · ${data.yearsInBusiness} years</span>
      </div>` : ''}
      ${data.responseTime ? `
      <div class="flex items-center gap-2">
        ${trustIcon('clock')}
        <span class="text-gray-700 text-sm">${esc(data.responseTime)}</span>
      </div>` : ''}
      ${(data.badges || []).slice(0, 2).map(b => `
      <div class="flex items-center gap-2">
        ${trustIcon('shield')}
        <span class="text-sm font-medium text-gray-700">${esc(b)}</span>
      </div>`).join('')}
    </div>
  </div>
</div>`;
}

export function trustBarLocalAnchor(data: TrustBarData): string {
  return `
<div class="py-4" style="background-color:var(--c-primary)">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap justify-center gap-8 text-white">
      <div class="flex items-center gap-2 text-sm font-medium">
        <svg class="w-5 h-5 text-yellow-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
        Your local specialist
      </div>
      ${data.yearsInBusiness ? `
      <div class="flex items-center gap-2 text-sm font-medium">
        <svg class="w-5 h-5 text-yellow-300" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
        ${data.yearsInBusiness} years serving the community
      </div>` : ''}
      ${data.reviewCount ? `
      <div class="flex items-center gap-2 text-sm font-medium">
        <svg class="w-5 h-5 text-yellow-300" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
        ${data.reviewRating?.toFixed(1) || '5.0'}★ from ${data.reviewCount.toLocaleString()} locals
      </div>` : ''}
      ${data.responseTime ? `
      <div class="flex items-center gap-2 text-sm font-medium">
        <svg class="w-5 h-5 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        ${esc(data.responseTime)}
      </div>` : ''}
    </div>
  </div>
</div>`;
}

export function trustBarAuthorityExpert(data: TrustBarData): string {
  return `
<div class="bg-gray-900 py-3">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap justify-center gap-8">
      ${(data.badges || ['Licensed', 'Insured', 'Certified']).map(b => `
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
        <span class="text-sm font-medium text-gray-200">${esc(b)}</span>
      </div>`).join('')}
      ${data.licenseNumber ? `
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <span class="text-sm text-gray-300">Lic. No. ${esc(data.licenseNumber)}</span>
      </div>` : ''}
      ${data.reviewCount ? `
      <div class="flex items-center gap-1.5">
        <span class="text-yellow-400 text-sm">★</span>
        <span class="text-sm font-medium text-gray-200">${data.reviewRating?.toFixed(1) || '5.0'} · ${data.reviewCount.toLocaleString()} reviews</span>
      </div>` : ''}
    </div>
  </div>
</div>`;
}

export function trustBarValueChallenger(data: TrustBarData): string {
  return `
<div class="bg-white border-y border-gray-200 py-4">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap justify-center gap-8 text-sm">
      <div class="flex items-center gap-2 font-semibold text-gray-800">
        <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        Free Quotes
      </div>
      <div class="flex items-center gap-2 font-semibold text-gray-800">
        <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        No Call-Out Fees
      </div>
      <div class="flex items-center gap-2 font-semibold text-gray-800">
        <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        Upfront Fixed Pricing
      </div>
      ${data.completedJobs ? `
      <div class="flex items-center gap-2 text-gray-600">
        ${trustIcon('jobs')}
        ${data.completedJobs.toLocaleString()}+ jobs completed
      </div>` : ''}
      ${data.responseTime ? `
      <div class="flex items-center gap-2 text-gray-600">
        ${trustIcon('clock')}
        ${esc(data.responseTime)}
      </div>` : ''}
    </div>
  </div>
</div>`;
}

export function trustBarTrustBuilder(data: TrustBarData): string {
  const guarantee = data.guaranteeText || '100% Satisfaction Guaranteed';
  return `
<div class="bg-green-50 border-y border-green-200 py-4">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap justify-center gap-8 text-sm">
      <div class="flex items-center gap-2 font-semibold text-green-800">
        <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        ${esc(guarantee)}
      </div>
      <div class="flex items-center gap-2 text-green-700 font-medium">
        <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
        Fully Insured
      </div>
      ${data.licenseNumber ? `
      <div class="flex items-center gap-2 text-green-700 font-medium">
        <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
        Lic. No. ${esc(data.licenseNumber)}
      </div>` : ''}
      ${data.reviewCount ? `
      <div class="flex items-center gap-2 text-green-700">
        <span class="text-yellow-500">★</span>
        <span class="font-medium">${data.reviewRating?.toFixed(1) || '5.0'} · ${data.reviewCount.toLocaleString()} verified reviews</span>
      </div>` : ''}
    </div>
  </div>
</div>`;
}

export const TRUST_BAR_TEMPLATES = {
  proof_machine:    trustBarProofMachine,
  local_anchor:     trustBarLocalAnchor,
  authority_expert: trustBarAuthorityExpert,
  value_challenger: trustBarValueChallenger,
  trust_builder:    trustBarTrustBuilder,
} as const;

// ============================================================
// TESTIMONIAL CAROUSEL  (CSS-only scroll snap, no JS required)
// ============================================================

function reviewCard(t: TestimonialData['testimonials'][0], extraBadge?: string): string {
  return `
  <div class="flex-none w-80 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
    <div class="flex items-center gap-1 mb-3">${starSVGs(t.rating, 14)}</div>
    <p class="text-gray-700 text-sm leading-relaxed mb-4">"${esc(truncate(t.text, 200))}"</p>
    <div class="flex justify-between items-end">
      <div>
        <div class="font-semibold text-gray-900 text-sm">${esc(t.name)}</div>
        <div class="text-xs text-gray-500">${t.location ? esc(t.location) : ''}${t.date ? ` · ${fmtDate(t.date)}` : ''}</div>
      </div>
      ${extraBadge ? `<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">${esc(extraBadge)}</span>` : ''}
    </div>
  </div>`;
}

export function testimonialCarouselProofMachine(data: TestimonialData): string {
  return `
<section class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-10">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline || 'What our customers say')}</h2>
      ${data.subheadline ? `<p class="text-gray-500">${esc(data.subheadline)}</p>` : ''}
    </div>
    <div class="flex gap-5 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory" style="scrollbar-width:none">
      ${data.testimonials.map(t => `<div class="snap-start">${reviewCard(t, t.platform || 'Google')}</div>`).join('')}
    </div>
  </div>
</section>`;
}

export function testimonialCarouselLocalAnchor(data: TestimonialData): string {
  return `
<section class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-10">
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-white mb-4" style="background-color:var(--c-primary)">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
        From your neighbours
      </div>
      <h2 class="text-3xl font-extrabold text-gray-900" style="font-family:var(--font-heading)">${esc(data.headline || 'Trusted by locals across the region')}</h2>
    </div>
    <div class="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory" style="scrollbar-width:none">
      ${data.testimonials.map(t => `
      <div class="snap-start flex-none w-80 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center gap-1 mb-3">${starSVGs(t.rating, 14)}</div>
        <p class="text-gray-700 text-sm leading-relaxed mb-4">"${esc(truncate(t.text, 200))}"</p>
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold text-gray-900 text-sm">${esc(t.name)}</div>
            ${t.location ? `
            <div class="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
              ${esc(t.location)}
            </div>` : ''}
          </div>
        </div>
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

export function testimonialCarouselAuthorityExpert(data: TestimonialData): string {
  return `
<section class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <h2 class="text-3xl font-extrabold text-gray-900 mb-2 text-center" style="font-family:var(--font-heading)">${esc(data.headline || 'Client outcomes')}</h2>
    ${data.subheadline ? `<p class="text-center text-gray-500 mb-10">${esc(data.subheadline)}</p>` : '<div class="mb-10"></div>'}
    <div class="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory" style="scrollbar-width:none">
      ${data.testimonials.map(t => `
      <div class="snap-start flex-none w-80 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div class="flex items-center gap-1 mb-3">${starSVGs(t.rating, 14)}</div>
        ${t.jobType ? `<div class="text-xs font-semibold uppercase tracking-wide mb-2" style="color:var(--c-primary)">${esc(t.jobType)}</div>` : ''}
        <p class="text-gray-700 text-sm leading-relaxed mb-4">"${esc(truncate(t.text, 220))}"</p>
        <div class="font-semibold text-gray-900 text-sm">${esc(t.name)}</div>
        ${t.date ? `<div class="text-xs text-gray-400 mt-0.5">${fmtDate(t.date)}</div>` : ''}
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

export function testimonialCarouselValueChallenger(data: TestimonialData): string {
  return `
<section class="py-16 bg-white border-y border-gray-100">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-10">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline || 'Real customers, real results')}</h2>
      <p class="text-gray-500 text-sm">${esc(data.subheadline || 'See why thousands choose us for value and quality')}</p>
    </div>
    <div class="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory" style="scrollbar-width:none">
      ${data.testimonials.map(t => `
      <div class="snap-start flex-none w-80 bg-white rounded-2xl shadow border border-gray-100 p-6">
        <div class="flex items-center gap-1 mb-3">${starSVGs(t.rating, 14)}</div>
        <p class="text-gray-700 text-sm leading-relaxed mb-4">"${esc(truncate(t.text, 200))}"</p>
        <div class="pt-3 border-t border-gray-100 flex justify-between items-center">
          <div class="font-semibold text-gray-900 text-sm">${esc(t.name)}</div>
          <span class="text-xs font-semibold px-2 py-1 rounded-full text-white" style="background-color:var(--c-primary)">Verified</span>
        </div>
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

export function testimonialCarouselTrustBuilder(data: TestimonialData): string {
  return `
<section class="py-16 bg-green-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-10">
      <div class="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-green-200 mb-4">
        <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        <span class="text-sm font-semibold text-green-800">Verified customer reviews</span>
      </div>
      <h2 class="text-3xl font-extrabold text-gray-900" style="font-family:var(--font-heading)">${esc(data.headline || 'Our customers trust us')}</h2>
    </div>
    <div class="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory" style="scrollbar-width:none">
      ${data.testimonials.map(t => `
      <div class="snap-start flex-none w-80 bg-white rounded-2xl border border-green-100 p-6 shadow-sm">
        <div class="flex items-center gap-1 mb-3">${starSVGs(t.rating, 14)}</div>
        <p class="text-gray-700 text-sm leading-relaxed mb-4">"${esc(truncate(t.text, 200))}"</p>
        <div class="font-semibold text-gray-900 text-sm">${esc(t.name)}</div>
        ${t.location ? `<div class="text-xs text-gray-400">${esc(t.location)}</div>` : ''}
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

export const TESTIMONIAL_CAROUSEL_TEMPLATES = {
  proof_machine:    testimonialCarouselProofMachine,
  local_anchor:     testimonialCarouselLocalAnchor,
  authority_expert: testimonialCarouselAuthorityExpert,
  value_challenger: testimonialCarouselValueChallenger,
  trust_builder:    testimonialCarouselTrustBuilder,
} as const;

// ============================================================
// TESTIMONIAL GRID (3-column static)
// ============================================================

export function testimonialGrid(data: TestimonialData, _archetype: string): string {
  const shown = data.testimonials.slice(0, 6);
  return `
<section class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `<h2 class="text-3xl font-extrabold text-gray-900 text-center mb-10" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>` : '<div class="mb-10"></div>'}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${shown.map(t => `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center gap-1 mb-3">${starSVGs(t.rating, 14)}</div>
        <p class="text-gray-700 text-sm leading-relaxed mb-4">"${esc(truncate(t.text, 180))}"</p>
        <div class="flex items-center justify-between pt-3 border-t border-gray-100">
          <div>
            <div class="font-semibold text-gray-900 text-sm">${esc(t.name)}</div>
            ${t.location ? `<div class="text-xs text-gray-400">${esc(t.location)}</div>` : ''}
          </div>
          ${t.platform ? `<span class="text-xs font-medium text-gray-400">${esc(t.platform)}</span>` : ''}
        </div>
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

export const TESTIMONIAL_GRID_TEMPLATES = {
  proof_machine:    (d: TestimonialData) => testimonialGrid(d, 'proof_machine'),
  local_anchor:     (d: TestimonialData) => testimonialGrid(d, 'local_anchor'),
  authority_expert: (d: TestimonialData) => testimonialGrid(d, 'authority_expert'),
  value_challenger: (d: TestimonialData) => testimonialGrid(d, 'value_challenger'),
  trust_builder:    (d: TestimonialData) => testimonialGrid(d, 'trust_builder'),
} as const;
