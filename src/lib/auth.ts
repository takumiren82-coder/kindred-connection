import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user as User | undefined, loading };
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

export function displayName(user?: User | null): string {
  if (!user) return "Reader";
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  return (
    meta.full_name ||
    meta.name ||
    (user.email ? user.email.split("@")[0] : "Reader")
  );
}

export function avatarUrl(user?: User | null): string | undefined {
  if (!user) return;
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  return meta.avatar_url || meta.picture;
}