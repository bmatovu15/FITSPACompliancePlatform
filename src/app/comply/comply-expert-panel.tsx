"use client";

import { useState } from "react";
import styles from "./comply-hub.module.css";

// Comply-hub twin of src/app/apply/apply-expert-panel.tsx -- same behaviour,
// `ch-*` class names, posts with sourceModule: "comply".
export default function ComplyExpertPanel({
  contextKey,
  heading,
  helpText,
}: {
  contextKey: string;
  heading: string;
  helpText: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!question.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/expert-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceModule: "comply",
          contextKey,
          contactName: name || undefined,
          contactEmail: email || undefined,
          message: question,
        }),
      });
      if (res.ok) setSuccess(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className={styles["ch-help"]}>
        <div>
          <strong>{heading}</strong>
          <p>{helpText}</p>
        </div>
        <button id="ch-expert" type="button" onClick={() => setOpen((o) => !o)}>
          Speak to an expert
        </button>
      </div>
      <section
        className={`${styles["ch-support-panel"]} ${open ? styles.open : ""}`}
        aria-live="polite"
      >
        <h3>Ask Expert Support</h3>
        <p>Tell us briefly what your business does and which compliance pathway you need help identifying.</p>
        <div className={styles["ch-support-fields"]}>
          <label>
            Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginTop: 10 }}>
          Business / product
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What does your business do, and which compliance pathway are you unsure about?"
          />
        </label>
        <div className={styles["ch-support-actions"]}>
          <button type="button" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send question"}
          </button>
          <button className="secondary" type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        {success && (
          <div className={styles["ch-support-success"]}>Question captured for Expert Support.</div>
        )}
      </section>
    </>
  );
}
