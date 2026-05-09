import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaRepository } from '../api/modules/media/media.repository';
import { MediaService } from '../api/modules/media/media.service';

describe('media service', () => {
  let tempDir: string;
  let imageDir: string;
  let service: MediaService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'composia-media-'));
    imageDir = path.join(tempDir, 'public/images');
    await fs.mkdir(imageDir, { recursive: true });
    const repository = new MediaRepository({
      imageDir,
      metadataPath: path.join(tempDir, 'data/media-assets.json'),
    });
    service = new MediaService(repository);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { force: true, recursive: true });
  });

  it('lists existing public image assets as /images URLs', async () => {
    await fs.writeFile(path.join(imageDir, 'screenshot1.png'), Buffer.from('image'));

    const result = await service.list({
      folder: 'all',
      limit: 24,
      page: 1,
      sortBy: 'date',
      sortOrder: 'desc',
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      filename: 'screenshot1.png',
      folder: 'uncategorized',
      mimeType: 'image/png',
      url: '/images/screenshot1.png',
    });
  });

  it('uploads image files with safe filenames and metadata', async () => {
    const result = await service.upload(
      new File(['image'], 'Hero Banner.PNG', { type: 'image/png' })
    );

    expect(result.success).toBe(true);
    expect(result.asset?.filename).toMatch(/^hero-banner-[0-9a-f-]+\.png$/);
    expect(result.asset).toMatchObject({
      folder: 'uncategorized',
      mimeType: 'image/png',
      originalName: 'Hero Banner.PNG',
    });
    await expect(fs.stat(path.join(imageDir, result.asset?.filename ?? ''))).resolves.toBeTruthy();
  });

  it('filters updated media metadata', async () => {
    const uploaded = await service.upload(new File(['image'], 'hero.webp', { type: 'image/webp' }));
    const assetId = uploaded.asset?.id;
    expect(assetId).toBeTruthy();

    await service.update(assetId ?? '', {
      altText: 'Home hero',
      folder: 'banners',
      tags: 'home, hero',
    });

    const result = await service.list({
      folder: 'banners',
      limit: 24,
      page: 1,
      q: 'home',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      altText: 'Home hero',
      folder: 'banners',
      tags: 'home, hero',
    });
  });

  it('rejects unsupported media uploads', async () => {
    await expect(
      service.upload(new File(['text'], 'note.txt', { type: 'text/plain' }))
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('deletes media files and metadata', async () => {
    const uploaded = await service.upload(
      new File(['image'], 'delete-me.gif', { type: 'image/gif' })
    );
    const assetId = uploaded.asset?.id ?? '';

    await expect(service.delete(assetId)).resolves.toEqual({ success: true });
    await expect(service.delete(assetId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
