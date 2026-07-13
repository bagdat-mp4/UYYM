'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FilterX,
  FolderOpen,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import MaterialCard from '@/components/materials/MaterialCard';
import MaterialForm from '@/components/materials/MaterialForm';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/useProfile';
import {
  buildMaterialUploadIdentity,
  escapeIlikePattern,
  MATERIAL_PAGE_SIZE,
  MATERIAL_TYPES,
  reconcileMaterialDeleteRows,
  safeDisplayText,
  shouldPreserveOriginalProfessor,
  validateMaterialFormValues,
} from './materialsUtils';
import './materials.css';

const BROWSE_MATERIAL_SELECT = `
  id,
  title,
  course_name,
  description,
  file_path,
  file_name,
  file_size,
  material_type,
  created_at,
  university:universities!university_id(id, name, short_name),
  professor:professors!professor_id(id, full_name),
  uploader:profiles!uploader_id(id, first_name, last_name)
`;

const MY_MATERIAL_SELECT = `${BROWSE_MATERIAL_SELECT}, uploader_id, university_id, professor_id, status`;

const UNIVERSITY_SELECT = 'id, name, short_name';
const PROFESSOR_SELECT = 'id, full_name, university_id';
const SEARCH_DELAY = 350;
const MATERIAL_VIEWS = ['browse', 'mine'];

function getBrowseCursor(rows) {
  const lastRow = rows.at(-1);
  if (!lastRow?.created_at || lastRow.id === null || lastRow.id === undefined) {
    return null;
  }

  return {
    created_at: lastRow.created_at,
    id: lastRow.id,
  };
}

