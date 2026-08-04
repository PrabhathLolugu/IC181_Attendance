import { createClient } from '@supabase/supabase-js';

const url = `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co`;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const ADMINS = [
  { email: 'loluguprabhath@gmail.com', name: 'Lolugu Prabhath' },
  { email: 'venkatesh@iitmandi.ac.in', name: 'Venkatesh' },
];

for (const { email, name } of ADMINS) {
  const { data: existingStaff } = await admin.from('staff').select('id, email').eq('email', email).maybeSingle();
  if (existingStaff) {
    console.log(`Already exists, skipping: ${email}`);
    continue;
  }

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteErr) {
    console.error(`Failed to invite ${email}:`, inviteErr.message);
    continue;
  }

  const { error: staffErr } = await admin.from('staff').insert({
    id: invited.user.id,
    email,
    name,
    role: 'admin',
  });

  if (staffErr) {
    console.error(`Invited ${email} but failed to create staff row:`, staffErr.message);
  } else {
    console.log(`Invited and registered as admin: ${email}`);
  }
}
