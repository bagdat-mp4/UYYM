import {
  BookOpen,
  Building2,
  CalendarDays,
  Download,
  FileText,
  GraduationCap,
  HardDrive,
  Loader2,
  Pencil,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  formatFileSize,
  formatMaterialDate,
  getMaterialStatusLabelKey,
  getMaterialTypeLabelKey,
  normalizeRelation,
  safeDisplayText,
} from '@/app/materials/materialsUtils';

export default function MaterialCard({
  material,
  lang,
  t,
  showStatus = false,
  downloading = false,
  downloadError = false,
  actionBusy = false,
  canEdit = false,
  canDelete = false,
  onDownload,
  onEdit,
  onDelete,
}) {
  const university = normalizeRelation(material.university);
  const professor = normalizeRelation(material.professor);
  const uploader = normalizeRelation(material.uploader);
  const title = safeDisplayText(material.title, t('materials.titleFallback'));
  const description = safeDisplayText(material.description);
  const universityName = safeDisplayText(
    university?.short_name,
    safeDisplayText(university?.name, t('materials.universityFallback'))
  );
  const professorName = safeDisplayText(professor?.full_name);
  const uploaderName = `${safeDisplayText(uploader?.first_name)} ${safeDisplayText(uploader?.last_name)}`.trim();
  const fileName = safeDisplayText(material.file_name, t('materials.fileNameFallback'));
  const courseName = safeDisplayText(material.course_name, t('materials.courseFallback'));
  const formattedSize = formatFileSize(material.file_size, lang, {
    bytes: t('materials.bytesUnit'),
    kilobytes: t('materials.kilobytesUnit'),
    megabytes: t('materials.megabytesUnit'),
    unknown: t('materials.unknownValue'),
  });
  const formattedDate = formatMaterialDate(
    material.created_at,
    lang,
    t('materials.unknownValue')
  );

  return (
    <article className="material-card">
      <header className="material-card-head">
        <div className="material-file-mark" aria-hidden="true">
          <FileText size={24} strokeWidth={1.75} />
        </div>
        <div className="material-card-title">
          <div className="material-card-badges">
            <span className="badge badge-neutral">
              {t(getMaterialTypeLabelKey(material.material_type))}
            </span>
            {showStatus && (
              <span className={`material-status material-status-${material.status}`}>
                {t(getMaterialStatusLabelKey(material.status))}
              </span>
            )}
          </div>
          <h2>{title}</h2>
        </div>
      </header>

      {description && <p className="material-description">{description}</p>}

      <dl className="material-meta-grid">
        <div className="material-meta-item">
          <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <dt>{t('materials.universityLabel')}</dt>
            <dd>{universityName}</dd>
          </div>
        </div>
        <div className="material-meta-item">
          <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <dt>{t('materials.courseLabel')}</dt>
            <dd>{courseName}</dd>
          </div>
        </div>
        {professorName && (
          <div className="material-meta-item">
            <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <dt>{t('materials.professorLabel')}</dt>
              <dd>{professorName}</dd>
            </div>
          </div>
        )}
        <div className="material-meta-item">
          <HardDrive size={16} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <dt>{t('materials.fileLabel')}</dt>
            <dd title={fileName}>{fileName}</dd>
          </div>
        </div>
        <div className="material-meta-item">
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <dt>{t('materials.createdLabel')}</dt>
            <dd>{formattedDate}</dd>
          </div>
        </div>
        {uploaderName && (
          <div className="material-meta-item">
            <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <dt>{t('materials.uploadedBy')}</dt>
              <dd>{uploaderName}</dd>
            </div>
          </div>
        )}
      </dl>

      <footer className="material-card-footer">
        <span className="material-file-size">
          {t('materials.fileSizeLabel')}: {formattedSize}
        </span>
        <div className="material-card-actions">
          {canEdit && (
            <button
              type="button"
              className="btn btn-quiet material-card-action"
              onClick={(event) => onEdit(material, event.currentTarget)}
              disabled={actionBusy || downloading}
              aria-label={t('materials.editNamed').replace('{title}', title)}
            >
              <Pencil size={17} strokeWidth={1.75} aria-hidden="true" />
              {t('materials.editAction')}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn btn-quiet material-card-action material-card-delete"
              onClick={(event) => onDelete(material, event.currentTarget)}
              disabled={actionBusy || downloading}
              aria-label={t('materials.deleteNamed').replace('{title}', title)}
            >
              <Trash2 size={17} strokeWidth={1.75} aria-hidden="true" />
              {t('materials.deleteAction')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary material-download"
            onClick={() => onDownload(material)}
            disabled={downloading || actionBusy}
            aria-label={t('materials.downloadNamed').replace('{title}', title)}
          >
            {downloading ? (
              <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
            ) : (
              <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
            {downloading ? t('materials.downloading') : t('materials.download')}
          </button>
        </div>
      </footer>

      {downloadError && (
        <p className="material-download-error" role="status">
          {t('materials.downloadError')}
        </p>
      )}
    </article>
  );
}
