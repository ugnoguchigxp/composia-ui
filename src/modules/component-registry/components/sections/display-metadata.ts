type DisplayMetadata =
  | string
  | number
  | boolean
  | null
  | { label: string; value: string | number | boolean | null }
  | Array<{ label: string; value: string | number | boolean | null }>
  | Record<string, string | number | boolean | null>;

function formatValue(value: string | number | boolean | null) {
  if (value === null) return '';
  return String(value);
}

export function formatDisplayMetadata(meta: DisplayMetadata | undefined) {
  if (meta === undefined) return undefined;

  if (typeof meta === 'string' || typeof meta === 'number' || typeof meta === 'boolean') {
    return String(meta);
  }

  if (meta === null) return undefined;

  if (Array.isArray(meta)) {
    return meta
      .map((item) => `${item.label}: ${formatValue(item.value)}`)
      .filter((item) => item.trim().length > 0)
      .join(' / ');
  }

  if ('label' in meta && 'value' in meta) {
    return `${meta.label}: ${formatValue(meta.value)}`;
  }

  return Object.entries(meta)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .filter((item) => item.trim().length > 0)
    .join(' / ');
}
