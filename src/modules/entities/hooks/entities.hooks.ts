import { useQuery } from '@tanstack/react-query';
import { entitiesRepository } from '../repositories/entities.repository';

export const entityQueryKeys = {
  detail: (entity: string, id: string) => ['entities', entity, id] as const,
  metadata: ['entities', 'metadata'] as const,
  rows: (entity: string) => ['entities', entity, 'rows'] as const,
};

export function useEntityMetadataList() {
  return useQuery({
    queryKey: entityQueryKeys.metadata,
    queryFn: entitiesRepository.listMetadata,
  });
}

export function useEntityRows(entity: string | null) {
  return useQuery({
    enabled: Boolean(entity),
    queryKey: entityQueryKeys.rows(entity ?? ''),
    queryFn: () => entitiesRepository.listRows(entity ?? ''),
  });
}

export function useEntityDetail(entity: string | null, id: string | null) {
  return useQuery({
    enabled: Boolean(entity && id),
    queryKey: entityQueryKeys.detail(entity ?? '', id ?? ''),
    queryFn: () => entitiesRepository.getRow(entity ?? '', id ?? ''),
  });
}
