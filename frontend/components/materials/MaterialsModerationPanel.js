'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  Download,
  Eye,
  FileText,
  GraduationCap,
  HardDrive,
  Loader2,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  MATERIAL_PAGE_SIZE,
  formatFileSize,
  formatMaterialDate,
  getMaterialTypeLabelKey,
  normalizeRelation,
  safeDisplayText,
} from '@/app/materials/materialsUtils';
import styles from './MaterialsModerationPanel.module.css';

const PENDING_MATERIAL_SELECT = `
  id,
  uploader_id,
  university_id,
  professor_id,
  title,
  description,
  course_name,
  file_path,
  file_name,
  mime_type,
  file_size,
  material_type,
  status,
  created_at,
  uploader:profiles!uploader_id(id, first_name, last_name),
  university:universities!university_id(id, name, short_name),
  professor:professors!professor_id(id, full_name)
`;

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'iframe',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function logModerationDiagnostic(context, error) {
  console.error('[Admin materials] request failed', {
    context,
    code: error?.code || null,
    status: error?.status || null,
  });
}

function getCursor(rows) {
  const lastRow = rows.at(-1);
  if (!lastRow?.created_at || lastRow.id === null || lastRow.id === undefined) {
    return null;
  }

  return {
    created_at: lastRow.created_at,
    id: lastRow.id,
  };
}

