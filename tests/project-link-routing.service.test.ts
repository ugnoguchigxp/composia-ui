import { describe, expect, it } from 'vitest';
import type { PromptSessionSummary } from '../shared/schemas/screen-history.schema';
import {
  normalizeProjectPagePathForLink,
  resolveProjectLinkTarget,
} from '../src/modules/screen-history/services/project-link-routing.service';

const projectId = '99999999-9999-4999-8999-999999999999';
const otherProjectId = '88888888-8888-4888-8888-888888888888';
const now = '2026-05-08T00:00:00.000Z';

function session(input: Partial<PromptSessionSummary>): PromptSessionSummary {
  return {
    id: input.id ?? '11111111-1111-4111-8111-111111111111',
    title: input.title ?? 'Home',
    activeScreenJsonId: input.activeScreenJsonId ?? null,
    activeVersion: input.activeVersion ?? 1,
    visibility: input.visibility ?? 'private',
    publishedAt: input.publishedAt ?? null,
    projectId: input.projectId ?? projectId,
    pagePath: input.pagePath ?? 'index',
    canonicalPath: input.canonicalPath ?? null,
    page: input.page ?? 'Home',
    prompt: input.prompt ?? 'EC top',
    inferredIntent: input.inferredIntent ?? 'EC top',
    screenCount: input.screenCount ?? 1,
    messageCount: input.messageCount ?? 0,
    messageSearchText: input.messageSearchText ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

describe('project link routing', () => {
  it('normalizes home-like links to the index project page', () => {
    expect(normalizeProjectPagePathForLink('/')).toBe('index');
    expect(normalizeProjectPagePathForLink('/home')).toBe('index');
    expect(normalizeProjectPagePathForLink('/index')).toBe('index');
    expect(normalizeProjectPagePathForLink('/index.html')).toBe('index');
  });

  it('resolves semantic project-local links to an existing project page route', () => {
    const sessions = [
      session({
        canonicalPath: `/prompt/project/${projectId}/index?id=11111111-1111-4111-8111-111111111111`,
        pagePath: 'index',
      }),
      session({
        id: '22222222-2222-4222-8222-222222222222',
        canonicalPath: `/prompt/project/${projectId}/cart?id=22222222-2222-4222-8222-222222222222`,
        page: 'Cart',
        pagePath: 'cart',
        title: 'Cart',
      }),
      session({
        id: '33333333-3333-4333-8333-333333333333',
        canonicalPath: `/prompt/project/${otherProjectId}/cart?id=33333333-3333-4333-8333-333333333333`,
        pagePath: 'cart',
        projectId: otherProjectId,
      }),
    ];

    expect(resolveProjectLinkTarget('/home', projectId, sessions)).toBe(
      `/prompt/project/${projectId}/index?id=11111111-1111-4111-8111-111111111111`
    );
    expect(resolveProjectLinkTarget('/cart', projectId, sessions)).toBe(
      `/prompt/project/${projectId}/cart?id=22222222-2222-4222-8222-222222222222`
    );
  });

  it('does not resolve external links or missing project pages', () => {
    expect(resolveProjectLinkTarget('https://example.com', projectId, [])).toBeNull();
    expect(
      resolveProjectLinkTarget('/orders', projectId, [session({ pagePath: 'cart' })])
    ).toBeNull();
  });
});
