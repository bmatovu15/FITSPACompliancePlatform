import { createBrowserClient } from "@supabase/ssr";

// The Supabase URL and anon key are meant to be public (security is enforced
// by row-level security policies, not by keeping these secret), so a hardcoded
// fallback is safe here and keeps the app working even without env vars set.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uybjqeuxmvzaalosgtot.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5YmpxZXV4bXZ6YWFsb3NndG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjk2OTEsImV4cCI6MjEwMTk0NTY5MX0.HG5k5H6EYkvfl6Vrlnh8HUWDDC29ZnN4x0s87nEreVw";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
