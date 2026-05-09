import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiLayoutProvider } from '../api/modules/ai/ai.provider';

describe('ai provider', () => {
  it('selects Azure OpenAI when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"density": "compact"}' } }],
      }),
    });

    const provider = createDefaultAiLayoutProvider({
      fetch: mockFetch as any,
      config: {
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/',
        AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deploy',
        AZURE_OPENAI_API_VERSION: '2024-10-21',
      } as any,
    });

    await provider.classify({ text: 'hello' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://test.openai.azure.com/openai/deployments/test-deploy/chat/completions'
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ 'api-key': 'test-key' }),
      })
    );
  });

  it('selects OpenAI when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ text: '{"density": "normal"}' }] }],
      }),
    });

    const provider = createDefaultAiLayoutProvider({
      fetch: mockFetch as any,
      config: {
        OPENAI_API_KEY: 'sk-test',
        OPENAI_MODEL: 'gpt-4o',
      } as any,
    });

    await provider.classify({ text: 'hello' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      })
    );
  });

  it('selects Anthropic when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '{"density": "spacious"}' }],
      }),
    });

    const provider = createDefaultAiLayoutProvider({
      fetch: mockFetch as any,
      config: {
        ANTHROPIC_API_KEY: 'ant-test',
        ANTHROPIC_MODEL: 'claude-3',
      } as any,
    });

    await provider.classify({ text: 'hello' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'ant-test' }),
      })
    );
  });

  it('selects Google AI when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"density": "compact"}' }] } }],
      }),
    });

    const provider = createDefaultAiLayoutProvider({
      fetch: mockFetch as any,
      config: {
        GOOGLE_AI_API_KEY: 'goog-test',
        GOOGLE_AI_MODEL: 'gemini-pro',
      } as any,
    });

    await provider.classify({ text: 'hello' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=goog-test'
      ),
      expect.anything()
    );
  });

  it('throws when no provider is configured', async () => {
    const provider = createDefaultAiLayoutProvider({
      config: {} as any,
    });

    await expect(provider.generateLayout('test')).rejects.toMatchObject({
      code: 'AI_PROVIDER_NOT_CONFIGURED',
    });
  });
});
