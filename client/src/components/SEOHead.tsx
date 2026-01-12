import { useEffect } from 'react';

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'profile';
  structuredData?: object;
}

export default function SEOHead({
  title,
  description,
  keywords,
  canonicalUrl = 'https://battlescore.com.au',
  ogImage = 'https://battlescore.com.au/og-image.jpg',
  ogType = 'website',
  structuredData,
}: SEOHeadProps) {
  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    setMeta('description', description);
    if (keywords) setMeta('keywords', keywords);
    
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', ogType, true);
    setMeta('og:url', canonicalUrl, true);
    setMeta('og:image', ogImage, true);
    setMeta('og:site_name', 'BattleScore', true);
    
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', ogImage);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    if (structuredData) {
      let script = document.querySelector('script[data-seo-schema]');
      if (!script) {
        script = document.createElement('script');
        script.setAttribute('type', 'application/ld+json');
        script.setAttribute('data-seo-schema', 'true');
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }

    return () => {
      const schema = document.querySelector('script[data-seo-schema]');
      if (schema) schema.remove();
    };
  }, [title, description, keywords, canonicalUrl, ogImage, ogType, structuredData]);

  return null;
}

export const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': 'https://battlescore.com.au/#business',
  name: 'BattleScore Business Consulting',
  description: 'Brisbane\'s leading business consulting firm helping SMEs achieve sustainable growth through strategic planning, sales coaching, and operational excellence.',
  url: 'https://battlescore.com.au',
  telephone: '+61-7-XXXX-XXXX',
  email: 'hello@battlescore.com.au',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Brisbane CBD',
    addressLocality: 'Brisbane',
    addressRegion: 'QLD',
    postalCode: '4000',
    addressCountry: 'AU',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: -27.4698,
    longitude: 153.0251,
  },
  areaServed: [
    { '@type': 'City', name: 'Brisbane' },
    { '@type': 'City', name: 'Gold Coast' },
    { '@type': 'City', name: 'Sunshine Coast' },
    { '@type': 'State', name: 'Queensland' },
  ],
  priceRange: '$$',
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',
    closes: '17:00',
  },
  sameAs: [
    'https://www.linkedin.com/company/battlescore',
    'https://www.facebook.com/battlescore',
  ],
};

export const serviceSchema = (name: string, description: string, url: string) => ({
  '@context': 'https://schema.org',
  '@type': 'Service',
  name,
  description,
  url,
  provider: {
    '@type': 'LocalBusiness',
    name: 'BattleScore Business Consulting',
  },
  areaServed: {
    '@type': 'City',
    name: 'Brisbane',
  },
});
