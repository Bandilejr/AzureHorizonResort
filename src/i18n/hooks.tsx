import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, t, getSupportedLanguages, defaultLanguage } from './index';
import { useAuth } from '@/context/AuthContext';

const LANG_STORAGE_KEY = '@azure_horizon_lang';

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

  useEffect(() => {
    const loadStoredLanguage = async () => {
      try {
        // Priority 1: User profile language preference if available
        const profileLang = profile?.preferences?.language as Language;
        if (profileLang && getSupportedLanguages().includes(profileLang)) {
          setLanguageState(profileLang);
          await AsyncStorage.setItem(LANG_STORAGE_KEY, profileLang);
        } else {
          // Priority 2: Stored AsyncStorage language
          const savedLang = await AsyncStorage.getItem(LANG_STORAGE_KEY);
          if (savedLang && getSupportedLanguages().includes(savedLang as Language)) {
            setLanguageState(savedLang as Language);
          }
        }
      } catch (err) {
        console.warn('I18n load error:', err);
      } finally {
        setInitialized(true);
      }
    };

    loadStoredLanguage();
  }, [profile]);

  const setLanguage = async (lang: Language) => {
    if (!getSupportedLanguages().includes(lang)) return;
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (err) {
      console.warn('I18n save error:', err);
    }
  };

  const translate = (key: string) => t(key, language);

  const value: I18nContextType = {
    language,
    setLanguage,
    t: translate,
    supportedLanguages: getSupportedLanguages(),
    initialized,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};