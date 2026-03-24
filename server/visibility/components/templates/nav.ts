// =============================================================================
// COMPONENT TEMPLATES — NAVIGATION BAR
// 5 archetype variants, all responsive, Tailwind CSS, CSS variable brand colours
// =============================================================================

import type { NavData } from '../types';
import { esc, tel } from '../utils';

function navLinks(links: NavData['navLinks'], cls: string): string {
  return links.map(l =>
    `<a href="${esc(l.url)}" class="${cls}">${esc(l.label)}</a>`
  ).join('\n          ');
}

function hamburger(): string {
  return `
  <button onclick="this.closest('nav').querySelector('.mobile-menu').classList.toggle('hidden')"
    class="md:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none"
    aria-label="Open menu">
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  </button>`;
}

// ---------------------------------------------------------------------------
// proof_machine — Rating badge beside CTA in nav bar
// ---------------------------------------------------------------------------
export function navProofMachine(data: NavData): string {
  const sticky = data.isSticky !== false ? 'sticky top-0 z-50' : '';
  return `
<nav class="bg-white border-b border-gray-100 shadow-sm ${sticky}">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <!-- Logo -->
      <a href="/" class="flex items-center gap-3 flex-shrink-0">
        ${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="${esc(data.businessName)}" class="h-9 w-auto object-contain">` : ''}
        <span class="font-bold text-xl text-gray-900">${esc(data.businessName)}</span>
      </a>
      <!-- Desktop links -->
      <div class="hidden md:flex items-center gap-7">
        ${navLinks(data.navLinks, 'text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors')}
      </div>
      <!-- Right: rating badge + phone + CTA -->
      <div class="hidden md:flex items-center gap-4">
        <div class="flex items-center gap-1 text-sm">
          <span class="text-yellow-400 text-base">★★★★★</span>
          <span class="text-gray-700 font-semibold">5.0</span>
          <span class="text-gray-400">Google</span>
        </div>
        <a href="tel:${tel(data.phone)}" class="flex items-center gap-1.5 text-gray-700 font-semibold text-sm hover:opacity-80">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
          ${esc(data.phone)}
        </a>
        <a href="${esc(data.ctaUrl || '#contact')}" class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-sm" style="background-color:var(--c-primary)">
          ${esc(data.ctaText || 'Get a Quote')}
        </a>
      </div>
      ${hamburger()}
    </div>
  </div>
  <!-- Mobile menu -->
  <div class="mobile-menu hidden md:hidden border-t border-gray-100 bg-white">
    <div class="px-4 pt-3 pb-4 space-y-1">
      ${data.navLinks.map(l => `<a href="${esc(l.url)}" class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">${esc(l.label)}</a>`).join('\n      ')}
      <div class="pt-3 border-t border-gray-100 flex flex-col gap-3">
        <a href="tel:${tel(data.phone)}" class="flex items-center gap-2 px-3 py-2 text-gray-700 font-semibold">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
          ${esc(data.phone)}
        </a>
        <a href="${esc(data.ctaUrl || '#contact')}" class="block text-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style="background-color:var(--c-primary)">
          ${esc(data.ctaText || 'Get a Quote')}
        </a>
      </div>
    </div>
  </div>
</nav>`;
}

// ---------------------------------------------------------------------------
// local_anchor — Suburb tag beneath logo, local phone prominent
// ---------------------------------------------------------------------------
export function navLocalAnchor(data: NavData): string {
  const sticky = data.isSticky !== false ? 'sticky top-0 z-50' : '';
  return `
