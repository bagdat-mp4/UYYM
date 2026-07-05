'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | ok | dup | err

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
          placeholder="student@kbtu.kz"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-label="Email"
        />
        <button className="btn btn-red" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Жіберілуде…' : 'Жазылу'}
        </button>
      </form>
      {status === 'ok' && (
        <div className="wait-msg ok">Дайын! Лаунч кезінде бірінші болып хабарлаймыз 🎉</div>
      )}
      {status === 'dup' && (
        <div className="wait-msg ok">Сен тізімде бұрыннан барсың — жақында хабарласамыз!</div>
      )}
      {status === 'err' && (
        <div className="wait-msg err">Қате шықты. Почтаны тексеріп, қайта көріп көр.</div>
      )}
    </>
  );
}
