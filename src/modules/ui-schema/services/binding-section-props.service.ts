import type { AppUiSchema, AppUiSchemaSection } from '../../../../shared/schemas/ui-schema.schema';

type BoundRow = Record<string, unknown>;
const rowBoundComponents = new Set([
  'CardGridSection',
  'CarouselSection',
  'DataTableSection',
  'MainSearchNavigationSection',
]);

export type RenderableSchemaSection = {
  index: number;
  props: Record<string, unknown>;
  section: AppUiSchemaSection;
};

function hasOwnBindingRows(
  bindingRows: Record<string, BoundRow[]> | undefined,
  dataBindingId: string
) {
  return Object.hasOwn(bindingRows ?? {}, dataBindingId);
}

function scalarText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function firstText(row: BoundRow, keys: string[]) {
  for (const key of keys) {
    const value = scalarText(row[key]);
    if (value) return value;
  }
  return '';
}

function fallbackText(row: BoundRow) {
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue;
    const text = scalarText(value);
    if (text) return text;
  }
  return scalarText(row.id) || 'Untitled';
}

function metadataFromRow(row: BoundRow) {
  const hiddenKeys = new Set([
    'id',
    'title',
    'name',
    'label',
    'display_name',
    'displayName',
    'description',
    'summary',
    'body',
    'content',
    'href',
    'url',
    'image',
    'image_url',
    'imageUrl',
    'src',
  ]);
  const entries = Object.entries(row)
    .filter(([key, value]) => !hiddenKeys.has(key) && scalarText(value))
    .slice(0, 3)
    .map(([key, value]) => ({ label: key, value: scalarText(value) }));

  if (entries.length === 0) return undefined;
  if (entries.length === 1) return entries[0];
  return Object.fromEntries(entries.map((entry) => [entry.label, entry.value]));
}

function imageFromRow(row: BoundRow) {
  const candidate = row.image;
  if (
    candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    typeof (candidate as { src?: unknown }).src === 'string' &&
    typeof (candidate as { alt?: unknown }).alt === 'string'
  ) {
    return candidate;
  }

  const src = firstText(row, ['image_url', 'imageUrl', 'src']);
  if (!src) return undefined;
  return { src, alt: firstText(row, ['title', 'name', 'label']) || 'Image' };
}

function hrefFromRow(row: BoundRow) {
  const href = firstText(row, ['href', 'url']);
  return href.startsWith('/') && !href.startsWith('//') ? href : undefined;
}

function cardItemFromRow(row: BoundRow) {
  const title =
    firstText(row, ['title', 'name', 'label', 'display_name', 'displayName']) || fallbackText(row);
  const description = firstText(row, ['description', 'summary', 'body', 'content']) || undefined;
  return {
    title,
    ...(description ? { description } : {}),
    ...(hrefFromRow(row) ? { href: hrefFromRow(row) } : {}),
    ...(imageFromRow(row) ? { image: imageFromRow(row) } : {}),
    ...(metadataFromRow(row) ? { meta: metadataFromRow(row) } : {}),
  };
}

export function resolveBoundSectionProps(section: AppUiSchemaSection, rows: BoundRow[]) {
  if (section.component === 'DataTableSection') return { ...section.props, rows };
  if (section.component === 'CardGridSection' || section.component === 'CarouselSection') {
    return { ...section.props, items: rows.map(cardItemFromRow) };
  }
  if (section.component === 'MainSearchNavigationSection') {
    return { ...section.props, results: rows.map(cardItemFromRow) };
  }
  return section.props;
}

export function resolveRenderableSchemaSections(
  schema: AppUiSchema,
  bindingRows?: Record<string, BoundRow[]>
): RenderableSchemaSection[] {
  return schema.sections.flatMap((section, index) => {
    if (!section.dataBindingId || !rowBoundComponents.has(section.component)) {
      return [{ index, props: section.props, section }];
    }

    if (!hasOwnBindingRows(bindingRows, section.dataBindingId)) return [];

    const rows = bindingRows?.[section.dataBindingId] ?? [];
    if (rows.length === 0) return [];

    return [
      {
        index,
        props: resolveBoundSectionProps(section, rows),
        section,
      },
    ];
  });
}
