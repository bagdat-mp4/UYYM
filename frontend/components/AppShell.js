'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Sun, Moon } from 'lucide-react';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import Logo from './Logo';

export default function AppShell({ children, profile }) {
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const navItems = [
    { href: '/feed', label: t('header.feed') },
    { href: '/professors', label: t('header.professors') },
    { href: '/messages', label: t('header.messages'), icon: MessageCircle },
    { href: '/profile', label: t('header.profile') },
  ];

  if (profile?.is_admin) {
    navItems.push({ href: '/admin', label: t('header.admin') });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/feed" className="app-brand-link" aria-label="UYYM">
          <Logo size={32} wordSize={20} />
        </Link>
        <nav className="app-nav">
          {navItems.map((item) => {
            const NavIcon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname === item.href ? 'active' : ''}`}
              >
                {NavIcon && (
                  <NavIcon size={18} strokeWidth={1.75} aria-hidden="true" />
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="app-header-right">
          <div className="lang">
            <button type="button" className={lang === 'kk' ? 'on' : ''} onClick={() => setLang('kk')}>ҚАЗ</button>
            <button type="button" className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУС</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>ENG</button>
          </div>
          <button type="button" className="theme-btn" onClick={toggleTheme} title={t('common.theme')} aria-label={t('common.themeToggle')}>
            {dark ? <Moon size={20} strokeWidth={1.75} color="currentColor" /> : <Sun size={20} strokeWidth={1.75} color="currentColor" />}
          </button>
          {profile && (
            <span className="user-name-badge">{profile.first_name} {profile.last_name}</span>
          )}
          <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
            {t('header.signout')}
          </button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
