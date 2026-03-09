'use client';

import {useLocale} from 'next-intl';
import {useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Globe} from 'lucide-react';
import {locales, localeNames} from '@/i18n';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;
    startTransition(() => {
      router.replace(`/${nextLocale}`);
    });
  }

  return (
    <div className="relative">
      <Globe className="w-4 h-4 text-gray-500" />
      <select
        value={locale}
        onChange={onSelectChange}
        disabled={isPending}
        className="appearance-none bg-transparent border border-gray-300 rounded-md py-1 pl-8 pr-6 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 cursor-pointer hover:border-gray-400 transition-colors"
        aria-label="Select language"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {localeNames[loc]}
          </option>
        ))}
      </select>
    </div>
  );
}
