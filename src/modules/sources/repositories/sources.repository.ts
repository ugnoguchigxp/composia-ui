import {
  type CreateApiSourceRequest,
  type CreateMarkdownSourceRequest,
  type CreatePostgresSourceRequest,
  type CreateRssSourceRequest,
  type SourceItemsResponse,
  type SourceListResponse,
  type SourceRefreshResponse,
  sourceItemsResponseSchema,
  sourceListResponseSchema,
  sourceRefreshResponseSchema,
  sourceResponseSchema,
} from '../../../../shared/schemas/sources.schema';
import { client } from '../../../lib/api';

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return payload?.error?.message ?? 'Source request failed';
}

export const sourcesRepository = {
  createApi: async (input: CreateApiSourceRequest) => {
    const response = await client.sources.api.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sourceResponseSchema.parse(await response.json());
  },
  createMarkdown: async (input: CreateMarkdownSourceRequest) => {
    const response = await client.sources.markdown.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sourceResponseSchema.parse(await response.json());
  },
  createPostgres: async (input: CreatePostgresSourceRequest) => {
    const response = await client.sources.postgres.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sourceResponseSchema.parse(await response.json());
  },
  createRss: async (input: CreateRssSourceRequest) => {
    const response = await client.sources.rss.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sourceResponseSchema.parse(await response.json());
  },
  delete: async (sourceId: string) => {
    const response = await client.sources[':sourceId'].$delete({ param: { sourceId } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return response.json();
  },
  items: async (sourceId: string): Promise<SourceItemsResponse> => {
    const response = await client.sources[':sourceId'].items.$get({ param: { sourceId } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sourceItemsResponseSchema.parse(await response.json());
  },
  list: async (): Promise<SourceListResponse> => {
    const response = await client.sources.$get({});
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sourceListResponseSchema.parse(await response.json());
  },
  refresh: async (sourceId: string): Promise<SourceRefreshResponse> => {
    const response = await client.sources[':sourceId'].refresh.$post({ param: { sourceId } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return sourceRefreshResponseSchema.parse(await response.json());
  },
};
