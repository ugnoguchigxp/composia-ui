import {
  type EntityDetailResponse,
  type EntityMetadataListResponse,
  type EntityRowsResponse,
  entityDetailResponseSchema,
  entityMetadataListResponseSchema,
  entityRowsResponseSchema,
} from '../../../../shared/schemas/entities.schema';
import { client } from '../../../lib/api';

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return payload?.error?.message ?? 'Entity request failed';
}

export const entitiesRepository = {
  getRow: async (entity: string, id: string): Promise<EntityDetailResponse> => {
    const response = await client.entities[':entity'][':id'].$get({ param: { entity, id } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return entityDetailResponseSchema.parse(await response.json());
  },
  listMetadata: async (): Promise<EntityMetadataListResponse> => {
    const response = await client.metadata.entities.$get({});
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return entityMetadataListResponseSchema.parse(await response.json());
  },
  listRows: async (entity: string): Promise<EntityRowsResponse> => {
    const response = await client.entities[':entity'].$get({ param: { entity } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return entityRowsResponseSchema.parse(await response.json());
  },
};
