"use client";

import { useState } from "react";
import { SUPABASE_URL } from "@/lib/public-config";
import BeaconNav from "@/components/beacon-nav";
import styles from "./assistant.module.css";

type Source = { title: string; regulator: string | null; storage_path: string | null; doc_kind: string };
type WebSource = { title: string; link: string };
type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  sourceType?: "documents" | "web";
  webSources?: WebSource[];
};

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
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: json.answer,
          sources: json.sources,
          sourceType: json.sourceType,
          webSources: json.webSources,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.asRoot}>
      <BeaconNav active="assistant" />
      <main className={styles.main}>
        <p className={styles.eyebrow}>Compliance assistant</p>
        <h1 className={styles.title}>AI compliance assistant</h1>
        <p className={styles.dek}>
          Grounded in FITSPA&rsquo;s indexed regulator documents first &mdash; it will say so if something
          isn&rsquo;t covered. For regulators FITSPA hasn&rsquo;t indexed documents for yet, it may
          fall back to a scoped search of that regulator&rsquo;s own official website, always
          clearly labelled as a web result rather than a FITSPA-vetted document.
        </p>

        <div className={styles.thread}>
          {messages.map((m, i) => (
            <div key={i} className={`${styles.row} ${m.role === "user" ? styles.rowUser : styles.rowAssistant}`}>
              <div className={`${styles.bubble} ${m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}>
                {m.sourceType === "web" && (
                  <div className={styles.webNotice}>
                    Web result &mdash; not one of FITSPA&rsquo;s indexed documents
                  </div>
                )}
                {m.text}
                {m.sources && m.sources.length > 0 && (
                  <div className={styles.sources}>
                    {m.sources.map((s, j) => (
                      <div key={j} className={styles.sourceRow}>
                        <span>
                          {s.title} {s.regulator ? `(${s.regulator})` : ""}
                        </span>
                        {s.storage_path && (
                          <a
                            className={styles.sourceLink}
                            target="_blank"
                            rel="noreferrer"
                            href={`${base}/storage/v1/object/public/regulatory-library/${s.storage_path}`}
                          >
                            Open
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {m.webSources && m.webSources.length > 0 && (
                  <div className={`${styles.sources} ${styles.webSources}`}>
                    {m.webSources.map((s, j) => (
                      <div key={j} className={styles.sourceRow}>
                        <span>{s.title}</span>
                        <a className={styles.sourceLink} target="_blank" rel="noreferrer" href={s.link}>
                          Open
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <p className={styles.thinking}>Thinking&hellip;</p>}
        </div>

        <div className={styles.composer}>
          <input
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="e.g. What are BOU's capital requirements for a PSP licence?"
          />
          <button className={styles.btn} onClick={send} disabled={loading}>
            Ask
          </button>
        </div>
      </main>
    </div>
  );
}
