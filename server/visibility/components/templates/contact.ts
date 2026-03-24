// =============================================================================
// COMPONENT TEMPLATES — CONTACT FORM + FOOTER + FAQ + LOCAL SCHEMA
// =============================================================================

import type { ContactFormData, FooterData, FAQData } from '../types';
import { esc, tel, ACCORDION_JS } from '../utils';

// ============================================================
// CONTACT FORM
// ============================================================

const DEFAULT_FIELDS: ContactFormData['fields'] = [
  { name: 'name',    label: 'Full Name',         type: 'text',     required: true,  placeholder: 'Your name' },
  { name: 'phone',   label: 'Phone Number',       type: 'tel',      required: true,  placeholder: 'Your phone number' },
  { name: 'email',   label: 'Email Address',      type: 'email',    required: false, placeholder: 'your@email.com' },
  { name: 'service', label: 'Service Required',   type: 'select',   required: false, options: ['General enquiry', 'Request a quote', 'Emergency service', 'Other'] },
  { name: 'message', label: 'Tell us more',       type: 'textarea', required: false, placeholder: 'Describe your job or question...' },
];

type FieldDef = (typeof DEFAULT_FIELDS)[0];

function formFields(fields: ContactFormData['fields']): string {
  // Coerce to non-nullable array — fallback to defaults if not provided
  const f = (fields && fields.length > 0 ? fields : DEFAULT_FIELDS) as FieldDef[];
  return f.map(field => {
    const required = field.required ? 'required' : '';
    const placeholder = field.placeholder ? `placeholder="${esc(field.placeholder)}"` : '';
    const baseInput = 'w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition';
    const focusStyle = `style="--tw-ring-color:var(--c-primary)"`;

    if (field.type === 'textarea') {
      return `
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1.5" for="${esc(field.name)}">${esc(field.label)}${field.required ? ' <span class="text-red-500">*</span>' : ''}</label>
        <textarea id="${esc(field.name)}" name="${esc(field.name)}" rows="4" ${required} ${placeholder} ${focusStyle} class="${baseInput} resize-none"></textarea>
      </div>`;
    }
    if (field.type === 'select') {
      return `
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1.5" for="${esc(field.name)}">${esc(field.label)}</label>
        <select id="${esc(field.name)}" name="${esc(field.name)}" ${focusStyle} class="${baseInput} bg-white">
          <option value="">Select an option</option>
          ${(field.options || []).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
        </select>
      </div>`;
    }
    return `
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1.5" for="${esc(field.name)}">${esc(field.label)}${field.required ? ' <span class="text-red-500">*</span>' : ''}</label>
      <input type="${esc(field.type)}" id="${esc(field.name)}" name="${esc(field.name)}" ${required} ${placeholder} ${focusStyle} class="${baseInput}">
    </div>`;
  }).join('\n');
}

