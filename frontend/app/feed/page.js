'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import { useLang } from '@/lib/LanguageProvider';
import './feed.css';

export default function FeedPage() {
  const router = useRouter();
  const { t } = useLang();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [verificationRequest, setVerificationRequest] = useState(null);
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

    // Fetch verification request status
    const { data: verificationData } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('user_id', user.id)
      .single();

    setVerificationRequest(verificationData);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="feed-loading">
        <p>{t('feed.loading')}</p>
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
            {t('header.signout')}
          </button>
        </div>
      </header>

      <main className="feed-main">
        <div className="feed-stub">
          <h1>🚧</h1>
          <h2>{t('feed.title')}</h2>
          <p>{t('feed.subtitle')}</p>
          {profile && !profile.is_verified && (
            <div className="verification-notice">
              {!verificationRequest ? (
                <>
                  <p>
                    <strong>{t('feed.notVerified')}</strong>
                  </p>
                  <Link href="/register" className="btn btn-red" style={{ marginTop: 16, display: 'inline-flex' }}>
                    {t('feed.continueVerification')}
                  </Link>
                </>
              ) : (
                <>
                  <p>
                    <strong>{t('feed.verificationPending')}</strong>
                  </p>
                  <p style={{ fontSize: 14, marginTop: 8 }}>
                    {t('feed.verificationNotice')}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
