import { supabase } from '../services/supabase';

export async function callFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message || 'Something went wrong. Please try again.';
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx?.json) {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        /* response wasn't JSON — keep the default message */
      }
    }
    throw new Error(message);
  }
  return data as T;
}
