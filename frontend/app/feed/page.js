'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  GraduationCap,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useProfile } from '@/lib/useProfile';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import './feed.css';

const MAX_POST_LENGTH = 1000;

function localeFor(lang) {
  if (lang === 'ru') return 'ru-RU';
  if (lang === 'en') return 'en-US';
  return 'kk-KZ';
}

function formatPostDate(value, lang) {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function normalizeRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getAuthorName(author, fallback) {
  const firstName = author?.first_name?.trim() || '';
  const lastName = author?.last_name?.trim() || '';
  return `${firstName} ${lastName}`.trim() || fallback;
}

function getInitials(author) {
  const first = author?.first_name?.trim()?.[0] || '';
  const last = author?.last_name?.trim()?.[0] || '';
  return `${first}${last}`.toUpperCase() || 'U';
}

export default function FeedPage() {
  const { profile, loading } = useProfile();
  const { lang, t } = useLang();
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [feedErrorKey, setFeedErrorKey] = useState('');
  const [postText, setPostText] = useState('');
  const [composerErrorKey, setComposerErrorKey] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const remaining = useMemo(() => MAX_POST_LENGTH - postText.length, [postText]);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setFeedErrorKey('');

    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        author_id,
        content,
        created_at,
        author:profiles!posts_author_id_fkey(
          id,
          first_name,
          last_name,
          university:universities(short_name)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      setFeedErrorKey('loadError');
      setPosts([]);
    } else {
      setPosts(data || []);
    }

    setPostsLoading(false);
  }, []);

  useEffect(() => {
    if (!loading && profile) {
      loadPosts();
    }
  }, [loading, profile, loadPosts]);

  const handleCreatePost = async (event) => {
    event.preventDefault();
    setComposerErrorKey('');

    if (!profile?.is_verified) {
      return;
    }

    const cleanText = postText.trim();
    if (!cleanText) {
      setComposerErrorKey('emptyPostError');
      return;
    }

    setSubmitting(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setComposerErrorKey('sessionError');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from('posts')
      .insert({
        author_id: user.id,
        content: cleanText,
      });

    if (error) {
      setComposerErrorKey('createError');
      setSubmitting(false);
      return;
    }

    setPostText('');
    setComposerErrorKey('');
    await loadPosts();
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="feed-loading">
        <Loader2 size={22} strokeWidth={1.75} className="spin" aria-hidden="true" />
        <span>{t('feed.loading')}</span>
      </div>
    );
  }

  return (
    <AppShell profile={profile}>
      <div className="feed-page">
        <div className="feed-topline">
          <div>
            <span className="chip feed-chip">
              <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
              {profile?.university?.short_name || t('feed.universityFallback')}
            </span>
            <h1>{t('feed.title')}</h1>
            <p>{t('feed.subtitle')}</p>
          </div>
          <button className="btn btn-ghost feed-refresh" onClick={loadPosts} disabled={postsLoading}>
            <RefreshCw size={18} strokeWidth={1.75} className={postsLoading ? 'spin' : ''} aria-hidden="true" />
            {t('feed.refresh')}
          </button>
        </div>

        <section className="feed-composer-card" aria-label={t('feed.composerLabel')}>
          {profile?.is_verified ? (
            <form onSubmit={handleCreatePost}>
              <div className="composer-heading">
                <div className="feed-avatar">
                  {getInitials(profile)}
                </div>
                <div>
                  <h2>{t('feed.composerLabel')}</h2>
                  <p>{profile?.university?.short_name || t('feed.universityFallback')}</p>
                </div>
              </div>

              <textarea
                value={postText}
                onChange={(event) => {
                  setPostText(event.target.value);
                  if (composerErrorKey) setComposerErrorKey('');
                }}
                placeholder={t('feed.composerPlaceholder')}
                maxLength={MAX_POST_LENGTH}
                rows={4}
                disabled={submitting}
              />

              <div className="composer-footer">
                <span className="composer-count">
                  {remaining} {t('feed.charactersRemaining')}
                </span>
                <button className="btn btn-red" type="submit" disabled={submitting}>
                  {submitting ? (
                    <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
                  ) : (
                    <Send size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  {submitting ? t('feed.publishing') : t('feed.publish')}
                </button>
              </div>

              {composerErrorKey && (
                <div className="feed-inline-error">
                  <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
                  {t(`feed.${composerErrorKey}`)}
                </div>
              )}
            </form>
          ) : (
            <div className="feed-verification-card">
              <div className="feed-verification-icon">
                <ShieldCheck size={24} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h2>{t('feed.verifiedOnlyTitle')}</h2>
                <p>{t('feed.verifiedOnlyText')}</p>
              </div>
              <Link href="/register" className="btn btn-red">
                {t('feed.continueVerification')}
              </Link>
            </div>
          )}
        </section>

        <section className="feed-list" aria-live="polite">
          {postsLoading && (
            <div className="feed-state-card">
              <Loader2 size={22} strokeWidth={1.75} className="spin" aria-hidden="true" />
              <span>{t('feed.loading')}</span>
            </div>
          )}

          {!postsLoading && feedErrorKey && (
            <div className="feed-state-card error">
              <AlertCircle size={22} strokeWidth={1.75} aria-hidden="true" />
              <span>{t(`feed.${feedErrorKey}`)}</span>
            </div>
          )}

          {!postsLoading && !feedErrorKey && posts.length === 0 && (
            <div className="feed-empty">
              <UserRound size={28} strokeWidth={1.75} aria-hidden="true" />
              <h2>{t('feed.emptyTitle')}</h2>
              <p>{t('feed.emptyText')}</p>
            </div>
          )}

          {!postsLoading && !feedErrorKey && posts.map((post) => {
            const author = normalizeRelation(post.author);
            const university = normalizeRelation(author?.university);
            const authorName = getAuthorName(author, t('feed.authorFallback'));

            return (
              <article className="feed-post-card" key={post.id}>
                <header className="post-header">
                  <div className="feed-avatar">
                    {getInitials(author)}
                  </div>
                  <div className="post-author">
                    <strong>{authorName}</strong>
                    <span>
                      {university?.short_name || t('feed.universityFallback')}
                      {post.created_at ? ` - ${formatPostDate(post.created_at, lang)}` : ''}
                    </span>
                  </div>
                </header>

                <p className="post-content">{post.content}</p>
              </article>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
