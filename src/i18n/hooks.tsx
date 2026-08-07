import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, t, getSupportedLanguages, defaultLanguage } from './index';
import { useAuth } from '@/context/AuthContext';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string) => string;
  supportedLanguages: Language[];
  initialized: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [language, setLanguageState] = useState<Language>(defaultLanguage);
  const [initialized, setInitialized] = useState(false);

  console.log('🟣 I18nProvider: Rendering, initialized=', initialized);

  useEffect(() => {
    console.log('🟣 I18nProvider: useEffect fired, profile=', profile?.uid);
    // Load saved language preference
    const savedLanguage = profile?.preferences?.language as Language;
    if (savedLanguage && getSupportedLanguages().includes(savedLanguage)) {
      setLanguageState(savedLanguage);
    }
    setInitialized(true);
    console.log('🟣 I18nProvider: Initialized set to true');
  }, [profile]);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
  };

  const translate = (key: string) => t(key, language);

  const value: I18nContextType = {
    language,
    setLanguage,
    t: translate,
    supportedLanguages: getSupportedLanguages(),
    initialized,
  };

  if (!initialized) {
    console.log('🟣 I18nProvider: Not initialized yet, returning Provider without children');
    return <I18nContext.Provider value={value} />;
  }

  console.log('🟣 I18nProvider: Rendering children');
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};