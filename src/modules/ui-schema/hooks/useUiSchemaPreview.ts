import { useQuery } from '@tanstack/react-query';
import { uiSchemaPreviewRepository } from '../repositories/ui-schema-preview.repository';

export function useUiSchemaPreview(pageId: string) {
  return useQuery({
    queryKey: ['ui-schema-preview', pageId],
    queryFn: () => uiSchemaPreviewRepository.getPreview(pageId),
  });
}
