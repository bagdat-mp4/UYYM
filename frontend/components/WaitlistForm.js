'use client';

import { useState } from 'react';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | ok | dup | err
  const { t } = useLang();

  const submit = async (e) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setStatus('err');
      return;
    }
    setStatus('loading');

    const { error } = await supabase.from('waitlist').insert({ email: clean });

    if (!error) {
      setStatus('ok');
      setEmail('');
    } else if (error.code === '23505') {
      // unique violation — email уже в списке
      setStatus('dup');
    } else {
      console.error('Waitlist error:', error);
      setStatus('err');
    }
  };

  return (
    <>
      <form onSubmit={submit}>
        <input
          type="email"
          placeholder={t('waitlist.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-label="Email"
        />
        <button className="btn btn-red" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? t('waitlist.loading') : t('waitlist.submitBtn')}
        </button>
      </form>
      {status === 'ok' && (
        <div className="wait-msg ok">{t('waitlist.success')}</div>
      )}
      {status === 'dup' && (
        <div className="wait-msg ok">{t('waitlist.duplicate')}</div>
      )}
      {status === 'err' && (
        <div className="wait-msg err">{t('waitlist.error')}</div>
      )}
    </>
  );
}
