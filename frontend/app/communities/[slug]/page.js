'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Crown,
  Globe2,
  Loader2,
  LockKeyhole,
  Send,
  ShieldCheck,
  Trash2,
  UserMinus,
  UsersRound,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/useProfile';
import {
  COMMUNITY_POST_MAX,
  COMMUNITY_SELECT,
  MEMBER_SELECT,
  POST_SELECT,
  formatCommunityDate,
  getInitials,
  getProfileName,
  getUniversityName,
  isCommunityManager,
  normalizeCommunity,
  normalizeMember,
  normalizePost,
} from '../communityUtils';
import '../communities.css';

function typeLabel(t, type) {
  return t(`communities.type${type[0].toUpperCase()}${type.slice(1)}`);
}

function roleLabel(t, role) {
  return t(`communities.role${role[0].toUpperCase()}${role.slice(1)}`);
}

function CommunityAvatar({ profile }) {
  return (
    <span className="community-avatar" aria-hidden="true">
      {getInitials(profile)}
    </span>
  );
}

export default function CommunityDetailPage() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const { user, profile, loading } = useProfile();
  const { lang, t } = useLang();
  const [community, setCommunity] = useState(null);
  const [membership, setMembership] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersVisible, setMembersVisible] = useState(false);
  const [posts, setPosts] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageErrorKey, setPageErrorKey] = useState('');
  const [postsErrorKey, setPostsErrorKey] = useState('');
  const [membersErrorKey, setMembersErrorKey] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionErrorKey, setActionErrorKey] = useState('');
  const [noticeKey, setNoticeKey] = useState('');
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const [postErrorKey, setPostErrorKey] = useState('');
  const [confirmDeletePostId, setConfirmDeletePostId] = useState(null);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [memberActionKey, setMemberActionKey] = useState('');

  const loadCommunity = useCallback(async ({ showLoading = true } = {}) => {
    if (!slug || !user?.id || !profile) return;

    if (showLoading) setPageLoading(true);
    setPageErrorKey('');
    setPostsErrorKey('');
    setMembersErrorKey('');

    const { data: communityData, error: communityError } = await supabase
      .from('communities')
      .select(COMMUNITY_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (communityError || !communityData) {
      if (communityError) console.error('Community detail load error:', communityError);
      setCommunity(null);
      setMembership(null);
      setMembers([]);
      setPosts([]);
      setPageErrorKey('communityUnavailableText');
      setPageLoading(false);
      return;
    }

    const nextCommunity = normalizeCommunity(communityData);
    const { data: membershipData, error: membershipError } = await supabase
      .from('community_members')
      .select('community_id, user_id, role, joined_at')
      .eq('community_id', nextCommunity.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('Current community membership load error:', membershipError);
      setCommunity(null);
      setPageErrorKey('membershipLoadError');
      setPageLoading(false);
      return;
    }

    const canReadMembers = Boolean(membershipData || profile.is_admin);
    const [postsResult, membersResult] = await Promise.all([
      supabase
        .from('community_posts')
        .select(POST_SELECT)
        .eq('community_id', nextCommunity.id)
        .order('created_at', { ascending: false }),
      canReadMembers
        ? supabase
          .from('community_members')
          .select(MEMBER_SELECT)
          .eq('community_id', nextCommunity.id)
          .order('joined_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (postsResult.error) {
      console.error('Community posts load error:', postsResult.error);
      setPostsErrorKey('postsLoadError');
    }

    if (membersResult.error) {
      console.error('Community members load error:', membersResult.error);
      setMembersErrorKey('membersLoadError');
    }

    setCommunity(nextCommunity);
    setMembership(membershipData || null);
    setPosts(postsResult.error ? [] : (postsResult.data || []).map(normalizePost));
    setMembers(membersResult.error ? [] : (membersResult.data || []).map(normalizeMember));
    setMembersVisible(canReadMembers && !membersResult.error);
    setPageLoading(false);
  }, [profile, slug, user?.id]);

  useEffect(() => {
    if (!loading && user && profile && slug) {
      loadCommunity();
    }
  }, [loading, user, profile, slug, loadCommunity]);

  const owner = useMemo(
    () => members.find((member) => member.role === 'owner') || null,
    [members],
  );
  const isManager = isCommunityManager(membership?.role, profile?.is_admin);
  const isOwner = membership?.role === 'owner';
  const isMember = Boolean(membership);
  const remainingPostCharacters = COMMUNITY_POST_MAX - postText.length;

  const refreshAfterAction = async () => {
    await loadCommunity({ showLoading: false });
  };

  const handleJoin = async () => {
    if (!community?.is_public || !profile?.is_verified || !user?.id || isMember) return;

    setActionLoading(true);
    setActionErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('community_members')
      .insert({
        community_id: community.id,
        user_id: user.id,
        role: 'member',
      });

    if (error) {
      console.error('Community detail join error:', error);
      setActionErrorKey(error.code === '42501' ? 'joinPermissionError' : 'joinError');
    } else {
      setNoticeKey('joinSuccess');
      await refreshAfterAction();
    }

    setActionLoading(false);
  };

  const handleLeave = async () => {
    if (!community || !membership || membership.role === 'owner' || !user?.id) return;

    setActionLoading(true);
    setActionErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Community detail leave error:', error);
      setActionErrorKey(error.code === '42501' ? 'leavePermissionError' : 'leaveError');
    } else {
      setNoticeKey('leaveSuccess');
      setPostText('');
      await refreshAfterAction();
    }

    setActionLoading(false);
  };

  const handleCreatePost = async (event) => {
    event.preventDefault();
    setPostErrorKey('');
    setNoticeKey('');

    const content = postText.trim();
    if (!content) {
      setPostErrorKey('emptyPostError');
      return;
    }
    if (!community || !isMember || !profile?.is_verified || !user?.id) {
      setPostErrorKey('postPermissionError');
      return;
    }

    setPosting(true);
    const { error } = await supabase
      .from('community_posts')
      .insert({
        community_id: community.id,
        author_id: user.id,
        content,
      });

    if (error) {
      console.error('Community post creation error:', error);
      setPostErrorKey(error.code === '42501' ? 'postPermissionError' : 'postCreateError');
    } else {
      setPostText('');
      setNoticeKey('postCreateSuccess');
      await refreshAfterAction();
    }

    setPosting(false);
  };

  const handleDeletePost = async (post) => {
    if (!community) return;

    setDeletingPostId(post.id);
    setActionErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('community_posts')
      .delete()
      .eq('id', post.id)
      .eq('community_id', community.id);

    if (error) {
      console.error('Community post deletion error:', error);
      setActionErrorKey(error.code === '42501' ? 'postDeletePermissionError' : 'postDeleteError');
    } else {
      setNoticeKey('postDeleteSuccess');
      setConfirmDeletePostId(null);
      await refreshAfterAction();
    }

    setDeletingPostId(null);
  };

  const handleRoleChange = async (member, nextRole) => {
    if (!community || !isOwner || member.role === 'owner' || member.user_id === user?.id) return;

    const key = `${member.user_id}:role`;
    setMemberActionKey(key);
    setActionErrorKey('');
    setNoticeKey('');

    const { data, error } = await supabase
      .from('community_members')
      .update({ role: nextRole })
      .eq('community_id', community.id)
      .eq('user_id', member.user_id)
      .select('role')
      .maybeSingle();

    if (error || !data) {
      console.error('Community member role update error:', error);
      setActionErrorKey(error?.code === '42501' ? 'memberPermissionError' : 'memberRoleError');
    } else {
      setNoticeKey(nextRole === 'admin' ? 'memberPromotedSuccess' : 'memberDemotedSuccess');
      await refreshAfterAction();
    }

    setMemberActionKey('');
  };

  const handleRemoveMember = async (member) => {
    if (!community || !isManager || member.role === 'owner' || member.user_id === user?.id) return;

    const key = `${member.user_id}:remove`;
    setMemberActionKey(key);
    setActionErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', member.user_id);

    if (error) {
      console.error('Community member removal error:', error);
      setActionErrorKey(error.code === '42501' ? 'memberPermissionError' : 'memberRemoveError');
    } else {
      setNoticeKey('memberRemovedSuccess');
      await refreshAfterAction();
    }

    setMemberActionKey('');
  };

  if (loading) {
    return (
      <div className="communities-full-loading">
        <Loader2 size={21} strokeWidth={1.75} className="spin" aria-hidden="true" />
        {t('communities.loading')}
      </div>
    );
  }

  if (!profile) return null;

  return (
    <AppShell profile={profile}>
      <div className="community-detail-page">
        <Link href="/communities" className="community-back-link">
          <ArrowLeft size={17} strokeWidth={1.75} aria-hidden="true" />
          {t('communities.backToCommunities')}
        </Link>

        {pageLoading && (
          <div className="communities-state community-detail-state">
            <Loader2 size={22} strokeWidth={1.75} className="spin" aria-hidden="true" />
            {t('communities.loadingCommunity')}
          </div>
        )}

        {!pageLoading && pageErrorKey && (
          <div className="communities-state error community-detail-state">
            <LockKeyhole size={26} strokeWidth={1.75} aria-hidden="true" />
            <h1>{t('communities.communityUnavailableTitle')}</h1>
            <p>{t(`communities.${pageErrorKey}`)}</p>
            <Link href="/communities" className="btn btn-secondary">
              {t('communities.backToCommunities')}
            </Link>
          </div>
        )}

        {!pageLoading && community && (
          <>
            <header className="community-detail-hero">
              <div className="community-detail-mark" aria-hidden="true">
                {community.type === 'university' || community.type === 'major' ? (
                  <Building2 size={30} strokeWidth={1.75} />
                ) : (
                  <UsersRound size={30} strokeWidth={1.75} />
                )}
              </div>

              <div className="community-detail-title">
                <div className="community-badge-row">
                  <span className="badge badge-neutral">{typeLabel(t, community.type)}</span>
                  <span className="badge badge-neutral">
                    {community.is_public ? (
                      <Globe2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <LockKeyhole size={14} strokeWidth={1.75} aria-hidden="true" />
                    )}
                    {community.is_public
                      ? t('communities.publicCommunity')
                      : t('communities.privateCommunity')}
                  </span>
                  {membership && (
                    <span className={`badge community-role-badge ${membership.role}`}>
                      {roleLabel(t, membership.role)}
                    </span>
                  )}
                </div>
                <h1>{community.name}</h1>
                {community.description && <p>{community.description}</p>}

                <div className="community-detail-meta">
                  {community.university && (
                    <span>
                      <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
                      {community.university.short_name || community.university.name}
                    </span>
                  )}
                  <span>
                    <UsersRound size={16} strokeWidth={1.75} aria-hidden="true" />
                    {membersVisible
                      ? t('communities.memberCount').replace('{count}', String(members.length))
                      : t('communities.memberCountRestricted')}
                  </span>
                  {owner?.profile && (
                    <span>
                      <Crown size={16} strokeWidth={1.75} aria-hidden="true" />
                      {t('communities.ownerLabel')}: {getProfileName(
                        owner.profile,
                        t('communities.studentFallback'),
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="community-detail-actions">
                {!isMember && community.is_public && profile.is_verified && (
                  <button type="button" className="btn btn-red" onClick={handleJoin} disabled={actionLoading}>
                    {actionLoading && (
                      <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                    )}
                    {t('communities.join')}
                  </button>
                )}
                {!isMember && community.is_public && !profile.is_verified && (
                  <Link href="/register" className="btn btn-red">
                    {t('communities.verifyToJoin')}
                  </Link>
                )}
                {isOwner && (
                  <span className="community-owner-lock">
                    <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                    {t('communities.ownerCannotLeave')}
                  </span>
                )}
                {isMember && !isOwner && (
                  <button type="button" className="btn btn-quiet" onClick={handleLeave} disabled={actionLoading}>
                    {actionLoading && (
                      <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                    )}
                    {t('communities.leave')}
                  </button>
                )}
              </div>
            </header>

            {noticeKey && (
              <div className="alert alert-success communities-feedback">
                <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" />
                {t(`communities.${noticeKey}`)}
              </div>
            )}
            {actionErrorKey && (
              <div className="alert alert-danger communities-feedback">
                <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                {t(`communities.${actionErrorKey}`)}
              </div>
            )}

            <div className="community-detail-layout">
              <main className="community-posts-column">
                {isMember && profile.is_verified ? (
                  <section className="community-composer" aria-labelledby="community-composer-title">
                    <div className="community-section-head">
                      <div>
                        <h2 id="community-composer-title">{t('communities.writePost')}</h2>
                        <p>{t('communities.writePostSubtitle')}</p>
                      </div>
                      <Send size={21} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <form onSubmit={handleCreatePost}>
                      <label className="sr-only" htmlFor="community-post-content">
                        {t('communities.postLabel')}
                      </label>
                      <textarea
                        id="community-post-content"
                        value={postText}
                        onChange={(event) => {
                          setPostText(event.target.value);
                          if (postErrorKey) setPostErrorKey('');
                        }}
                        placeholder={t('communities.postPlaceholder')}
                        maxLength={COMMUNITY_POST_MAX}
                        rows={4}
                        disabled={posting}
                      />
                      <div className="community-composer-footer">
                        <span>
                          {remainingPostCharacters} {t('communities.charactersRemaining')}
                        </span>
                        <button type="submit" className="btn btn-red" disabled={posting}>
                          {posting ? (
                            <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
                          ) : (
                            <Send size={18} strokeWidth={1.75} aria-hidden="true" />
                          )}
                          {posting ? t('communities.publishing') : t('communities.publish')}
                        </button>
                      </div>
                      {postErrorKey && (
                        <div className="community-form-error">
                          <AlertCircle size={17} strokeWidth={1.75} aria-hidden="true" />
                          {t(`communities.${postErrorKey}`)}
                        </div>
                      )}
                    </form>
                  </section>
                ) : (
                  <section className="community-post-gate">
                    <ShieldCheck size={22} strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <h2>{t('communities.membersPostTitle')}</h2>
                      <p>
                        {isMember
                          ? t('communities.verifyToPostText')
                          : t('communities.joinToPostText')}
                      </p>
                    </div>
                  </section>
                )}

                <section className="community-posts-section" aria-labelledby="community-posts-title">
                  <div className="community-section-head">
                    <div>
                      <h2 id="community-posts-title">{t('communities.postsTitle')}</h2>
                      <p>{t('communities.postsSubtitle')}</p>
                    </div>
                  </div>

                  {postsErrorKey && (
                    <div className="community-inline-state error">
                      <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                      {t(`communities.${postsErrorKey}`)}
                    </div>
                  )}

                  {!postsErrorKey && posts.length === 0 && (
                    <div className="community-inline-state empty">
                      <UsersRound size={24} strokeWidth={1.75} aria-hidden="true" />
                      <h3>{t('communities.noPostsTitle')}</h3>
                      <p>{t('communities.noPostsText')}</p>
                    </div>
                  )}

                  {!postsErrorKey && posts.length > 0 && (
                    <div className="community-post-list">
                      {posts.map((post) => {
                        const canDelete = (post.author_id === user.id && isMember) || isManager;
                        const authorName = getProfileName(
                          post.author,
                          t('communities.studentFallback'),
                        );

                        return (
                          <article className="community-post-card" key={post.id}>
                            <header>
                              <CommunityAvatar profile={post.author} />
                              <div>
                                <strong>{authorName}</strong>
                                <span>
                                  {getUniversityName(
                                    post.author,
                                    t('communities.universityFallback'),
                                  )}
                                  {post.created_at
                                    ? ` · ${formatCommunityDate(post.created_at, lang)}`
                                    : ''}
                                </span>
                              </div>
                            </header>
                            <p className="community-post-content">{post.content}</p>

                            {canDelete && (
                              <footer>
                                {confirmDeletePostId === post.id ? (
                                  <div className="community-delete-confirm">
                                    <span>{t('communities.confirmDeletePost')}</span>
                                    <div>
                                      <button
                                        type="button"
                                        className="btn btn-quiet"
                                        onClick={() => setConfirmDeletePostId(null)}
                                        disabled={deletingPostId === post.id}
                                      >
                                        {t('communities.cancel')}
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={() => handleDeletePost(post)}
                                        disabled={deletingPostId === post.id}
                                      >
                                        {deletingPostId === post.id && (
                                          <Loader2 size={16} strokeWidth={1.75} className="spin" aria-hidden="true" />
                                        )}
                                        {t('communities.deletePost')}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-quiet community-delete-button"
                                    onClick={() => setConfirmDeletePostId(post.id)}
                                  >
                                    <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                                    {t('communities.deletePost')}
                                  </button>
                                )}
                              </footer>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </main>

              <aside className="community-members-panel" aria-labelledby="community-members-title">
                <div className="community-section-head">
                  <div>
                    <h2 id="community-members-title">{t('communities.membersTitle')}</h2>
                    <p>{t('communities.membersSubtitle')}</p>
                  </div>
                  <UsersRound size={21} strokeWidth={1.75} aria-hidden="true" />
                </div>

                {membersErrorKey && (
                  <div className="community-inline-state error compact">
                    <AlertCircle size={19} strokeWidth={1.75} aria-hidden="true" />
                    {t(`communities.${membersErrorKey}`)}
                  </div>
                )}

                {!membersVisible && !membersErrorKey && (
                  <div className="community-member-locked">
                    <LockKeyhole size={22} strokeWidth={1.75} aria-hidden="true" />
                    <p>{t('communities.membersRestrictedText')}</p>
                  </div>
                )}

                {membersVisible && !membersErrorKey && (
                  <div className="community-member-list">
                    {members.map((member) => {
                      const memberName = getProfileName(
                        member.profile,
                        t('communities.studentFallback'),
                      );
                      const roleActionLoading = memberActionKey === `${member.user_id}:role`;
                      const removeActionLoading = memberActionKey === `${member.user_id}:remove`;
                      const canChangeRole = isOwner
                        && member.role !== 'owner'
                        && member.user_id !== user.id;
                      const canRemove = isManager
                        && member.role !== 'owner'
                        && member.user_id !== user.id;

                      return (
                        <article className="community-member-row" key={member.user_id}>
                          <CommunityAvatar profile={member.profile} />
                          <div className="community-member-copy">
                            <strong>{memberName}</strong>
                            <span>
                              {getUniversityName(
                                member.profile,
                                t('communities.universityFallback'),
                              )}
                              {member.profile?.major ? ` · ${member.profile.major}` : ''}
                            </span>
                            <span className={`community-member-role ${member.role}`}>
                              {member.role === 'owner' && (
                                <Crown size={13} strokeWidth={1.75} aria-hidden="true" />
                              )}
                              {roleLabel(t, member.role)}
                            </span>
                          </div>

                          {(canChangeRole || canRemove) && (
                            <div className="community-member-actions">
                              {canChangeRole && (
                                <button
                                  type="button"
                                  className="btn btn-quiet"
                                  onClick={() => handleRoleChange(
                                    member,
                                    member.role === 'admin' ? 'member' : 'admin',
                                  )}
                                  disabled={roleActionLoading || removeActionLoading}
                                >
                                  {roleActionLoading && (
                                    <Loader2 size={15} strokeWidth={1.75} className="spin" aria-hidden="true" />
                                  )}
                                  {member.role === 'admin'
                                    ? t('communities.demoteMember')
                                    : t('communities.promoteMember')}
                                </button>
                              )}
                              {canRemove && (
                                <button
                                  type="button"
                                  className="btn btn-quiet community-remove-member"
                                  onClick={() => handleRemoveMember(member)}
                                  disabled={roleActionLoading || removeActionLoading}
                                  aria-label={t('communities.removeMemberLabel').replace('{name}', memberName)}
                                  title={t('communities.removeMember')}
                                >
                                  {removeActionLoading ? (
                                    <Loader2 size={16} strokeWidth={1.75} className="spin" aria-hidden="true" />
                                  ) : (
                                    <UserMinus size={16} strokeWidth={1.75} aria-hidden="true" />
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
