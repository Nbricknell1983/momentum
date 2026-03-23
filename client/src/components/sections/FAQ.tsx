import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQProps {
  heading?: string;
  items?: FAQItem[];
  [key: string]: any;
}

export function FAQ({ heading, items = [] }: FAQProps) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      {heading && <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{heading}</h2>}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span>{item.question}</span>
                {open === i ? <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />}
              </button>
              {open === i && (
                <div className="px-4 pb-3 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-600 pt-3">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-500 text-sm italic">FAQ items will appear here</div>
      )}
    </div>
  );
}
