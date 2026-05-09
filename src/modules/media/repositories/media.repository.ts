import type {
  MediaAsset,
  MediaDeleteResponse,
  MediaListQuery,
  MediaListResponse,
  MediaUpdateRequest,
  MediaUploadResponse,
} from '../../../../shared/schemas/media.schema';
import {
  mediaAssetSchema,
  mediaDeleteResponseSchema,
  mediaListResponseSchema,
  mediaUploadResponseSchema,
} from '../../../../shared/schemas/media.schema';
import { apiFetch } from '../../../lib/api';

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return payload?.error?.message ?? payload?.message ?? 'Media request failed';
}

function buildSearchParams(query: MediaListQuery) {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  params.set('folder', query.folder);
  params.set('sortBy', query.sortBy);
  params.set('sortOrder', query.sortOrder);
  if (query.q?.trim()) {
    params.set('q', query.q.trim());
  }
  return params;
}

export const mediaRepository = {
  delete: async (assetId: string): Promise<MediaDeleteResponse> => {
    const response = await apiFetch(`/api/media/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return mediaDeleteResponseSchema.parse(await response.json());
  },
  list: async (query: MediaListQuery): Promise<MediaListResponse> => {
    const response = await apiFetch(`/api/media/assets?${buildSearchParams(query)}`);
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return mediaListResponseSchema.parse(await response.json());
  },
  update: async (assetId: string, input: MediaUpdateRequest): Promise<MediaAsset> => {
    const response = await apiFetch(`/api/media/assets/${encodeURIComponent(assetId)}`, {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return mediaAssetSchema.parse(await response.json());
  },
  upload: async (file: File): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    formData.set('file', file);
    const response = await apiFetch('/api/media/upload', {
      body: formData,
      method: 'POST',
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return mediaUploadResponseSchema.parse(await response.json());
  },
};
