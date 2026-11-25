import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import { FULL_SCHEMA_AND_CONFIG_SQL } from './sql-bundle';
import { seedBrowserDemoDatabase } from './demo-seed';

async function ensureSchemaAndSeed(db: PGlite): Promise<void> {
  let profileCount = 0;
  let schemaReady = false;
  try {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public.profiles;`
    );
    profileCount = Number(res.rows[0]?.count || 0);
    schemaReady = true;
  } catch {
    schemaReady = false;
  }

  if (!schemaReady) {
    await db.exec(FULL_SCHEMA_AND_CONFIG_SQL);
  }

  if (profileCount === 0) {
    await seedBrowserDemoDatabase(db);
  }
}

void worker({
  async init(options) {
    let db: PGlite;
    try {
      db = new PGlite(options.dataDir || 'idb://suklink-demo-pg-v1', {
        relaxedDurability: true,
      });
      await db.waitReady;
    } catch {
      db = new PGlite();
      await db.waitReady;
    }

    await ensureSchemaAndSeed(db);
    return db;
  },
});
