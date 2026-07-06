'use client';

import Link from 'next/link';
import { useProfile } from '@/lib/useProfile';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { useState, useEffect } from 'react';

export default function FeedPage() {
  const { profile, loading } = useProfile();
  const { t } = useLang();
  const [verificationRequest, setVerificationRequest] = useState(null);

  useEffect(() => {
    if (profile) {
      fetchVerificationStatus();
    }
  }, [profile]);

  const fetchVerificationStatus = async () => {
    if (!profile) return;

    const { data } = await supabase
      .from('verification_requests')
      .select('*')
      .eq('user_id', profile.id)
      .single();

    setVerificationRequest(data);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {t('feed.loading')}
      </div>
    );
  }

  return (
    <AppShell profile={profile}>
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: 48 }}>🚧</h1>
        <h2 style={{ fontSize: 28, marginTop: 20 }}>{t('feed.title')}</h2>
        <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 16 }}>
          {t('feed.subtitle')}
        </p>

        {profile && !profile.is_verified && (
          <div style={{
            background: 'var(--red-tint)',
            border: '1px solid var(--red-soft)',
            borderRadius: '14px',
            padding: '20px 24px',
            marginTop: 32,
            maxWidth: 500,
            marginLeft: 'auto',
            marginRight: 'auto',
            textAlign: 'left',
          }}>
            {!verificationRequest ? (
              <>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>
                  {t('feed.notVerified')}
                </p>
                <Link href="/register" className="btn btn-red">
                  {t('feed.continueVerification')}
                </Link>
              </>
            ) : (
              <>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>
                  {t('feed.verificationPending')}
                </p>
                <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                  {t('feed.verificationNotice')}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