function buildBrowseCursorFilter(cursor) {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

function appendUniqueMaterials(current, incoming) {
  const existingIds = new Set(current.map((material) => String(material.id)));
  const uniqueIncoming = incoming.filter((material) => {
    const key = String(material.id);
    if (existingIds.has(key)) return false;
    existingIds.add(key);
    return true;
  });

  return [...current, ...uniqueIncoming];
}

function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

function logMaterialsDiagnostic(context, error) {
  console.error('[Materials] request failed', {
    context,
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
  });
}

function dialogFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function DeleteMaterialDialog({
  material,
  t,
  busy,
  errorKey,
  returnFocusRef,
  fallbackFocusRef,
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const restoreTargetRef = useRef(returnFocusRef?.current || null);
  const materialTitle = safeDisplayText(material?.title, t('materials.titleFallback'));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      const restoreTarget = restoreTargetRef.current;
      window.requestAnimationFrame(() => {
        if (restoreTarget?.isConnected) {
          restoreTarget.focus();
        } else {
          fallbackFocusRef?.current?.focus();
        }
      });
    };
  }, [fallbackFocusRef]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (!busy) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;

    const elements = dialogFocusableElements(dialogRef.current);
    if (elements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="material-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="material-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <span className="material-delete-icon" aria-hidden="true">
          <Trash2 size={24} strokeWidth={1.75} />
        </span>
        <div>
          <h2 id={titleId}>{t('materials.deleteConfirmTitle')}</h2>
          <p id={descriptionId}>
            {t('materials.deleteConfirmText').replace('{title}', materialTitle)}
          </p>
        </div>

        {errorKey && (
          <div className="material-form-operation-error" role="alert">
            <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
            {t(errorKey)}
          </div>
        )}

        <div className="material-modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            {t('materials.cancelDelete')}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? (
              <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
            ) : (
              <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
            {t(busy ? 'materials.deletingMaterial' : 'materials.confirmDelete')}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function MaterialsPage() {
  const {
    user,
    profile,
    loading,
    profileError,
    refreshProfile,
  } = useProfile();
  const { lang, t } = useLang();
  const [activeView, setActiveView] = useState('browse');
  const [universities, setUniversities] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [lookupErrorKey, setLookupErrorKey] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [universityFilter, setUniversityFilter] = useState('');
  const [professorFilter, setProfessorFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [browseMaterials, setBrowseMaterials] = useState([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseErrorKey, setBrowseErrorKey] = useState('');
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [paginationErrorKey, setPaginationErrorKey] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [browseCursor, setBrowseCursor] = useState(null);
  const [browseRevision, setBrowseRevision] = useState(0);
  const [myMaterials, setMyMaterials] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myLoaded, setMyLoaded] = useState(false);
  const [myErrorKey, setMyErrorKey] = useState('');
  const [downloadingIds, setDownloadingIds] = useState(() => new Set());
  const [downloadErrorIds, setDownloadErrorIds] = useState(() => new Set());
  const [materialForm, setMaterialForm] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formErrorKey, setFormErrorKey] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState('');
  const [materialActionIds, setMaterialActionIds] = useState(() => new Set());
  const [pageNotice, setPageNotice] = useState(null);
  const mountedRef = useRef(false);
  const lookupRequestRef = useRef(0);
  const browseRequestRef = useRef(0);
  const myRequestRef = useRef(0);
  const paginationBusyRef = useRef(false);
  const downloadBusyRef = useRef(new Set());
  const formBusyRef = useRef(false);
  const deleteBusyRef = useRef(false);
  const materialActionRef = useRef(new Set());
  const formReturnFocusRef = useRef(null);
  const deleteReturnFocusRef = useRef(null);
  const myUploadsTabRef = useRef(null);
  const tabRefs = useRef({});
  const debouncedTitle = useDebouncedValue(titleSearch, SEARCH_DELAY);
  const debouncedCourse = useDebouncedValue(courseSearch, SEARCH_DELAY);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      lookupRequestRef.current += 1;
      browseRequestRef.current += 1;
      myRequestRef.current += 1;
      paginationBusyRef.current = false;
    };
  }, []);

  const visibleProfessors = useMemo(() => {
    if (!universityFilter) return professors;
    return professors.filter(
      (professor) => String(professor.university_id) === universityFilter
    );
  }, [professors, universityFilter]);

  const loadLookups = useCallback(async () => {
    if (!mountedRef.current) return;
    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    setLookupLoading(true);
    setLookupErrorKey('');

    try {
      const [universityResult, professorResult] = await Promise.all([
        supabase.from('universities').select(UNIVERSITY_SELECT).order('name'),
        supabase.from('professors').select(PROFESSOR_SELECT).order('full_name'),
      ]);

      if (!mountedRef.current || requestId !== lookupRequestRef.current) return;
      if (universityResult.error) {
        logMaterialsDiagnostic('lookup-universities', universityResult.error);
      }
      if (professorResult.error) {
        logMaterialsDiagnostic('lookup-professors', professorResult.error);
      }

      setUniversities(universityResult.error ? [] : (universityResult.data || []));
      setProfessors(professorResult.error ? [] : (professorResult.data || []));
      if (universityResult.error || professorResult.error) {
        setLookupErrorKey('materials.lookupError');
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== lookupRequestRef.current) return;
      logMaterialsDiagnostic('lookups', error);
      setUniversities([]);
      setProfessors([]);
      setLookupErrorKey('materials.lookupError');
    } finally {
      if (mountedRef.current && requestId === lookupRequestRef.current) {
        setLookupLoading(false);
      }
    }
  }, []);

  const loadBrowse = useCallback(async (cursor = null) => {
    if (!mountedRef.current) return;
    const isPagination = Boolean(cursor);
    if (isPagination && paginationBusyRef.current) return;

    const requestId = browseRequestRef.current + 1;
    browseRequestRef.current = requestId;

    if (isPagination) {
      paginationBusyRef.current = true;
      setPaginationLoading(true);
      setPaginationErrorKey('');
    } else {
      paginationBusyRef.current = false;
      setPaginationLoading(false);
      setBrowseLoading(true);
      setBrowseErrorKey('');
      setPaginationErrorKey('');
      setBrowseCursor(null);
      setHasMore(false);
    }

    try {
      let query = supabase
        .from('materials')
        .select(BROWSE_MATERIAL_SELECT, isPagination ? {} : { count: 'exact' })
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MATERIAL_PAGE_SIZE);

      if (cursor) query = query.or(buildBrowseCursorFilter(cursor));
      if (universityFilter) query = query.eq('university_id', universityFilter);
      if (professorFilter) query = query.eq('professor_id', professorFilter);
      if (typeFilter) query = query.eq('material_type', typeFilter);

      const cleanTitle = escapeIlikePattern(debouncedTitle);
      const cleanCourse = escapeIlikePattern(debouncedCourse);
      if (cleanTitle) query = query.ilike('title', `%${cleanTitle}%`);
      if (cleanCourse) query = query.ilike('course_name', `%${cleanCourse}%`);

      const { data, error, count } = await query;
      if (!mountedRef.current || requestId !== browseRequestRef.current) return;

      if (error) {
        logMaterialsDiagnostic(isPagination ? 'browse-page' : 'browse', error);
        if (isPagination) {
          setPaginationErrorKey('materials.paginationError');
        } else {
          setBrowseMaterials([]);
          setBrowseTotal(0);
          setBrowseCursor(null);
          setHasMore(false);
          setBrowseErrorKey('materials.browseError');
        }
      } else {
        const rows = data || [];
        const nextCursor = getBrowseCursor(rows);

        if (isPagination) {
          setBrowseMaterials((current) => appendUniqueMaterials(current, rows));
        } else {
          setBrowseMaterials(rows);
          setBrowseTotal(count ?? rows.length);
        }

        setBrowseCursor(nextCursor);
        setHasMore(
          Boolean(nextCursor)
          && rows.length === MATERIAL_PAGE_SIZE
          && (isPagination || count === null || count === undefined || rows.length < count)
        );
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== browseRequestRef.current) return;
      logMaterialsDiagnostic(isPagination ? 'browse-page' : 'browse', error);
      if (isPagination) {
        setPaginationErrorKey('materials.paginationError');
      } else {
        setBrowseMaterials([]);
        setBrowseTotal(0);
        setBrowseCursor(null);
        setHasMore(false);
        setBrowseErrorKey('materials.browseError');
      }
    } finally {
      if (requestId === browseRequestRef.current) {
        paginationBusyRef.current = false;
        if (mountedRef.current) {
          setBrowseLoading(false);
          setPaginationLoading(false);
        }
      }
    }
  }, [debouncedCourse, debouncedTitle, professorFilter, typeFilter, universityFilter]);

  const loadMyMaterials = useCallback(async () => {
    if (!mountedRef.current || !user?.id) return null;

    const requestId = myRequestRef.current + 1;
    myRequestRef.current = requestId;
    setMyLoading(true);
    setMyErrorKey('');

    try {
      const { data, error } = await supabase
        .from('materials')
        .select(MY_MATERIAL_SELECT)
        .eq('uploader_id', user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (!mountedRef.current || requestId !== myRequestRef.current) return null;

      if (error) {
        logMaterialsDiagnostic('my-uploads', error);
        setMyMaterials([]);
        setMyErrorKey('materials.myError');
        return null;
      }

      const rows = data || [];
      setMyMaterials(rows);
      return rows;
    } catch (error) {
      if (!mountedRef.current || requestId !== myRequestRef.current) return null;
      logMaterialsDiagnostic('my-uploads', error);
      setMyMaterials([]);
      setMyErrorKey('materials.myError');
      return null;
    } finally {
      if (requestId === myRequestRef.current) {
        if (mountedRef.current) {
          setMyLoaded(true);
          setMyLoading(false);
        }
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!loading && user && profile) loadLookups();
  }, [loadLookups, loading, profile, user]);

  useEffect(() => {
    const searchIsSettled = debouncedTitle === titleSearch && debouncedCourse === courseSearch;
    if (!loading && user && profile && activeView === 'browse' && searchIsSettled) {
      loadBrowse();
    }
  }, [
    activeView,
    browseRevision,
    courseSearch,
    debouncedCourse,
    debouncedTitle,
    loadBrowse,
    loading,
    profile,
    titleSearch,
    user,
  ]);

  useEffect(() => {
    if (!loading && user && profile && activeView === 'mine' && !myLoaded && !myLoading) {
      loadMyMaterials();
    }
  }, [activeView, loadMyMaterials, loading, myLoaded, myLoading, profile, user]);

  const invalidateBrowseResults = () => {
    browseRequestRef.current += 1;
    paginationBusyRef.current = false;
    setPaginationLoading(false);
    setPaginationErrorKey('');
    setBrowseCursor(null);
    setHasMore(false);
    setBrowseRevision((current) => current + 1);
    if (activeView === 'browse') setBrowseLoading(true);
  };

  const handleUniversityChange = (event) => {
    const nextUniversity = event.target.value;
    invalidateBrowseResults();
    setUniversityFilter(nextUniversity);

    if (professorFilter && nextUniversity) {
      const selectedProfessor = professors.find(
        (professor) => String(professor.id) === professorFilter
      );
      if (String(selectedProfessor?.university_id) !== nextUniversity) {
        setProfessorFilter('');
      }
    }
  };

  const clearFilters = () => {
    invalidateBrowseResults();
    setTitleSearch('');
    setCourseSearch('');
    setUniversityFilter('');
    setProfessorFilter('');
    setTypeFilter('');
  };

  const handleViewChange = (nextView) => {
    if (nextView === activeView || !MATERIAL_VIEWS.includes(nextView)) return;

    invalidateBrowseResults();

    if (nextView === 'browse') {
      setBrowseMaterials([]);
      setBrowseTotal(0);
      setBrowseLoading(true);
    }

    setActiveView(nextView);
  };

  const handleTabKeyDown = (event, currentView) => {
    const currentIndex = MATERIAL_VIEWS.indexOf(currentView);
    let nextIndex = null;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % MATERIAL_VIEWS.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + MATERIAL_VIEWS.length) % MATERIAL_VIEWS.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = MATERIAL_VIEWS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextView = MATERIAL_VIEWS[nextIndex];
    handleViewChange(nextView);
    window.requestAnimationFrame(() => tabRefs.current[nextView]?.focus());
  };

  const refreshActiveView = () => {
    if (activeView === 'mine') {
      loadMyMaterials();
    } else {
      loadBrowse();
    }
  };

  const loadMoreBrowse = () => {
    if (!browseCursor || paginationBusyRef.current) return;
    loadBrowse(browseCursor);
  };

  const setMaterialActionBusy = (materialId, busy) => {
    if (materialId === null || materialId === undefined) return;
    if (busy) {
      materialActionRef.current.add(materialId);
    } else {
      materialActionRef.current.delete(materialId);
    }
    if (mountedRef.current) {
      setMaterialActionIds(new Set(materialActionRef.current));
    }
  };

  const isPendingOwnedMaterial = (material) => Boolean(
    material
    && material.status === 'pending'
    && user?.id
    && material.uploader_id === user.id
  );

  const recheckMutationUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        logMaterialsDiagnostic('auth-recheck', error);
        return null;
      }
      if (!data?.user || data.user.id !== user?.id) return null;
      return data.user;
    } catch (error) {
      logMaterialsDiagnostic('auth-recheck', error);
      return null;
    }
  };

  const moveToMyUploads = () => {
    if (activeView !== 'mine') handleViewChange('mine');
  };

  const openUploadForm = (trigger) => {
    if (!profile?.is_verified || formBusyRef.current) return;
    formReturnFocusRef.current = trigger;
    setFormErrorKey('');
    setPageNotice(null);
    setMaterialForm({ mode: 'create', material: null });
  };

  const openEditForm = (material, trigger) => {
    if (
      !profile?.is_verified
      || !isPendingOwnedMaterial(material)
      || materialActionRef.current.has(material.id)
    ) return;

    formReturnFocusRef.current = trigger;
    setFormErrorKey('');
    setPageNotice(null);
    setMaterialForm({ mode: 'edit', material });
  };

  const closeMaterialForm = () => {
    if (formBusyRef.current) return;
    setMaterialForm(null);
    setFormErrorKey('');
  };

  const openDeleteDialog = (material, trigger) => {
    if (!isPendingOwnedMaterial(material) || materialActionRef.current.has(material.id)) return;
    deleteReturnFocusRef.current = trigger;
    setDeleteErrorKey('');
    setPageNotice(null);
    setDeleteTarget(material);
  };

  const closeDeleteDialog = () => {
    if (deleteBusyRef.current) return;
    setDeleteTarget(null);
    setDeleteErrorKey('');
  };

  const closeDeleteWithNotice = (notice) => {
    if (!mountedRef.current) return;
    setDeleteTarget(null);
    setDeleteErrorKey('');
    setPageNotice(notice);
  };

  const reconcileDeleteTargetState = async (target, {
    keepPendingDialog = false,
    pendingErrorKey = 'materials.deleteStorageError',
    pendingNoticeKey = 'materials.deletePendingCleanupWarning',
    missingNoticeKey = 'materials.deleteAlreadyRemoved',
    missingNoticeType = 'neutral',
  } = {}) => {
    const rows = await loadMyMaterials();
    if (!mountedRef.current) return null;

    const result = reconcileMaterialDeleteRows(rows, target.id);
    if (result.state === 'pending' && keepPendingDialog) {
      setDeleteTarget(result.material);
      setDeleteErrorKey(pendingErrorKey);
      return result;
    }

    if (result.state === 'missing') {
      closeDeleteWithNotice({ type: missingNoticeType, key: missingNoticeKey });
    } else if (result.state === 'status_changed') {
      closeDeleteWithNotice({ type: 'warning', key: 'materials.deleteStatusChanged' });
    } else if (result.state === 'pending') {
      closeDeleteWithNotice({ type: 'warning', key: pendingNoticeKey });
    } else {
      closeDeleteWithNotice({ type: 'warning', key: 'materials.deleteRecoveryRefreshFailed' });
    }

    return result;
  };

  const finishFormWithMyUploads = async (notice) => {
    if (!mountedRef.current) return null;
    moveToMyUploads();
    const rows = await loadMyMaterials();
    if (!mountedRef.current) return rows;
    setMaterialForm(null);
    setFormErrorKey('');
    setPageNotice(notice);
    return rows;
  };

  const handleMaterialFormSubmit = async (submittedValues, relationshipTouched = {}) => {
    if (!mountedRef.current || !materialForm || formBusyRef.current) return;

    const mode = materialForm.mode;
    const target = materialForm.material;
    const universityChanged = mode === 'edit' && (
      Boolean(relationshipTouched.university)
      || String(submittedValues?.universityId || '') !== String(target?.university_id || '')
    );
    const preserveProfessorId = shouldPreserveOriginalProfessor({
      mode,
      universityTouched: universityChanged,
      professorId: submittedValues?.professorId,
      originalProfessorId: target?.professor_id ?? null,
    }) ? target.professor_id : null;
    const validation = validateMaterialFormValues(submittedValues, {
      mode,
      universities,
      professors,
      preserveProfessorId,
    });

    if (!validation.isValid) {
      setFormErrorKey('materials.validationGeneric');
      return;
    }
    if (mode === 'edit' && !isPendingOwnedMaterial(target)) {
      setFormErrorKey('materials.editConflict');
      return;
    }

    formBusyRef.current = true;
    setFormBusy(true);
    setFormErrorKey('');
    setPageNotice(null);
    if (mode === 'edit') setMaterialActionBusy(target.id, true);

    try {
      const currentUser = await recheckMutationUser();
      if (!mountedRef.current) return;
      if (!currentUser) {
        setFormErrorKey('materials.sessionError');
        return;
      }
      if (!profile?.is_verified) {
        setFormErrorKey('materials.verificationRequiredUpload');
        return;
      }

      const values = validation.values;

      if (mode === 'edit') {
        let updateResult;
        try {
          updateResult = await supabase
            .from('materials')
            .update({
              title: values.title,
              description: values.description,
              course_name: values.courseName,
              university_id: values.universityId,
              professor_id: values.professorId,
              material_type: values.materialType,
            })
            .eq('id', target.id)
            .eq('uploader_id', currentUser.id)
            .eq('status', 'pending')
            .select('id');
        } catch (error) {
          logMaterialsDiagnostic('edit-metadata', error);
          if (mountedRef.current) setFormErrorKey('materials.editError');
          return;
        }

        if (!mountedRef.current) return;
        if (updateResult.error) {
          logMaterialsDiagnostic('edit-metadata', updateResult.error);
          setFormErrorKey('materials.editError');
          return;
        }
        if ((updateResult.data || []).length !== 1) {
          await finishFormWithMyUploads({ type: 'warning', key: 'materials.editConflict' });
          return;
        }

        await finishFormWithMyUploads({ type: 'success', key: 'materials.editSuccess' });
        return;
      }

      let uploadIdentity;
      try {
        if (!window.crypto?.randomUUID) throw new Error('random_uuid_unavailable');
        const uploadId = window.crypto.randomUUID();
        uploadIdentity = buildMaterialUploadIdentity(
          currentUser.id,
          uploadId,
          values.file.name,
          values.fileExtension
        );
      } catch (error) {
        logMaterialsDiagnostic('upload-identity', error);
        if (mountedRef.current) setFormErrorKey('materials.uploadError');
        return;
      }

      let insertedRow;
      try {
        const { data, error } = await supabase
          .from('materials')
          .insert({
            uploader_id: currentUser.id,
            university_id: values.universityId,
            professor_id: values.professorId,
            title: values.title,
            description: values.description,
            course_name: values.courseName,
            file_path: uploadIdentity.filePath,
            file_name: uploadIdentity.fileName,
            mime_type: values.mimeType,
            file_size: values.fileSize,
            material_type: values.materialType,
            status: 'pending',
          })
          .select('id')
          .single();

        if (error || !data?.id) {
          if (error) logMaterialsDiagnostic('upload-row-insert', error);
          if (mountedRef.current) setFormErrorKey('materials.uploadDatabaseError');
          return;
        }
        insertedRow = data;
      } catch (error) {
        logMaterialsDiagnostic('upload-row-insert', error);
        if (mountedRef.current) setFormErrorKey('materials.uploadDatabaseError');
        return;
      }

      let uploadError = null;
      try {
        const result = await supabase.storage
          .from('materials')
          .upload(uploadIdentity.filePath, values.file, {
            upsert: false,
            contentType: values.mimeType,
          });
        uploadError = result.error;
      } catch (error) {
        uploadError = error;
      }

      if (!uploadError) {
        await finishFormWithMyUploads({ type: 'success', key: 'materials.uploadSuccess' });
        return;
      }

      logMaterialsDiagnostic('upload-storage', uploadError);

      let storageCleanupError = null;
      try {
        const result = await supabase.storage
          .from('materials')
          .remove([uploadIdentity.filePath]);
        storageCleanupError = result.error;
      } catch (error) {
        storageCleanupError = error;
      }

      if (storageCleanupError) {
        logMaterialsDiagnostic('upload-cleanup-storage', storageCleanupError);
        await finishFormWithMyUploads({
          type: 'warning',
          key: 'materials.uploadPartialCleanupWarning',
        });
        return;
      }

      let rowCleanupResult;
      try {
        rowCleanupResult = await supabase
          .from('materials')
          .delete()
          .eq('id', insertedRow.id)
          .eq('uploader_id', currentUser.id)
          .eq('status', 'pending')
          .select('id');
      } catch (error) {
        rowCleanupResult = { data: null, error };
      }

      if (rowCleanupResult.error || (rowCleanupResult.data || []).length !== 1) {
        if (rowCleanupResult.error) {
          logMaterialsDiagnostic('upload-cleanup-row', rowCleanupResult.error);
        }
        await finishFormWithMyUploads({
          type: 'warning',
          key: 'materials.uploadPartialCleanupWarning',
        });
        return;
      }

      if (mountedRef.current) setFormErrorKey('materials.uploadStorageError');
    } finally {
      formBusyRef.current = false;
      if (mountedRef.current) setFormBusy(false);
      if (mode === 'edit' && target?.id !== undefined) {
        setMaterialActionBusy(target.id, false);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (
      !mountedRef.current
      || !deleteTarget
      || deleteBusyRef.current
      || !isPendingOwnedMaterial(deleteTarget)
      || !deleteTarget.file_path
    ) return;

    const target = deleteTarget;
    deleteBusyRef.current = true;
    setDeleteBusy(true);
    setDeleteErrorKey('');
    setPageNotice(null);
    setMaterialActionBusy(target.id, true);

    try {
      const currentUser = await recheckMutationUser();
      if (!mountedRef.current) return;
      if (!currentUser) {
        setDeleteErrorKey('materials.sessionError');
        return;
      }

      let storageError = null;
      try {
        const result = await supabase.storage
          .from('materials')
          .remove([target.file_path]);
        storageError = result.error;
      } catch (error) {
        storageError = error;
      }

      if (storageError) {
        logMaterialsDiagnostic('delete-storage', storageError);
        await reconcileDeleteTargetState(target, {
          keepPendingDialog: true,
          pendingErrorKey: 'materials.deleteStorageError',
        });
        return;
      }

      let rowDeleteResult;
      try {
        rowDeleteResult = await supabase
          .from('materials')
          .delete()
          .eq('id', target.id)
          .eq('uploader_id', currentUser.id)
          .eq('status', 'pending')
          .select('id');
      } catch (error) {
        rowDeleteResult = { data: null, error };
      }

      if (rowDeleteResult.error || (rowDeleteResult.data || []).length !== 1) {
        if (rowDeleteResult.error) {
          logMaterialsDiagnostic('delete-row', rowDeleteResult.error);
        }
        await reconcileDeleteTargetState(target);
        return;
      }

      await reconcileDeleteTargetState(target, {
        missingNoticeKey: 'materials.deleteSuccess',
        missingNoticeType: 'success',
      });
    } finally {
      deleteBusyRef.current = false;
      if (mountedRef.current) setDeleteBusy(false);
      setMaterialActionBusy(target.id, false);
    }
  };

  const handleDownload = useCallback(async (material) => {
    if (!material?.id || !material?.file_path || downloadBusyRef.current.has(material.id)) {
      return;
    }

    downloadBusyRef.current.add(material.id);
    setDownloadingIds(new Set(downloadBusyRef.current));
    setDownloadErrorIds((current) => {
      const next = new Set(current);
      next.delete(material.id);
      return next;
    });

    const filePath = material.file_path;
    const fileName = typeof material.file_name === 'string' && material.file_name.trim()
      ? material.file_name.trim()
      : true;
    let downloadLink = null;

    try {
      const { data, error } = await supabase.storage
        .from('materials')
        .createSignedUrl(filePath, 300, { download: fileName });

      if (error || !data?.signedUrl) {
        throw error || new Error('signed_url_unavailable');
      }

      if (!mountedRef.current) return;

      downloadLink = document.createElement('a');
      downloadLink.href = data.signedUrl;
      downloadLink.download = fileName === true ? '' : fileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
    } catch (error) {
      logMaterialsDiagnostic('download', error);
      if (mountedRef.current) {
        setDownloadErrorIds((current) => new Set(current).add(material.id));
      }
    } finally {
      downloadLink?.remove();
      downloadBusyRef.current.delete(material.id);
      if (mountedRef.current) {
        setDownloadingIds(new Set(downloadBusyRef.current));
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="materials-auth-loading">
        <Loader2 size={22} strokeWidth={1.75} className="spin" aria-hidden="true" />
        <span>{t('materials.loadingPage')}</span>
      </div>
    );
  }

  if (profileError) {
    const profileErrorState = (
      <div className="materials-state materials-state-error">
        <AlertCircle size={24} strokeWidth={1.75} aria-hidden="true" />
        <div>
          <h1>{t('materials.profileLoadErrorTitle')}</h1>
          <p>{t('materials.profileLoadErrorText')}</p>
          <button type="button" className="btn btn-secondary" onClick={refreshProfile}>
            {t('materials.retry')}
          </button>
        </div>
      </div>
    );

    if (!user) {
      return <div className="materials-auth-loading">{profileErrorState}</div>;
    }

    return (
      <AppShell profile={profile}>
        <div className="materials-page">{profileErrorState}</div>
      </AppShell>
    );
  }

  if (!user) return null;

  if (!profile) {
    return (
      <AppShell profile={profile}>
        <div className="materials-page">
          <div className="materials-state materials-state-error">
            <AlertCircle size={24} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <h1>{t('materials.missingProfileTitle')}</h1>
              <p>{t('materials.missingProfileText')}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const myViewLoading = myLoading || !myLoaded;
  const activeLoading = activeView === 'browse' ? browseLoading : myViewLoading;
  const renderMaterialCards = (materials, showStatus) => (
    <div className="materials-grid" aria-live="polite">
      {materials.map((material) => {
        const canDelete = showStatus && isPendingOwnedMaterial(material);
        const canEdit = canDelete && profile.is_verified;

        return (
          <MaterialCard
            key={material.id}
            material={material}
            lang={lang}
            t={t}
            showStatus={showStatus}
            downloading={downloadingIds.has(material.id)}
            downloadError={downloadErrorIds.has(material.id)}
            actionBusy={materialActionIds.has(material.id)}
            canEdit={canEdit}
            canDelete={canDelete}
            onDownload={handleDownload}
            onEdit={openEditForm}
            onDelete={openDeleteDialog}
          />
        );
      })}
    </div>
  );

  return (
    <AppShell profile={profile}>
      <div className="materials-page">
        <header className="materials-topline">
          <div>
            <span className="chip">
              <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              {t('materials.badge')}
            </span>
            <h1>{t('materials.title')}</h1>
            <p>{t('materials.subtitle')}</p>
          </div>
          <div className="materials-top-actions">
            <button
              type="button"
              className="btn btn-secondary materials-refresh"
              onClick={refreshActiveView}
              disabled={activeLoading || paginationLoading}
            >
              <RefreshCw
                size={18}
                strokeWidth={1.75}
                className={activeLoading ? 'spin' : ''}
                aria-hidden="true"
              />
              {t('materials.refresh')}
            </button>
            {profile.is_verified ? (
              <button
                type="button"
                className="btn btn-red materials-upload-button"
                onClick={(event) => openUploadForm(event.currentTarget)}
                disabled={lookupLoading || formBusy}
              >
                <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
                {t('materials.uploadAction')}
              </button>
            ) : (
              <Link href="/register" className="btn btn-secondary materials-verify-link">
                <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" />
                {t('materials.continueVerification')}
              </Link>
            )}
          </div>
        </header>

        {pageNotice && (
          <div
            className={`alert materials-notice ${
              pageNotice.type === 'success'
                ? 'alert-success'
                : pageNotice.type === 'warning'
                  ? 'alert-warning'
                  : ''
            }`}
            role={pageNotice.type === 'warning' ? 'alert' : 'status'}
            aria-live={pageNotice.type === 'warning' ? 'assertive' : 'polite'}
          >
            {pageNotice.type === 'success' ? (
              <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
            ) : pageNotice.type === 'warning' ? (
              <AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Info size={20} strokeWidth={1.75} aria-hidden="true" />
            )}
            <span>{t(pageNotice.key)}</span>
          </div>
        )}

        {!profile.is_verified && (
          <div className="alert alert-warning materials-verification-note">
            <ShieldCheck size={21} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <strong>{t('materials.verificationRequiredTitle')}</strong>
              <p>{t('materials.verificationRequiredText')}</p>
            </div>
            <Link href="/register" className="btn btn-secondary">
              {t('materials.continueVerification')}
            </Link>
          </div>
        )}

        <div className="materials-tabs" role="tablist" aria-label={t('materials.viewsLabel')}>
          <button
            id="materials-tab-browse"
            ref={(node) => { tabRefs.current.browse = node; }}
            type="button"
            role="tab"
            aria-selected={activeView === 'browse'}
            aria-controls="materials-panel-browse"
            tabIndex={activeView === 'browse' ? 0 : -1}
            className={`materials-tab ${activeView === 'browse' ? 'active' : ''}`}
            onClick={() => handleViewChange('browse')}
            onKeyDown={(event) => handleTabKeyDown(event, 'browse')}
          >
            <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('materials.browseTab')}
          </button>
          <button
            id="materials-tab-mine"
            ref={(node) => {
              tabRefs.current.mine = node;
              myUploadsTabRef.current = node;
            }}
            type="button"
            role="tab"
            aria-selected={activeView === 'mine'}
            aria-controls="materials-panel-mine"
            tabIndex={activeView === 'mine' ? 0 : -1}
            className={`materials-tab ${activeView === 'mine' ? 'active' : ''}`}
            onClick={() => handleViewChange('mine')}
            onKeyDown={(event) => handleTabKeyDown(event, 'mine')}
          >
            <FolderOpen size={18} strokeWidth={1.75} aria-hidden="true" />
            {t('materials.myUploadsTab')}
          </button>
        </div>

        <div
          id={`materials-panel-${activeView}`}
          className="materials-panel"
          role="tabpanel"
          aria-labelledby={`materials-tab-${activeView}`}
          tabIndex={0}
        >
          {activeView === 'browse' && (
          <section className="materials-filter-panel" aria-label={t('materials.filtersLabel')}>
            <div className="materials-filter-heading">
              <div>
                <h2>{t('materials.filtersTitle')}</h2>
                <p>{lookupLoading ? t('materials.lookupLoading') : t('materials.filtersSubtitle')}</p>
              </div>
              <button type="button" className="btn btn-quiet" onClick={clearFilters}>
                <FilterX size={17} strokeWidth={1.75} aria-hidden="true" />
                {t('materials.clearFilters')}
              </button>
            </div>

            {lookupErrorKey && (
              <div className="materials-lookup-error" role="status">
                <AlertCircle size={17} strokeWidth={1.75} aria-hidden="true" />
                <span>{t(lookupErrorKey)}</span>
                <button type="button" className="btn btn-quiet" onClick={loadLookups}>
                  {t('materials.retry')}
                </button>
              </div>
            )}

            <div className="materials-filter-grid">
              <div className="materials-search-field">
                <label htmlFor="materials-title-search">{t('materials.searchLabel')}</label>
                <div className="materials-input-wrap">
                  <Search size={18} strokeWidth={1.75} aria-hidden="true" />
                  <input
                    id="materials-title-search"
                    type="search"
                    value={titleSearch}
                    onChange={(event) => {
                      invalidateBrowseResults();
                      setTitleSearch(event.target.value);
                    }}
                    placeholder={t('materials.searchPlaceholder')}
                    maxLength={180}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="materials-university">{t('materials.universityLabel')}</label>
                <select
                  id="materials-university"
                  value={universityFilter}
                  onChange={handleUniversityChange}
                  disabled={lookupLoading}
                >
                  <option value="">{t('materials.allUniversities')}</option>
                  {universities.map((university) => (
                    <option key={university.id} value={String(university.id)}>
                      {university.short_name || university.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="materials-course">{t('materials.courseLabel')}</label>
                <input
                  id="materials-course"
                  type="search"
                  value={courseSearch}
                  onChange={(event) => {
                    invalidateBrowseResults();
                    setCourseSearch(event.target.value);
                  }}
                  placeholder={t('materials.coursePlaceholder')}
                  maxLength={120}
                />
              </div>

              <div>
                <label htmlFor="materials-professor">{t('materials.professorLabel')}</label>
                <select
                  id="materials-professor"
                  value={professorFilter}
                  onChange={(event) => {
                    invalidateBrowseResults();
                    setProfessorFilter(event.target.value);
                  }}
                  disabled={lookupLoading}
                >
                  <option value="">{t('materials.allProfessors')}</option>
                  {visibleProfessors.map((professor) => (
                    <option key={professor.id} value={String(professor.id)}>
                      {professor.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="materials-type">{t('materials.materialTypeLabel')}</label>
                <select
                  id="materials-type"
                  value={typeFilter}
                  onChange={(event) => {
                    invalidateBrowseResults();
                    setTypeFilter(event.target.value);
                  }}
                >
                  <option value="">{t('materials.allTypes')}</option>
                  {MATERIAL_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{t(type.labelKey)}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
          )}

          {!activeLoading && activeView === 'browse' && !browseErrorKey && (
          <div className="materials-results-line">
            {t('materials.resultsCount').replace('{count}', String(browseTotal))}
          </div>
          )}

          {!activeLoading && activeView === 'mine' && !myErrorKey && (
          <div className="materials-results-line">
            {t('materials.resultsCount').replace('{count}', String(myMaterials.length))}
          </div>
          )}

          {activeLoading && (
          <div className="materials-state">
            <Loader2 size={22} strokeWidth={1.75} className="spin" aria-hidden="true" />
            <span>{activeView === 'browse' ? t('materials.browseLoading') : t('materials.myLoading')}</span>
          </div>
          )}

          {!activeLoading && activeView === 'browse' && browseErrorKey && (
          <div className="materials-state materials-state-error">
            <AlertCircle size={22} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <h2>{t(browseErrorKey)}</h2>
              <button type="button" className="btn btn-secondary" onClick={() => loadBrowse()}>
                {t('materials.retry')}
              </button>
            </div>
          </div>
          )}

          {!activeLoading && activeView === 'mine' && myErrorKey && (
          <div className="materials-state materials-state-error">
            <AlertCircle size={22} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <h2>{t(myErrorKey)}</h2>
              <button type="button" className="btn btn-secondary" onClick={loadMyMaterials}>
                {t('materials.retry')}
              </button>
            </div>
          </div>
          )}

          {!activeLoading && activeView === 'browse' && !browseErrorKey && browseMaterials.length === 0 && (
          <div className="materials-state materials-empty">
            <BookOpen size={28} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <h2>{t('materials.browseEmptyTitle')}</h2>
              <p>{t('materials.browseEmptyText')}</p>
            </div>
          </div>
          )}

          {!activeLoading && activeView === 'mine' && !myErrorKey && myMaterials.length === 0 && (
          <div className="materials-state materials-empty">
            <FolderOpen size={28} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <h2>{t('materials.myEmptyTitle')}</h2>
              <p>{t('materials.myEmptyText')}</p>
            </div>
          </div>
          )}

          {!activeLoading && activeView === 'browse' && browseMaterials.length > 0
            && renderMaterialCards(browseMaterials, false)}

          {!activeLoading && activeView === 'mine' && myMaterials.length > 0
            && renderMaterialCards(myMaterials, true)}

          {activeView === 'browse' && !browseLoading && !browseErrorKey && hasMore && (
          <div className="materials-pagination">
            {paginationErrorKey && (
              <p className="materials-pagination-error" role="status">
                {t(paginationErrorKey)}
              </p>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadMoreBrowse}
              disabled={paginationLoading || !browseCursor}
            >
              {paginationLoading && (
                <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
              )}
              {paginationLoading ? t('materials.loadingMore') : t('materials.loadMore')}
            </button>
          </div>
          )}
        </div>

        <div
          id={`materials-panel-${activeView === 'browse' ? 'mine' : 'browse'}`}
          role="tabpanel"
          aria-labelledby={`materials-tab-${activeView === 'browse' ? 'mine' : 'browse'}`}
          hidden
        />

        {materialForm && (
          <MaterialForm
            key={`${materialForm.mode}:${materialForm.material?.id || 'new'}`}
            mode={materialForm.mode}
            material={materialForm.material}
            defaultUniversityId={profile.university_id || profile.university?.id || ''}
            universities={universities}
            professors={professors}
            lang={lang}
            t={t}
            busy={formBusy}
            operationErrorKey={formErrorKey}
            returnFocusRef={formReturnFocusRef}
            fallbackFocusRef={myUploadsTabRef}
            onSubmit={handleMaterialFormSubmit}
            onClose={closeMaterialForm}
          />
        )}

        {deleteTarget && (
          <DeleteMaterialDialog
            material={deleteTarget}
            t={t}
            busy={deleteBusy}
            errorKey={deleteErrorKey}
            returnFocusRef={deleteReturnFocusRef}
            fallbackFocusRef={myUploadsTabRef}
            onConfirm={handleConfirmDelete}
            onClose={closeDeleteDialog}
          />
        )}
      </div>
    </AppShell>
  );
}
