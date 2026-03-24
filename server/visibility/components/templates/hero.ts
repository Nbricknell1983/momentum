// =============================================================================
// COMPONENT TEMPLATES — HERO SECTION
// 5 archetype variants, responsive, Tailwind CSS, CSS variable brand colours
// =============================================================================

import type { HeroData } from '../types';
import { esc, tel, renderStars } from '../utils';

function statPills(stats: HeroData['trustStats']): string {
  if (!stats?.length) return '';
  return `
  <div class="flex flex-wrap gap-4 justify-center md:justify-start mt-6">
    ${stats.map(s => `
    <div class="text-center">
      <div class="text-2xl font-bold" style="color:var(--c-primary)">${esc(s.value)}</div>
      <div class="text-sm text-gray-500">${esc(s.label)}</div>
    </div>`).join('')}
  </div>`;
}

// ---------------------------------------------------------------------------
// proof_machine — Star rating + review count above H1
// ---------------------------------------------------------------------------
export function heroProofMachine(data: HeroData): string {
  const bgStyle = data.backgroundImageUrl
    ? `background:linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url('${esc(data.backgroundImageUrl)}') center/cover no-repeat`
    : 'background-color:var(--c-background)';
  const textOnBg = data.backgroundImageUrl ? 'text-white' : 'text-gray-900';
  const subTextOnBg = data.backgroundImageUrl ? 'text-gray-200' : 'text-gray-600';

  return `
<section class="relative py-20 md:py-28" style="${bgStyle}">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="max-w-3xl">
      <!-- Social proof badge -->
      ${data.reviewCount ? `
      <div class="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm mb-6">
        <span class="text-yellow-400 text-lg">${renderStars(data.reviewRating || 5)}</span>
        <span class="text-gray-900 font-semibold text-sm">${data.reviewRating?.toFixed(1) || '5.0'}</span>
        <span class="text-gray-500 text-sm">${data.reviewCount.toLocaleString()} reviews on ${esc(data.reviewPlatform || 'Google')}</span>
      </div>` : ''}
      <!-- H1 -->
      <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-4 ${textOnBg}" style="font-family:var(--font-heading)">
        ${esc(data.headline)}
      </h1>
      <p class="text-lg md:text-xl mb-8 max-w-xl ${subTextOnBg}">
        ${esc(data.subheadline)}
      </p>
      <!-- CTAs -->
      <div class="flex flex-col sm:flex-row gap-4">
        <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold text-white shadow-lg transition-opacity hover:opacity-90" style="background-color:var(--c-primary)">
          ${esc(data.ctaText)}
        </a>
        <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold border-2 bg-white text-gray-900 hover:bg-gray-50 shadow-sm" style="border-color:var(--c-primary)">
          <svg class="w-5 h-5" style="color:var(--c-primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
          ${esc(data.phone)}
        </a>
      </div>
      ${statPills(data.trustStats)}
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// local_anchor — Suburb-specific headline, map pin, service area feel
// ---------------------------------------------------------------------------
export function heroLocalAnchor(data: HeroData): string {
  return `
<section class="bg-white py-16 md:py-24 border-b border-gray-100">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-12 items-center">
      <!-- Left: copy -->
      <div>
        <!-- Location pill -->
        ${data.suburb || data.location ? `
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold text-white mb-5" style="background-color:var(--c-primary)">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
          Serving ${esc(data.suburb || data.location || '')} &amp; surrounds
        </div>` : ''}
        <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5" style="font-family:var(--font-heading)">
          ${esc(data.headline)}
        </h1>
        <p class="text-lg text-gray-600 mb-8 max-w-lg">
          ${esc(data.subheadline)}
        </p>
        <!-- Dual CTA -->
        <div class="flex flex-col sm:flex-row gap-4">
          <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-7 py-4 rounded-xl text-base font-bold text-white shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
            ${esc(data.ctaText)}
          </a>
          <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold border-2 border-gray-200 bg-white text-gray-800 hover:border-gray-300">
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            ${esc(data.phone)}
          </a>
        </div>
        <!-- Trust row -->
        ${data.reviewCount ? `
        <div class="flex items-center gap-2 mt-6 text-sm text-gray-500">
          <span class="text-yellow-400">${renderStars(data.reviewRating || 5)}</span>
          <span class="font-medium text-gray-700">${data.reviewRating?.toFixed(1) || '5.0'}</span>
          <span>· ${data.reviewCount.toLocaleString()} ${esc(data.reviewPlatform || 'Google')} reviews</span>
        </div>` : ''}
      </div>
      <!-- Right: local visual placeholder -->
      <div class="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[4/3]">
        ${data.backgroundImageUrl
          ? `<img src="${esc(data.backgroundImageUrl)}" alt="Our work" class="w-full h-full object-cover">`
          : `<div class="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <svg class="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span class="text-sm">Your work photo here</span>
            </div>`}
        <!-- Location badge overlay -->
        <div class="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
          <svg class="w-4 h-4" style="color:var(--c-primary)" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
          <span class="text-sm font-semibold text-gray-800">${esc(data.suburb || data.location || 'Your area')}</span>
        </div>
      </div>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// authority_expert — Credentials front-and-centre
// ---------------------------------------------------------------------------
export function heroAuthorityExpert(data: HeroData): string {
  return `
<section class="bg-gray-50 py-20 md:py-28 border-b border-gray-200">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-16 items-center">
      <!-- Left -->
      <div>
        <!-- Credentials pill -->
        ${data.badge ? `
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold mb-6">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          ${esc(data.badge)}
        </div>` : ''}
        <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5" style="font-family:var(--font-heading)">
          ${esc(data.headline)}
        </h1>
        <p class="text-lg text-gray-600 mb-8 max-w-lg leading-relaxed">
          ${esc(data.subheadline)}
        </p>
        <div class="flex flex-col sm:flex-row gap-4">
          <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-7 py-4 rounded-lg text-base font-bold text-white shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
            ${esc(data.ctaText)}
          </a>
          <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-lg text-base font-bold text-gray-700 border border-gray-300 bg-white hover:border-gray-400">
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            ${esc(data.phone)}
          </a>
        </div>
        <!-- Credential stats -->
        ${data.yearsInBusiness || data.trustStats?.length ? `
        <div class="flex flex-wrap gap-6 mt-8 pt-8 border-t border-gray-200">
          ${data.yearsInBusiness ? `<div><div class="text-3xl font-extrabold" style="color:var(--c-primary)">${data.yearsInBusiness}+</div><div class="text-sm text-gray-500">Years experience</div></div>` : ''}
          ${(data.trustStats || []).map(s => `<div><div class="text-3xl font-extrabold" style="color:var(--c-primary)">${esc(s.value)}</div><div class="text-sm text-gray-500">${esc(s.label)}</div></div>`).join('')}
        </div>` : ''}
      </div>
      <!-- Right -->
      <div class="relative">
        <div class="rounded-2xl overflow-hidden bg-gray-200 aspect-[4/3] shadow-xl">
          ${data.backgroundImageUrl
            ? `<img src="${esc(data.backgroundImageUrl)}" alt="${esc(data.headline)}" class="w-full h-full object-cover">`
            : `<div class="absolute inset-0 flex items-center justify-center text-gray-400">
                <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>`}
        </div>
        <!-- Floating credential card -->
        <div class="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-xl p-4 flex items-center gap-3">
          <div class="w-12 h-12 rounded-full flex items-center justify-center" style="background-color:var(--c-primary)">
            <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          </div>
          <div>
            <div class="font-bold text-gray-900 text-sm">Licensed &amp; Certified</div>
            <div class="text-xs text-gray-500">Verified professionals</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// value_challenger — Price anchor prominent, savings claim
// ---------------------------------------------------------------------------
export function heroValueChallenger(data: HeroData): string {
  return `
<section class="bg-white py-16 md:py-24 border-b border-gray-100">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-12 items-center">
      <!-- Left -->
      <div>
        ${data.savingsClaim ? `
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white mb-6" style="background-color:var(--c-accent)">
          💰 ${esc(data.savingsClaim)}
        </div>` : ''}
        <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-4" style="font-family:var(--font-heading)">
          ${esc(data.headline)}
        </h1>
        <p class="text-lg text-gray-600 mb-6">
          ${esc(data.subheadline)}
        </p>
        ${data.priceFrom ? `
        <div class="flex items-baseline gap-2 mb-7">
          <span class="text-sm text-gray-500">Starting from</span>
          <span class="text-4xl font-extrabold" style="color:var(--c-primary)">${esc(data.priceFrom)}</span>
          <span class="text-sm text-gray-500">· No call-out fee</span>
        </div>` : ''}
        <div class="flex flex-col sm:flex-row gap-4">
          <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-7 py-4 rounded-xl text-base font-bold text-white shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
            ${esc(data.ctaText)}
            <svg class="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </a>
          <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold border border-gray-200 text-gray-700 hover:border-gray-300">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            ${esc(data.phone)}
          </a>
        </div>
        <div class="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm text-gray-500">
          <span class="flex items-center gap-1"><svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>No hidden fees</span>
          <span class="flex items-center gap-1"><svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>Free quotes</span>
          <span class="flex items-center gap-1"><svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>Price match guarantee</span>
        </div>
      </div>
      <!-- Right: image -->
      <div class="rounded-2xl overflow-hidden bg-gray-100 aspect-[4/3] shadow-lg">
        ${data.backgroundImageUrl
          ? `<img src="${esc(data.backgroundImageUrl)}" alt="${esc(data.headline)}" class="w-full h-full object-cover">`
          : `<div class="w-full h-full flex items-center justify-center text-gray-400">
              <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>`}
      </div>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// trust_builder — Guarantee banner, risk-free framing
// ---------------------------------------------------------------------------
export function heroTrustBuilder(data: HeroData): string {
  const guarantee = data.guarantee || '100% Satisfaction Guaranteed or We Come Back Free';
  return `
<section class="bg-white py-16 md:py-24">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Guarantee banner -->
    <div class="rounded-2xl p-4 mb-12 flex items-center gap-4 shadow-sm" style="background-color:var(--c-primary)">
      <div class="flex-shrink-0 w-12 h-12 bg-white rounded-full flex items-center justify-center">
        <svg class="w-7 h-7" style="color:var(--c-primary)" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      </div>
      <p class="text-white font-semibold text-sm md:text-base">${esc(guarantee)}</p>
    </div>
    <div class="grid md:grid-cols-2 gap-12 items-center">
      <!-- Left -->
      <div>
        <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5" style="font-family:var(--font-heading)">
          ${esc(data.headline)}
        </h1>
        <p class="text-lg text-gray-600 mb-8 max-w-lg">
          ${esc(data.subheadline)}
        </p>
        <div class="flex flex-col sm:flex-row gap-4">
          <a href="${esc(data.ctaUrl)}" class="inline-flex items-center justify-center px-7 py-4 rounded-xl text-base font-bold text-white shadow-lg hover:opacity-90" style="background-color:var(--c-primary)">
            ${esc(data.ctaText)} — Risk Free
          </a>
          <a href="tel:${tel(data.phone)}" class="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold text-gray-700 border border-gray-200 hover:border-gray-300">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            ${esc(data.phone)}
          </a>
        </div>
        <!-- Trust signals -->
        <div class="grid grid-cols-2 gap-4 mt-8">
          ${[
            { icon: '🛡️', label: 'Fully Insured' },
            { icon: '✅', label: 'Licensed & Certified' },
            { icon: '⭐', label: `${data.reviewRating?.toFixed(1) || '5.0'}-Star Rated` },
            { icon: '🔄', label: 'Satisfaction Guarantee' },
          ].map(t => `
          <div class="flex items-center gap-2 text-sm text-gray-700">
            <span class="text-lg">${t.icon}</span>
            <span class="font-medium">${t.label}</span>
          </div>`).join('')}
        </div>
      </div>
      <!-- Right: image -->
      <div class="rounded-2xl overflow-hidden bg-gray-100 aspect-[4/3] shadow-xl">
        ${data.backgroundImageUrl
          ? `<img src="${esc(data.backgroundImageUrl)}" alt="${esc(data.headline)}" class="w-full h-full object-cover">`
          : `<div class="w-full h-full flex items-center justify-center text-gray-400">
              <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>`}
      </div>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------
export const HERO_TEMPLATES = {
  proof_machine:    heroProofMachine,
  local_anchor:     heroLocalAnchor,
  authority_expert: heroAuthorityExpert,
  value_challenger: heroValueChallenger,
  trust_builder:    heroTrustBuilder,
} as const;
