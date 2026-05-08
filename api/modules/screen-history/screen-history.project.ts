import type { AppAction } from '../../../shared/schemas/ui-schema.schema';
import { ValidationError } from '../../lib/errors';

export function projectRoutePath(projectId: string, pagePath: string, pageSessionId: string) {
  return `/prompt/project/${projectId}/${pagePath}?id=${pageSessionId}`;
}

export function slugifyPagePath(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'page';
}

export function parseProjectRoutePath(
  value: string
): { pagePath: string; projectId: string; sessionId: string | null } | null {
  const trimmed = value.trim();
  const [pathname, search = ''] = trimmed.split('?');
  const match = pathname.match(/^\/prompt\/project\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  const id = new URLSearchParams(search).get('id');
  return {
    projectId: match[1],
    pagePath: normalizeProjectPagePath(`/${match[2]}`),
    sessionId: id,
  };
}

export function normalizeProjectPagePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return 'index';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    throw new ValidationError('External links cannot be used as UIDesign project pages');
  }
  if (trimmed.includes('\\')) {
    throw new ValidationError('UIDesign project page paths cannot contain backslashes');
  }
  if (trimmed.startsWith('/prompt/project/')) {
    const parsed = parseProjectRoutePath(trimmed);
    if (!parsed) throw new ValidationError('Invalid UIDesign project route');
    return parsed.pagePath;
  }
  if (trimmed.startsWith('/prompt/session/')) {
    throw new ValidationError('Prompt session routes are already concrete routes');
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? '';
  const withoutLeadingSlash = withoutQuery.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!withoutLeadingSlash) return 'index';
  if (withoutLeadingSlash.includes('//')) {
    throw new ValidationError('UIDesign project page paths cannot contain empty segments');
  }
  const canonicalName = withoutLeadingSlash.toLowerCase();
  if (canonicalName === 'home' || canonicalName === 'index' || canonicalName === 'index.html') {
    return 'index';
  }
  return withoutLeadingSlash;
}

export function pagePathForAction(action: AppAction) {
  if (action.target) {
    try {
      return normalizeProjectPagePath(action.target);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
    }
  }
  return slugifyPagePath(action.label ?? action.intentHint ?? action.id);
}

export function projectLocalPathForPage(pagePath: string) {
  return pagePath === 'index' ? '/' : `/${pagePath}`;
}
