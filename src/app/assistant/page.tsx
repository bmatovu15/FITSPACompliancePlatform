"use client";

import { useState } from "react";
import { SUPABASE_URL } from "@/lib/public-config";

type Source = { title: string; regulator: string | null; storage_path: string | null; doc_kind: string };
type Message = { role: "user" | "assistant"; text: string; sources?: Source[] };

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Ask me about a regulator requirement, obligation, or form — I'll answer only from documents FITSPA has indexed and cite my sources.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const base = SUPABASE_URL;

  async function send() {
    if (!input.trim()) return;
    const question = input.trim();
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: json.answer, sources: json.sources }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>AI compliance assistant</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Grounded in FITSPA's indexed regulator documents only — it will say so if something isn't covered
        rather than guessing.
      </p>

      <div className="mt-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className="inline-block max-w-[85%] whitespace-pre-wrap rounded-lg p-3 text-sm text-left"
              style={{
                background: m.role === "user" ? "var(--color-primary)" : "var(--color-surface)",
                color: m.role === "user" ? "white" : "var(--color-text)",
                border: m.role === "assistant" ? "1px solid var(--color-border)" : undefined,
              }}
            >
              {m.text}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-3 space-y-1 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
                  {m.sources.map((s, j) => (
                    <div key={j} className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <span>{s.title} {s.regulator ? `(${s.regulator})` : ""}</span>
                      {s.storage_path && (
                        <a className="underline" target="_blank" rel="noreferrer" href={`${base}/storage/v1/object/public/regulatory-library/${s.storage_path}`}>
                          Open
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Thinking…</p>}
      </div>

      <div className="mt-6 flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. What are BOU's capital requirements for a PSP licence?"
        />
        <button className="btn btn-primary" onClick={send} disabled={loading}>Ask</button>
      </div>
    </div>
  );
}
