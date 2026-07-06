'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';
import Logo from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import { useLang } from '@/lib/LanguageProvider';
import './login.css';

export default function LoginPage() {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.body.classList.toggle('dark', next);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError(t('login.errorInvalidCreds'));
        } else if (authError.message.includes('Email not confirmed')) {
          setError(t('login.errorEmailNotConfirmed'));
        } else {
          setError(t('login.errorGeneric'));
        }
        setLoading(false);
        return;
      }

      router.push('/feed');
    } catch (err) {
      setError(t('login.errorNetwork'));
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-side">
        <svg className="constel" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="140" y1="120" x2="330" y2="70" />
            <line x1="330" y1="70" x2="410" y2="240" />
            <line x1="140" y1="120" x2="250" y2="330" />
            <line x1="250" y1="330" x2="410" y2="240" />
            <line x1="1120" y1="90" x2="1300" y2="170" />
            <line x1="1300" y1="170" x2="1210" y2="360" />
            <line x1="1120" y1="90" x2="1210" y2="360" />
            <line x1="980" y1="420" x2="1210" y2="360" />
            <line x1="620" y1="480" x2="820" y2="520" />
          </g>
          <g fill="#fff">
            <circle cx="140" cy="120" r="9" />
            <circle cx="330" cy="70" r="7" />
            <circle cx="410" cy="240" r="8" />
            <circle cx="250" cy="330" r="7" />
            <circle cx="1120" cy="90" r="8" />
            <circle cx="1300" cy="170" r="7" />
            <circle cx="1210" cy="360" r="9" />
            <circle cx="980" cy="420" r="7" />
            <circle cx="620" cy="480" r="7" />
            <circle cx="820" cy="520" r="8" />
          </g>
        </svg>
        <div style={{ position: 'relative' }}>
          <Logo size={40} wordSize={24} white />
        </div>
        <h2>{t('login.sideTitle')}</h2>
        <p className="q">
          {t('login.sideQuote')}
          <br />
          <b>{t('login.sideAuthor')}</b>
        </p>
      </div>

      <div className="auth-form">
        <div className="auth-box">
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <div className="lang">
              <span className={lang === 'kk' ? 'on' : ''} onClick={() => setLang('kk')}>ҚАЗ</span>
              <span className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУС</span>
              <span className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>ENG</span>
            </div>
            <button className="theme-btn" onClick={toggleTheme} title={t('common.theme')} aria-label={t('common.themeToggle')}>
              {dark ? <Moon size={20} strokeWidth={2} color="#9BA0B0" /> : <Sun size={20} strokeWidth={2} color="#69728A" />}
            </button>
          </div>

          <h1>{t('login.title')}</h1>
          <p className="sub">{t('login.subtitle')}</p>

          <form onSubmit={handleLogin}>
            {error && (
              <div className="error-msg" style={{
                background: 'var(--red-tint)',
                color: 'var(--red)',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                marginBottom: '16px',
                border: '1px solid var(--red-soft)'
              }}>
                {error}
              </div>
            )}

            <div className="field">
              <label>{t('login.email')}</label>
              <input
                type="email"
                placeholder="student@kbtu.kz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="field">
              <label>{t('login.password')}</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <p className="forgot">
              <a className="link" href="#">{t('login.forgotPassword')}</a>
            </p>

            <button type="submit" className="btn btn-red" style={{ width: '100%' }} disabled={loading}>
              {loading ? t('login.loading') : t('login.loginBtn')}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 14, marginTop: 22 }}>
            {t('login.noAccount')} <Link className="link" href="/register">{t('login.signupLink')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
