import {
  type MediaAsset,
  type MediaListQuery,
  type MediaListResponse,
  type MediaUpdateRequest,
  type MediaUploadResponse,
  mediaListQuerySchema,
  mediaUpdateRequestSchema,
} from '../../../shared/schemas/media.schema';
import { ValidationError } from '../../lib/errors';
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE,
  type MediaRepository,
  mediaRepository,
} from './media.repository';

export type UploadFile = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name: string;
  size: number;
  type: string;
};

function getSearchText(asset: MediaAsset) {
  return [
    asset.filename,
    asset.originalName,
    asset.mimeType,
    asset.folder,
    asset.tags,
    asset.altText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function sortAssets(assets: MediaAsset[], query: MediaListQuery) {
  return [...assets].sort((a, b) => {
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    if (query.sortBy === 'name') {
      return a.filename.localeCompare(b.filename) * direction;
    }
    if (query.sortBy === 'size') {
      return (a.size - b.size) * direction;
    }
    return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * direction;
  });
}

export class MediaService {
  constructor(private readonly repository: MediaRepository = mediaRepository) {}

  async list(input: MediaListQuery): Promise<MediaListResponse> {
    const query = mediaListQuerySchema.parse(input);
    const search = query.q?.trim().toLowerCase();
    const assets = await this.repository.listAssets();
    const filtered = assets.filter((asset) => {
      if (query.folder !== 'all' && asset.folder !== query.folder) return false;
      if (search && !getSearchText(asset).includes(search)) return false;
      return true;
    });
    const sorted = sortAssets(filtered, query);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
    const start = (query.page - 1) * query.limit;

    return {
      files: sorted.slice(start, start + query.limit),
      pagination: {
        limit: query.limit,
        page: query.page,
        total,
        totalPages,
      },
    };
  }

  async upload(file: UploadFile): Promise<MediaUploadResponse> {
    this.validateUpload(file);
    const mimeType = file.type;
    const filename = this.repository.createSafeFilename(file.name);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const asset = await this.repository.saveUploadedFile({
      fileBuffer,
      filename,
      mimeType,
      originalName: file.name,
      size: file.size,
    });

    return { asset, success: true };
  }

  async update(assetId: string, input: MediaUpdateRequest): Promise<MediaAsset> {
    return this.repository.updateMetadata(assetId, mediaUpdateRequestSchema.parse(input));
  }

  async delete(assetId: string) {
    return this.repository.deleteAsset(assetId);
  }

  private validateUpload(file: UploadFile) {
    if (!file.name || file.name.trim().length === 0) {
      throw new ValidationError('Upload requires a filename');
    }
    if (file.size <= 0) {
      throw new ValidationError('Upload requires a non-empty image file');
    }
    if (file.size > MEDIA_MAX_FILE_SIZE) {
      throw new ValidationError('Image file size must be 5MB or less');
    }
    if (
      !MEDIA_ALLOWED_MIME_TYPES.includes(file.type as (typeof MEDIA_ALLOWED_MIME_TYPES)[number])
    ) {
      throw new ValidationError('Only JPG, PNG, GIF, and WebP images can be uploaded');
    }
  }
}

export const mediaService = new MediaService();
