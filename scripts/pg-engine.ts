import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const PGLITE_DATA_DIR = path.join(PROJECT_ROOT, '.pglite-data');

const MIGRATION_FILES = [
  '0001_extensions_enums.sql',
  '0002_core_tables.sql',
  '0003_rls.sql',
  '0004_functions.sql',
  '0005_views_indexes.sql',
  '0006_realtime_cron_storage.sql',
  '0007_order_counters.sql',
  '0008_walk_in_credit_and_balances.sql',
];

export async function applyMigrationsAndSeedSql(db: PGlite): Promise<void> {
  // Concatenate all migration SQL and configuration seed into a single transaction for <1s execution
  const migrationsDir = path.join(PROJECT_ROOT, 'supabase', 'migrations');
  const chunks: string[] = [];
  for (const file of MIGRATION_FILES) {
    const sqlPath = path.join(migrationsDir, file);
    chunks.push(fs.readFileSync(sqlPath, 'utf-8'));
  }
  const seedSqlPath = path.join(PROJECT_ROOT, 'supabase', 'seed.sql');
  if (fs.existsSync(seedSqlPath)) {
    chunks.push(fs.readFileSync(seedSqlPath, 'utf-8'));
  }
  await db.exec(chunks.join('\n\n'));
}

export async function createInMemoryPostgres(): Promise<PGlite> {
  const db = new PGlite();
  await applyMigrationsAndSeedSql(db);
  return db;
}

export async function openPersistentPostgres(reset = false, inMemoryFast = false): Promise<PGlite> {
  if (inMemoryFast) {
    const db = new PGlite();
    await applyMigrationsAndSeedSql(db);
    return db;
  }
  if (reset && fs.existsSync(PGLITE_DATA_DIR)) {
    fs.rmSync(PGLITE_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PGLITE_DATA_DIR, { recursive: true });
  // Use relaxedDurability so filesystem flushes do not stall on macOS during bulk seed/reset
  const db = new PGlite(PGLITE_DATA_DIR, { relaxedDurability: true });
  await applyMigrationsAndSeedSql(db);
  return db;
}

export interface JwtContext {
  sub?: string;
  role?: 'authenticated' | 'anon' | 'service_role';
  appRole?: 'customer' | 'shop_owner' | 'admin';
  email?: string;
}

/**
 * Executes a parameterized query or block inside a transaction with PostgreSQL RLS active
 * for the given JWT user context.
 */
export async function queryAsUser<T = Record<string, any>>(
  db: PGlite,
  ctx: JwtContext,
  sql: string,
  params: any[] = []
): Promise<{ rows: T[] }> {
  const next = dbQueryMutex.then(async () => {
    const pgRole = ctx.role || (ctx.sub ? 'authenticated' : 'anon');
    const claims = ctx.sub
      ? JSON.stringify({
          sub: ctx.sub,
          role: pgRole,
          email: ctx.email || '',
          app_metadata: { role: ctx.appRole || 'customer' },
        })
      : '{}';

    return await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${pgRole};`);
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [ctx.sub || '']);
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true);`, [claims]);
      const res = await tx.query<T>(sql, params);
      return { rows: res.rows };
    });
  });
  dbQueryMutex = next.catch(() => {});
  return next;
}

let dbQueryMutex: Promise<any> = Promise.resolve();
