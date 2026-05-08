import type { Context } from 'hono';
import { endTime as honoEndTime, startTime as honoStartTime } from 'hono/timing';

export const startTime = (c: Context, name: string, description?: string) => {
  try {
    honoStartTime(c, name, description);
  } catch (_e) {
    // Timing middleware might not be enabled for this route
  }
};

export const endTime = (c: Context, name: string) => {
  try {
    honoEndTime(c, name);
  } catch (_e) {
    // Timing middleware might not be enabled for this route
  }
};

export const time = async <T>(
  c: Context,
  name: string,
  fn: () => Promise<T>,
  description?: string
): Promise<T> => {
  startTime(c, name, description);
  try {
    return await fn();
  } finally {
    endTime(c, name);
  }
};
