export const MATERIAL_PAGE_SIZE = 20;
export const MATERIAL_MAX_FILE_SIZE = 26214400;

export const MATERIAL_MIME_EXTENSIONS = Object.freeze({
  'application/pdf': Object.freeze(['pdf']),
  'application/msword': Object.freeze(['doc']),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': Object.freeze(['docx']),
  'application/vnd.ms-powerpoint': Object.freeze(['ppt']),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': Object.freeze(['pptx']),
  'application/vnd.ms-excel': Object.freeze(['xls']),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': Object.freeze(['xlsx']),
  'text/plain': Object.freeze(['txt']),
  'image/png': Object.freeze(['png']),
  'image/jpeg': Object.freeze(['jpg', 'jpeg']),
  'image/webp': Object.freeze(['webp']),
});

export const MATERIAL_FILE_ACCEPT = Object.keys(MATERIAL_MIME_EXTENSIONS).join(',');

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

const MATERIAL_TYPE_VALUES = new Set(MATERIAL_TYPES.map((type) => type.value));
const MATERIAL_FILE_EXTENSIONS = new Set(Object.values(MATERIAL_MIME_EXTENSIONS).flat());
const SAFE_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UPLOAD_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

export function unicodeCodePointLength(value) {
  return Array.from(typeof value === 'string' ? value : '').length;
}

export function shouldPreserveOriginalProfessor({
  mode,
  universityTouched = false,
  professorId = '',
  originalProfessorId = null,
}) {
  return mode === 'edit'
    && !universityTouched
    && originalProfessorId !== null
    && originalProfessorId !== undefined
    && String(professorId) === String(originalProfessorId);
}

export function reconcileMaterialDeleteRows(rows, materialId) {
  if (!Array.isArray(rows)) {
    return { state: 'refresh_failed', material: null };
  }

  const material = rows.find((item) => String(item.id) === String(materialId)) || null;
  if (!material) return { state: 'missing', material: null };
  if (material.status !== 'pending') return { state: 'status_changed', material };
  return { state: 'pending', material };
}

export function escapeIlikePattern(value) {
  return safeDisplayText(value).replace(/[\\%_]/g, '\\$&');
}

export function getMaterialFileExtension(fileName) {
  if (typeof fileName !== 'string') return '';
  const candidate = fileName.trim();
  const lastDot = candidate.lastIndexOf('.');
  if (lastDot < 0 || lastDot === candidate.length - 1) return '';
  return candidate.slice(lastDot + 1).toLowerCase();
}

export function validateMaterialFile(file) {
  if (!file || typeof file.name !== 'string') {
    return { errorKey: 'materials.validationFileRequired' };
  }

  const fileSize = Number(file.size);
  if (!Number.isFinite(fileSize) || fileSize < 1) {
    return { errorKey: 'materials.validationFileEmpty' };
  }
  if (fileSize > MATERIAL_MAX_FILE_SIZE) {
    return { errorKey: 'materials.validationFileTooLarge' };
  }

  const mimeType = typeof file.type === 'string' ? file.type : '';
  if (!mimeType) {
    return { errorKey: 'materials.validationMimeMissing' };
  }

  const allowedExtensions = MATERIAL_MIME_EXTENSIONS[mimeType];
  if (!allowedExtensions) {
    return { errorKey: 'materials.validationFileUnsupported' };
  }

  const extension = getMaterialFileExtension(file.name);
  if (!extension || !allowedExtensions.includes(extension)) {
    return { errorKey: 'materials.validationFileMismatch' };
  }

  return {
    errorKey: '',
    extension,
    mimeType,
    fileSize,
  };
}

export function validateMaterialFormValues(rawValues, {
  mode = 'create',
  universities = [],
  professors = [],
  preserveProfessorId = null,
} = {}) {
  const errors = {};
  const title = safeDisplayText(rawValues?.title);
  const description = safeDisplayText(rawValues?.description) || null;
  const courseName = safeDisplayText(rawValues?.courseName);
  const universityValue = String(rawValues?.universityId || '');
  const professorValue = String(rawValues?.professorId || '');
  const materialType = String(rawValues?.materialType || '');
  const university = universities.find((item) => String(item.id) === universityValue);
  const preservesOriginalProfessor = professorValue
    && preserveProfessorId !== null
    && preserveProfessorId !== undefined
    && professorValue === String(preserveProfessorId);
  const professor = professorValue
    ? professors.find((item) => String(item.id) === professorValue)
    : null;

  const titleLength = unicodeCodePointLength(title);
  const descriptionLength = unicodeCodePointLength(description || '');
  const courseNameLength = unicodeCodePointLength(courseName);

  if (titleLength < 3 || titleLength > 180) {
    errors.title = 'materials.validationTitle';
  }
  if (description && descriptionLength > 2000) {
    errors.description = 'materials.validationDescription';
  }
  if (courseNameLength < 2 || courseNameLength > 120) {
    errors.courseName = 'materials.validationCourse';
  }
  if (!university) {
    errors.universityId = 'materials.validationUniversity';
  }
  if (professorValue && !preservesOriginalProfessor && (
    !professor
    || !university
    || String(professor.university_id) !== String(university.id)
  )) {
    errors.professorId = 'materials.validationProfessor';
  }
  if (!MATERIAL_TYPE_VALUES.has(materialType)) {
    errors.materialType = 'materials.validationMaterialType';
  }

  let fileValidation = null;
  if (mode === 'create') {
    fileValidation = validateMaterialFile(rawValues?.file);
    if (fileValidation.errorKey) errors.file = fileValidation.errorKey;
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    values: {
      title,
      description,
      courseName,
      universityId: university?.id ?? null,
      professorId: preservesOriginalProfessor ? preserveProfessorId : (professor?.id ?? null),
      materialType,
      file: mode === 'create' ? rawValues?.file : null,
      fileExtension: fileValidation?.extension || '',
      mimeType: fileValidation?.mimeType || '',
      fileSize: fileValidation?.fileSize || 0,
    },
  };
}

export function buildMaterialUploadIdentity(userId, uploadId, fileName, extension) {
  if (
    typeof userId !== 'string'
    || !userId
    || userId.includes('/')
    || !UPLOAD_UUID_PATTERN.test(uploadId)
    || !MATERIAL_FILE_EXTENSIONS.has(extension)
  ) {
    throw new Error('invalid_material_upload_identity');
  }

  const originalNameIsSafe = typeof fileName === 'string'
    && fileName === fileName.trim()
    && fileName.length >= 3
    && fileName.length <= 180
    && SAFE_FILE_NAME_PATTERN.test(fileName)
    && getMaterialFileExtension(fileName) === extension;
  const safeFileName = originalNameIsSafe ? fileName : `${uploadId}.${extension}`;

  return {
    fileName: safeFileName,
    filePath: `${userId}/${uploadId}/${safeFileName}`,
  };
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
