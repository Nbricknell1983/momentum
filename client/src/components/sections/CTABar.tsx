interface CTABarProps {
  heading?: string;
  cta?: string;
  ctaHref?: string;
  phone?: string;
  [key: string]: any;
}

export function CTABar({ heading, cta, ctaHref, phone }: CTABarProps) {
  return (
    <div className="bg-orange-500 text-white rounded-lg p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div>
        {heading && <div className="font-bold text-lg">{heading}</div>}
        {phone && <div className="text-orange-100 text-sm">{phone}</div>}
      </div>
      {cta && (
        <a
          href={ctaHref || '#contact'}
          className="bg-white text-orange-600 font-semibold px-5 py-2 rounded-lg hover:bg-orange-50 transition-colors text-sm whitespace-nowrap"
        >
          {cta}
        </a>
      )}
    </div>
  );
}
