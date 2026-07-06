'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import './feed.css';

export default function FeedPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    setUser(user);

    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
    }

    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="feed-loading">
        <p>Жүктелуде...</p>
      </div>
    );
  }

  return (
    <div className="feed-shell">
      <header className="feed-header">
        <Logo size={32} wordSize={20} />
        <div className="header-right">
          {profile && (
            <div className="user-info">
              <span className="user-name">
                {profile.first_name} {profile.last_name}
              </span>
            </div>
          )}
          <button className="btn btn-ghost" onClick={handleSignOut}>
            Шығу
          </button>
        </div>
      </header>

      <main className="feed-main">
        <div className="feed-stub">
          <h1>🚧</h1>
          <h2>Лента жасалуда</h2>
          <p>
            Біз қазір қолданбаның негізгі мүмкіндіктерін жасап жатырмыз.
            Жақын арада лента, посттар және басқа функциялар қосылады!
          </p>
          {profile && !profile.is_verified && (
            <div className="verification-notice">
              <p>
                <strong>Верификация күтілуде</strong>
              </p>
              <p style={{ fontSize: 14, marginTop: 8 }}>
                Сіздің өтінім қаралуда. Әдетте 24 сағат ішінде расталады.
                Растауды алғаннан кейін барлық мүмкіндіктер ашылады.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
