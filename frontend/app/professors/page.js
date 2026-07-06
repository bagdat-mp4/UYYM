'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FilterX,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/useProfile';
import '../feed/feed.css';
import './professors.css';

const PROFESSOR_SELECT = 'id, full_name, department, university_id, created_at';
const PROFESSOR_STATS_SELECT = 'id, full_name, department, university_id, ratings_count, count, overall, avg_clarity, avg_fairness, avg_usefulness';
const UNIVERSITY_SELECT = 'id, name, short_name, city, brand_color, is_active';
const COMMENT_MAX_LENGTH = 500;

const RATING_FIELDS = [
  { key: 'clarity', statKey: 'avg_clarity', labelKey: 'professors.clarity' },
  { key: 'fairness', statKey: 'avg_fairness', labelKey: 'professors.fairness' },
  { key: 'usefulness', statKey: 'avg_usefulness', labelKey: 'professors.usefulness' },
];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRating(value) {
  const rating = toNumber(value);
  if (rating === null) return '—';
  return rating.toFixed(1);
}

function getRatingCount(row) {
  const count = toNumber(row?.ratings_count ?? row?.count ?? 0);
  return count || 0;
}

function normalizeProfessor(row, statsRow, universityMap) {
  const source = {
    ...row,
    ...statsRow,
  };
  const ratingsCount = getRatingCount(source);
  const dimensions = RATING_FIELDS.reduce((acc, field) => {
    acc[field.key] = toNumber(source[field.statKey]);
    return acc;
  }, {});

  return {
    id: source.id,
    full_name: source.full_name || '',
    department: source.department || '',
    university_id: source.university_id || '',
    university: universityMap.get(source.university_id) || null,
    ratingsCount,
    overall: toNumber(source.overall),
    dimensions,
  };
}

function sortProfessors(a, b) {
  const countDiff = b.ratingsCount - a.ratingsCount;
  if (countDiff !== 0) return countDiff;

  const ratingDiff = (b.overall || 0) - (a.overall || 0);
  if (ratingDiff !== 0) return ratingDiff;

  return a.full_name.localeCompare(b.full_name);
}

function initialScores() {
  return {
    clarity: 0,
    fairness: 0,
    usefulness: 0,
  };
}

