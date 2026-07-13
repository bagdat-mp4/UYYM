export const MATERIAL_PAGE_SIZE = 20;

export const MATERIAL_TYPES = Object.freeze([
  { value: 'notes', labelKey: 'materials.typeNotes' },
  { value: 'exam', labelKey: 'materials.typeExam' },
  { value: 'assignment', labelKey: 'materials.typeAssignment' },
  { value: 'presentation', labelKey: 'materials.typePresentation' },
  { value: 'book', labelKey: 'materials.typeBook' },
  { value: 'other', labelKey: 'materials.typeOther' },
]);

export const MATERIAL_STATUSES = Object.freeze([
  { value: 'pending', labelKey: 'materials.statusPending' },
  { value: 'approved', labelKey: 'materials.statusApproved' },
  { value: 'rejected', labelKey: 'materials.statusRejected' },
]);

export function localeFor(lang) {
  if (lang === 'ru') return 'ru-RU';
  if (lang === 'en') return 'en-US';
  return 'kk-KZ';
}

export function normalizeRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function safeDisplayText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim() || fallback;
}

export function escapeIlikePattern(value) {
  return safeDisplayText(value).replace(/[\\%_]/g, '\\$&');
}

export function formatFileSize(value, lang, units) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return units.unknown;

  const formatter = new Intl.NumberFormat(localeFor(lang), {
    maximumFractionDigits: 1,
  });

  if (bytes < 1024) return `${formatter.format(bytes)} ${units.bytes}`;
  if (bytes < 1024 * 1024) {
    return `${formatter.format(bytes / 1024)} ${units.kilobytes}`;
  }
  return `${formatter.format(bytes / (1024 * 1024))} ${units.megabytes}`;
}

export function formatMaterialDate(value, lang, fallback = '') {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function getMaterialTypeLabelKey(value) {
  return MATERIAL_TYPES.find((type) => type.value === value)?.labelKey
    || 'materials.typeOther';
}

export function getMaterialStatusLabelKey(value) {
  return MATERIAL_STATUSES.find((status) => status.value === value)?.labelKey
    || 'materials.statusPending';
}

