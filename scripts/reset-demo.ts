import { openPersistentPostgres } from './pg-engine';
import { seedDatabase } from './seed';

async function main() {
  const start = Date.now();
  const db = await openPersistentPostgres(true);
  await seedDatabase(db);
  await db.close();
  console.log(`✅ Demo state restored in ${Date.now() - start}ms.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Demo reset failed:', err);
  process.exit(1);
});

