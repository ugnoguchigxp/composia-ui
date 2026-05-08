import {
  type AppAction,
  type AppUiSchema,
  type AppUiSchemaSection,
  appRelativePathSchema,
  appUiSchemaSchema,
} from './ui-schema.schema';

type HrefCandidate = {
  label: string;
  path: string[];
  target: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAppRelativePath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

function labelForRecord(value: Record<string, unknown>, fallback: string) {
  for (const key of ['label', 'title', 'name']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function slugifyActionPart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'link';
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function collectHrefCandidates(value: unknown, path: string[] = []): HrefCandidate[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectHrefCandidates(item, [...path, String(index)]));
  }

  if (!isRecord(value)) return [];

  const href = value.href;
  const ownCandidate =
    typeof href === 'string' && href.trim() && isAppRelativePath(href.trim())
      ? [
          {
            label: labelForRecord(value, href.trim()),
            path,
            target: href.trim(),
          },
        ]
      : [];

  return [
    ...ownCandidate,
    ...Object.entries(value).flatMap(([key, child]) =>
      key === 'href' ? [] : collectHrefCandidates(child, [...path, key])
    ),
  ];
}

function syntheticActionId(sectionIndex: number, candidate: HrefCandidate, duplicateIndex: number) {
  const path = candidate.path.length > 0 ? candidate.path.join('-') : 'href';
  const suffix = hashString(`${sectionIndex}:${path}:${candidate.label}`);
  const duplicate = duplicateIndex > 0 ? `-${duplicateIndex + 1}` : '';
  return `section-${sectionIndex}-${slugifyActionPart(path)}-${slugifyActionPart(
    candidate.label
  )}-${suffix}${duplicate}`.slice(0, 120);
}

export function collectSectionRenderableActions(
  section: AppUiSchemaSection,
  sectionIndex: number
): AppAction[] {
  const actions = [...(section.actions ?? [])];
  const seenIds = new Set(actions.map((action) => action.id));
  const seenSemanticTargets = new Set(
    actions.map((action) => `${action.label}\n${action.target ?? ''}`)
  );
  const syntheticCounts = new Map<string, number>();

  for (const candidate of collectHrefCandidates(section.props)) {
    const semanticTarget = `${candidate.label}\n${candidate.target}`;
    if (seenSemanticTargets.has(semanticTarget)) continue;
    if (
      actions.some(
        (action) => action.label === candidate.label || action.target === candidate.target
      )
    ) {
      continue;
    }

    const key = `${candidate.path.join('.')}:${candidate.label}:${candidate.target}`;
    const count = syntheticCounts.get(key) ?? 0;
    syntheticCounts.set(key, count + 1);
    let id = syntheticActionId(sectionIndex, candidate, count);
    let disambiguator = 2;
    while (seenIds.has(id)) {
      id = `${syntheticActionId(sectionIndex, candidate, count)}-${disambiguator}`.slice(0, 120);
      disambiguator += 1;
    }

    const action: AppAction = {
      carry: {
        navigation: true,
        sourceContext: true,
        visualIntent: true,
      },
      id,
      label: candidate.label,
      kind: 'generate-screen',
      target: candidate.target,
      intentHint: `${candidate.label} page`,
    };
    actions.push(action);
    seenIds.add(action.id);
    seenSemanticTargets.add(semanticTarget);
  }

  return actions;
}

export function collectRenderableActions(schema: AppUiSchema): AppAction[] {
  return schema.sections.flatMap((section, index) =>
    collectSectionRenderableActions(section, index)
  );
}

function cloneSchema(schema: AppUiSchema): AppUiSchema {
  return appUiSchemaSchema.parse(structuredClone(schema));
}

function setHrefAtPath(props: Record<string, unknown>, path: string[], target: string) {
  const nextProps = structuredClone(props);
  let current: unknown = nextProps;
  for (const segment of path) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
      continue;
    }
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  if (!isRecord(current)) return null;
  current.href = target;
  return nextProps;
}

export function updateRenderableActionTarget(
  schema: AppUiSchema,
  actionId: string,
  target: string
): { action: AppAction; schema: AppUiSchema } | null {
  const parsedTarget = appRelativePathSchema.parse(target);
  const nextSchema = cloneSchema(schema);

  for (const [sectionIndex, section] of nextSchema.sections.entries()) {
    const actionIndex = section.actions?.findIndex((action) => action.id === actionId) ?? -1;
    if (section.actions && actionIndex >= 0) {
      const currentAction = section.actions[actionIndex];
      if (!currentAction) return null;
      const nextAction: AppAction = {
        ...currentAction,
        target: parsedTarget,
      };
      section.actions = section.actions.map((action, index) =>
        index === actionIndex ? nextAction : action
      );
      return { action: nextAction, schema: appUiSchemaSchema.parse(nextSchema) };
    }

    const seenIds = new Set(section.actions?.map((action) => action.id) ?? []);
    const syntheticCounts = new Map<string, number>();
    for (const candidate of collectHrefCandidates(section.props)) {
      const key = `${candidate.path.join('.')}:${candidate.label}:${candidate.target}`;
      const count = syntheticCounts.get(key) ?? 0;
      syntheticCounts.set(key, count + 1);
      let id = syntheticActionId(sectionIndex, candidate, count);
      let disambiguator = 2;
      while (seenIds.has(id)) {
        id = `${syntheticActionId(sectionIndex, candidate, count)}-${disambiguator}`.slice(0, 120);
        disambiguator += 1;
      }
      seenIds.add(id);
      if (id !== actionId) continue;
      const nextProps = setHrefAtPath(section.props, candidate.path, parsedTarget);
      if (!nextProps) return null;
      section.props = nextProps;
      const updatedAction =
        collectSectionRenderableActions(section, sectionIndex).find(
          (action) => action.id === actionId
        ) ?? null;
      if (!updatedAction) return null;
      return { action: updatedAction, schema: appUiSchemaSchema.parse(nextSchema) };
    }
  }

  return null;
}
