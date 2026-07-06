'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  Loader2,
  MapPin,
  Pencil,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import '../feed/feed.css';
import './profile.css';

const PROFILE_SELECT = `
  id,
  first_name,
  last_name,
  university_id,
  major,
  course,
  is_verified,
  is_admin,
  university:universities(id, short_name, name, city, brand_color)
`;

const POSTS_SELECT = `
  id,
  author_id,
  content,
  created_at
`;

const NAME_MAX_LENGTH = 80;
const MAJOR_MAX_LENGTH = 120;

function normalizeRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formFromProfile(profile) {
  return {
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    major: profile?.major || '',
    course: profile?.course ? String(profile.course) : '1',
  };
}

function normalizeProfile(profile) {
  if (!profile) return null;
  return {
    ...profile,
    university: normalizeRelation(profile.university),
  };
}

function localeFor(lang) {
  if (lang === 'kk') return 'kk-KZ';
  if (lang === 'ru') return 'ru-RU';
  return 'en-US';
}

function formatPostDate(value, lang) {
  if (!value) return '';

  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getDisplayName(profile, fallback) {
  const firstName = profile?.first_name?.trim() || '';
  const lastName = profile?.last_name?.trim() || '';
  const name = `${firstName} ${lastName}`.trim();
  return name || fallback;
}

function getInitials(profile, fallback) {
  const first = profile?.first_name?.trim()?.[0] || '';
  const last = profile?.last_name?.trim()?.[0] || '';
  return `${first}${last}`.toUpperCase() || fallback[0]?.toUpperCase() || 'U';
}

function getUniversityName(profile, fallback) {
  const university = normalizeRelation(profile?.university);
  return university?.short_name || university?.name || fallback;
}

function getCourseLabel(t, course) {
  const courseNumber = Number(course);
  if (courseNumber >= 1 && courseNumber <= 5) {
    return t(`register.course${courseNumber}`);
  }
  return t('profile.notSet');
}

export default function ProfilePage() {
  const router = useRouter();
  const { lang, t } = useLang();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileErrorKey, setProfileErrorKey] = useState('');
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsErrorKey, setPostsErrorKey] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(formFromProfile(null));
  const [formErrorKey, setFormErrorKey] = useState('');
  const [noticeKey, setNoticeKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState('');

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileErrorKey('');

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      setProfileErrorKey('profile.sessionError');
      setProfileLoading(false);
      return;
    }

    if (!sessionData?.session) {
      router.push('/login');
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setProfileErrorKey('profile.sessionError');
      setProfileLoading(false);
      return;
    }

    if (!authData?.user) {
      router.push('/login');
      return;
    }

    setUser(authData.user);

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', authData.user.id)
      .maybeSingle();

    if (error) {
      setProfileErrorKey('profile.profileLoadError');
      setProfileLoading(false);
      return;
    }

    if (!data) {
      setProfileErrorKey('profile.missingProfileTitle');
      setProfileLoading(false);
      return;
    }

    const nextProfile = normalizeProfile(data);
    setProfile(nextProfile);
    setForm(formFromProfile(nextProfile));
    setProfileLoading(false);
  }, [router]);

  const loadPosts = useCallback(async (userId) => {
    if (!userId) return;

    setPostsLoading(true);
    setPostsErrorKey('');

    const { data, error } = await supabase
      .from('posts')
      .select(POSTS_SELECT)
      .eq('author_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      setPostsErrorKey('profile.postsLoadError');
      setPostsLoading(false);
      return;
    }

    setPosts(data || []);
    setPostsLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (user?.id) {
      loadPosts(user.id);
    }
  }, [loadPosts, user?.id]);

  const handleFieldChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setFormErrorKey('');
    setNoticeKey('');
  };

  const handleEditCancel = () => {
    setForm(formFromProfile(profile));
    setEditOpen(false);
    setFormErrorKey('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setFormErrorKey('');
    setNoticeKey('');

    const nextCourse = Number.parseInt(form.course, 10);
    const updates = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      major: form.major.trim(),
      course: nextCourse,
    };

    if (!updates.first_name || !updates.last_name || !updates.major) {
      setFormErrorKey('profile.requiredError');
      return;
    }

    if (!Number.isInteger(nextCourse) || nextCourse < 1 || nextCourse > 5) {
      setFormErrorKey('profile.courseError');
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select(PROFILE_SELECT)
      .single();

    setSaving(false);

    if (error) {
      setFormErrorKey('profile.editError');
      return;
    }

    const nextProfile = normalizeProfile(data);
    setProfile(nextProfile);
    setForm(formFromProfile(nextProfile));
    setEditOpen(false);
    setNoticeKey('profile.editSuccess');
  };

  const handleDelete = async (postId) => {
    if (!user?.id) return;

    setDeletingId(postId);
    setDeleteErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('author_id', user.id);

    setDeletingId(null);

    if (error) {
      setDeleteErrorKey('profile.deleteError');
      return;
    }

    setPosts((current) => current.filter((post) => post.id !== postId));
    setPendingDeleteId(null);
    setNoticeKey('profile.deleteSuccess');
  };

  if (profileLoading) {
    return (
      <div className="feed-loading">
        <Loader2 size={20} strokeWidth={1.75} className="spin" aria-hidden="true" />
        {t('profile.loading')}
      </div>
    );
  }

  if (profileErrorKey) {
    const isMissingProfile = profileErrorKey === 'profile.missingProfileTitle';

    return (
      <AppShell profile={profile}>
        <div className="profile-page">
          <div className="feed-state-card error profile-full-state">
            <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <strong>{t(profileErrorKey)}</strong>
              {isMissingProfile && <p>{t('profile.missingProfileText')}</p>}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const displayName = getDisplayName(profile, t('profile.studentFallback'));
  const initials = getInitials(profile, t('profile.studentFallback'));
  const university = normalizeRelation(profile?.university);
  const universityName = getUniversityName(profile, t('profile.universityFallback'));
  const universityLocation = university?.city;

  return (
    <AppShell profile={profile}>
      <div className="profile-page">
        <section className="profile-hero-card" aria-labelledby="profile-title">
          <div className="profile-cover" aria-hidden="true" />
          <div className="profile-header-body">
            <div className="feed-avatar profile-avatar-large">
              {initials}
            </div>

            <div className="profile-identity">
              <div className={`profile-status ${profile.is_verified ? 'verified' : 'pending'}`}>
                {profile.is_verified ? (
                  <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <ShieldAlert size={16} strokeWidth={1.75} aria-hidden="true" />
                )}
                {profile.is_verified ? t('profile.verified') : t('profile.notVerified')}
              </div>
              <h1 id="profile-title">{displayName}</h1>
              <div className="profile-meta">
                <span className="profile-meta-item">
                  <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
                  {profile.major || t('profile.notSet')}
                </span>
                <span className="profile-meta-item">
                  <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                  {universityName}
                </span>
                {universityLocation && (
                  <span className="profile-meta-item">
                    <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
                    {universityLocation}
                  </span>
                )}
              </div>
            </div>

            <div className="profile-actions">
              <button type="button" className="btn btn-red" onClick={() => setEditOpen(true)}>
                <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />
                {t('profile.editProfile')}
              </button>
            </div>
          </div>
        </section>

        {noticeKey && (
          <div className="alert alert-success profile-notice">
            <Check size={18} strokeWidth={1.75} aria-hidden="true" />
            {t(noticeKey)}
          </div>
        )}

        {editOpen && (
          <form className="profile-edit-card" onSubmit={handleSave}>
            <div className="profile-section-head compact">
              <div>
                <h2>{t('profile.editProfile')}</h2>
                <p>{t('profile.editSubtitle')}</p>
              </div>
              <button type="button" className="btn btn-icon" onClick={handleEditCancel} aria-label={t('profile.cancelEdit')}>
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <div className="profile-edit-grid">
              <div className="field">
                <label htmlFor="profile-first-name">{t('profile.firstName')}</label>
                <input
                  id="profile-first-name"
                  value={form.first_name}
                  onChange={(event) => handleFieldChange('first_name', event.target.value)}
                  maxLength={NAME_MAX_LENGTH}
                  required
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label htmlFor="profile-last-name">{t('profile.lastName')}</label>
                <input
                  id="profile-last-name"
                  value={form.last_name}
                  onChange={(event) => handleFieldChange('last_name', event.target.value)}
                  maxLength={NAME_MAX_LENGTH}
                  required
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label htmlFor="profile-course">{t('profile.course')}</label>
                <select
                  id="profile-course"
                  value={form.course}
                  onChange={(event) => handleFieldChange('course', event.target.value)}
                  disabled={saving}
                >
                  <option value="1">{t('register.course1')}</option>
                  <option value="2">{t('register.course2')}</option>
                  <option value="3">{t('register.course3')}</option>
                  <option value="4">{t('register.course4')}</option>
                  <option value="5">{t('register.course5')}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="profile-major">{t('profile.major')}</label>
                <input
                  id="profile-major"
                  value={form.major}
                  onChange={(event) => handleFieldChange('major', event.target.value)}
                  maxLength={MAJOR_MAX_LENGTH}
                  required
                  disabled={saving}
                />
              </div>
            </div>

            {formErrorKey && (
              <div className="feed-inline-error">
                <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                {t(formErrorKey)}
              </div>
            )}

            <div className="profile-edit-actions">
              <button type="button" className="btn btn-ghost" onClick={handleEditCancel} disabled={saving}>
                {t('profile.cancelEdit')}
              </button>
              <button type="submit" className="btn btn-red" disabled={saving}>
                {saving ? (
                  <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
                ) : (
                  <Save size={18} strokeWidth={1.75} aria-hidden="true" />
                )}
                {saving ? t('profile.saving') : t('profile.saveProfile')}
              </button>
            </div>
          </form>
        )}

        <div className="profile-layout">
          <aside className="profile-panel" aria-labelledby="profile-details-title">
            <div className="profile-section-head compact">
              <div>
                <h2 id="profile-details-title">{t('profile.detailsTitle')}</h2>
                <p>{t('profile.detailsSubtitle')}</p>
              </div>
            </div>

            <dl className="profile-facts">
              <div className="profile-fact">
                <dt>{t('profile.university')}</dt>
                <dd>{universityName}</dd>
              </div>
              <div className="profile-fact">
                <dt>{t('profile.major')}</dt>
                <dd>{profile.major || t('profile.notSet')}</dd>
              </div>
              <div className="profile-fact">
                <dt>{t('profile.course')}</dt>
                <dd>{getCourseLabel(t, profile.course)}</dd>
              </div>
              <div className="profile-fact">
                <dt>{t('profile.verification')}</dt>
                <dd>{profile.is_verified ? t('profile.verified') : t('profile.notVerified')}</dd>
              </div>
            </dl>

            <div className={`profile-verification-note ${profile.is_verified ? 'verified' : 'pending'}`}>
              {profile.is_verified ? (
                <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ShieldAlert size={20} strokeWidth={1.75} aria-hidden="true" />
              )}
              <div>
                <strong>{profile.is_verified ? t('profile.verified') : t('profile.notVerified')}</strong>
                <p>{profile.is_verified ? t('profile.verifiedText') : t('profile.notVerifiedText')}</p>
                {!profile.is_verified && (
                  <Link href="/register" className="btn btn-quiet profile-verify-link">
                    {t('feed.continueVerification')}
                  </Link>
                )}
              </div>
            </div>
          </aside>

          <section className="profile-posts-section" aria-labelledby="profile-posts-title">
            <div className="profile-section-head">
              <div>
                <h2 id="profile-posts-title">{t('profile.postsTitle')}</h2>
                <p>{t('profile.postsSubtitle')}</p>
              </div>
            </div>

            {deleteErrorKey && (
              <div className="feed-inline-error">
                <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                {t(deleteErrorKey)}
              </div>
            )}

            {postsLoading && (
              <div className="feed-state-card">
                <Loader2 size={20} strokeWidth={1.75} className="spin" aria-hidden="true" />
                {t('profile.postsLoading')}
              </div>
            )}

            {!postsLoading && postsErrorKey && (
              <div className="feed-state-card error">
                <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                {t(postsErrorKey)}
              </div>
            )}

            {!postsLoading && !postsErrorKey && posts.length === 0 && (
              <div className="feed-empty">
                <h2>{t('profile.noPostsTitle')}</h2>
                <p>{t('profile.noPostsText')}</p>
              </div>
            )}

            {!postsLoading && !postsErrorKey && posts.length > 0 && (
              <div className="feed-list">
                {posts.map((post) => (
                  <article className="feed-post-card profile-post-card" key={post.id}>
                    <header className="post-header">
                      <div className="feed-avatar">
                        {initials}
                      </div>
                      <div className="post-author">
                        <strong>{displayName}</strong>
                        <span>
                          {universityName}
                          {post.created_at ? ` · ${formatPostDate(post.created_at, lang)}` : ''}
                        </span>
                      </div>
                    </header>
                    <p className="post-content">{post.content}</p>

                    <div className="profile-post-footer">
                      {pendingDeleteId === post.id ? (
                        <div className="profile-delete-confirm">
                          <span>{t('profile.confirmDeleteText')}</span>
                          <div className="profile-delete-buttons">
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => handleDelete(post.id)}
                              disabled={deletingId === post.id}
                            >
                              {deletingId === post.id && (
                                <Loader2 size={16} strokeWidth={1.75} className="spin" aria-hidden="true" />
                              )}
                              {t('profile.confirmDelete')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              onClick={() => setPendingDeleteId(null)}
                              disabled={deletingId === post.id}
                            >
                              {t('profile.cancelDelete')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-quiet profile-delete-button"
                          onClick={() => {
                            setPendingDeleteId(post.id);
                            setDeleteErrorKey('');
                          }}
                          aria-label={t('profile.deletePost')}
                        >
                          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                          {t('profile.deletePost')}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
