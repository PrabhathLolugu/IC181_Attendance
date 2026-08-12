import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { Staff } from '../types';

interface AuthState {
  loading: boolean;
  staff: Staff | null;
  session: Session | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, staff: null, session: null });

  useEffect(() => {
    let active = true;

    async function resolve(session: Session | null) {
      if (!session) {
        if (active) setState({ loading: false, staff: null, session: null });
        return;
      }
      let { data } = await supabase.from('staff').select('*').eq('id', session.user.id).maybeSingle();
      if (!data && session.user) {
        // Auto-provision staff account for signed up users
        const name = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User';
        const { data: created } = await supabase.from('staff').insert({
          id: session.user.id,
          email: session.user.email || '',
          name,
          role: 'admin',
          status: 'active',
        }).select().maybeSingle();
        data = created;
      }
      if (active) setState({ loading: false, staff: (data as Staff) ?? null, session });
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
}