<nav class="bg-white border-b-2 shadow-sm ${sticky}" style="border-color:var(--c-primary)">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <!-- Logo + local tag -->
      <a href="/" class="flex items-center gap-3 flex-shrink-0">
        ${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="${esc(data.businessName)}" class="h-9 w-auto object-contain">` : ''}
        <div class="flex flex-col">
          <span class="font-bold text-lg text-gray-900 leading-tight">${esc(data.businessName)}</span>
          <span class="text-xs font-medium leading-tight" style="color:var(--c-primary)">
            <svg class="w-3 h-3 inline -mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
            Your Local Specialist
          </span>
        </div>
      </a>
      <!-- Desktop links -->
      <div class="hidden md:flex items-center gap-7">
        ${navLinks(data.navLinks, 'text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors')}
      </div>
      <!-- Right: call now prominent -->
      <div class="hidden md:flex items-center gap-4">
        <a href="tel:${tel(data.phone)}" class="flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-sm transition-colors hover:text-white" style="border-color:var(--c-primary);color:var(--c-primary);" onmouseover="this.style.backgroundColor='var(--c-primary)'" onmouseout="this.style.backgroundColor=''">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
          Call Now — ${esc(data.phone)}
        </a>
        <a href="${esc(data.ctaUrl || '#contact')}" class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white" style="background-color:var(--c-primary)">
          ${esc(data.ctaText || 'Free Quote')}
        </a>
      </div>
      ${hamburger()}
    </div>
  </div>
  <!-- Mobile menu -->
  <div class="mobile-menu hidden md:hidden border-t bg-white">
    <div class="px-4 pt-3 pb-4 space-y-1">
      ${data.navLinks.map(l => `<a href="${esc(l.url)}" class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">${esc(l.label)}</a>`).join('\n      ')}
      <div class="pt-3 border-t border-gray-100">
        <a href="tel:${tel(data.phone)}" class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-white mb-2" style="background-color:var(--c-primary)">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
          ${esc(data.phone)}
        </a>
      </div>
    </div>
  </div>
</nav>`;
}

// ---------------------------------------------------------------------------
// authority_expert — Credentials badge in utility bar above main nav
// ---------------------------------------------------------------------------
export function navAuthorityExpert(data: NavData): string {
  const sticky = data.isSticky !== false ? 'sticky top-0 z-50' : '';
  return `
<header class="${sticky}">
  <!-- Utility bar -->
  <div class="bg-gray-900 text-gray-300 text-xs py-1.5">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
      <div class="flex items-center gap-4">
        <span class="flex items-center gap-1">
          <svg class="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          Fully Licensed &amp; Insured
        </span>
        <span class="hidden sm:flex items-center gap-1">
          <svg class="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          Member — Industry Association
        </span>
      </div>
      <a href="tel:${tel(data.phone)}" class="text-gray-300 hover:text-white font-medium">${esc(data.phone)}</a>
    </div>
  </div>
  <!-- Main nav -->
  <nav class="bg-white border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <a href="/" class="flex items-center gap-3 flex-shrink-0">
          ${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="${esc(data.businessName)}" class="h-9 w-auto object-contain">` : ''}
          <span class="font-bold text-xl text-gray-900">${esc(data.businessName)}</span>
        </a>
        <div class="hidden md:flex items-center gap-7">
          ${navLinks(data.navLinks, 'text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors')}
        </div>
        <div class="hidden md:flex items-center gap-3">
          <a href="${esc(data.ctaUrl || '#contact')}" class="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style="background-color:var(--c-primary)">
            ${esc(data.ctaText || 'Book a Consultation')}
          </a>
        </div>
        ${hamburger()}
      </div>
    </div>
    <div class="mobile-menu hidden md:hidden border-t border-gray-100 bg-white">
      <div class="px-4 pt-3 pb-4 space-y-1">
        ${data.navLinks.map(l => `<a href="${esc(l.url)}" class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">${esc(l.label)}</a>`).join('\n        ')}
        <div class="pt-3 border-t border-gray-100">
          <a href="${esc(data.ctaUrl || '#contact')}" class="block text-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style="background-color:var(--c-primary)">${esc(data.ctaText || 'Book a Consultation')}</a>
        </div>
      </div>
    </div>
  </nav>
</header>`;
}

// ---------------------------------------------------------------------------
// value_challenger — Promo ribbon above nav, price anchor visible
// ---------------------------------------------------------------------------
export function navValueChallenger(data: NavData): string {
  const sticky = data.isSticky !== false ? 'sticky top-0 z-50' : '';
  return `
<header class="${sticky}">
  <!-- Promo ribbon -->
  <div class="text-white text-sm py-1.5 text-center font-medium" style="background-color:var(--c-accent)">
    ✓ Free quotes · No call-out fees · Upfront pricing — no surprises
  </div>
  <!-- Main nav -->
  <nav class="bg-white border-b border-gray-200 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-14">
        <a href="/" class="flex items-center gap-3 flex-shrink-0">
          ${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="${esc(data.businessName)}" class="h-8 w-auto object-contain">` : ''}
          <span class="font-bold text-xl text-gray-900">${esc(data.businessName)}</span>
        </a>
        <div class="hidden md:flex items-center gap-6">
          ${navLinks(data.navLinks, 'text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors')}
        </div>
        <div class="hidden md:flex items-center gap-3">
          <a href="tel:${tel(data.phone)}" class="text-gray-700 font-bold text-sm hover:opacity-80">${esc(data.phone)}</a>
          <a href="${esc(data.ctaUrl || '#contact')}" class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold text-white" style="background-color:var(--c-primary)">
            ${esc(data.ctaText || 'Get Free Quote')}
          </a>
        </div>
        ${hamburger()}
      </div>
    </div>
    <div class="mobile-menu hidden md:hidden border-t border-gray-100 bg-white">
      <div class="px-4 pt-3 pb-4 space-y-1">
        ${data.navLinks.map(l => `<a href="${esc(l.url)}" class="block px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 rounded-md">${esc(l.label)}</a>`).join('\n        ')}
        <div class="pt-3 border-t border-gray-100 flex flex-col gap-2">
          <a href="tel:${tel(data.phone)}" class="flex items-center justify-center gap-2 py-2.5 font-bold text-white rounded-lg" style="background-color:var(--c-primary)">${esc(data.phone)}</a>
        </div>
      </div>
    </div>
  </nav>
</header>`;
}

// ---------------------------------------------------------------------------
// trust_builder — Satisfaction guarantee badge in utility bar
// ---------------------------------------------------------------------------
export function navTrustBuilder(data: NavData): string {
  const sticky = data.isSticky !== false ? 'sticky top-0 z-50' : '';
  return `
<header class="${sticky}">
  <!-- Trust utility bar -->
  <div class="bg-gray-50 border-b border-gray-200 py-1.5">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
      <div class="flex items-center gap-5 text-xs text-gray-600 font-medium">
        <span class="flex items-center gap-1.5">
          <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
          100% Satisfaction Guarantee
        </span>
        <span class="hidden sm:flex items-center gap-1.5">
          <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          Fully Insured
        </span>
        <span class="hidden lg:flex items-center gap-1.5">
          <svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          5-Star Rated
        </span>
      </div>
      <a href="tel:${tel(data.phone)}" class="text-xs font-semibold text-gray-700 hover:text-gray-900">${esc(data.phone)}</a>
    </div>
  </div>
  <!-- Main nav -->
  <nav class="bg-white border-b border-gray-200 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <a href="/" class="flex items-center gap-3 flex-shrink-0">
          ${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="${esc(data.businessName)}" class="h-9 w-auto object-contain">` : ''}
          <span class="font-bold text-xl text-gray-900">${esc(data.businessName)}</span>
        </a>
        <div class="hidden md:flex items-center gap-7">
          ${navLinks(data.navLinks, 'text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors')}
        </div>
        <div class="hidden md:flex items-center gap-3">
          <a href="${esc(data.ctaUrl || '#contact')}" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm" style="background-color:var(--c-primary)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            ${esc(data.ctaText || 'Get a Quote')}
          </a>
        </div>
        ${hamburger()}
      </div>
    </div>
    <div class="mobile-menu hidden md:hidden border-t border-gray-100 bg-white">
      <div class="px-4 pt-3 pb-4 space-y-1">
        ${data.navLinks.map(l => `<a href="${esc(l.url)}" class="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">${esc(l.label)}</a>`).join('\n        ')}
        <div class="pt-3 border-t border-gray-100">
          <a href="${esc(data.ctaUrl || '#contact')}" class="block text-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style="background-color:var(--c-primary)">${esc(data.ctaText || 'Get a Quote')}</a>
        </div>
      </div>
    </div>
  </nav>
</header>`;
}

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------
export const NAV_TEMPLATES = {
  proof_machine:    navProofMachine,
  local_anchor:     navLocalAnchor,
  authority_expert: navAuthorityExpert,
  value_challenger: navValueChallenger,
  trust_builder:    navTrustBuilder,
} as const;
