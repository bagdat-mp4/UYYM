'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/useProfile';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';

function localeFor(lang) {
  if (lang === 'kk') return 'kk-KZ';
  if (lang === 'ru') return 'ru-RU';
  return 'en-US';
}

function formatAdminDate(value, lang) {
  if (!value) return '';

  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminPage() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const { lang, t } = useLang();
  const [activeTab, setActiveTab] = useState('verifications');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [pendingRatings, setPendingRatings] = useState([]);
  const [ratingsErrorKey, setRatingsErrorKey] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  useEffect(() => {
    if (!loading && profile && !profile.is_admin) {
      router.push('/feed');
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.is_admin) {
      if (activeTab === 'verifications') {
        fetchVerificationRequests();
      } else {
        fetchPendingRatings();
      }
    }
  }, [profile, activeTab, statusFilter]);

  const fetchVerificationRequests = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from('verification_requests')
      .select(`
        *,
        profile:profiles(first_name, last_name, university:universities(short_name))
      `)
      .eq('status', statusFilter)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setVerificationRequests(data);
    }
    setLoadingData(false);
  };

  const fetchPendingRatings = async () => {
    setLoadingData(true);
    setRatingsErrorKey('');
    const { data, error } = await supabase
      .from('professor_ratings')
      .select(`
        id,
        professor_id,
        user_id,
        clarity,
        fairness,
        usefulness,
        comment,
        is_approved,
        created_at,
        profile:profiles(first_name, last_name),
        professor:professors(
          id,
          full_name,
          department,
          university_id,
          university:universities(short_name, name)
        )
      `)
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Pending professor ratings query failed:', error);
      setPendingRatings([]);
      setRatingsErrorKey('admin.ratingsLoadError');
    } else {
      setPendingRatings(data || []);
    }
    setLoadingData(false);
  };

  const handleApprove = async (requestId) => {
    const { error } = await supabase
      .from('verification_requests')
      .update({ status: 'approved' })
      .eq('id', requestId);

    if (!error) {
      // Also update the profile
      const request = verificationRequests.find(r => r.id === requestId);
      if (request) {
        await supabase
          .from('profiles')
          .update({ is_verified: true })
          .eq('id', request.user_id);
      }
      fetchVerificationRequests();
    }
  };

  const handleReject = async (requestId) => {
    const { error } = await supabase
      .from('verification_requests')
      .update({
        status: 'rejected',
        admin_note: rejectNote || null
      })
      .eq('id', requestId);

    if (!error) {
      setRejectingId(null);
      setRejectNote('');
      fetchVerificationRequests();
    }
  };

  const handleApproveRating = async (ratingId) => {
    setRatingsErrorKey('');
    const { error } = await supabase
      .from('professor_ratings')
      .update({ is_approved: true })
      .eq('id', ratingId);

    if (error) {
      console.error('Professor rating approval failed:', error);
      setRatingsErrorKey('admin.ratingApproveError');
      return;
    }

    fetchPendingRatings();
  };

  const handleRejectRating = async (ratingId) => {
    setRatingsErrorKey('');
    const { error } = await supabase
      .from('professor_ratings')
      .delete()
      .eq('id', ratingId);

    if (error) {
      console.error('Professor rating rejection failed:', error);
      setRatingsErrorKey('admin.ratingRejectError');
      return;
    }

    fetchPendingRatings();
  };

  const getSignedUrl = async (documentUrl) => {
    if (!documentUrl) return null;

    // Normalize path: strip "verifications/" prefix or full URL
    let cleanPath = documentUrl;
    if (cleanPath.includes('verifications/')) {
      cleanPath = cleanPath.split('verifications/').pop();
    }
    if (cleanPath.startsWith('http')) {
      const url = new URL(cleanPath);
      cleanPath = url.pathname.split('/').slice(-1)[0];
    }

    const { data, error } = await supabase.storage
      .from('verifications')
      .createSignedUrl(cleanPath, 600);

    if (error) {
      return { error: error.message };
    }

    return { signedUrl: data?.signedUrl };
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {t('common.loading')}
      </div>
    );
  }

  if (!profile?.is_admin) {
    return null;
  }

  return (
    <AppShell profile={profile}>
      <div className="admin-container">
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 32 }}>
          {t('admin.title')}
        </h1>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'verifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('verifications')}
          >
            {t('admin.verifications')}
          </button>
          <button
            className={`admin-tab ${activeTab === 'ratings' ? 'active' : ''}`}
            onClick={() => setActiveTab('ratings')}
          >
            {t('admin.ratings')}
          </button>
        </div>

        {activeTab === 'verifications' && (
          <>
            <div className="status-filters">
              <button
                className={`filter-btn ${statusFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setStatusFilter('pending')}
              >
                {t('admin.pending')}
              </button>
              <button
                className={`filter-btn ${statusFilter === 'approved' ? 'active' : ''}`}
                onClick={() => setStatusFilter('approved')}
              >
                {t('admin.approved')}
              </button>
              <button
                className={`filter-btn ${statusFilter === 'rejected' ? 'active' : ''}`}
                onClick={() => setStatusFilter('rejected')}
              >
                {t('admin.rejected')}
              </button>
            </div>

            {loadingData ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {t('common.loading')}
              </div>
            ) : verificationRequests.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {t('admin.noRequests')}
              </div>
            ) : (
              <div className="verification-list">
                {verificationRequests.map((request) => (
                  <VerificationCard
                    key={request.id}
                    request={request}
                    statusFilter={statusFilter}
                    rejectingId={rejectingId}
                    setRejectingId={setRejectingId}
                    rejectNote={rejectNote}
                    setRejectNote={setRejectNote}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    getSignedUrl={getSignedUrl}
                    t={t}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'ratings' && (
          <>
            {loadingData ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {t('common.loading')}
              </div>
            ) : ratingsErrorKey ? (
              <div className="rating-card" style={{ color: 'var(--danger)', background: 'var(--danger-bg)', borderColor: 'var(--red-soft)' }}>
                {t(ratingsErrorKey)}
              </div>
            ) : pendingRatings.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {t('admin.noPendingRatings')}
              </div>
            ) : (
              <div className="ratings-list">
                {pendingRatings.map((rating) => (
                  <div key={rating.id} className="rating-card">
                    <div className="rating-header">
                      <div>
                        <strong>{t('admin.professor')}:</strong>{' '}
                        {rating.professor?.full_name || t('admin.unknownProfessor')}
                        {rating.professor?.university && (
                          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
                            {rating.professor.university.short_name || rating.professor.university.name}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                        <div>
                          <strong>{t('admin.student')}:</strong>{' '}
                          {`${rating.profile?.first_name || ''} ${rating.profile?.last_name || ''}`.trim() || t('admin.unknownStudent')}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <strong>{t('admin.submittedAt')}:</strong>{' '}
                          {formatAdminDate(rating.created_at, lang)}
                        </div>
                      </div>
                    </div>
                    <div className="rating-body">
                      <div className="rating-scores">
                        <span>{t('admin.clarity')}: {rating.clarity}/5</span>
                        <span>{t('admin.fairness')}: {rating.fairness}/5</span>
                        <span>{t('admin.usefulness')}: {rating.usefulness}/5</span>
                      </div>
                      {rating.comment && (
                        <div className="rating-comment">
                          <strong>{t('admin.comment')}:</strong> {rating.comment}
                        </div>
                      )}
                    </div>
                    <div className="rating-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => handleApproveRating(rating.id)}
                      >
                        {t('admin.approve')}
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleRejectRating(rating.id)}
                      >
                        {t('admin.reject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function VerificationCard({
  request,
  statusFilter,
  rejectingId,
  setRejectingId,
  rejectNote,
  setRejectNote,
  onApprove,
  onReject,
  getSignedUrl,
  t
}) {
  const [documentData, setDocumentData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (request.document_url) {
      getSignedUrl(request.document_url).then(result => {
        if (result?.error) {
          setError(result.error);
        } else if (result?.signedUrl) {
          // Detect file type from original document_url
          const ext = request.document_url.toLowerCase().split('.').pop();
          const isPdf = ext === 'pdf';
          setDocumentData({ url: result.signedUrl, isPdf });
        }
      });
    }
  }, [request.document_url]);

  return (
    <div className="verification-card">
      <div className="verification-header">
        <div>
          <strong>
            {request.profile?.first_name} {request.profile?.last_name}
          </strong>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            {request.profile?.university?.short_name}
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
          {new Date(request.created_at).toLocaleDateString()}
        </div>
      </div>

      {error && (
        <div className="verification-image">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {t('admin.studentId')}:
          </div>
          <div style={{ padding: 16, background: 'var(--red-tint)', color: 'var(--red)', borderRadius: 8, fontSize: 14 }}>
            Error: {error}
          </div>
        </div>
      )}

      {documentData && !error && (
        <div className="verification-image">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {t('admin.studentId')}:
          </div>
          {documentData.isPdf ? (
            <div>
              <iframe
                src={documentData.url}
                style={{
                  width: '100%',
                  height: '500px',
                  border: '1px solid var(--line)',
                  borderRadius: 8
                }}
                title="Student ID PDF"
              />
              <a
                href={documentData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
                style={{ marginTop: 12, display: 'inline-block' }}
              >
                PDF-ті ашу ↗
              </a>
            </div>
          ) : (
            <img
              src={documentData.url}
              alt="Student ID"
              style={{ maxWidth: '100%', borderRadius: 8 }}
            />
          )}
        </div>
      )}

      {request.admin_note && (
        <div style={{
          background: 'var(--red-tint)',
          padding: 12,
          borderRadius: 8,
          fontSize: 14,
          marginTop: 12
        }}>
          <strong>Note:</strong> {request.admin_note}
        </div>
      )}

      {statusFilter === 'pending' && (
        <div className="verification-actions">
          {rejectingId === request.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <input
                type="text"
                placeholder={t('admin.rejectNote')}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="input"
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn btn-red"
                  onClick={() => onReject(request.id)}
                >
                  {t('admin.reject')}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectNote('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="btn btn-primary"
                onClick={() => onApprove(request.id)}
              >
                {t('admin.approve')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setRejectingId(request.id)}
              >
                {t('admin.reject')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
