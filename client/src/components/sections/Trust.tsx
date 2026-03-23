interface TrustProps {
  heading?: string;
  items?: string[];
  badges?: string[];
  yearsInBusiness?: number;
  [key: string]: any;
}

export function Trust({ heading, items = [], badges = [], yearsInBusiness }: TrustProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      {heading && <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{heading}</h2>}
      {yearsInBusiness && (
        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">{yearsInBusiness}+ Years</div>
      )}
      {items.length > 0 && (
        <ul className="space-y-2 mb-4">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((b, i) => (
            <span key={i} className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-1 rounded">
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
