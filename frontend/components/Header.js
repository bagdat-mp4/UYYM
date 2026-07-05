'use client';

import { useEffect, useState } from 'react';
import Logo from './Logo';

export default function Header() {
  const [dark, setDark] = useState(false);

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
        <a href="#feat">Мүмкіндіктер</a>
        <a href="#how">Қалай жұмыс істейді</a>
        <a href="#unis">Университеттер</a>
        <a href="#wait">Байланыс</a>
      </nav>
      <div className="head-actions">
        <div className="lang">
          <span className="on">ҚАЗ</span>
          <span>РУС</span>
          <span>ENG</span>
        </div>
        <button className="theme-btn" onClick={toggleTheme} title="Тақырып" aria-label="Тақырыпты ауыстыру">
          {dark ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9BA0B0" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 7.5 7.5 0 1 0 20 13.5Z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#69728A" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
            </svg>
          )}
        </button>
        <a className="btn btn-ghost" href="#wait">Кіру</a>
        <a className="btn btn-red" href="#wait">Тіркелу</a>
      </div>
    </header>
  );
}
