import type {
  EntityDetailResponse,
  EntityMetadata,
  EntityRowsResponse,
} from '../../../shared/schemas/entities.schema';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import {
  type EntitiesRepository,
  entitiesRepository,
  isEntityTableName,
} from './entities.repository';
import { entityMetadataList, findEntityMetadata } from './entity-metadata';

export function createEntitiesService(repo: EntitiesRepository) {
  const getMetadata = (entity: string): EntityMetadata => {
    const metadata = findEntityMetadata(entity);
    if (!metadata || !isEntityTableName(entity)) {
      throw new NotFoundError('Entity not found');
    }
    return metadata;
  };

  return {
    create: async (entity: string) => {
      const metadata = getMetadata(entity);
      if (metadata.mode === 'readonly') {
        throw new ForbiddenError('Readonly entity cannot be mutated');
      }
      throw new ForbiddenError('Generic entity writes are not enabled');
    },
    delete: async (entity: string) => {
      const metadata = getMetadata(entity);
      if (metadata.mode === 'readonly') {
        throw new ForbiddenError('Readonly entity cannot be mutated');
      }
      throw new ForbiddenError('Generic entity writes are not enabled');
    },
    get: async (entity: string, id: string): Promise<EntityDetailResponse> => {
      const metadata = getMetadata(entity);
      if (!isEntityTableName(entity)) throw new NotFoundError('Entity not found');
      const row = await repo.findById(entity, id);
      if (!row) throw new NotFoundError('Entity row not found');
      return { metadata, row };
    },
    list: async (entity: string): Promise<EntityRowsResponse> => {
      const metadata = getMetadata(entity);
      if (!isEntityTableName(entity)) throw new NotFoundError('Entity not found');
      return { metadata, rows: await repo.list(entity) };
    },
    listMetadata: async () => ({ entities: entityMetadataList }),
    metadata: async (entity: string) => ({ metadata: getMetadata(entity) }),
    update: async (entity: string) => {
      const metadata = getMetadata(entity);
      if (metadata.mode === 'readonly') {
        throw new ForbiddenError('Readonly entity cannot be mutated');
      }
      throw new ForbiddenError('Generic entity writes are not enabled');
    },
  };
}

export const entitiesService = createEntitiesService(entitiesRepository);
