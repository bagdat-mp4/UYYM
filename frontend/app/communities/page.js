'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FilterX,
  Globe2,
  Loader2,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/useProfile';
import {
  COMMUNITY_DESCRIPTION_MAX,
  COMMUNITY_NAME_MAX,
  COMMUNITY_SELECT,
  COMMUNITY_SLUG_MAX,
  COMMUNITY_TYPES,
  isUniversityScoped,
  isValidCommunitySlug,
  normalizeCommunity,
} from './communityUtils';
import './communities.css';

function initialCreateForm() {
  return {
    name: '',
    slug: '',
    description: '',
    type: 'university',
    university_id: '',
    is_public: true,
  };
}

function typeLabel(t, type) {
  return t(`communities.type${type[0].toUpperCase()}${type.slice(1)}`);
}

function roleLabel(t, role) {
  return t(`communities.role${role[0].toUpperCase()}${role.slice(1)}`);
}

export default function CommunitiesPage() {
  const router = useRouter();
  const { user, profile, loading } = useProfile();
  const { t } = useLang();
  const [communities, setCommunities] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [membershipByCommunity, setMembershipByCommunity] = useState({});
  const [memberCountByCommunity, setMemberCountByCommunity] = useState({});
  const [countVisibleIds, setCountVisibleIds] = useState(new Set());
  const [dataLoading, setDataLoading] = useState(true);
  const [dataErrorKey, setDataErrorKey] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [universityFilter, setUniversityFilter] = useState('');
  const [actionCommunityId, setActionCommunityId] = useState(null);
  const [actionErrorKey, setActionErrorKey] = useState('');
  const [noticeKey, setNoticeKey] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createErrorKey, setCreateErrorKey] = useState('');
  const [creating, setCreating] = useState(false);

  const loadCommunities = useCallback(async () => {
    if (!user?.id || !profile) return;

    setDataLoading(true);
    setDataErrorKey('');

    const [communitiesResult, universitiesResult] = await Promise.all([
      supabase
        .from('communities')
        .select(COMMUNITY_SELECT)
        .order('created_at', { ascending: false }),
      supabase
        .from('universities')
        .select('id, name, short_name, city, is_active')
        .eq('is_active', true)
        .order('name'),
    ]);

    if (communitiesResult.error) {
      console.error('Community list load error:', communitiesResult.error);
      setCommunities([]);
      setDataErrorKey('loadError');
      setDataLoading(false);
      return;
    }

    const nextCommunities = (communitiesResult.data || []).map(normalizeCommunity);
    const communityIds = nextCommunities.map((community) => community.id);
    let myMemberships = [];
    let membershipLoadFailed = false;

    if (communityIds.length > 0) {
      const { data, error } = await supabase
        .from('community_members')
        .select('community_id, user_id, role')
        .eq('user_id', user.id)
        .in('community_id', communityIds);

      if (error) {
        console.error('Current community memberships load error:', error);
        membershipLoadFailed = true;
      } else {
        myMemberships = data || [];
      }
    }

    if (membershipLoadFailed) {
      setCommunities([]);
      setDataErrorKey('membershipLoadError');
      setDataLoading(false);
      return;
    }

    const nextMembershipByCommunity = Object.fromEntries(
      myMemberships.map((membership) => [membership.community_id, membership]),
    );
    const joinedIds = myMemberships.map((membership) => membership.community_id);
    const countableIds = profile.is_admin ? communityIds : joinedIds;
    const nextCounts = {};
    const nextVisibleIds = new Set();

    if (countableIds.length > 0) {
      const { data, error } = await supabase
        .from('community_members')
        .select('community_id, user_id')
        .in('community_id', countableIds);

      if (error) {
        console.error('Community member count load error:', error);
      } else {
        (data || []).forEach((membership) => {
          nextCounts[membership.community_id] = (nextCounts[membership.community_id] || 0) + 1;
        });
        countableIds.forEach((id) => nextVisibleIds.add(id));
      }
    }

    if (universitiesResult.error) {
      console.error('Community universities load error:', universitiesResult.error);
    }

    setCommunities(nextCommunities);
    setUniversities(universitiesResult.error ? [] : (universitiesResult.data || []));
    setMembershipByCommunity(nextMembershipByCommunity);
    setMemberCountByCommunity(nextCounts);
    setCountVisibleIds(nextVisibleIds);
    setDataLoading(false);
  }, [profile, user?.id]);

  useEffect(() => {
    if (!loading && user && profile) {
      loadCommunities();
    }
  }, [loading, user, profile, loadCommunities]);

  const filteredCommunities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    return communities.filter((community) => {
      const matchesSearch = !query || community.name.toLocaleLowerCase().includes(query);
      const matchesType = !typeFilter || community.type === typeFilter;
      const matchesUniversity = !universityFilter
        || String(community.university_id) === universityFilter;
      return matchesSearch && matchesType && matchesUniversity;
    });
  }, [communities, search, typeFilter, universityFilter]);

  const canCreate = Boolean(profile?.is_verified && profile?.is_admin);

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setUniversityFilter('');
  };

  const handleJoin = async (community) => {
    if (!profile?.is_verified || !community.is_public || !user?.id) return;

    setActionCommunityId(community.id);
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
      console.error('Community join error:', error);
      if (error.code === '23505') {
        setActionErrorKey('alreadyJoinedError');
      } else if (error.code === '42501') {
        setActionErrorKey('joinPermissionError');
      } else {
        setActionErrorKey('joinError');
      }
    } else {
      setNoticeKey('joinSuccess');
      await loadCommunities();
    }

    setActionCommunityId(null);
  };

  const handleLeave = async (community) => {
    const membership = membershipByCommunity[community.id];
    if (!membership || membership.role === 'owner' || !user?.id) return;

    setActionCommunityId(community.id);
    setActionErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Community leave error:', error);
      setActionErrorKey(error.code === '42501' ? 'leavePermissionError' : 'leaveError');
    } else {
      setNoticeKey('leaveSuccess');
      await loadCommunities();
    }

    setActionCommunityId(null);
  };

  const openCreate = () => {
    setCreateForm(initialCreateForm());
    setCreateErrorKey('');
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (creating) return;
    setCreateOpen(false);
    setCreateErrorKey('');
  };

  const updateCreateField = (field, value) => {
    setCreateForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'type' && !isUniversityScoped(value)) {
        next.university_id = '';
      }
      return next;
    });
    setCreateErrorKey('');
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateErrorKey('');

    if (!canCreate || !user?.id) {
      setCreateErrorKey('createPermissionError');
      return;
    }

    const name = createForm.name.trim();
    const slug = createForm.slug.trim().toLowerCase();
    const description = createForm.description.trim();

    if (name.length < 3) {
      setCreateErrorKey('nameError');
      return;
    }
    if (!isValidCommunitySlug(slug)) {
      setCreateErrorKey('slugError');
      return;
    }
    if (!COMMUNITY_TYPES.includes(createForm.type)) {
      setCreateErrorKey('typeError');
      return;
    }
    if (isUniversityScoped(createForm.type) && !createForm.university_id) {
      setCreateErrorKey('universityRequiredError');
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from('communities')
      .insert({
        name,
        slug,
        description: description || null,
        type: createForm.type,
        university_id: isUniversityScoped(createForm.type)
          ? Number(createForm.university_id)
          : null,
        created_by: user.id,
        is_public: createForm.is_public,
      })
      .select('id, slug')
      .single();

    if (error) {
      console.error('Community creation error:', error);
      if (error.code === '23505') {
        setCreateErrorKey('duplicateSlugError');
      } else if (error.code === '42501') {
        setCreateErrorKey('createPermissionError');
      } else {
        setCreateErrorKey('createError');
      }
      setCreating(false);
      return;
    }

    setCreating(false);
    setCreateOpen(false);
    router.push(`/communities/${data.slug}`);
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
      <div className="communities-page">
        <header className="communities-hero">
          <div>
            <span className="chip communities-chip">
              <UsersRound size={16} strokeWidth={1.75} aria-hidden="true" />
              {t('communities.badge')}
            </span>
            <h1>{t('communities.title')}</h1>
            <p>{t('communities.subtitle')}</p>
          </div>
          {canCreate && (
            <button type="button" className="btn btn-red" onClick={openCreate}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              {t('communities.createCommunity')}
            </button>
          )}
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

        <section className="communities-toolbar" aria-label={t('communities.filtersLabel')}>
          <label className="communities-search-field">
            <span>{t('communities.searchLabel')}</span>
            <div>
              <Search size={18} strokeWidth={1.75} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('communities.searchPlaceholder')}
              />
            </div>
          </label>

          <label>
            <span>{t('communities.typeFilter')}</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">{t('communities.allTypes')}</option>
              {COMMUNITY_TYPES.map((type) => (
                <option value={type} key={type}>{typeLabel(t, type)}</option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('communities.universityFilter')}</span>
            <select
              value={universityFilter}
              onChange={(event) => setUniversityFilter(event.target.value)}
            >
              <option value="">{t('communities.allUniversities')}</option>
              {universities.map((university) => (
                <option value={university.id} key={university.id}>
                  {university.short_name || university.name}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-quiet" onClick={clearFilters}>
            <FilterX size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('communities.clearFilters')}
          </button>
        </section>

        <div className="communities-results-line">
          {t('communities.resultsCount').replace('{count}', String(filteredCommunities.length))}
        </div>

        {dataLoading && (
          <div className="communities-state">
            <Loader2 size={22} strokeWidth={1.75} className="spin" aria-hidden="true" />
            {t('communities.loading')}
          </div>
        )}

        {!dataLoading && dataErrorKey && (
          <div className="communities-state error">
            <AlertCircle size={22} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <strong>{t('communities.loadErrorTitle')}</strong>
              <p>{t(`communities.${dataErrorKey}`)}</p>
            </div>
          </div>
        )}

        {!dataLoading && !dataErrorKey && filteredCommunities.length === 0 && (
          <div className="communities-state empty">
            <UsersRound size={28} strokeWidth={1.75} aria-hidden="true" />
            <h2>{t('communities.emptyTitle')}</h2>
            <p>{t('communities.emptyText')}</p>
          </div>
        )}

        {!dataLoading && !dataErrorKey && filteredCommunities.length > 0 && (
          <section className="communities-list" aria-live="polite">
            {filteredCommunities.map((community) => {
              const membership = membershipByCommunity[community.id];
              const isActionLoading = actionCommunityId === community.id;
              const canSeeCount = countVisibleIds.has(community.id);

              return (
                <article className="community-list-card" key={community.id}>
                  <div className="community-mark" aria-hidden="true">
                    {community.type === 'university' || community.type === 'major' ? (
                      <Building2 size={24} strokeWidth={1.75} />
                    ) : (
                      <UsersRound size={24} strokeWidth={1.75} />
                    )}
                  </div>

                  <div className="community-list-main">
                    <div className="community-card-title-row">
                      <div>
                        <Link href={`/communities/${community.slug}`}>
                          <h2>{community.name}</h2>
                        </Link>
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
                              {membership.role === 'owner' && (
                                <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                              )}
                              {roleLabel(t, membership.role)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {community.description && <p>{community.description}</p>}

                    <div className="community-list-meta">
                      {community.university && (
                        <span>
                          <Building2 size={15} strokeWidth={1.75} aria-hidden="true" />
                          {community.university.short_name || community.university.name}
                        </span>
                      )}
                      <span>
                        <UsersRound size={15} strokeWidth={1.75} aria-hidden="true" />
                        {canSeeCount
                          ? t('communities.memberCount').replace(
                            '{count}',
                            String(memberCountByCommunity[community.id] || 0),
                          )
                          : t('communities.memberCountRestricted')}
                      </span>
                    </div>
                  </div>

                  <div className="community-list-actions">
                    <Link href={`/communities/${community.slug}`} className="btn btn-secondary">
                      {t('communities.openCommunity')}
                    </Link>

                    {!membership && community.is_public && profile.is_verified && (
                      <button
                        type="button"
                        className="btn btn-red"
                        onClick={() => handleJoin(community)}
                        disabled={isActionLoading}
                      >
                        {isActionLoading && (
                          <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                        )}
                        {t('communities.join')}
                      </button>
                    )}

                    {!membership && community.is_public && !profile.is_verified && (
                      <Link href="/register" className="btn btn-red">
                        {t('communities.verifyToJoin')}
                      </Link>
                    )}

                    {membership?.role === 'owner' && (
                      <span className="community-owner-lock">
                        <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                        {t('communities.ownerCannotLeave')}
                      </span>
                    )}

                    {membership && membership.role !== 'owner' && (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => handleLeave(community)}
                        disabled={isActionLoading}
                      >
                        {isActionLoading && (
                          <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                        )}
                        {t('communities.leave')}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {createOpen && (
        <div className="community-modal-backdrop" role="presentation" onMouseDown={closeCreate}>
          <section
            className="community-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-create-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="community-modal-head">
              <div>
                <h2 id="community-create-title">{t('communities.createTitle')}</h2>
                <p>{t('communities.createSubtitle')}</p>
              </div>
              <button
                type="button"
                className="btn btn-icon"
                onClick={closeCreate}
                disabled={creating}
                aria-label={t('communities.closeCreate')}
                title={t('communities.closeCreate')}
              >
                <X size={19} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </header>

            <form className="community-create-form" onSubmit={handleCreate}>
              <label>
                <span>{t('communities.nameLabel')}</span>
                <input
                  value={createForm.name}
                  onChange={(event) => updateCreateField('name', event.target.value)}
                  maxLength={COMMUNITY_NAME_MAX}
                  disabled={creating}
                />
              </label>

              <label>
                <span>{t('communities.slugLabel')}</span>
                <input
                  value={createForm.slug}
                  onChange={(event) => updateCreateField('slug', event.target.value.toLowerCase())}
                  placeholder={t('communities.slugPlaceholder')}
                  maxLength={COMMUNITY_SLUG_MAX}
                  disabled={creating}
                />
                <small>{t('communities.slugHint')}</small>
              </label>

              <label className="community-create-wide">
                <span>{t('communities.descriptionLabel')}</span>
                <textarea
                  value={createForm.description}
                  onChange={(event) => updateCreateField('description', event.target.value)}
                  maxLength={COMMUNITY_DESCRIPTION_MAX}
                  rows={4}
                  disabled={creating}
                />
                <small>
                  {createForm.description.length} / {COMMUNITY_DESCRIPTION_MAX}
                </small>
              </label>

              <label>
                <span>{t('communities.typeLabel')}</span>
                <select
                  value={createForm.type}
                  onChange={(event) => updateCreateField('type', event.target.value)}
                  disabled={creating}
                >
                  {COMMUNITY_TYPES.map((type) => (
                    <option value={type} key={type}>{typeLabel(t, type)}</option>
                  ))}
                </select>
              </label>

              {isUniversityScoped(createForm.type) && (
                <label>
                  <span>{t('communities.universityLabel')}</span>
                  <select
                    value={createForm.university_id}
                    onChange={(event) => updateCreateField('university_id', event.target.value)}
                    disabled={creating}
                  >
                    <option value="">{t('communities.selectUniversity')}</option>
                    {universities.map((university) => (
                      <option value={university.id} key={university.id}>
                        {university.short_name || university.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="community-public-toggle community-create-wide">
                <input
                  type="checkbox"
                  checked={createForm.is_public}
                  onChange={(event) => updateCreateField('is_public', event.target.checked)}
                  disabled={creating}
                />
                <span>
                  <strong>{t('communities.publicLabel')}</strong>
                  <small>{t('communities.publicHelp')}</small>
                </span>
              </label>

              {createErrorKey && (
                <div className="community-form-error community-create-wide">
                  <AlertCircle size={17} strokeWidth={1.75} aria-hidden="true" />
                  {t(`communities.${createErrorKey}`)}
                </div>
              )}

              <div className="community-modal-actions community-create-wide">
                <button type="button" className="btn btn-ghost" onClick={closeCreate} disabled={creating}>
                  {t('communities.cancel')}
                </button>
                <button type="submit" className="btn btn-red" disabled={creating}>
                  {creating ? (
                    <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
                  ) : (
                    <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  {creating ? t('communities.creating') : t('communities.create')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}
