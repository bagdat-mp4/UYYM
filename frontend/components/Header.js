'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';
import { useLang } from '@/lib/LanguageProvider';
import Logo from './Logo';

export default function Header() {
  const [dark, setDark] = useState(false);
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    const saved = localStorage.getItem('uyym-theme');
    if (saved === 'dark') {
      setDark(true);
      document.body.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.body.classList.toggle('dark', next);
    localStorage.setItem('uyym-theme', next ? 'dark' : 'light');
  };

  return (
    <header className="land-head">
      <Logo />
      <nav className="land-nav">
        <a href="#feat">{t('header.features')}</a>
        <a href="#how">{t('header.howItWorks')}</a>
        <a href="#unis">{t('header.universities')}</a>
        <a href="#wait">{t('header.contact')}</a>
      </nav>
      <div className="head-actions">
        <div className="lang">
          <button type="button" className={lang === 'kk' ? 'on' : ''} onClick={() => setLang('kk')}>ҚАЗ</button>
          <button type="button" className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУС</button>
          <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>ENG</button>
        </div>
        <button type="button" className="theme-btn" onClick={toggleTheme} title={t('common.theme')} aria-label={t('common.themeToggle')}>
          {dark ? (
            <Moon size={20} strokeWidth={1.75} color="currentColor" />
          ) : (
            <Sun size={20} strokeWidth={1.75} color="currentColor" />
          )}
        </button>
        <Link className="btn btn-ghost" href="/login">{t('header.login')}</Link>
        <Link className="btn btn-red" href="/register">{t('header.signup')}</Link>
      </div>
    </header>
  );
}
