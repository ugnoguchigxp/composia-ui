import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  type MediaAsset,
  mediaAssetSchema,
  mediaFolderSchema,
} from '../../../shared/schemas/media.schema';
import { NotFoundError, ValidationError } from '../../lib/errors';

export const MEDIA_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MEDIA_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const;
export const MEDIA_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

const extensionToMimeType: Record<(typeof MEDIA_ALLOWED_EXTENSIONS)[number], string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const metadataEntrySchema = z
  .object({
    originalName: z.string().nullable().optional(),
    mimeType: z.string().optional(),
    size: z.number().int().min(0).optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    folder: mediaFolderSchema.optional(),
    tags: z.string().nullable().optional(),
    altText: z.string().nullable().optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

const metadataFileSchema = z.record(z.string(), metadataEntrySchema).catch({});

type MediaAssetMetadata = z.infer<typeof metadataEntrySchema>;
type MetadataFile = Record<string, MediaAssetMetadata>;

type SaveUploadedFileInput = {
  fileBuffer: Buffer;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
};

type MediaRepositoryOptions = {
  imageDir?: string;
  metadataPath?: string;
  publicBasePath?: string;
};

const defaultImageDir = path.resolve(process.cwd(), 'public/images');
const defaultMetadataPath = path.resolve(process.cwd(), 'data/media-assets.json');

function normalizePathSegment(value: string) {
  return value.trim().replace(/\\/g, '/');
}

function getExtension(filename: string) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (!MEDIA_ALLOWED_EXTENSIONS.includes(extension as (typeof MEDIA_ALLOWED_EXTENSIONS)[number])) {
    return null;
  }
  return extension as (typeof MEDIA_ALLOWED_EXTENSIONS)[number];
}

function normalizeAssetId(assetId: string) {
  const decoded = (() => {
    try {
      return decodeURIComponent(assetId);
    } catch {
      return assetId;
    }
  })();
  const normalized = normalizePathSegment(decoded);
  if (
    normalized.length === 0 ||
    normalized.includes('/') ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('\0')
  ) {
    throw new ValidationError('Invalid media filename');
  }
  return normalized;
}

function toPublicUrl(basePath: string, filename: string) {
  return `${basePath.replace(/\/$/, '')}/${encodeURIComponent(filename)}`;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class MediaRepository {
  private readonly imageDir: string;
  private readonly metadataPath: string;
  private readonly publicBasePath: string;

  constructor(options: MediaRepositoryOptions = {}) {
    this.imageDir = path.resolve(options.imageDir ?? defaultImageDir);
    this.metadataPath = path.resolve(options.metadataPath ?? defaultMetadataPath);
    this.publicBasePath = options.publicBasePath ?? '/images';
  }

  createSafeFilename(originalName: string) {
    const sourceName = path.basename(originalName || 'image');
    const extension = getExtension(sourceName);
    if (!extension) {
      throw new ValidationError('Only JPG, PNG, GIF, and WebP images can be uploaded');
    }

    const rawStem = path.basename(sourceName, path.extname(sourceName));
    const stem =
      rawStem
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image';

    return `${stem}-${randomUUID()}.${extension}`;
  }

  mimeTypeForFilename(filename: string) {
    const extension = getExtension(filename);
    return extension ? extensionToMimeType[extension] : null;
  }

  async listAssets(): Promise<MediaAsset[]> {
    await this.ensureDirectories();
    const [metadata, entries] = await Promise.all([
      this.readMetadata(),
      fs.readdir(this.imageDir, { withFileTypes: true }),
    ]);

    const assets = await Promise.all(
      entries
        .filter(
          (entry) => entry.isFile() && !entry.name.startsWith('.') && getExtension(entry.name)
        )
        .map(async (entry) => this.buildAsset(entry.name, metadata))
    );

    return assets.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async getAsset(assetId: string): Promise<MediaAsset> {
    await this.ensureDirectories();
    const filename = normalizeAssetId(assetId);
    const metadata = await this.readMetadata();
    return this.buildAsset(filename, metadata);
  }

  async saveUploadedFile(input: SaveUploadedFileInput): Promise<MediaAsset> {
    await this.ensureDirectories();
    const filename = normalizeAssetId(input.filename);
    const targetPath = this.resolveImagePath(filename);
    const now = new Date().toISOString();

    await fs.writeFile(targetPath, input.fileBuffer);

    const metadata = await this.readMetadata();
    metadata[filename] = {
      ...metadata[filename],
      createdAt: metadata[filename]?.createdAt ?? now,
      folder: metadata[filename]?.folder ?? 'uncategorized',
      height: metadata[filename]?.height ?? null,
      mimeType: input.mimeType,
      originalName: input.originalName,
      size: input.size,
      updatedAt: now,
      width: metadata[filename]?.width ?? null,
    };
    await this.writeMetadata(metadata);

    return this.buildAsset(filename, metadata);
  }

  async updateMetadata(
    assetId: string,
    input: Partial<Pick<MediaAsset, 'altText' | 'folder' | 'tags'>>
  ) {
    await this.ensureDirectories();
    const filename = normalizeAssetId(assetId);
    const metadata = await this.readMetadata();
    const existingAsset = await this.buildAsset(filename, metadata);
    const now = new Date().toISOString();

    metadata[filename] = {
      ...metadata[filename],
      altText: normalizeOptionalText(input.altText),
      createdAt: metadata[filename]?.createdAt ?? existingAsset.createdAt,
      folder: input.folder ?? metadata[filename]?.folder ?? 'uncategorized',
      tags: normalizeOptionalText(input.tags),
      updatedAt: now,
    };
    await this.writeMetadata(metadata);

    return this.buildAsset(filename, metadata);
  }

  async deleteAsset(assetId: string) {
    await this.ensureDirectories();
    const filename = normalizeAssetId(assetId);
    const targetPath = this.resolveImagePath(filename);

    try {
      await fs.unlink(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError('Media asset not found');
      }
      throw error;
    }

    const metadata = await this.readMetadata();
    delete metadata[filename];
    await this.writeMetadata(metadata);
    return { success: true };
  }

  private async buildAsset(filename: string, metadata: MetadataFile): Promise<MediaAsset> {
    const safeFilename = normalizeAssetId(filename);
    const targetPath = this.resolveImagePath(safeFilename);
    const extensionMimeType = this.mimeTypeForFilename(safeFilename);
    if (!extensionMimeType) {
      throw new ValidationError('Unsupported media file extension');
    }

    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError('Media asset not found');
      }
      throw error;
    }

    const entry = metadata[safeFilename];
    return mediaAssetSchema.parse({
      altText: entry?.altText ?? null,
      createdAt: entry?.createdAt ?? stats.birthtime.toISOString(),
      filename: safeFilename,
      folder: entry?.folder ?? 'uncategorized',
      height: entry?.height ?? null,
      id: safeFilename,
      mimeType: entry?.mimeType ?? extensionMimeType,
      originalName: entry?.originalName ?? null,
      size: stats.size,
      tags: entry?.tags ?? null,
      updatedAt: entry?.updatedAt ?? stats.mtime.toISOString(),
      url: toPublicUrl(this.publicBasePath, safeFilename),
      width: entry?.width ?? null,
    });
  }

  private resolveImagePath(filename: string) {
    const resolved = path.resolve(this.imageDir, filename);
    if (resolved !== this.imageDir && !resolved.startsWith(`${this.imageDir}${path.sep}`)) {
      throw new ValidationError('Invalid media filename');
    }
    return resolved;
  }

  private async ensureDirectories() {
    await Promise.all([
      fs.mkdir(this.imageDir, { recursive: true }),
      fs.mkdir(path.dirname(this.metadataPath), { recursive: true }),
    ]);
  }

  private async readMetadata(): Promise<MetadataFile> {
    try {
      const raw = await fs.readFile(this.metadataPath, 'utf8');
      return metadataFileSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        throw new ValidationError('Media metadata file is invalid');
      }
      throw error;
    }
  }

  private async writeMetadata(metadata: MetadataFile) {
    const tempPath = `${this.metadataPath}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(metadata, null, 2)}\n`);
    await fs.rename(tempPath, this.metadataPath);
  }
}

export const mediaRepository = new MediaRepository();
