interface Service {
  title: string;
  description?: string;
  icon?: string;
}

interface ServicesGridProps {
  heading?: string;
  services?: Service[];
  [key: string]: any;
}

export function ServicesGrid({ heading, services = [] }: ServicesGridProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
      {heading && <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{heading}</h2>}
      <div className="grid grid-cols-2 gap-4">
        {services.length > 0 ? services.map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="font-semibold text-gray-900 dark:text-white">{s.title}</div>
            {s.description && <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.description}</div>}
          </div>
        )) : (
          <div className="col-span-2 text-gray-500 text-sm italic">Services will appear here</div>
        )}
      </div>
    </div>
  );
}
