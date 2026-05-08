import type { PromptSessionSummary } from '../../../../shared/schemas/screen-history.schema';

function promptSessionPath(sessionId: string) {
  return `/prompt/session/${sessionId}`;
}

function projectRoutePath(projectId: string, pagePath: string, sessionId: string) {
  const encodedPagePath = pagePath.split('/').map(encodeURIComponent).join('/');
  return `/prompt/project/${encodeURIComponent(projectId)}/${encodedPagePath}?id=${encodeURIComponent(sessionId)}`;
}

export function isConcretePromptPath(path: string | null | undefined) {
  const target = path?.trim();
  if (!target) return false;
  return (
    /^\/prompt\/session\/[^/?#]+$/.test(target) ||
    /^\/prompt\/project\/[^/]+\/.+\?id=[^&#]+/.test(target)
  );
}

export function normalizeProjectPagePathForLink(path: string | null | undefined) {
  if (path == null) return null;
  const trimmed = path?.trim();
  if (!trimmed || trimmed === '/') return 'index';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;
  if (trimmed.startsWith('/prompt/session/')) return null;

  if (trimmed.startsWith('/prompt/project/')) {
    const [pathname] = trimmed.split('?');
    const match = pathname?.match(/^\/prompt\/project\/[^/]+\/(.+)$/);
    if (!match?.[1]) return null;
    return normalizeProjectPagePathForLink(`/${decodeURIComponent(match[1])}`);
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? '';
  const normalized = withoutQuery.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return 'index';
  if (normalized.includes('//')) return null;

  const canonicalName = normalized.toLowerCase();
  if (canonicalName === 'home' || canonicalName === 'index' || canonicalName === 'index.html') {
    return 'index';
  }

  return normalized;
}

export function resolveProjectLinkTarget(
  targetPath: string | null | undefined,
  projectId: string | null | undefined,
  sessions: PromptSessionSummary[]
) {
  const trimmed = targetPath?.trim();
  if (!trimmed) return null;
  if (isConcretePromptPath(trimmed)) return trimmed;
  if (!projectId) return null;

  const targetPagePath = normalizeProjectPagePathForLink(trimmed);
  if (!targetPagePath) return null;

  const targetSession = sessions.find(
    (session) =>
      session.projectId === projectId &&
      normalizeProjectPagePathForLink(session.pagePath) === targetPagePath
  );
  if (!targetSession) return null;

  return (
    targetSession.canonicalPath ?? projectRoutePath(projectId, targetPagePath, targetSession.id)
  );
}

export function pathFromSessionChoice(session: PromptSessionSummary) {
  return session.canonicalPath ?? promptSessionPath(session.id);
}
