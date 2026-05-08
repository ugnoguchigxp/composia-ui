import { describe, expect, it } from 'vitest';
import {
  collectRenderableActions,
  updateRenderableActionTarget,
} from '../shared/schemas/ui-action-collector';
import { appUiSchemaSchema } from '../shared/schemas/ui-schema.schema';

describe('UI action collector', () => {
  it('collects explicit actions and props hrefs as stable renderable actions', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Shop',
      intent: 'Browse products',
      layout: 'screen',
      sections: [
        {
          component: 'NavigationPanel',
          source: 'navigation',
          props: {
            title: 'Navigation',
            links: [
              { label: 'Home', href: '/' },
              { label: 'Cart', href: '/cart' },
            ],
          },
          actions: [
            {
              id: 'home',
              label: 'Home',
              kind: 'generate-screen',
              target: '/',
            },
          ],
        },
        {
          component: 'CardGridSection',
          source: 'app',
          props: {
            title: 'Products',
            items: [{ title: 'Time sale', href: '/deals' }],
          },
        },
      ],
    });

    const actions = collectRenderableActions(schema);

    expect(actions).toEqual([
      expect.objectContaining({ id: 'home', label: 'Home', target: '/' }),
      expect.objectContaining({ label: 'Cart', kind: 'generate-screen', target: '/cart' }),
      expect.objectContaining({ label: 'Time sale', kind: 'generate-screen', target: '/deals' }),
    ]);
    expect(actions.map((action) => action.id)).toHaveLength(new Set(actions.map((a) => a.id)).size);
  });

  it('updates props href targets without changing the synthetic action id', () => {
    const schema = appUiSchemaSchema.parse({
      page: 'Shop',
      intent: 'Browse products',
      layout: 'screen',
      sections: [
        {
          component: 'NavigationPanel',
          source: 'navigation',
          props: {
            title: 'Navigation',
            links: [{ label: 'Cart', href: '/cart' }],
          },
        },
      ],
    });
    const cartAction = collectRenderableActions(schema).find((action) => action.target === '/cart');

    const updated = updateRenderableActionTarget(
      schema,
      cartAction?.id ?? '',
      '/prompt/session/22222222-2222-4222-8222-222222222222'
    );

    const updatedAction = updated ? collectRenderableActions(updated.schema)[0] : null;
    const links = updated?.schema.sections[0]?.props.links as { href: string; label: string }[];
    expect(updatedAction).toEqual(
      expect.objectContaining({
        id: cartAction?.id,
        label: 'Cart',
        target: '/prompt/session/22222222-2222-4222-8222-222222222222',
      })
    );
    expect(links[0]).toEqual(
      expect.objectContaining({
        href: '/prompt/session/22222222-2222-4222-8222-222222222222',
        label: 'Cart',
      })
    );
  });
});