function RatingButtons({ field, value, label, disabled, onChange }) {
  return (
    <div className="professor-score-field">
      <div className="professor-score-label">
        <span>{label}</span>
        <strong>{value || '—'}</strong>
      </div>
      <div className="professor-score-buttons" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            className={`professor-score-button ${value >= score ? 'active' : ''}`}
            onClick={() => onChange(field, score)}
            disabled={disabled}
            aria-label={`${label}: ${score}`}
          >
            <Star size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{score}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ProfessorsPage() {
  const { user, profile, loading } = useProfile();
  const { t } = useLang();
  const [professors, setProfessors] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataErrorKey, setDataErrorKey] = useState('');
  const [search, setSearch] = useState('');
  const [universityFilter, setUniversityFilter] = useState('');
  const [selectedProfessor, setSelectedProfessor] = useState(null);
  const [scores, setScores] = useState(initialScores);
  const [comment, setComment] = useState('');
  const [ratingErrorKey, setRatingErrorKey] = useState('');
  const [noticeKey, setNoticeKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ratedProfessorIds, setRatedProfessorIds] = useState(new Set());

  const loadMyRatings = useCallback(async (userId) => {
    if (!userId) return;

    const { data, error } = await supabase
      .from('professor_ratings')
      .select('professor_id')
      .eq('user_id', userId);

    if (!error && data) {
      setRatedProfessorIds(new Set(data.map((rating) => rating.professor_id)));
    }
  }, []);

  const loadProfessors = useCallback(async () => {
    setDataLoading(true);
    setDataErrorKey('');

    const [professorResult, statsResult, universityResult] = await Promise.all([
      supabase
        .from('professors')
        .select(PROFESSOR_SELECT)
        .order('created_at', { ascending: false }),
      supabase
        .from('professor_stats')
        .select(PROFESSOR_STATS_SELECT)
        .order('ratings_count', { ascending: false })
        .order('overall', { ascending: false }),
      supabase
        .from('universities')
        .select(UNIVERSITY_SELECT)
        .order('name'),
    ]);

    if (professorResult.error && statsResult.error) {
      setDataErrorKey('professors.loadError');
      setDataLoading(false);
      return;
    }

    const nextUniversities = universityResult.error ? [] : (universityResult.data || []);
    const universityMap = new Map(nextUniversities.map((university) => [university.id, university]));
    const merged = new Map();

    if (!professorResult.error) {
      (professorResult.data || []).forEach((professor) => {
        merged.set(professor.id, normalizeProfessor(professor, null, universityMap));
      });
    }

    if (!statsResult.error) {
      (statsResult.data || []).forEach((statsRow) => {
        const existing = merged.get(statsRow.id) || {};
        merged.set(statsRow.id, normalizeProfessor(existing, statsRow, universityMap));
      });
    }

    setUniversities(nextUniversities);
    setProfessors(Array.from(merged.values()).sort(sortProfessors));
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      loadProfessors();
      loadMyRatings(user.id);
    }
  }, [loadMyRatings, loadProfessors, loading, user]);

  const visibleProfessors = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return professors.filter((professor) => {
      const matchesSearch = !normalizedSearch
        || professor.full_name.toLowerCase().includes(normalizedSearch);
      const matchesUniversity = !universityFilter || professor.university_id === universityFilter;
      return matchesSearch && matchesUniversity;
    });
  }, [professors, search, universityFilter]);

  const activeUniversities = useMemo(
    () => universities.filter((university) => university.is_active !== false),
    [universities]
  );

  const resetRatingForm = () => {
    setScores(initialScores());
    setComment('');
    setRatingErrorKey('');
  };

  const openRating = (professor) => {
    setSelectedProfessor(professor);
    setNoticeKey('');
    resetRatingForm();
  };

  const closeRating = () => {
    setSelectedProfessor(null);
    resetRatingForm();
  };

  const updateScore = (field, value) => {
    setScores((current) => ({
      ...current,
      [field]: value,
    }));
    setRatingErrorKey('');
  };

  const clearFilters = () => {
    setSearch('');
    setUniversityFilter('');
  };

  const handleSubmitRating = async (event) => {
    event.preventDefault();
    setRatingErrorKey('');
    setNoticeKey('');

    if (!profile?.is_verified) {
      setRatingErrorKey('professors.verificationRequiredTitle');
      return;
    }

    if (!selectedProfessor || ratedProfessorIds.has(selectedProfessor.id)) {
      setRatingErrorKey('professors.duplicateRating');
      return;
    }

    const hasAllScores = RATING_FIELDS.every((field) => scores[field.key] >= 1 && scores[field.key] <= 5);
    if (!hasAllScores) {
      setRatingErrorKey('professors.scoreRequired');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase
      .from('professor_ratings')
      .insert({
        professor_id: selectedProfessor.id,
        user_id: user.id,
        clarity: scores.clarity,
        fairness: scores.fairness,
        usefulness: scores.usefulness,
        comment: comment.trim() || null,
        is_approved: false,
      });

    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        setRatedProfessorIds((current) => new Set([...current, selectedProfessor.id]));
        setRatingErrorKey('professors.duplicateRating');
        return;
      }

      setRatingErrorKey('professors.submitError');
      return;
    }

    setRatedProfessorIds((current) => new Set([...current, selectedProfessor.id]));
    setNoticeKey('professors.submitSuccess');
    closeRating();
    loadProfessors();
    loadMyRatings(user.id);
  };

  if (loading) {
    return (
      <div className="feed-loading">
        <Loader2 size={20} strokeWidth={1.75} className="spin" aria-hidden="true" />
        {t('common.loading')}
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <AppShell profile={profile}>
      <div className="professors-page">
        <section className="professors-hero" aria-labelledby="professors-title">
          <div>
            <div className="feed-chip chip">
              <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
              {t('professors.badge')}
            </div>
            <h1 id="professors-title">{t('professors.title')}</h1>
            <p>{t('professors.subtitle')}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={loadProfessors} disabled={dataLoading}>
            <RefreshCw size={18} strokeWidth={1.75} className={dataLoading ? 'spin' : ''} aria-hidden="true" />
            {t('professors.refresh')}
          </button>
        </section>

        {noticeKey && (
          <div className="alert alert-success">
            <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" />
            {t(noticeKey)}
          </div>
        )}

        <section className="professors-toolbar" aria-label={t('professors.filtersLabel')}>
          <label className="professors-search">
            <span>{t('professors.searchLabel')}</span>
            <div className="professors-input-wrap">
              <Search size={18} strokeWidth={1.75} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('professors.searchPlaceholder')}
              />
            </div>
          </label>

          <label className="professors-filter">
            <span>{t('professors.universityFilter')}</span>
            <select value={universityFilter} onChange={(event) => setUniversityFilter(event.target.value)}>
              <option value="">{t('professors.allUniversities')}</option>
              {activeUniversities.map((university) => (
                <option value={university.id} key={university.id}>
                  {university.short_name || university.name}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-quiet professors-clear" onClick={clearFilters}>
            <FilterX size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('professors.clearFilters')}
          </button>
        </section>

        {selectedProfessor && (
          <section className="professor-rating-card" aria-labelledby="professor-rating-title">
            <div className="professor-section-head">
              <div>
                <h2 id="professor-rating-title">{t('professors.rateTitle')}</h2>
                <p>{selectedProfessor.full_name}</p>
              </div>
              <button type="button" className="btn btn-icon" onClick={closeRating} aria-label={t('professors.closeRating')}>
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {!profile.is_verified ? (
              <div className="professor-verify-state">
                <ShieldAlert size={22} strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <strong>{t('professors.verificationRequiredTitle')}</strong>
                  <p>{t('professors.verificationRequiredText')}</p>
                  <Link href="/register" className="btn btn-red">
                    {t('feed.continueVerification')}
                  </Link>
                </div>
              </div>
            ) : ratedProfessorIds.has(selectedProfessor.id) ? (
              <div className="professor-verify-state warning">
                <AlertCircle size={22} strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <strong>{t('professors.duplicateRating')}</strong>
                  <p>{t('professors.duplicateRatingText')}</p>
                </div>
              </div>
            ) : (
              <form className="professor-rating-form" onSubmit={handleSubmitRating}>
                <div className="professor-score-grid">
                  {RATING_FIELDS.map((field) => (
                    <RatingButtons
                      key={field.key}
                      field={field.key}
                      value={scores[field.key]}
                      label={t(field.labelKey)}
                      disabled={submitting}
                      onChange={updateScore}
                    />
                  ))}
                </div>

                <label className="professor-comment-field">
                  <span>{t('professors.commentLabel')}</span>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value.slice(0, COMMENT_MAX_LENGTH))}
                    placeholder={t('professors.commentPlaceholder')}
                    maxLength={COMMENT_MAX_LENGTH}
                    disabled={submitting}
                  />
                </label>
                <div className="professor-comment-count">
                  {COMMENT_MAX_LENGTH - comment.length} {t('feed.charactersRemaining')}
                </div>

                {ratingErrorKey && (
                  <div className="feed-inline-error">
                    <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                    {t(ratingErrorKey)}
                  </div>
                )}

                <div className="professor-rating-actions">
                  <button type="button" className="btn btn-ghost" onClick={closeRating} disabled={submitting}>
                    {t('professors.cancelRating')}
                  </button>
                  <button type="submit" className="btn btn-red" disabled={submitting}>
                    {submitting ? (
                      <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
                    ) : (
                      <Send size={18} strokeWidth={1.75} aria-hidden="true" />
                    )}
                    {submitting ? t('professors.submitting') : t('professors.submitRating')}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        <div className="professors-results-line">
          {t('professors.resultsCount').replace('{count}', String(visibleProfessors.length))}
        </div>

        {dataLoading && (
          <div className="feed-state-card">
            <Loader2 size={20} strokeWidth={1.75} className="spin" aria-hidden="true" />
            {t('professors.loading')}
          </div>
        )}

        {!dataLoading && dataErrorKey && (
          <div className="feed-state-card error">
            <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
            {t(dataErrorKey)}
          </div>
        )}

        {!dataLoading && !dataErrorKey && visibleProfessors.length === 0 && (
          <div className="feed-empty">
            <h2>{t('professors.emptyTitle')}</h2>
            <p>{t('professors.emptyText')}</p>
          </div>
        )}

        {!dataLoading && !dataErrorKey && visibleProfessors.length > 0 && (
          <div className="professors-list">
            {visibleProfessors.map((professor) => {
              const universityName = professor.university?.short_name
                || professor.university?.name
                || t('professors.universityFallback');
              const hasRatings = professor.ratingsCount > 0;

              return (
                <article className="professor-card" key={professor.id}>
                  <div className="professor-card-main">
                    <div className="professor-mark" aria-hidden="true">
                      <GraduationCap size={24} strokeWidth={1.75} />
                    </div>
                    <div className="professor-card-copy">
                      <div className="professor-card-heading">
                        <h2>{professor.full_name || t('professors.professorFallback')}</h2>
                        <span className="badge badge-neutral">
                          <Building2 size={14} strokeWidth={1.75} aria-hidden="true" />
                          {universityName}
                        </span>
                      </div>
                      <p>{professor.department || t('professors.notSet')}</p>
                    </div>
                  </div>

                  <div className="professor-rating-summary">
                    <div className="professor-overall">
                      <Star size={24} strokeWidth={1.75} aria-hidden="true" />
                      <strong>{hasRatings ? formatRating(professor.overall) : '—'}</strong>
                      <span>{t('professors.outOfFive')}</span>
                    </div>
                    <div className="professor-rating-count">
                      {t('professors.ratingCount').replace('{count}', String(professor.ratingsCount))}
                    </div>
                  </div>

                  <div className="professor-dimensions">
                    {RATING_FIELDS.map((field) => (
                      <div className="professor-dimension" key={field.key}>
                        <span>{t(field.labelKey)}</span>
                        <strong>{hasRatings ? formatRating(professor.dimensions[field.key]) : '—'}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="professor-card-actions">
                    <button type="button" className="btn btn-red" onClick={() => openRating(professor)}>
                      <Star size={18} strokeWidth={1.75} aria-hidden="true" />
                      {t('professors.rateProfessor')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