function buildCursorFilter(cursor) {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

function appendUniqueMaterials(current, incoming) {
  const knownIds = new Set(current.map((material) => String(material.id)));
  const uniqueIncoming = incoming.filter((material) => {
    const key = String(material.id);
    if (knownIds.has(key)) return false;
    knownIds.add(key);
    return true;
  });

  return [...current, ...uniqueIncoming];
}

function getPreviewKind(mimeType) {
  if (IMAGE_MIME_TYPES.has(mimeType)) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'unsupported';
}

function materialDomId(materialId) {
  return `admin-material-${String(materialId).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function moderationOperationsMatch(left, right) {
  return Boolean(
    left
    && right
    && left.token === right.token
    && left.materialId === right.materialId
    && left.decision === right.decision
    && left.confirmationGeneration === right.confirmationGeneration
  );
}

function useDialogAccessibility({
  open,
  dialogRef,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef,
  isCloseBlocked,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const dialog = dialogRef.current;
    if (!dialog?.isConnected) return undefined;

    const returnTarget = returnFocusRef.current;
    const previousBodyOverflow = document.body.style.overflow;

    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialog.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter((element) => (
        !element.hasAttribute('disabled')
        && element.getAttribute('aria-hidden') !== 'true'
        && element.getClientRects().length > 0
      ));

      if (focusable.length === 0) {
        event.preventDefault();
        initialFocusRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      const activeIndex = focusable.indexOf(activeElement);

      if (!dialog.contains(activeElement) || activeIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleCancel = (event) => {
      event.preventDefault();
      if (!isCloseBlocked()) onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      dialog.removeEventListener('cancel', handleCancel);
      document.body.style.overflow = previousBodyOverflow;
      if (dialog.open) dialog.close();
      if (returnTarget?.isConnected && !returnTarget.disabled) {
        returnTarget.focus();
      } else {
        fallbackFocusRef.current?.focus();
      }
    };
  }, [
    dialogRef,
    fallbackFocusRef,
    initialFocusRef,
    isCloseBlocked,
    onClose,
    open,
    returnFocusRef,
  ]);
}

function PreviewDialog({
  preview,
  t,
  signing,
  downloading,
  downloadError,
  dialogRef,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef,
  isItemBusy,
  onClose,
  onRetry,
  onDownload,
}) {
  const busy = signing || downloading;
  const title = safeDisplayText(preview.material.title, t('materials.titleFallback'));
  const materialId = preview.material.id;
  const isCloseBlocked = useCallback(
    () => isItemBusy(materialId),
    [isItemBusy, materialId]
  );
  const requestClose = useCallback(() => {
    if (!isCloseBlocked()) onClose();
  }, [isCloseBlocked, onClose]);

  useDialogAccessibility({
    open: true,
    dialogRef,
    initialFocusRef,
    returnFocusRef,
    fallbackFocusRef,
    isCloseBlocked,
    onClose: requestClose,
  });

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) requestClose();
  };

  return (
    <dialog
      className={styles.dialogBackdrop}
      onMouseDown={handleBackdropMouseDown}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-material-preview-title"
      aria-describedby="admin-material-preview-description"
      aria-busy={busy}
    >
      <section
        ref={initialFocusRef}
        className={styles.previewDialog}
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>{t('admin.materialPreviewEyebrow')}</p>
            <h2 id="admin-material-preview-title">{title}</h2>
            <p id="admin-material-preview-description">
              {t('admin.materialPreviewDescription')}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-quiet btn-icon"
            onClick={requestClose}
            disabled={busy}
            aria-label={t('admin.closeMaterialPreview')}
            title={t('admin.closeMaterialPreview')}
          >
            <X size={19} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.previewBody}>
          {preview.kind === 'unsupported' ? (
            <div className={styles.unsupportedPreview}>
              <FileText size={32} strokeWidth={1.7} aria-hidden="true" />
              <h3>{t('admin.materialPreviewUnavailableTitle')}</h3>
              <p>{t('admin.materialPreviewUnavailableText')}</p>
            </div>
          ) : signing ? (
            <div className={styles.previewLoading} role="status">
              <Loader2 size={24} strokeWidth={1.75} className="spin" aria-hidden="true" />
              <span>{t('admin.materialPreviewLoading')}</span>
            </div>
          ) : preview.errorKey ? (
            <div className={styles.previewError} role="alert">
              <AlertCircle size={22} strokeWidth={1.75} aria-hidden="true" />
              <p>{t(preview.errorKey)}</p>
              <button type="button" className="btn btn-secondary" onClick={onRetry}>
                <RefreshCw size={17} strokeWidth={1.75} aria-hidden="true" />
                {t('admin.retryMaterialPreview')}
              </button>
            </div>
          ) : preview.signedUrl && preview.kind === 'image' ? (
            <img
              className={styles.imagePreview}
              src={preview.signedUrl}
              alt={t('admin.materialPreviewImageAlt').replace('{title}', title)}
            />
          ) : preview.signedUrl && preview.kind === 'pdf' ? (
            <iframe
              className={styles.pdfPreview}
              src={preview.signedUrl}
              title={t('admin.materialPreviewPdfTitle').replace('{title}', title)}
              referrerPolicy="no-referrer"
              sandbox=""
            />
          ) : null}
        </div>

        <footer className={styles.dialogActions}>
          {downloadError && (
            <p className={styles.inlineError} role="alert">
              {t('materials.downloadError')}
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onDownload(preview.material)}
            disabled={busy}
            aria-label={t('materials.downloadNamed').replace('{title}', title)}
          >
            {downloading ? (
              <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
            ) : (
              <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
            {downloading ? t('materials.downloading') : t('materials.download')}
          </button>
          <button type="button" className="btn btn-quiet" onClick={requestClose} disabled={busy}>
            {t('admin.closeMaterialPreview')}
          </button>
        </footer>
      </section>
    </dialog>
  );
}

function ConfirmationDialog({
  confirmation,
  t,
  busy,
  errorKey,
  dialogRef,
  initialFocusRef,
  returnFocusRef,
  fallbackFocusRef,
  isOperationActive,
  onClose,
  onConfirm,
}) {
  const approving = confirmation.decision === 'approved';
  const title = safeDisplayText(
    confirmation.material.title,
    t('materials.titleFallback')
  );
  const materialId = confirmation.material.id;
  const decision = confirmation.decision;
  const generation = confirmation.generation;
  const isCloseBlocked = useCallback(
    () => isOperationActive(materialId, decision, generation),
    [decision, generation, isOperationActive, materialId]
  );
  const requestClose = useCallback(() => {
    if (!isCloseBlocked()) onClose();
  }, [isCloseBlocked, onClose]);

  useDialogAccessibility({
    open: true,
    dialogRef,
    initialFocusRef,
    returnFocusRef,
    fallbackFocusRef,
    isCloseBlocked,
    onClose: requestClose,
  });

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) requestClose();
  };

  return (
    <dialog
      className={styles.dialogBackdrop}
      onMouseDown={handleBackdropMouseDown}
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="admin-material-confirm-title"
      aria-describedby="admin-material-confirm-description"
      aria-busy={busy}
    >
      <section
        ref={initialFocusRef}
        className={styles.confirmDialog}
        tabIndex={-1}
      >
        <div className={approving ? styles.confirmMarkApprove : styles.confirmMarkReject}>
          {approving ? (
            <Check size={24} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <X size={24} strokeWidth={1.8} aria-hidden="true" />
          )}
        </div>
        <h2 id="admin-material-confirm-title">
          {t(approving ? 'admin.approveMaterialConfirmTitle' : 'admin.rejectMaterialConfirmTitle')}
        </h2>
        <p id="admin-material-confirm-description">
          {t(approving ? 'admin.approveMaterialConfirmText' : 'admin.rejectMaterialConfirmText')
            .replace('{title}', title)}
        </p>

        {errorKey && (
          <p className={styles.confirmError} role="alert">
            {t(errorKey)}
          </p>
        )}

        <div className={styles.confirmActions}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={requestClose}
            disabled={busy}
          >
            {t('admin.cancelMaterialModeration')}
          </button>
          <button
            type="button"
            className={`btn ${approving ? 'btn-primary' : 'btn-danger'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
            ) : approving ? (
              <Check size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
            {busy
              ? t('admin.moderatingMaterial')
              : t(approving ? 'admin.approveMaterial' : 'admin.rejectMaterial')}
          </button>
        </div>
      </section>
    </dialog>
  );
}

export default function MaterialsModerationPanel({ isAdmin, lang, t }) {
  const [materials, setMaterials] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listErrorKey, setListErrorKey] = useState('');
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [paginationErrorKey, setPaginationErrorKey] = useState('');
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [signingIds, setSigningIds] = useState(() => new Set());
  const [downloadingIds, setDownloadingIds] = useState(() => new Set());
  const [downloadErrorIds, setDownloadErrorIds] = useState(() => new Set());
  const [moderatingIds, setModeratingIds] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmationState] = useState(null);
  const [moderationErrorKey, setModerationErrorKey] = useState('');
  const [notice, setNotice] = useState(null);

  const mountedRef = useRef(false);
  const listRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const paginationBusyRef = useRef(false);
  const itemBusyRef = useRef(new Set());
  const signingRef = useRef(new Set());
  const downloadingRef = useRef(new Set());
  const moderatingRef = useRef(new Set());
  const moderationTokenRef = useRef(0);
  const moderationOwnerRef = useRef(new Map());
  const activeModerationRef = useRef(null);
  const confirmationGenerationRef = useRef(0);
  const confirmationRef = useRef(null);
  const previewDialogRef = useRef(null);
  const previewInitialFocusRef = useRef(null);
  const previewReturnFocusRef = useRef(null);
  const confirmationDialogRef = useRef(null);
  const confirmationInitialFocusRef = useRef(null);
  const confirmationReturnFocusRef = useRef(null);
  const panelFocusRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listRequestRef.current += 1;
      previewRequestRef.current += 1;
      moderationTokenRef.current += 1;
      paginationBusyRef.current = false;
      itemBusyRef.current.clear();
      signingRef.current.clear();
      downloadingRef.current.clear();
      moderatingRef.current.clear();
      moderationOwnerRef.current.clear();
      activeModerationRef.current = null;
      confirmationGenerationRef.current += 1;
      confirmationRef.current = null;
    };
  }, []);

  const startItemOperation = useCallback((materialId, operationRef, setOperationIds) => {
    if (!mountedRef.current) return false;
    const key = String(materialId);
    if (itemBusyRef.current.has(key)) return false;

    itemBusyRef.current.add(key);
    operationRef.current.add(key);
    setOperationIds(new Set(operationRef.current));
    return true;
  }, []);

  const finishItemOperation = useCallback((materialId, operationRef, setOperationIds) => {
    const key = String(materialId);
    itemBusyRef.current.delete(key);
    operationRef.current.delete(key);
    if (mountedRef.current) setOperationIds(new Set(operationRef.current));
  }, []);

  const isItemBusy = useCallback(
    (materialId) => itemBusyRef.current.has(String(materialId)),
    []
  );

  const setActiveConfirmation = useCallback((nextConfirmation) => {
    confirmationRef.current = nextConfirmation;
    setConfirmationState(nextConfirmation);
  }, []);

  const closePreview = useCallback(() => {
    previewRequestRef.current += 1;
    setPreview(null);
  }, []);

  const isConfirmationOperationActive = useCallback((materialId, decision, generation) => {
    const operation = activeModerationRef.current;
    const owner = operation
      ? moderationOwnerRef.current.get(operation.materialId)
      : null;

    return moderationOperationsMatch(owner, operation)
      && operation.materialId === String(materialId)
      && operation.decision === decision
      && operation.confirmationGeneration === generation;
  }, []);

  const clearConfirmation = useCallback(() => {
    confirmationGenerationRef.current += 1;
    setActiveConfirmation(null);
    setModerationErrorKey('');
  }, [setActiveConfirmation]);

  const closeConfirmation = useCallback(() => {
    const currentConfirmation = confirmationRef.current;
    if (!currentConfirmation) return true;
    if (isConfirmationOperationActive(
      currentConfirmation.material.id,
      currentConfirmation.decision,
      currentConfirmation.generation
    )) {
      return false;
    }

    clearConfirmation();
    return true;
  }, [clearConfirmation, isConfirmationOperationActive]);

  const startModerationOperation = useCallback((materialId, decision, generation) => {
    if (!mountedRef.current) return null;
    const key = String(materialId);
    if (itemBusyRef.current.has(key)) return null;

    const token = moderationTokenRef.current + 1;
    const operation = {
      token,
      materialId: key,
      decision,
      confirmationGeneration: generation,
    };

    moderationTokenRef.current = token;
    moderationOwnerRef.current.set(key, operation);
    activeModerationRef.current = operation;
    itemBusyRef.current.add(key);
    moderatingRef.current.add(key);
    setModeratingIds(new Set(moderatingRef.current));
    return operation;
  }, []);

  const ownsModerationOperation = useCallback((operation) => {
    if (!mountedRef.current || !operation) return false;
    return moderationOperationsMatch(
      moderationOwnerRef.current.get(operation.materialId),
      operation
    );
  }, []);

  const ownsModerationDialog = useCallback((operation) => {
    const currentConfirmation = confirmationRef.current;
    return ownsModerationOperation(operation)
      && moderationOperationsMatch(activeModerationRef.current, operation)
      && currentConfirmation
      && String(currentConfirmation.material.id) === operation.materialId
      && currentConfirmation.decision === operation.decision
      && currentConfirmation.generation === operation.confirmationGeneration;
  }, [ownsModerationOperation]);

  const finishModerationOperation = useCallback((operation) => {
    if (!operation) return;
    const key = operation.materialId;
    if (!moderationOperationsMatch(moderationOwnerRef.current.get(key), operation)) return;

    moderationOwnerRef.current.delete(key);
    if (moderationOperationsMatch(activeModerationRef.current, operation)) {
      activeModerationRef.current = null;
    }
    itemBusyRef.current.delete(key);
    moderatingRef.current.delete(key);
    if (mountedRef.current) setModeratingIds(new Set(moderatingRef.current));
  }, []);

  const invalidatePendingListRequests = useCallback(() => {
    listRequestRef.current += 1;
    paginationBusyRef.current = false;
    if (mountedRef.current) {
      setListLoading(false);
      setRefreshing(false);
      setPaginationLoading(false);
      setListErrorKey('');
      setPaginationErrorKey('');
    }
  }, []);

  const loadPendingMaterials = useCallback(async ({ nextCursor = null, mode = 'initial' } = {}) => {
    if (!mountedRef.current || !isAdmin) return false;
    const isPagination = Boolean(nextCursor);
    if (isPagination && paginationBusyRef.current) return false;

    const requestId = listRequestRef.current + 1;
    listRequestRef.current = requestId;

    if (isPagination) {
      paginationBusyRef.current = true;
      setPaginationLoading(true);
      setPaginationErrorKey('');
    } else {
      paginationBusyRef.current = false;
      setPaginationLoading(false);
      setPaginationErrorKey('');
      setListErrorKey('');
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setListLoading(true);
      }
    }

    try {
      let query = supabase
        .from('materials')
        .select(PENDING_MATERIAL_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MATERIAL_PAGE_SIZE);

      if (nextCursor) query = query.or(buildCursorFilter(nextCursor));

      const { data, error } = await query;
      if (!mountedRef.current || requestId !== listRequestRef.current) return false;

      if (error) {
        logModerationDiagnostic(isPagination ? 'pending-page' : 'pending-list', error);
        if (isPagination) {
          setPaginationErrorKey('admin.materialsPaginationError');
        } else {
          if (mode !== 'refresh') {
            setMaterials([]);
            setCursor(null);
            setHasMore(false);
          }
          setListErrorKey('admin.materialsLoadError');
        }
        return false;
      }

      const rows = data || [];
      const nextPageCursor = getCursor(rows);
      if (isPagination) {
        setMaterials((current) => appendUniqueMaterials(current, rows));
      } else {
        setMaterials(rows);
      }
      setCursor(nextPageCursor);
      setHasMore(Boolean(nextPageCursor) && rows.length === MATERIAL_PAGE_SIZE);
      return true;
    } catch (error) {
      if (!mountedRef.current || requestId !== listRequestRef.current) return false;
      logModerationDiagnostic(isPagination ? 'pending-page' : 'pending-list', error);
      if (isPagination) {
        setPaginationErrorKey('admin.materialsPaginationError');
      } else {
        if (mode !== 'refresh') {
          setMaterials([]);
          setCursor(null);
          setHasMore(false);
        }
        setListErrorKey('admin.materialsLoadError');
      }
      return false;
    } finally {
      if (requestId === listRequestRef.current) {
        if (isPagination) paginationBusyRef.current = false;
        if (mountedRef.current) {
          setPaginationLoading(false);
          setListLoading(false);
          setRefreshing(false);
        }
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) loadPendingMaterials();
  }, [isAdmin, loadPendingMaterials]);

  const handleExplicitRefresh = useCallback((mode = 'refresh') => {
    closePreview();
    return loadPendingMaterials({ mode });
  }, [closePreview, loadPendingMaterials]);

  const openPreview = useCallback(async (material, trigger = null) => {
    const materialKey = String(material.id);
    if (itemBusyRef.current.has(materialKey)) return;
    if (confirmationRef.current && !closeConfirmation()) return;
    if (trigger) previewReturnFocusRef.current = trigger;

    setModerationErrorKey('');
    const kind = getPreviewKind(material.mime_type);
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreview({ generation: requestId, material, kind, signedUrl: '', errorKey: '' });
    setDownloadErrorIds((current) => {
      const next = new Set(current);
      next.delete(materialKey);
      return next;
    });

    if (kind === 'unsupported') return;
    if (!safeDisplayText(material.file_path)) {
      setPreview({
        generation: requestId,
        material,
        kind,
        signedUrl: '',
        errorKey: 'admin.materialPreviewError',
      });
      return;
    }

    if (!startItemOperation(material.id, signingRef, setSigningIds)) return;

    try {
      const { data, error } = await supabase.storage
        .from('materials')
        .createSignedUrl(material.file_path, 300);

      if (error || !data?.signedUrl) {
        throw error || new Error('signed_url_unavailable');
      }
      if (!mountedRef.current || requestId !== previewRequestRef.current) return;

      setPreview((current) => (
        current
          && current.generation === requestId
          && String(current.material.id) === materialKey
          ? { ...current, signedUrl: data.signedUrl, errorKey: '' }
          : current
      ));
    } catch (error) {
      logModerationDiagnostic('preview', error);
      if (mountedRef.current && requestId === previewRequestRef.current) {
        setPreview((current) => (
          current
            && current.generation === requestId
            && String(current.material.id) === materialKey
            ? { ...current, signedUrl: '', errorKey: 'admin.materialPreviewError' }
            : current
        ));
      }
    } finally {
      finishItemOperation(material.id, signingRef, setSigningIds);
    }
  }, [closeConfirmation, finishItemOperation, startItemOperation]);

  const handleDownload = useCallback(async (material) => {
    const materialKey = String(material.id);
    if (!startItemOperation(material.id, downloadingRef, setDownloadingIds)) return;

    setDownloadErrorIds((current) => {
      const next = new Set(current);
      next.delete(materialKey);
      return next;
    });

    const filePath = safeDisplayText(material.file_path);
    const fileName = safeDisplayText(material.file_name);
    let downloadLink = null;

    try {
      if (!filePath || !fileName) throw new Error('material_file_unavailable');

      const { data, error } = await supabase.storage
        .from('materials')
        .createSignedUrl(filePath, 300, { download: fileName });

      if (error || !data?.signedUrl) {
        throw error || new Error('signed_url_unavailable');
      }
      if (!mountedRef.current) return;

      downloadLink = document.createElement('a');
      downloadLink.href = data.signedUrl;
      downloadLink.download = fileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
    } catch (error) {
      logModerationDiagnostic('download', error);
      if (mountedRef.current) {
        setDownloadErrorIds((current) => new Set(current).add(materialKey));
        setNotice({ tone: 'error', key: 'materials.downloadError' });
      }
    } finally {
      downloadLink?.remove();
      finishItemOperation(material.id, downloadingRef, setDownloadingIds);
    }
  }, [finishItemOperation, startItemOperation]);

  const openConfirmation = useCallback((material, decision, trigger) => {
    const materialKey = String(material.id);
    if (!['approved', 'rejected'].includes(decision)) return;
    if (itemBusyRef.current.has(materialKey)) return;

    const currentConfirmation = confirmationRef.current;
    if (currentConfirmation && isConfirmationOperationActive(
      currentConfirmation.material.id,
      currentConfirmation.decision,
      currentConfirmation.generation
    )) {
      return;
    }

    confirmationReturnFocusRef.current = trigger;
    closePreview();
    setModerationErrorKey('');
    const generation = confirmationGenerationRef.current + 1;
    confirmationGenerationRef.current = generation;
    setActiveConfirmation({ generation, material, decision });
  }, [closePreview, isConfirmationOperationActive, setActiveConfirmation]);

  const handleModeration = useCallback(async () => {
    const currentConfirmation = confirmationRef.current;
    if (!currentConfirmation) return;
    const { material, decision, generation } = currentConfirmation;
    const materialKey = String(material.id);
    if (!['approved', 'rejected'].includes(decision)) return;

    const operation = startModerationOperation(material.id, decision, generation);
    if (!operation) return;

    if (!ownsModerationDialog(operation)) {
      finishModerationOperation(operation);
      return;
    }

    setModerationErrorKey('');
    let failureContext = 'status-update';
    let failureKey = 'admin.materialModerationError';

    try {
      const { data, error } = await supabase
        .from('materials')
        .update({ status: decision })
        .eq('id', material.id)
        .eq('status', 'pending')
        .select('id, status');

      if (!ownsModerationOperation(operation)) return;
      if (error) {
        logModerationDiagnostic('status-update', error);
        if (ownsModerationDialog(operation)) {
          setModerationErrorKey('admin.materialModerationError');
          setNotice({ tone: 'error', key: 'admin.materialModerationError' });
        }
        return;
      }

      const rows = data || [];
      if (
        rows.length === 1
        && String(rows[0].id) === materialKey
        && rows[0].status === decision
      ) {
        invalidatePendingListRequests();
        setMaterials((current) => current.filter((item) => String(item.id) !== materialKey));
        if (ownsModerationDialog(operation)) {
          clearConfirmation();
          setNotice({
            tone: 'success',
            key: decision === 'approved'
              ? 'admin.materialApprovedSuccess'
              : 'admin.materialRejectedSuccess',
          });
        }
        return;
      }

      failureContext = 'status-reconciliation';
      failureKey = 'admin.materialReconciliationError';
      const {
        data: reconciledMaterial,
        error: reconciliationError,
      } = await supabase
        .from('materials')
        .select('id, status')
        .eq('id', material.id)
        .maybeSingle();

      if (!ownsModerationOperation(operation)) return;
      if (reconciliationError) {
        logModerationDiagnostic('status-reconciliation', reconciliationError);
        if (ownsModerationDialog(operation)) {
          setModerationErrorKey('admin.materialReconciliationError');
          setNotice({ tone: 'error', key: 'admin.materialReconciliationError' });
        }
        return;
      }

      if (
        reconciledMaterial
        && String(reconciledMaterial.id) !== materialKey
      ) {
        if (ownsModerationDialog(operation)) {
          setModerationErrorKey('admin.materialReconciliationError');
          setNotice({ tone: 'error', key: 'admin.materialReconciliationError' });
        }
        return;
      }

      if (reconciledMaterial?.status === 'pending') {
        if (ownsModerationDialog(operation)) {
          setModerationErrorKey('admin.materialStillPending');
          setNotice({ tone: 'error', key: 'admin.materialStillPending' });
        }
        return;
      }

      const refreshSucceeded = await loadPendingMaterials({ mode: 'refresh' });
      if (!ownsModerationOperation(operation)) return;
      if (ownsModerationDialog(operation)) {
        if (!refreshSucceeded) {
          setModerationErrorKey('admin.materialReconciliationError');
          setNotice({ tone: 'error', key: 'admin.materialReconciliationError' });
          return;
        }

        clearConfirmation();
        setNotice({ tone: 'neutral', key: 'admin.materialStatusChanged' });
      }
    } catch (error) {
      if (ownsModerationOperation(operation)) {
        logModerationDiagnostic(failureContext, error);
      }
      if (ownsModerationDialog(operation)) {
        setModerationErrorKey(failureKey);
        setNotice({ tone: 'error', key: failureKey });
      }
    } finally {
      finishModerationOperation(operation);
    }
  }, [
    clearConfirmation,
    finishModerationOperation,
    invalidatePendingListRequests,
    loadPendingMaterials,
    ownsModerationDialog,
    ownsModerationOperation,
    startModerationOperation,
  ]);

  const units = {
    bytes: t('materials.bytesUnit'),
    kilobytes: t('materials.kilobytesUnit'),
    megabytes: t('materials.megabytesUnit'),
    unknown: t('materials.unknownValue'),
  };

  return (
    <div className={styles.panel} ref={panelFocusRef} tabIndex={-1}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>{t('admin.materialsEyebrow')}</p>
          <h2>{t('admin.materialsTitle')}</h2>
          <p>{t('admin.materialsSubtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => handleExplicitRefresh('refresh')}
          disabled={listLoading || refreshing || paginationLoading}
        >
          {refreshing ? (
            <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
          {refreshing ? t('admin.materialsRefreshing') : t('admin.materialsRefresh')}
        </button>
      </header>

      <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
        {notice && (
          <div
            className={`${styles.notice} ${styles[`notice_${notice.tone}`]}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
          >
            <span>{t(notice.key)}</span>
            <button
              type="button"
              className="btn btn-quiet btn-icon"
              onClick={() => setNotice(null)}
              aria-label={t('admin.dismissMaterialNotice')}
              title={t('admin.dismissMaterialNotice')}
            >
              <X size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {listErrorKey && materials.length > 0 && (
        <div className={styles.inlineListError} role="alert">
          <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
          <span>{t(listErrorKey)}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleExplicitRefresh('refresh')}
            disabled={refreshing}
          >
            {t('admin.materialsRetry')}
          </button>
        </div>
      )}

      {listLoading ? (
        <div className={styles.state} role="status">
          <Loader2 size={24} strokeWidth={1.75} className="spin" aria-hidden="true" />
          <p>{t('admin.materialsLoading')}</p>
        </div>
      ) : listErrorKey && materials.length === 0 ? (
        <div className={`${styles.state} ${styles.errorState}`} role="alert">
          <AlertCircle size={26} strokeWidth={1.75} aria-hidden="true" />
          <h3>{t('admin.materialsLoadErrorTitle')}</h3>
          <p>{t(listErrorKey)}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleExplicitRefresh('initial')}
          >
            <RefreshCw size={17} strokeWidth={1.75} aria-hidden="true" />
            {t('admin.materialsRetry')}
          </button>
        </div>
      ) : materials.length === 0 && !hasMore ? (
        <div className={styles.state}>
          <FileText size={28} strokeWidth={1.65} aria-hidden="true" />
          <h3>{t('admin.noPendingMaterialsTitle')}</h3>
          <p>{t('admin.noPendingMaterialsText')}</p>
        </div>
      ) : (
        <div className={styles.materialList}>
          {materials.map((material) => {
            const key = String(material.id);
            const university = normalizeRelation(material.university);
            const professor = normalizeRelation(material.professor);
            const uploader = normalizeRelation(material.uploader);
            const title = safeDisplayText(material.title, t('materials.titleFallback'));
            const description = safeDisplayText(material.description);
            const uploaderName = `${safeDisplayText(uploader?.first_name)} ${safeDisplayText(uploader?.last_name)}`.trim()
              || t('admin.unknownStudent');
            const universityName = safeDisplayText(
              university?.short_name,
              safeDisplayText(university?.name, t('materials.universityFallback'))
            );
            const professorName = safeDisplayText(professor?.full_name);
            const fileName = safeDisplayText(
              material.file_name,
              t('materials.fileNameFallback')
            );
            const courseName = safeDisplayText(
              material.course_name,
              t('materials.courseFallback')
            );
            const formattedSize = formatFileSize(material.file_size, lang, units);
            const formattedDate = formatMaterialDate(
              material.created_at,
              lang,
              t('materials.unknownValue')
            );
            const itemBusy = itemBusyRef.current.has(key);
            const signing = signingIds.has(key);
            const downloading = downloadingIds.has(key);
            const moderating = moderatingIds.has(key);
            const titleId = `${materialDomId(material.id)}-title`;

            return (
              <article key={material.id} className={styles.materialCard} aria-labelledby={titleId}>
                <header className={styles.cardHeader}>
                  <div className={styles.fileMark} aria-hidden="true">
                    <FileText size={24} strokeWidth={1.7} />
                  </div>
                  <div className={styles.cardHeading}>
                    <div className={styles.badges}>
                      <span className="badge badge-neutral">
                        {t(getMaterialTypeLabelKey(material.material_type))}
                      </span>
                      <span className={styles.pendingBadge}>
                        {t('materials.statusPending')}
                      </span>
                    </div>
                    <h3 id={titleId}>{title}</h3>
                  </div>
                </header>

                {description && <p className={styles.description}>{description}</p>}

                <dl className={styles.metaGrid}>
                  <div className={styles.metaItem}>
                    <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt>{t('materials.uploadedBy')}</dt>
                      <dd>{uploaderName}</dd>
                    </div>
                  </div>
                  <div className={styles.metaItem}>
                    <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt>{t('materials.universityLabel')}</dt>
                      <dd>{universityName}</dd>
                    </div>
                  </div>
                  <div className={styles.metaItem}>
                    <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt>{t('materials.courseLabel')}</dt>
                      <dd>{courseName}</dd>
                    </div>
                  </div>
                  {professorName && (
                    <div className={styles.metaItem}>
                      <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
                      <div>
                        <dt>{t('materials.professorLabel')}</dt>
                        <dd>{professorName}</dd>
                      </div>
                    </div>
                  )}
                  <div className={styles.metaItem}>
                    <HardDrive size={16} strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt>{t('materials.fileLabel')}</dt>
                      <dd title={fileName}>{fileName}</dd>
                    </div>
                  </div>
                  <div className={styles.metaItem}>
                    <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt>{t('admin.materialSubmittedAt')}</dt>
                      <dd>{formattedDate}</dd>
                    </div>
                  </div>
                </dl>

                <footer className={styles.cardFooter}>
                  <span className={styles.fileSize}>
                    {t('materials.fileSizeLabel')}: {formattedSize}
                  </span>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={(event) => openPreview(material, event.currentTarget)}
                      disabled={itemBusy}
                      aria-label={t('admin.previewMaterialNamed').replace('{title}', title)}
                    >
                      {signing ? (
                        <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                      ) : (
                        <Eye size={17} strokeWidth={1.75} aria-hidden="true" />
                      )}
                      {t('admin.previewMaterial')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDownload(material)}
                      disabled={itemBusy}
                      aria-label={t('materials.downloadNamed').replace('{title}', title)}
                    >
                      {downloading ? (
                        <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                      ) : (
                        <Download size={17} strokeWidth={1.75} aria-hidden="true" />
                      )}
                      {downloading ? t('materials.downloading') : t('materials.download')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={(event) => openConfirmation(material, 'approved', event.currentTarget)}
                      disabled={itemBusy}
                      aria-label={t('admin.approveMaterialNamed').replace('{title}', title)}
                    >
                      {moderating ? (
                        <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                      ) : (
                        <Check size={17} strokeWidth={1.75} aria-hidden="true" />
                      )}
                      {t('admin.approveMaterial')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={(event) => openConfirmation(material, 'rejected', event.currentTarget)}
                      disabled={itemBusy}
                      aria-label={t('admin.rejectMaterialNamed').replace('{title}', title)}
                    >
                      <X size={17} strokeWidth={1.75} aria-hidden="true" />
                      {t('admin.rejectMaterial')}
                    </button>
                  </div>
                </footer>

                {downloadErrorIds.has(key) && (
                  <p className={styles.cardError} role="status">
                    {t('materials.downloadError')}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {paginationErrorKey && (
        <div className={styles.paginationError} role="alert">
          <AlertCircle size={19} strokeWidth={1.75} aria-hidden="true" />
          <span>{t(paginationErrorKey)}</span>
        </div>
      )}

      {hasMore && !listLoading && (
        <div className={styles.paginationActions}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => loadPendingMaterials({ nextCursor: cursor, mode: 'pagination' })}
            disabled={paginationLoading || refreshing || !cursor}
          >
            {paginationLoading && (
              <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
            )}
            {paginationLoading ? t('materials.loadingMore') : t('materials.loadMore')}
          </button>
        </div>
      )}

      {preview && (
        <PreviewDialog
          key={`preview-${preview.generation}`}
          preview={preview}
          t={t}
          signing={signingIds.has(String(preview.material.id))}
          downloading={downloadingIds.has(String(preview.material.id))}
          downloadError={downloadErrorIds.has(String(preview.material.id))}
          dialogRef={previewDialogRef}
          initialFocusRef={previewInitialFocusRef}
          returnFocusRef={previewReturnFocusRef}
          fallbackFocusRef={panelFocusRef}
          isItemBusy={isItemBusy}
          onClose={closePreview}
          onRetry={() => openPreview(preview.material)}
          onDownload={handleDownload}
        />
      )}

      {confirmation && (
        <ConfirmationDialog
          key={`confirmation-${confirmation.generation}`}
          confirmation={confirmation}
          t={t}
          busy={moderatingIds.has(String(confirmation.material.id))}
          errorKey={moderationErrorKey}
          dialogRef={confirmationDialogRef}
          initialFocusRef={confirmationInitialFocusRef}
          returnFocusRef={confirmationReturnFocusRef}
          fallbackFocusRef={panelFocusRef}
          isOperationActive={isConfirmationOperationActive}
          onClose={closeConfirmation}
          onConfirm={handleModeration}
        />
      )}
    </div>
  );
}
