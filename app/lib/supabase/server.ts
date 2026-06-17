import "server-only";
import { createClient } from "@supabase/supabase-js";

function makeClient(serviceRole = false) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = serviceRole
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
    : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
  return createClient(url, key);
}

export const getReadSupabase  = () => makeClient(false);
export const getWriteSupabase = () => makeClient(true);
