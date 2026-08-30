// Server-only. Never import this from a "use client" file — these values must
// not end up in the browser bundle. Falls back to the values configured for
// this deployment when the equivalent Vercel environment variable isn't set;
// once real env vars are added in the Vercel dashboard, remove the fallback.
export const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "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";
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
