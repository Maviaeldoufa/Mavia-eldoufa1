import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AcademicYear } from '../types';

export type AppLanguage = 'ar' | 'en';

interface LanguageContextValue {
  lang: AppLanguage;
  isEn: boolean;
  setLang: (lang: AppLanguage) => void;
  toggleLang: () => void;
  tr: (ar: string, en: string) => string;
  formatYear: (year: AcademicYear | number) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

const LANG_STORAGE_KEY = 'mvia_language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'en' ? 'en' : 'ar';
  });

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
  }, [lang]);

  const setLang = (next: AppLanguage) => {
    setLangState(next);
  };

  const toggleLang = () => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const tr = (ar: string, en: string) => (lang === 'en' ? en : ar);

  const formatYear = (year: AcademicYear | number) => {
    if (lang === 'en') {
      switch (year) {
        case 1:
          return 'Year 1';
        case 2:
          return 'Year 2';
        case 3:
          return 'Year 3';
        case 4:
          return 'Year 4';
        default:
          return 'All Years';
      }
    }
    switch (year) {
      case 1:
        return 'الفرقة الأولى';
      case 2:
        return 'الفرقة الثانية';
      case 3:
        return 'الفرقة الثالثة';
      case 4:
        return 'الفرقة الرابعة';
      default:
        return 'جميع الدفعات';
    }
  };

  return (
    <LanguageContext.Provider
      value={{
        lang,
        isEn: lang === 'en',
        setLang,
        toggleLang,
        tr,
        formatYear,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
