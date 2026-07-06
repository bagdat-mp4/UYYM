'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';
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
            <Moon size={20} strokeWidth={2} color="#9BA0B0" />
          ) : (
            <Sun size={20} strokeWidth={2} color="#69728A" />
          )}
        </button>
        <Link className="btn btn-ghost" href="/login">Кіру</Link>
        <Link className="btn btn-red" href="/register">Тіркелу</Link>
      </div>
    </header>
  );
}
