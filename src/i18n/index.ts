import en from './en.json';
import zu from './zu.json';
import af from './af.json';

export type Language = 'en' | 'zu' | 'af';

export const translations: Record<Language, Record<string, string>> = {
  en,
  zu,
  af,
};

export const languageNames: Record<Language, string> = {
  en: 'English',
  zu: 'isiZulu',
  af: 'Afrikaans',
};

export const defaultLanguage: Language = 'en';

export function t(key: string, language: Language = defaultLanguage): string {
  return translations[language][key] || translations[defaultLanguage][key] || key;
}

export function getTranslation(language: Language): Record<string, string> {
  return translations[language];
}

export function getSupportedLanguages(): Language[] {
  return Object.keys(translations) as Language[];
}