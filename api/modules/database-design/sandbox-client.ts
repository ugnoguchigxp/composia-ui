import postgres from 'postgres';
import { config } from '../../config';
import { ValidationError } from '../../lib/errors';

let sandboxSql: postgres.Sql | null = null;

export function getSandboxSql() {
  if (!config.SANDBOX_DATABASE_URL) {
    throw new ValidationError('SANDBOX_DATABASE_URL is not configured');
  }

  sandboxSql ??= postgres(config.SANDBOX_DATABASE_URL, { max: 5 });
  return sandboxSql;
}
