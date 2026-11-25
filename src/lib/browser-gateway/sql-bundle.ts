import m0001 from '../../../supabase/migrations/0001_extensions_enums.sql?raw';
import m0002 from '../../../supabase/migrations/0002_core_tables.sql?raw';
import m0003 from '../../../supabase/migrations/0003_rls.sql?raw';
import m0004 from '../../../supabase/migrations/0004_functions.sql?raw';
import m0005 from '../../../supabase/migrations/0005_views_indexes.sql?raw';
import m0006 from '../../../supabase/migrations/0006_realtime_cron_storage.sql?raw';
import seedConfigSql from '../../../supabase/seed.sql?raw';

export const FULL_SCHEMA_AND_CONFIG_SQL = [
  m0001,
  m0002,
  m0003,
  m0004,
  m0005,
  m0006,
  seedConfigSql,
].join('\n\n');
