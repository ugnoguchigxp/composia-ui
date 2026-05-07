import { describe, expect, it } from 'vitest';
import { authResponseSchema, loginSchema, registerSchema } from '../shared/schemas/auth.schema';

describe('shared auth schemas', () => {
  it('validates login schema', () => {
    expect(
      loginSchema.parse({
        email: 'user@example.com',
        password: 'DevTest!2026-Composia',
      })
    ).toEqual({
      email: 'user@example.com',
      password: 'DevTest!2026-Composia',
    });
  });

  it('validates register schema', () => {
    expect(
      registerSchema.parse({
        email: 'user@example.com',
        password: 'DevTest!2026-Composia',
        name: '<b>John Doe</b>',
      })
    ).toEqual({
      email: 'user@example.com',
      password: 'DevTest!2026-Composia',
      name: 'John Doe',
    });
  });

  it('validates auth response schema', () => {
    const parsed = authResponseSchema.parse({
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    });
    expect(parsed.user.email).toBe('user@example.com');
  });
});
