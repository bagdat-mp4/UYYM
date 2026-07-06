'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation } from './i18n';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('kk');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Load language from localStorage on mount
    const saved = localStorage.getItem('uyym-lang');
    if (saved && ['kk', 'ru', 'en'].includes(saved)) {
      setLangState(saved);
    }
    setMounted(true);
  }, []);

  const setLang = (newLang) => {
    if (['kk', 'ru', 'en'].includes(newLang)) {
      setLangState(newLang);
      localStorage.setItem('uyym-lang', newLang);
    }
  };

  const t = (key) => {
    return getTranslation(lang, key);
  };

  // Don't render children until we've loaded the saved language
  // to avoid flash of wrong language
  if (!mounted) {
    return null;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLang must be used within a LanguageProvider');
  }
  return context;
}
