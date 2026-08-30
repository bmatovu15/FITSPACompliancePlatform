// Safe to expose to the browser — the Supabase anon key/URL are public by
// design; security is enforced by row-level security policies server-side.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uybjqeuxmvzaalosgtot.supabase.co";
