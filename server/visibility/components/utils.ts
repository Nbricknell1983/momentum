// =============================================================================
// COMPONENT TEMPLATE UTILITIES
// Shared helpers used across all template files
// =============================================================================

/** HTML-escape a value to prevent injection in templates */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip all non-digit chars so phone numbers are valid in tel: hrefs */
export function tel(phone: string): string {
  return phone.replace(/[^+\d]/g, '');
}

/** Render filled star characters (★) for a rating 1–5 */
export function renderStars(rating: number): string {
  const full = Math.round(Math.max(0, Math.min(5, rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/** Render star SVGs (yellow, 16×16) for a rating 1–5 */
export function starSVGs(rating: number, size = 16): string {
  const full = Math.round(Math.max(0, Math.min(5, rating)));
  const starFull = `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="#FBBF24" xmlns="http://www.w3.org/2000/svg"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
  const starEmpty = `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="#D1D5DB" xmlns="http://www.w3.org/2000/svg"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
  return starFull.repeat(full) + starEmpty.repeat(5 - full);
}

/** Format a date string as DD/MM/YYYY (Australian) */
export function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return iso;
  }
}

/** Truncate a string to maxLen characters, appending ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Generate CSS custom property block from brand tokens */
export function brandCSSVars(brand: {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
  fontHeading: string;
  fontBody: string;
}): string {
  return `
  --c-primary: ${brand.primary};
  --c-secondary: ${brand.secondary};
  --c-accent: ${brand.accent};
  --c-text: ${brand.text};
  --c-background: ${brand.background};
  --font-heading: '${brand.fontHeading}', system-ui, sans-serif;
  --font-body: '${brand.fontBody}', system-ui, sans-serif;`.trim();
}

/** Build a <style>:root{...}</style> block from brand tokens */
export function buildBrandStyleBlock(brand: {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
  fontHeading: string;
  fontBody: string;
}): string {
  return `<style>:root{${brandCSSVars(brand)}}body{font-family:var(--font-body);color:var(--c-text);background-color:var(--c-background)}</style>`;
}

/** Google Fonts <link> tag for heading + body font pair */
export function googleFontsLink(headingFont: string, bodyFont: string): string {
  const families = Array.from(new Set([headingFont, bodyFont]))
    .map(f => f.replace(/ /g, '+') + ':wght@400;500;600;700;800;900')
    .join('&family=');
  return `<link href="https://fonts.googleapis.com/css2?family=${families}&display=swap" rel="stylesheet">`;
}

/** Simple accordion JS — used by FAQ component */
export const ACCORDION_JS = `
<script>
(function(){
  document.querySelectorAll('[data-accordion-trigger]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var content=document.getElementById(btn.getAttribute('data-accordion-trigger'));
      var icon=btn.querySelector('[data-accordion-icon]');
      var isOpen=content.style.maxHeight&&content.style.maxHeight!=='0px';
      document.querySelectorAll('[data-accordion-trigger]').forEach(function(b){
        var c=document.getElementById(b.getAttribute('data-accordion-trigger'));
        var i=b.querySelector('[data-accordion-icon]');
        if(c){c.style.maxHeight='0px';c.style.opacity='0';}
        if(i){i.style.transform='rotate(0deg)';}
        b.setAttribute('aria-expanded','false');
      });
      if(!isOpen){
        content.style.maxHeight=content.scrollHeight+'px';
        content.style.opacity='1';
        if(icon)icon.style.transform='rotate(180deg)';
        btn.setAttribute('aria-expanded','true');
      }
    });
  });
})();
</script>`;
