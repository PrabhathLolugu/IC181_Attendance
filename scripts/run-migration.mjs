import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ref = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;
const poolerHost = process.env.SUPABASE_POOLER_HOST || 'aws-0-ap-south-1.pooler.supabase.com';

if (!ref || !password) {
  console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_DB_PASSWORD in the environment.');
  process.exit(1);
}

// The direct db.<ref>.supabase.co host is IPv6-only on this project and unreachable from here,
// so we go through the IPv4 session pooler instead (same database, different route).
const client = new Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`,
});

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

try {
  await client.connect();
  await client.query(`
    create table if not exists public._migrations_applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const { rows } = await client.query('select filename from public._migrations_applied;');
  const already = new Set(rows.map((r) => r.filename));

  const pending = files.filter((f) => !already.has(f));
  if (pending.length === 0) {
    console.log('Nothing to apply — all migrations already recorded as applied.');
  } else {
    console.log(`Applying ${pending.length} pending migration(s) (${files.length - pending.length} already applied)...`);
    for (const file of pending) {
      console.log(`  -> ${file}`);
      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._migrations_applied (filename) values ($1);', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
    console.log('Migration completed successfully.');
  }
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
