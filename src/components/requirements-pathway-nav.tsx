"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type PathwayNavRegulator = {
  key: string;
  title: string;
  status: string;
};

function hrefFor(key: string) {
  if (key === "nps") return "/nps-pathway";
  if (key === "digital_credit") return "/digital-credit-pathway";
  return `/requirements-pathway/${key}`;
}

export default function RequirementsPathwayNav({ regulators }: { regulators: PathwayNavRegulator[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const published = regulators.filter((r) => r.status === "Active");

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="nav-link"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
      >
        Requirements Pathway Wizard
        <span aria-hidden="true" style={{ fontSize: "0.7em" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.35rem",
            minWidth: "15rem",
            background: "var(--color-surface, #fff)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.5rem",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "0.35rem",
            zIndex: 200,
          }}
        >
          {published.map((r) => (
            <Link
              key={r.key}
              role="menuitem"
              href={hrefFor(r.key)}
              className="nav-link"
              style={{ display: "block", padding: "0.4rem 0.6rem" }}
              onClick={() => setOpen(false)}
            >
              {r.title}
            </Link>
          ))}
          <div style={{ height: 1, background: "var(--color-border)", margin: "0.3rem 0" }} />
          <Link
            role="menuitem"
            href="/requirements-pathway"
            className="nav-link"
            style={{ display: "block", padding: "0.4rem 0.6rem", fontWeight: 600 }}
            onClick={() => setOpen(false)}
          >
            View all regulator pathways →
          </Link>
        </div>
      )}
    </div>
  );
}
