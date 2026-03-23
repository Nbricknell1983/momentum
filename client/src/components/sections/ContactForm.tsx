interface ContactFormProps {
  heading?: string;
  subheading?: string;
  fields?: string[];
  cta?: string;
  [key: string]: any;
}

export function ContactForm({ heading, subheading, cta }: ContactFormProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      {heading && <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">{heading}</h2>}
      {subheading && <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{subheading}</p>}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
          <div className="h-9 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
          <div className="h-9 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
          <div className="h-20 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600" />
        </div>
        <div className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded w-full text-center cursor-default">
          {cta || 'Send Message'}
        </div>
      </div>
    </div>
  );
}
