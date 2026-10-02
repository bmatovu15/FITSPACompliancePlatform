// Server-only. Never import this from a "use client" file — these values must
// not end up in the browser bundle.
//
// OPENROUTER_API_KEY previously fell back to a live key hardcoded directly
// in this file -- which means it was sitting in plain text in GitHub's
// history. That's a real credential-leakage risk on its own (anyone with
// read access to the repo could lift and use it) independent of the key
// having since run out of credit (every assistant call was getting back
// HTTP 402 and silently degrading to the raw-excerpt fallback in
// src/lib/ingest.ts). There is no hardcoded fallback anymore -- set
// OPENROUTER_API_KEY as an actual environment variable in the Vercel
// project's dashboard (Project -> Settings -> Environment Variables).
// Every call site already handles an empty key gracefully: the assistant
// (src/app/api/assistant/route.ts) falls back to a direct document-excerpt
// answer instead of calling the AI, and obligation auto-extraction on
// document upload (src/app/api/admin/documents/route.ts) just skips that
// step -- so leaving this unset doesn't break anything, it only means
// those two AI-assisted features stay off until a real key is configured.
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
// Defaults to Thinking Machines' Inkling (free) -- a free-to-use model on
// OpenRouter (openrouter.ai/thinkingmachines/inkling:free) with a 1M-token
// context window, explicitly intended by its provider for RAG/agentic/
// tool-use workloads, which is exactly this app's use case. Override with
// the OPENROUTER_MODEL env var to switch models without a code change.
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "thinkingmachines/inkling:free";

// Scoped regulator-website search (src/lib/web-search.ts), used by the AI
// Assistant ONLY as a fallback when FITSPA's indexed documents return zero
// matches for a question. Both must be set together or the feature stays
// off (searchRegulatorWeb() returns null and the assistant keeps its
// existing "not covered" behaviour) -- so, like OPENROUTER_API_KEY, leaving
// these unset breaks nothing, it just means that fallback isn't active yet.
//
// GOOGLE_CSE_API_KEY: an API key for Google's Custom Search JSON API,
// created in Google Cloud Console (APIs & Services -> Credentials) with the
// "Custom Search API" enabled. Free for the first 100 queries/day.
//
// GOOGLE_CSE_ID: the "Search engine ID" of a Programmable Search Engine
// (created at programmablesearchengine.google.com) that MUST be configured,
// in its own dashboard, to search only the official regulator domains
// listed in src/lib/web-search.ts's OFFICIAL_REGULATOR_DOMAINS -- never a
// general web search. web-search.ts also re-checks every result's domain
// against that same list as a second safeguard, so a misconfigured search
// engine can't silently widen what the assistant is allowed to cite.
export const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || "";
export const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || "";
