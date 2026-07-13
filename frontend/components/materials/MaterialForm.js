'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  FileText,
  Loader2,
  Save,
  Upload,
  X,
} from 'lucide-react';
import {
  formatFileSize,
  MATERIAL_FILE_ACCEPT,
  MATERIAL_TYPES,
  normalizeRelation,
  shouldPreserveOriginalProfessor,
  unicodeCodePointLength,
  validateMaterialFormValues,
} from '@/app/materials/materialsUtils';

function initialFormValues(mode, material, defaultUniversityId) {
  return {
    file: null,
    title: mode === 'edit' ? (material?.title || '') : '',
    description: mode === 'edit' ? (material?.description || '') : '',
    courseName: mode === 'edit' ? (material?.course_name || '') : '',
    universityId: String(
      mode === 'edit'
        ? (material?.university_id || '')
        : (defaultUniversityId || '')
    ),
    professorId: String(mode === 'edit' ? (material?.professor_id || '') : ''),
    materialType: mode === 'edit' ? (material?.material_type || '') : '',
  };
}

function focusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

export default function MaterialForm({
  mode = 'create',
  material = null,
  defaultUniversityId = '',
  universities,
  professors,
  lang,
  t,
  busy,
  operationErrorKey,
  returnFocusRef,
  fallbackFocusRef,
  onSubmit,
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const titleRef = useRef(null);
  const fieldRefs = useRef({});
  const restoreTargetRef = useRef(returnFocusRef?.current || null);
  const [values, setValues] = useState(() => (
    initialFormValues(mode, material, defaultUniversityId)
  ));
  const [errors, setErrors] = useState({});
  const [relationshipTouched, setRelationshipTouched] = useState({
    university: false,
    professor: false,
  });
  const isEdit = mode === 'edit';
  const originalProfessorId = isEdit ? (material?.professor_id ?? null) : null;
  const originalProfessor = normalizeRelation(material?.professor);

  const availableProfessors = useMemo(() => {
    if (!values.universityId) return [];
    return professors.filter(
      (professor) => String(professor.university_id) === values.universityId
    );
  }, [professors, values.universityId]);
  const existingProfessorIsListed = originalProfessorId !== null
    && availableProfessors.some(
      (professor) => String(professor.id) === String(originalProfessorId)
    );
  const showExistingProfessorFallback = isEdit
    && values.professorId
    && String(values.professorId) === String(originalProfessorId)
    && !existingProfessorIsListed;

  useEffect(() => {
    if (isEdit || !values.professorId) return;
    const professorIsCompatible = availableProfessors.some(
      (professor) => String(professor.id) === values.professorId
    );
    if (!professorIsCompatible) {
      setValues((current) => ({ ...current, professorId: '' }));
      setErrors((current) => ({ ...current, professorId: undefined }));
    }
  }, [availableProfessors, isEdit, values.professorId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      const initialTarget = isEdit ? titleRef.current : fileRef.current;
      (initialTarget || dialogRef.current)?.focus();
    });

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
  }, [fallbackFocusRef, isEdit]);

  const updateField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleUniversityChange = (event) => {
    const universityId = event.target.value;
    setRelationshipTouched((current) => ({
      ...current,
      university: true,
      professor: true,
    }));
    setValues((current) => ({ ...current, universityId, professorId: '' }));
    setErrors((current) => ({
      ...current,
      universityId: undefined,
      professorId: undefined,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (busy) return;

    const preserveProfessorId = shouldPreserveOriginalProfessor({
      mode,
      universityTouched: relationshipTouched.university,
      professorId: values.professorId,
      originalProfessorId,
    }) ? originalProfessorId : null;
    const validation = validateMaterialFormValues(values, {
      mode,
      universities,
      professors,
      preserveProfessorId,
    });
    setErrors(validation.errors);

    if (!validation.isValid) {
      const fieldOrder = [
        'file',
        'title',
        'description',
        'courseName',
        'universityId',
        'professorId',
        'materialType',
      ];
      const firstInvalidField = fieldOrder.find((field) => validation.errors[field]);
      window.requestAnimationFrame(() => fieldRefs.current[firstInvalidField]?.focus());
      return;
    }

    onSubmit(validation.values, relationshipTouched);
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (!busy) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;

    const elements = focusableElements(dialogRef.current);
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

  const errorMessage = (field) => errors[field] && (
    <span id={`${titleId}-${field}-error`} className="material-form-field-error" role="alert">
      <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
      {t(errors[field])}
    </span>
  );
  const describedBy = (field, hintId = '') => [
    hintId,
    errors[field] ? `${titleId}-${field}-error` : '',
  ].filter(Boolean).join(' ') || undefined;
  const selectedFileSize = values.file && formatFileSize(values.file.size, lang, {
    bytes: t('materials.bytesUnit'),
    kilobytes: t('materials.kilobytesUnit'),
    megabytes: t('materials.megabytesUnit'),
    unknown: t('materials.unknownValue'),
  });

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
        className="material-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="material-modal-head">
          <div>
            <h2 id={titleId}>
              {t(isEdit ? 'materials.editFormTitle' : 'materials.uploadFormTitle')}
            </h2>
            <p id={descriptionId}>
              {t(isEdit ? 'materials.editFormSubtitle' : 'materials.uploadFormSubtitle')}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            onClick={onClose}
            disabled={busy}
            aria-label={t('materials.closeForm')}
            title={t('materials.closeForm')}
          >
            <X size={19} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <form className="material-form" onSubmit={handleSubmit} noValidate>
          {isEdit ? (
            <div className="material-form-file-summary material-form-wide">
              <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
              <div>
                <strong>{t('materials.existingFileLabel')}</strong>
                <span>{material?.file_name || t('materials.fileNameFallback')}</span>
                <small>{t('materials.fileImmutableHint')}</small>
              </div>
            </div>
          ) : (
            <div className="material-form-field material-form-wide">
              <label htmlFor={`${titleId}-file`}>{t('materials.uploadFileLabel')}</label>
              <input
                ref={(node) => {
                  fileRef.current = node;
                  fieldRefs.current.file = node;
                }}
                id={`${titleId}-file`}
                type="file"
                accept={MATERIAL_FILE_ACCEPT}
                onChange={(event) => updateField('file', event.target.files?.[0] || null)}
                disabled={busy}
                aria-invalid={Boolean(errors.file)}
                aria-describedby={describedBy('file', `${titleId}-file-hint`)}
                required
              />
              <small id={`${titleId}-file-hint`} className="material-form-hint">
                {t('materials.uploadFileHint')}
              </small>
              {values.file && (
                <span className="material-selected-file">
                  <FileText size={15} strokeWidth={1.75} aria-hidden="true" />
                  {values.file.name} / {selectedFileSize}
                </span>
              )}
              {errorMessage('file')}
            </div>
          )}

          <div className="material-form-field material-form-wide">
            <label htmlFor={`${titleId}-title`}>{t('materials.formTitleLabel')}</label>
            <input
              ref={(node) => {
                titleRef.current = node;
                fieldRefs.current.title = node;
              }}
              id={`${titleId}-title`}
              value={values.title}
              onChange={(event) => updateField('title', event.target.value)}
              disabled={busy}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={describedBy('title')}
              required
            />
            {errorMessage('title')}
          </div>

          <div className="material-form-field material-form-wide">
            <label htmlFor={`${titleId}-description`}>
              {t('materials.formDescriptionLabel')} <span>{t('materials.optionalLabel')}</span>
            </label>
            <textarea
              ref={(node) => { fieldRefs.current.description = node; }}
              id={`${titleId}-description`}
              value={values.description}
              onChange={(event) => updateField('description', event.target.value)}
              rows={4}
              disabled={busy}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describedBy('description')}
            />
            <small className="material-form-counter">
              {unicodeCodePointLength(values.description)} / 2000
            </small>
            {errorMessage('description')}
          </div>

          <div className="material-form-field">
            <label htmlFor={`${titleId}-course`}>{t('materials.courseLabel')}</label>
            <input
              ref={(node) => { fieldRefs.current.courseName = node; }}
              id={`${titleId}-course`}
              value={values.courseName}
              onChange={(event) => updateField('courseName', event.target.value)}
              disabled={busy}
              aria-invalid={Boolean(errors.courseName)}
              aria-describedby={describedBy('courseName')}
              required
            />
            {errorMessage('courseName')}
          </div>

          <div className="material-form-field">
            <label htmlFor={`${titleId}-university`}>{t('materials.universityLabel')}</label>
            <select
              ref={(node) => { fieldRefs.current.universityId = node; }}
              id={`${titleId}-university`}
              value={values.universityId}
              onChange={handleUniversityChange}
              disabled={busy}
              aria-invalid={Boolean(errors.universityId)}
              aria-describedby={describedBy('universityId')}
              required
            >
              <option value="">{t('materials.selectUniversity')}</option>
              {universities.map((university) => (
                <option value={String(university.id)} key={university.id}>
                  {university.short_name || university.name}
                </option>
              ))}
            </select>
            {errorMessage('universityId')}
          </div>

          <div className="material-form-field">
            <label htmlFor={`${titleId}-professor`}>
              {t('materials.professorLabel')} <span>{t('materials.optionalLabel')}</span>
            </label>
            <select
              ref={(node) => { fieldRefs.current.professorId = node; }}
              id={`${titleId}-professor`}
              value={values.professorId}
              onChange={(event) => {
                setRelationshipTouched((current) => ({ ...current, professor: true }));
                updateField('professorId', event.target.value);
              }}
              disabled={busy || !values.universityId}
              aria-invalid={Boolean(errors.professorId)}
              aria-describedby={describedBy('professorId')}
            >
              <option value="">{t('materials.noProfessor')}</option>
              {showExistingProfessorFallback && (
                <option value={String(originalProfessorId)}>
                  {originalProfessor?.full_name || t('materials.existingProfessorFallback')}
                </option>
              )}
              {availableProfessors.map((professor) => (
                <option value={String(professor.id)} key={professor.id}>
                  {professor.full_name}
                </option>
              ))}
            </select>
            {errorMessage('professorId')}
          </div>

          <div className="material-form-field">
            <label htmlFor={`${titleId}-type`}>{t('materials.materialTypeLabel')}</label>
            <select
              ref={(node) => { fieldRefs.current.materialType = node; }}
              id={`${titleId}-type`}
              value={values.materialType}
              onChange={(event) => updateField('materialType', event.target.value)}
              disabled={busy}
              aria-invalid={Boolean(errors.materialType)}
              aria-describedby={describedBy('materialType')}
              required
            >
              <option value="">{t('materials.selectMaterialType')}</option>
              {MATERIAL_TYPES.map((type) => (
                <option value={type.value} key={type.value}>{t(type.labelKey)}</option>
              ))}
            </select>
            {errorMessage('materialType')}
          </div>

          {operationErrorKey && (
            <div className="material-form-operation-error material-form-wide" role="alert">
              <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
              {t(operationErrorKey)}
            </div>
          )}

          <div className="material-modal-actions material-form-wide">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              {t('materials.cancelForm')}
            </button>
            <button type="submit" className="btn btn-red" disabled={busy}>
              {busy ? (
                <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
              ) : isEdit ? (
                <Save size={18} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
              )}
              {t(busy
                ? (isEdit ? 'materials.savingMetadata' : 'materials.uploadingMaterial')
                : (isEdit ? 'materials.saveMetadata' : 'materials.submitUpload'))}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
