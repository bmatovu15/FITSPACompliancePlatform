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
  sourceType?: "documents" | "web" | "mixed" | "none";
  webSources?: WebSource[];
};

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Ask me about a regulator requirement, obligation, or form — I'll check FITSPA's indexed documents and official regulator websites, and cite exactly where the answer came from.",
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
          Checks FITSPA&rsquo;s indexed regulator documents and a scoped search of official
          regulator websites together, and gives you whichever actually answers your question
          &mdash; FITSPA&rsquo;s own vetted documents take priority whenever they cover it. Every
          answer is clearly labelled by where it came from, and it will say so plainly if nothing
          covers the question at all.
        </p>

        <div className={styles.thread}>
          {messages.map((m, i) => (
            <div key={i} className={`${styles.row} ${m.role === "user" ? styles.rowUser : styles.rowAssistant}`}>
              <div className={`${styles.bubble} ${m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}>
                {(m.sourceType === "web" || m.sourceType === "mixed") && (
                  <div className={styles.webNotice}>
                    {m.sourceType === "web"
                      ? "Web result — not one of FITSPA’s indexed documents"
                      : "Partly based on a regulator website — see which parts below"}
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
