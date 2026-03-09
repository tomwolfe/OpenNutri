/**
 * Internationalization (i18n) Configuration
 *
 * Task 2.6: Multi-language support (EN, ES, FR, DE, PT)
 * Using next-intl for server and client components
 */

import {getRequestConfig} from 'next-intl/server';
 
// Can be imported from a shared config
export const locales = ['en', 'es', 'fr', 'de', 'pt'] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
};

export default getRequestConfig(async ({locale}) => ({
  // Can be imported from a shared config
  messages: (await import(`./messages/${locale}.json`)).default
}));