export function contactFormProofMachine(data: ContactFormData): string {
  return `
<section id="contact" class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-12 items-start">
      <!-- Left: info -->
      <div>
        <h2 class="text-3xl font-extrabold text-gray-900 mb-4" style="font-family:var(--font-heading)">${esc(data.formTitle || 'Get in touch')}</h2>
        <p class="text-gray-600 mb-6">${esc(data.formSubtitle || 'Fill in the form and we\'ll get back to you promptly.')}</p>
        <!-- Social proof beside form -->
        <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="text-2xl font-bold text-yellow-500">★★★★★</div>
            <div>
              <div class="font-semibold text-gray-900 text-sm">5.0 Google Rating</div>
              <div class="text-xs text-gray-500">Based on verified reviews</div>
            </div>
          </div>
          <p class="text-sm text-gray-600 italic">"Fast response, professional service. Highly recommend."</p>
        </div>
        <!-- Contact details -->
        <div class="space-y-3 text-sm text-gray-700">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 flex-shrink-0" style="color:var(--c-primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            <a href="tel:${tel(data.phone)}" class="font-semibold hover:underline">${esc(data.phone)}</a>
          </div>
          ${data.email ? `
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 flex-shrink-0" style="color:var(--c-primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <a href="mailto:${esc(data.email)}" class="hover:underline">${esc(data.email)}</a>
          </div>` : ''}
          ${data.address ? `
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" style="color:var(--c-primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span>${esc(data.address)}</span>
          </div>` : ''}
        </div>
      </div>
      <!-- Right: form -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <form name="contact" method="POST" action="#" class="space-y-5">
          ${formFields(data.fields)}
          <button type="submit" class="w-full py-4 rounded-xl text-base font-bold text-white shadow-md hover:opacity-90 transition" style="background-color:var(--c-primary)">
            Send Message
          </button>
          <p class="text-xs text-gray-400 text-center">${esc(data.responsePromise || 'We reply within 2 hours during business hours')}</p>
        </form>
      </div>
    </div>
  </div>
</section>`;
}

export function contactFormLocalAnchor(data: ContactFormData): string {
  return `
<section id="contact" class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-12 items-start">
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold text-white mb-5" style="background-color:var(--c-primary)">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
          ${esc(data.suburb || 'Your local team')}
        </div>
        <h2 class="text-3xl font-extrabold text-gray-900 mb-4" style="font-family:var(--font-heading)">${esc(data.formTitle || 'Contact your local team')}</h2>
        <p class="text-gray-600 mb-8">${esc(data.formSubtitle || 'Local team, fast response. We know your area.')}</p>
        <div class="space-y-3 text-sm">
          <a href="tel:${tel(data.phone)}" class="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition">
            <svg class="w-5 h-5" style="color:var(--c-primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            <div>
              <div class="font-bold text-gray-900">${esc(data.phone)}</div>
              <div class="text-gray-500 text-xs">${esc(data.responsePromise || 'Same-day response')}</div>
            </div>
          </a>
          ${data.address ? `
          <div class="flex items-start gap-3 p-4 rounded-xl bg-gray-50">
            <svg class="w-5 h-5 mt-0.5" style="color:var(--c-primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
            <span class="text-gray-700">${esc(data.address)}</span>
          </div>` : ''}
        </div>
      </div>
      <div class="bg-gray-50 rounded-2xl p-8">
        <form name="contact" method="POST" action="#" class="space-y-5">
          ${formFields(data.fields)}
          <button type="submit" class="w-full py-4 rounded-xl text-base font-bold text-white shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
            Send Enquiry
          </button>
        </form>
      </div>
    </div>
  </div>
</section>`;
}

export function contactFormAuthorityExpert(data: ContactFormData): string {
  return `
<section id="contact" class="py-16 bg-gray-50">
  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-10">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.formTitle || 'Book a consultation')}</h2>
      <p class="text-gray-600">${esc(data.formSubtitle || 'Speak with a certified specialist. No obligation.')}</p>
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-10">
      <form name="contact" method="POST" action="#" class="grid md:grid-cols-2 gap-5">
        ${((data.fields || DEFAULT_FIELDS) as FieldDef[]).slice(0, -1).map((field: FieldDef) => {
    const baseInput = 'w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none transition';
    return field.type === 'textarea'
      ? `<div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1.5">${esc(field.label)}</label><textarea name="${esc(field.name)}" rows="3" placeholder="${esc(field.placeholder || '')}" class="${baseInput} resize-none w-full"></textarea></div>`
      : field.type === 'select'
        ? `<div><label class="block text-sm font-medium text-gray-700 mb-1.5">${esc(field.label)}</label><select name="${esc(field.name)}" class="${baseInput} bg-white"><option value="">Select</option>${(field.options || []).map(o => `<option>${esc(o)}</option>`).join('')}</select></div>`
        : `<div><label class="block text-sm font-medium text-gray-700 mb-1.5">${esc(field.label)}${field.required ? ' *' : ''}</label><input type="${field.type}" name="${esc(field.name)}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''} class="${baseInput}"></div>`;
  }).join('\n')}
        <div class="md:col-span-2">
          <button type="submit" class="w-full py-4 rounded-xl text-base font-bold text-white shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
            ${esc(data.formTitle ? 'Submit Request' : 'Book Consultation')}
          </button>
          <p class="text-xs text-gray-400 text-center mt-3">${esc(data.responsePromise || 'We respond within 2 business hours')}</p>
        </div>
      </form>
    </div>
  </div>
</section>`;
}

export function contactFormValueChallenger(data: ContactFormData): string {
  return `
