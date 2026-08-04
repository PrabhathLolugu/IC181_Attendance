import { Client } from 'pg';

const ref = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;
const poolerHost = process.env.SUPABASE_POOLER_HOST;

const client = new Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`,
});

await client.connect();

const { rows: tables } = await client.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name;
`);
console.log('Tables:', tables.map((t) => t.table_name).join(', '));

const { rows: policies } = await client.query(`
  select tablename, count(*) as policy_count from pg_policies
  where schemaname = 'public' group by tablename order by tablename;
`);
console.log('RLS policies per table:', JSON.stringify(policies));

const { rows: settings } = await client.query(`select * from course_settings;`);
console.log('course_settings row:', JSON.stringify(settings));

await client.end();
