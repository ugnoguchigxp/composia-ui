import { describe, expect, it, vi } from 'vitest';
import { createDefaultDatabaseDesignProvider } from '../api/modules/database-design/database-design.provider';

describe('database-design provider', () => {
  const mockConfig = {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-4o',
    AZURE_OPENAI_API_KEY: 'azure-test',
    AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/',
    AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
    AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
  };

  const mockDesignJob = {
    name: 'test_app',
    label: 'Test App',
    purpose: 'A test application',
    tables: [
      {
        name: 'items',
        label: 'Items',
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'price', label: 'Price', type: 'numeric', required: false },
        ],
      },
    ],
    relationships: [],
    primaryTables: ['items'],
    notes: ['Initial schema'],
  };

  it('proposes using Azure OpenAI when configured', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(mockDesignJob),
            },
          },
        ],
      }),
    })) as any;

    const provider = createDefaultDatabaseDesignProvider({
      fetch: mockFetch,
      config: mockConfig as any,
    });

    const result = await provider.propose({
      prompt: 'Create a test app',
      source: 'dbdesign',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://test.openai.azure.com/openai/deployments/test-deployment/chat/completions'
      ),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'api-key': 'azure-test',
        }),
      })
    );

    expect(result.draft.databaseSchema.name).toBe('test_app');
    expect(result.providerMeta.provider).toBe('azure-openai');
  });

  it('proposes using OpenAI when Azure is not configured', async () => {
    const openAiConfig = {
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt-4o',
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(mockDesignJob),
            },
          },
        ],
      }),
    })) as any;

    const provider = createDefaultDatabaseDesignProvider({
      fetch: mockFetch,
      config: openAiConfig as any,
    });

    const result = await provider.propose({
      prompt: 'Create a test app',
      source: 'dbdesign',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      })
    );

    expect(result.draft.databaseSchema.name).toBe('test_app');
    expect(result.providerMeta.provider).toBe('openai');
  });

  it('returns a mock draft when no AI is configured', async () => {
    const provider = createDefaultDatabaseDesignProvider({
      config: {} as any,
    });

    const result = await provider.propose({
      prompt: 'Create a test app',
      source: 'dbdesign',
    });

    expect(result.providerMeta.provider).toBe('mock');
    expect(result.draft.databaseSchema.tables.length).toBe(1);
    expect(result.draft.databaseSchema.tables[0].name).toBe('records');
  });

  it('throws ValidationError when AI returns invalid JSON', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'invalid json',
            },
          },
        ],
      }),
    })) as any;

    const provider = createDefaultDatabaseDesignProvider({
      fetch: mockFetch,
      config: mockConfig as any,
    });

    await expect(
      provider.propose({
        prompt: 'Create a test app',
        source: 'dbdesign',
      })
    ).rejects.toThrow('AI returned invalid DBDesignJob JSON');
  });
});