<section id="contact" class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-12">
      <div>
        <h2 class="text-3xl font-extrabold text-gray-900 mb-3" style="font-family:var(--font-heading)">${esc(data.formTitle || 'Get your free quote')}</h2>
        <p class="text-gray-600 mb-6">${esc(data.formSubtitle || 'No obligation, no hidden fees. Just an honest price.')}</p>
        <div class="space-y-4">
          ${['No call-out fee', 'Free detailed quote', 'Upfront pricing — no surprises', 'Reply within 2 hours'].map(p => `
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
            <span class="text-gray-700 font-medium">${p}</span>
          </div>`).join('')}
        </div>
        <div class="mt-8">
          <a href="tel:${tel(data.phone)}" class="inline-flex items-center gap-2 font-bold text-lg hover:underline" style="color:var(--c-primary)">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            ${esc(data.phone)}
          </a>
        </div>
      </div>
      <div class="bg-gray-50 rounded-2xl p-8 border border-gray-200">
        <form name="contact" method="POST" action="#" class="space-y-5">
          ${formFields(data.fields)}
          <button type="submit" class="w-full py-4 rounded-xl font-bold text-white text-base shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
            Get My Free Quote →
          </button>
        </form>
      </div>
    </div>
  </div>
</section>`;
}

export function contactFormTrustBuilder(data: ContactFormData): string {
  return `
<section id="contact" class="py-16 bg-green-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-12">
      <div>
        <div class="inline-flex items-center gap-2 bg-white border border-green-200 rounded-xl px-4 py-2 mb-6">
          <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          <span class="text-sm font-semibold text-green-800">100% Satisfaction Guaranteed</span>
        </div>
        <h2 class="text-3xl font-extrabold text-gray-900 mb-4" style="font-family:var(--font-heading)">${esc(data.formTitle || 'Contact us — risk free')}</h2>
        <p class="text-gray-600 mb-8">${esc(data.formSubtitle || 'No pressure. No obligation. Just honest advice and service.')}</p>
        <div class="space-y-3 text-sm">
          <div class="flex items-center gap-3 font-medium text-gray-700">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            Your details are kept private and never shared
          </div>
          <div class="flex items-center gap-3 font-medium text-gray-700">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            ${esc(data.responsePromise || 'We reply within 2 hours')}
          </div>
          <a href="tel:${tel(data.phone)}" class="flex items-center gap-2 text-base font-bold mt-2" style="color:var(--c-primary)">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            ${esc(data.phone)}
          </a>
        </div>
      </div>
      <div class="bg-white rounded-2xl shadow-sm border border-green-100 p-8">
        <form name="contact" method="POST" action="#" class="space-y-5">
          ${formFields(data.fields)}
          <button type="submit" class="w-full py-4 rounded-xl font-bold text-white text-base shadow-md hover:opacity-90" style="background-color:var(--c-primary)">
            Send Secure Enquiry
          </button>
          <p class="text-xs text-gray-400 text-center">🔒 Your information is safe with us</p>
        </form>
      </div>
    </div>
  </div>
</section>`;
}

export const CONTACT_FORM_TEMPLATES = {
  proof_machine:    contactFormProofMachine,
  local_anchor:     contactFormLocalAnchor,
  authority_expert: contactFormAuthorityExpert,
  value_challenger: contactFormValueChallenger,
  trust_builder:    contactFormTrustBuilder,
} as const;

// ============================================================
// FOOTER
// ============================================================

export function footer(data: FooterData, _archetype: string): string {
  const year = data.copyrightYear || new Date().getFullYear();
  const areas = data.serviceAreas || [];
  const services = data.services || [];
  const navLinks = data.navLinks || [];
  const socials = data.socialLinks || [];

  return `
