import {
  type CacheInvalidateRequest,
  type CacheStatus,
  cacheStatusSchema,
} from '../../../../shared/schemas/cache.schema';
import { client } from '../../../lib/api';

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return payload?.error?.message ?? 'Cache request failed';
}

export const cacheRepository = {
  invalidate: async (input: CacheInvalidateRequest) => {
    const response = await client.cache.invalidate.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return response.json();
  },
  rebuild: async () => {
    const response = await client.cache.rebuild.$post({});
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return response.json();
  },
  status: async (): Promise<CacheStatus> => {
    const response = await client.cache.status.$get({});
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return cacheStatusSchema.parse(await response.json());
  },
};
