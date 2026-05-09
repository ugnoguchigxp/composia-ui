import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Edit2,
  Folder,
  Image,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import type {
  MediaAsset,
  MediaFolder,
  MediaListQuery,
} from '../../../../shared/schemas/media.schema';
import { mediaFolders } from '../../../../shared/schemas/media.schema';
import {
  useDeleteMediaAsset,
  useMediaAssets,
  useUpdateMediaAsset,
  useUploadMediaAssets,
} from '../hooks/media.hooks';

type MediaSortBy = MediaListQuery['sortBy'];
type MediaSortOrder = MediaListQuery['sortOrder'];
type FolderFilter = MediaListQuery['folder'];

const folderLabels: Record<MediaFolder, string> = {
  articles: 'Articles',
  banners: 'Banners',
  icons: 'Icons',
  others: 'Others',
  thumbnails: 'Thumbnails',
  uncategorized: 'Uncategorized',
};

const sortLabels: Record<MediaSortBy, string> = {
  date: 'Date',
  name: 'Name',
  size: 'Size',
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function mediaMarkdown(asset: MediaAsset) {
  return `![${asset.altText || asset.originalName || asset.filename}](${asset.url})`;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function MediaLibrary() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState<MediaListQuery>({
    folder: 'all',
    limit: 24,
    page: 1,
    q: '',
    sortBy: 'date',
    sortOrder: 'desc',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const media = useMediaAssets(query);
  const uploadAssets = useUploadMediaAssets();
  const updateAsset = useUpdateMediaAsset();
  const deleteAsset = useDeleteMediaAsset();

  const files = media.data?.files ?? [];
  const pagination = media.data?.pagination ?? {
    limit: query.limit,
    page: query.page,
    total: 0,
    totalPages: 0,
  };
  const selectedOnPage = useMemo(
    () => files.filter((asset) => selectedIds.has(asset.id)),
    [files, selectedIds]
  );
  const pageCount = pagination.totalPages || 1;
  const isMutating = uploadAssets.isPending || deleteAsset.isPending || updateAsset.isPending;

  const patchQuery = (patch: Partial<MediaListQuery>) => {
    setQuery((current) => ({ ...current, ...patch }));
  };

  const handleUpload = async (fileList: FileList | null) => {
    const filesToUpload = Array.from(fileList ?? []);
    if (filesToUpload.length === 0) return;
    await uploadAssets.mutateAsync(filesToUpload);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    patchQuery({ page: 1, sortBy: 'date', sortOrder: 'desc' });
  };

  const handleCopy = async (asset: MediaAsset, value: string) => {
    await copyText(value);
    setCopiedId(asset.id);
    window.setTimeout(() => setCopiedId(null), 1200);
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (!window.confirm(`Delete "${asset.filename}"?`)) return;
    await deleteAsset.mutateAsync(asset.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(asset.id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected media assets?`)) return;
    for (const assetId of selectedIds) {
      await deleteAsset.mutateAsync(assetId);
    }
    setSelectedIds(new Set());
  };

  const toggleSelection = (assetId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selectedOnPage.length === files.length) {
        for (const asset of files) {
          next.delete(asset.id);
        }
      } else {
        for (const asset of files) {
          next.add(asset.id);
        }
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <input
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        multiple
        onChange={(event) => handleUpload(event.target.files)}
        ref={fileInputRef}
        type="file"
      />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm outline-none ring-primary/20 transition-all focus:border-primary focus:ring-4"
            onChange={(event) => patchQuery({ page: 1, q: event.target.value })}
            placeholder="Search media..."
            value={query.q ?? ''}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <select
              className="bg-transparent text-sm outline-none"
              onChange={(event) =>
                patchQuery({ folder: event.target.value as FolderFilter, page: 1 })
              }
              value={query.folder}
            >
              <option value="all">All folders</option>
              {mediaFolders.map((folder) => (
                <option key={folder} value={folder}>
                  {folderLabels[folder]}
                </option>
              ))}
            </select>
          </label>

          <select
            aria-label="Sort media"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none"
            onChange={(event) => patchQuery({ sortBy: event.target.value as MediaSortBy })}
            value={query.sortBy}
          >
            {Object.entries(sortLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            aria-label={`Sort ${query.sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background hover:bg-secondary"
            onClick={() =>
              patchQuery({
                sortOrder: (query.sortOrder === 'asc' ? 'desc' : 'asc') as MediaSortOrder,
              })
            }
            type="button"
          >
            {query.sortOrder === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </button>

          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={uploadAssets.isPending}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {uploadAssets.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-1 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          {pagination.total} assets
          {selectedIds.size > 0 ? (
            <span className="ml-2 text-foreground">({selectedIds.size} selected)</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            disabled={files.length === 0}
            onClick={togglePageSelection}
            type="button"
          >
            {selectedOnPage.length === files.length && files.length > 0
              ? 'Clear page'
              : 'Select page'}
          </button>
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 px-3 text-destructive text-xs font-medium hover:bg-destructive/10 disabled:opacity-50"
            disabled={selectedIds.size === 0 || deleteAsset.isPending}
            onClick={handleBulkDelete}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      {media.error ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
          <h2 className="font-semibold text-destructive">Media request failed</h2>
          <p className="mt-2 text-muted-foreground text-sm">{media.error.message}</p>
        </section>
      ) : media.isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
            <p className="text-sm font-medium tracking-wide">Loading media assets...</p>
          </div>
        </div>
      ) : files.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card text-center">
          <Image className="h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-3 font-semibold">No media assets</h2>
          <p className="mt-1 max-w-sm text-muted-foreground text-sm">
            Upload images to use them as /images assets in generated screens.
          </p>
          <button
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload className="h-4 w-4" />
            Upload images
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {files.map((asset) => (
            <article
              className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm"
              key={asset.id}
            >
              <div className="relative aspect-[4/3] bg-muted">
                <button
                  aria-label={`Preview ${asset.filename}`}
                  className="h-full w-full"
                  onClick={() => setPreviewAsset(asset)}
                  type="button"
                >
                  <img
                    alt={asset.altText || asset.originalName || asset.filename}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    src={asset.url}
                  />
                </button>
                <label className="absolute top-2 left-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-background/90 shadow-sm">
                  <input
                    aria-label={`Select ${asset.filename}`}
                    checked={selectedIds.has(asset.id)}
                    className="h-4 w-4"
                    onChange={() => toggleSelection(asset.id)}
                    type="checkbox"
                  />
                </label>
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconButton label="Preview" onClick={() => setPreviewAsset(asset)}>
                    <ZoomIn className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Edit" onClick={() => setEditingAsset(asset)}>
                    <Edit2 className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Copy Markdown"
                    onClick={() => handleCopy(asset, mediaMarkdown(asset))}
                  >
                    {copiedId === asset.id ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </IconButton>
                </div>
              </div>
              <div className="space-y-2 p-3">
                <div>
                  <h3 className="truncate font-medium text-sm" title={asset.filename}>
                    {asset.filename}
                  </h3>
                  <p className="truncate text-muted-foreground text-xs">
                    {folderLabels[asset.folder]} · {formatBytes(asset.size)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground text-[11px]">
                    {formatDate(asset.createdAt)}
                  </span>
                  <button
                    aria-label={`Delete ${asset.filename}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    disabled={isMutating}
                    onClick={() => handleDelete(asset)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-border border-t px-1 pt-4">
        <div className="text-muted-foreground text-xs">
          Page {query.page} of {pageCount}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            disabled={query.page <= 1}
            onClick={() => patchQuery({ page: query.page - 1 })}
            type="button"
          >
            Previous
          </button>
          <button
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            disabled={query.page >= pageCount}
            onClick={() => patchQuery({ page: query.page + 1 })}
            type="button"
          >
            Next
          </button>
        </div>
      </div>

      {previewAsset ? (
        <MediaPreview
          asset={previewAsset}
          copied={copiedId === previewAsset.id}
          onClose={() => setPreviewAsset(null)}
          onCopy={() => handleCopy(previewAsset, mediaMarkdown(previewAsset))}
          onDelete={() => handleDelete(previewAsset)}
          onEdit={() => setEditingAsset(previewAsset)}
        />
      ) : null}

      {editingAsset ? (
        <MediaEdit
          asset={editingAsset}
          isSaving={updateAsset.isPending}
          onClose={() => setEditingAsset(null)}
          onSave={async (input) => {
            await updateAsset.mutateAsync({ assetId: editingAsset.id, input });
            setEditingAsset(null);
          }}
        />
      ) : null}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function MediaPreview({
  asset,
  copied,
  onClose,
  onCopy,
  onDelete,
  onEdit,
}: {
  asset: MediaAsset;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="grid max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-xl md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-80 items-center justify-center bg-muted p-4">
          <img
            alt={asset.altText || asset.originalName || asset.filename}
            className="max-h-[72vh] max-w-full object-contain"
            src={asset.url}
          />
        </div>
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{asset.filename}</h2>
              <p className="text-muted-foreground text-sm">{folderLabels[asset.folder]}</p>
            </div>
            <button
              aria-label="Close preview"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <dl className="grid gap-3 text-sm">
            <MetadataRow label="URL" value={asset.url} />
            <MetadataRow label="Original" value={asset.originalName || 'n/a'} />
            <MetadataRow label="Size" value={formatBytes(asset.size)} />
            <MetadataRow label="Type" value={asset.mimeType} />
            <MetadataRow label="Created" value={formatDate(asset.createdAt)} />
            <MetadataRow label="Alt text" value={asset.altText || 'n/a'} />
            <MetadataRow label="Tags" value={asset.tags || 'n/a'} />
          </dl>

          <div className="mt-auto grid gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={onCopy}
              type="button"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy Markdown
            </button>
            <div className="grid grid-cols-3 gap-2">
              <a
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary"
                download={asset.filename}
                href={asset.url}
              >
                <Download className="h-4 w-4" />
                Save
              </a>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary"
                onClick={onEdit}
                type="button"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-destructive/30 px-3 text-destructive text-sm hover:bg-destructive/10"
                onClick={onDelete}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function MediaEdit({
  asset,
  isSaving,
  onClose,
  onSave,
}: {
  asset: MediaAsset;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: {
    altText: string | null;
    folder: MediaFolder;
    tags: string | null;
  }) => Promise<void>;
}) {
  const [folder, setFolder] = useState<MediaFolder>(asset.folder);
  const [altText, setAltText] = useState(asset.altText ?? '');
  const [tags, setTags] = useState(asset.tags ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        className="w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-xl"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSave({
            altText: altText.trim() || null,
            folder,
            tags: tags.trim() || null,
          });
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">Edit media metadata</h2>
            <p className="truncate text-muted-foreground text-sm">{asset.filename}</p>
          </div>
          <button
            aria-label="Close editor"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Folder</span>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 outline-none"
              onChange={(event) => setFolder(event.target.value as MediaFolder)}
              value={folder}
            >
              {mediaFolders.map((folderOption) => (
                <option key={folderOption} value={folderOption}>
                  {folderLabels[folderOption]}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Alt text</span>
            <input
              className="h-10 rounded-md border border-border bg-background px-3 outline-none ring-primary/20 focus:border-primary focus:ring-4"
              onChange={(event) => setAltText(event.target.value)}
              value={altText}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Tags</span>
            <input
              className="h-10 rounded-md border border-border bg-background px-3 outline-none ring-primary/20 focus:border-primary focus:ring-4"
              onChange={(event) => setTags(event.target.value)}
              placeholder="hero, product, icon"
              value={tags}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
