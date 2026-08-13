import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://wkiejppvzbzuhzwflbon.supabase.co';
const DEFAULT_KEY = 'sb_publishable_ErzyOyGkBlD7WpI2OZQc0g_MjyA2ahP';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  DEFAULT_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
