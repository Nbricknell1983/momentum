interface AreasProps {
  heading?: string;
  areas?: string[];
  [key: string]: any;
}

export function Areas({ heading, areas = [] }: AreasProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
      {heading && <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{heading}</h2>}
      <div className="flex flex-wrap gap-2">
        {areas.length > 0 ? areas.map((area, i) => (
          <span key={i} className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600">
            {area}
          </span>
        )) : (
          <span className="text-gray-500 text-sm italic">Service areas will appear here</span>
        )}
      </div>
    </div>
  );
}
