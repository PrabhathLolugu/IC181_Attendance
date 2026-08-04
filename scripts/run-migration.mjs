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
  console.log(`Connected. Applying ${files.length} migration file(s)...`);
  for (const file of files) {
    console.log(`  -> ${file}`);
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
  }
  console.log('Migration completed successfully.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
