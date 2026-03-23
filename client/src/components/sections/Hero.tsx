interface HeroProps {
  headline?: string;
  subheadline?: string;
  cta?: string;
  ctaHref?: string;
  backgroundImage?: string;
  [key: string]: any;
}

export function Hero({ headline, subheadline, cta, ctaHref }: HeroProps) {
  return (
    <div className="bg-blue-900 text-white rounded-lg p-8 min-h-[200px] flex flex-col justify-center">
      <h1 className="text-3xl font-bold mb-3">{headline || 'Your Headline Here'}</h1>
      {subheadline && <p className="text-blue-200 text-lg mb-5">{subheadline}</p>}
      {cta && (
        <a
          href={ctaHref || '#contact'}
          className="inline-block bg-orange-500 text-white font-semibold px-6 py-3 rounded-lg w-fit hover:bg-orange-600 transition-colors"
        >
          {cta}
        </a>
      )}
    </div>
  );
}
