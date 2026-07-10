export const COMMUNITY_TYPES = ['university', 'major', 'interest', 'city'];
export const COMMUNITY_ROLES = ['owner', 'admin', 'member'];
export const COMMUNITY_MANAGER_ROLES = ['owner', 'admin'];
export const COMMUNITY_NAME_MAX = 120;
export const COMMUNITY_SLUG_MAX = 80;
export const COMMUNITY_DESCRIPTION_MAX = 1000;
export const COMMUNITY_POST_MAX = 2000;

export const COMMUNITY_SELECT = `
  id,
  name,
  slug,
  description,
  type,
  university_id,
  created_by,
  is_public,
  created_at,
  university:universities!communities_university_fkey(
    id,
    name,
    short_name,
    city
  )
`;

export const MEMBER_SELECT = `
  community_id,
  user_id,
  role,
  joined_at,
  profile:profiles!community_members_user_fkey(
    id,
    first_name,
    last_name,
    major,
    university:universities(id, name, short_name)
  )
`;

export const POST_SELECT = `
  id,
  community_id,
  author_id,
  content,
  created_at,
  author:profiles!community_posts_author_fkey(
    id,
    first_name,
    last_name,
    university:universities(id, name, short_name)
  )
`;

export function normalizeRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeCommunity(community) {
  if (!community) return null;
  return {
    ...community,
    university: normalizeRelation(community.university),
  };
}

export function normalizeMember(member) {
  if (!member) return null;
  const profile = normalizeRelation(member.profile);
  return {
    ...member,
    profile: profile
      ? { ...profile, university: normalizeRelation(profile.university) }
      : null,
  };
}

export function normalizePost(post) {
  if (!post) return null;
  const author = normalizeRelation(post.author);
  return {
    ...post,
    author: author
      ? { ...author, university: normalizeRelation(author.university) }
      : null,
  };
}

export function getProfileName(profile, fallback) {
  const firstName = profile?.first_name?.trim() || '';
  const lastName = profile?.last_name?.trim() || '';
  return `${firstName} ${lastName}`.trim() || fallback;
}

export function getInitials(profile) {
  const first = profile?.first_name?.trim()?.[0] || '';
  const last = profile?.last_name?.trim()?.[0] || '';
  return `${first}${last}`.toUpperCase() || 'U';
}

export function getUniversityName(value, fallback) {
  const university = normalizeRelation(value?.university || value);
  return university?.short_name || university?.name || fallback;
}

export function localeFor(lang) {
  if (lang === 'ru') return 'ru-RU';
  if (lang === 'en') return 'en-US';
  return 'kk-KZ';
}

export function formatCommunityDate(value, lang) {
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

export function isCommunityManager(role, isPlatformAdmin) {
  return Boolean(isPlatformAdmin || COMMUNITY_MANAGER_ROLES.includes(role));
}

export function isUniversityScoped(type) {
  return type === 'university' || type === 'major';
}

export function isValidCommunitySlug(slug) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
    && slug.length >= 3
    && slug.length <= COMMUNITY_SLUG_MAX;
}
