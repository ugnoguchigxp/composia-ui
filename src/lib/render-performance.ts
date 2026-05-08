type RenderPerfDetails = Record<string, unknown>;

const isRenderPerfEnabled = import.meta.env.DEV;
const minLoggedDurationMs = 1;

export function renderPerfStart() {
  return isRenderPerfEnabled ? performance.now() : 0;
}

export function logRenderPerf(label: string, startedAt: number, _details?: RenderPerfDetails) {
  if (!isRenderPerfEnabled) return;
  const duration = performance.now() - startedAt;
  if (duration < minLoggedDurationMs && !label.endsWith('.commit')) return;
  console.log(`[UIDesign render] ${label}: ${duration.toFixed(2)}ms`);
}

export function measureRenderTask<T>(
  label: string,
  task: () => T,
  _details?: (result: T) => RenderPerfDetails
) {
  const startedAt = renderPerfStart();
  const result = task();
  logRenderPerf(label, startedAt);
  return result;
}