<footer class="bg-gray-900 text-gray-300">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
      <!-- Col 1: Brand -->
      <div>
        <div class="font-bold text-white text-lg mb-2">${esc(data.businessName)}</div>
        ${data.tagline ? `<p class="text-sm text-gray-400 mb-4">${esc(data.tagline)}</p>` : ''}
        <div class="space-y-2 text-sm">
          <a href="tel:${tel(data.phone)}" class="flex items-center gap-2 hover:text-white transition">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/></svg>
            ${esc(data.phone)}
          </a>
          ${data.email ? `
          <a href="mailto:${esc(data.email)}" class="flex items-center gap-2 hover:text-white transition">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            ${esc(data.email)}
          </a>` : ''}
          ${data.address ? `
          <div class="flex items-start gap-2 text-gray-400">
            <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
            <span>${esc(data.address)}</span>
          </div>` : ''}
        </div>
        ${socials.length ? `
        <div class="flex gap-3 mt-4">
          ${socials.map(s => `<a href="${esc(s.url)}" class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition" aria-label="${esc(s.platform)}">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </a>`).join('')}
        </div>` : ''}
      </div>
      <!-- Col 2: Navigation -->
      ${navLinks.length ? `
      <div>
        <h3 class="font-semibold text-white text-sm uppercase tracking-wider mb-4">Quick Links</h3>
        <ul class="space-y-2 text-sm">
          ${navLinks.map(l => `<li><a href="${esc(l.url)}" class="hover:text-white transition">${esc(l.label)}</a></li>`).join('')}
        </ul>
      </div>` : ''}
      <!-- Col 3: Services -->
      ${services.length ? `
      <div>
        <h3 class="font-semibold text-white text-sm uppercase tracking-wider mb-4">Services</h3>
        <ul class="space-y-2 text-sm">
          ${services.slice(0, 8).map(s => `<li><a href="#services" class="hover:text-white transition">${esc(s)}</a></li>`).join('')}
        </ul>
      </div>` : ''}
      <!-- Col 4: Service Areas -->
      ${areas.length ? `
      <div>
        <h3 class="font-semibold text-white text-sm uppercase tracking-wider mb-4">Service Areas</h3>
        <ul class="space-y-2 text-sm">
          ${areas.slice(0, 10).map(a => `<li class="text-gray-400">${esc(a)}</li>`).join('')}
        </ul>
      </div>` : ''}
    </div>
  </div>
  <!-- Bottom bar -->
  <div class="border-t border-gray-800">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-gray-500">
      <div>© ${year} ${esc(data.businessName)}. All rights reserved.</div>
      <div class="flex gap-5">
        ${data.licenseNumber ? `<span>Lic. No. ${esc(data.licenseNumber)}</span>` : ''}
        ${data.abn ? `<span>ABN ${esc(data.abn)}</span>` : ''}
        <a href="/privacy" class="hover:text-gray-300">Privacy</a>
        <a href="/terms" class="hover:text-gray-300">Terms</a>
      </div>
    </div>
  </div>
</footer>`;
}

export const FOOTER_TEMPLATES = {
  proof_machine:    (d: FooterData) => footer(d, 'proof_machine'),
  local_anchor:     (d: FooterData) => footer(d, 'local_anchor'),
  authority_expert: (d: FooterData) => footer(d, 'authority_expert'),
  value_challenger: (d: FooterData) => footer(d, 'value_challenger'),
  trust_builder:    (d: FooterData) => footer(d, 'trust_builder'),
} as const;

// ============================================================
// FAQ ACCORDION
// ============================================================

export function faqAccordion(data: FAQData): string {
  const schemaItems = data.faqs.map((faq, i) => `{
    "@type": "Question",
    "name": ${JSON.stringify(faq.question)},
    "acceptedAnswer": {"@type": "Answer","text": ${JSON.stringify(faq.answer)}}
  }`).join(',\n');

  return `
<section class="py-16 bg-gray-50">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
    ${data.headline ? `
    <div class="text-center mb-10">
      <h2 class="text-3xl font-extrabold text-gray-900 mb-2" style="font-family:var(--font-heading)">${esc(data.headline)}</h2>
      ${data.subheadline ? `<p class="text-gray-500">${esc(data.subheadline)}</p>` : ''}
    </div>` : ''}
    <div class="space-y-3">
      ${data.faqs.map((faq, i) => `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          data-accordion-trigger="faq-answer-${i}"
          aria-expanded="false"
          class="w-full flex items-center justify-between px-6 py-5 text-left font-semibold text-gray-900 hover:bg-gray-50 transition focus:outline-none">
          <span>${esc(faq.question)}</span>
          <svg data-accordion-icon class="w-5 h-5 flex-shrink-0 text-gray-500 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <div id="faq-answer-${i}" style="max-height:0;opacity:0;overflow:hidden;transition:max-height 0.3s ease,opacity 0.3s ease">
          <div class="px-6 pb-5 text-gray-600 text-sm leading-relaxed">${esc(faq.answer)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
</section>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [${schemaItems}]
}
</script>
${ACCORDION_JS}`;
}

export const FAQ_TEMPLATES = {
  proof_machine:    faqAccordion,
  local_anchor:     faqAccordion,
  authority_expert: faqAccordion,
  value_challenger: faqAccordion,
  trust_builder:    faqAccordion,
} as const;
