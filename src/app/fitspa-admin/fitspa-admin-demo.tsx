"use client";

import { useCallback, useState } from "react";
import styles from "./fitspa-admin.module.css";
import { seedState } from "./admin-seed";
import type { AdminState, Programme, Section } from "./admin-types";
import type { Ctx } from "./panels/ctx";
import Overview from "./panels/overview";
import Regulators from "./panels/regulators";
import Apply from "./panels/apply";
import Comply from "./panels/comply";
import DocsAi from "./panels/docsai";
import Members from "./panels/members";
import Publish from "./panels/publish";
import Activity from "./panels/activity";

const TABS: { key: Section; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "regulators", label: "Regulators" },
  { key: "apply", label: "Apply" },
  { key: "comply", label: "Comply" },
  { key: "docsai", label: "Documents & AI" },
  { key: "members", label: "Members" },
  { key: "publish", label: "Publish & preview" },
  { key: "activity", label: "Activity" },
];

const HEAD: Record<Section, { title: string; dek: string }> = {
  overview: {
    title: "Everything for every regulator, managed here.",
    dek: "Add a regulator and cover its licence application, ongoing compliance, documents and AI answers from one console. Nothing needs a developer.",
  },
  regulators: { title: "Regulators", dek: "Add a regulator, or open an existing one, and start its programme." },
  apply: { title: "Apply", dek: "Licence classes, minimum capital, fees and the application checklist applicants work through." },
  comply: { title: "Comply", dek: "The obligations, who each one applies to, due dates, events and control areas members see." },
  docsai: { title: "Documents & AI assistant", dek: "Upload the regulator’s documents for visitors and members, and decide what the assistant can read and who can ask it." },
  members: { title: "Members", dek: "See exactly what each member gets from the rules you set. Change a rule and watch their universe change." },
  publish: { title: "Publish & preview", dek: "Check a regulator is complete, publish it, and look at the public site as a visitor." },
  activity: { title: "Activity", dek: "Everything changed in this demonstration, newest first." },
};

export default function FitspaAdminDemo({ onSignOut }: { onSignOut?: () => void } = {}) {
  const [section, setSection] = useState<Section>("overview");
  const [sub, setSub] = useState("");
  const [state, setState] = useState<AdminState>(seedState);
  const [progId, setProgId] = useState("payments");
  const [toast, setToast] = useState("");

  const update = useCallback((fn: (s: AdminState) => AdminState, message: string) => {
    setState((s) => {
      const next = fn(s);
      return message ? { ...next, log: [{ at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), text: message }, ...next.log] } : next;
    });
    if (message) {
      setToast(message);
      window.setTimeout(() => setToast(""), 2600);
    }
  }, []);

  const patchProgramme = useCallback(
    (id: string, fn: (p: Programme) => Programme, message: string) =>
      update((s) => ({ ...s, programmes: s.programmes.map((p) => (p.id === id ? fn(p) : p)) }), message),
    [update]
  );

  const prog = state.programmes.find((p) => p.id === progId) ?? state.programmes[0];

  const go: Ctx["go"] = (s, opts) => {
    setSection(s);
    setSub(opts?.sub ?? "");
    if (opts?.progId) setProgId(opts.progId);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const ctx: Ctx = { state, update, patchProgramme, progId: prog?.id ?? "", setProgId, prog, go, sub, setSub };

  function reset() {
    setState(seedState());
    setProgId("payments");
    setSub("");
    setToast("");
  }

  const head = HEAD[section];

  return (
    <div className={styles.root}>
      <div className={styles.adminBar}>
        <div className={styles.adminBarInner}>
          <div className={styles.adminBrand}>
            <span className={styles.adminMark} aria-hidden="true"></span>
            <span>
              FITSPA Admin
              <small>Regulatory console</small>
            </span>
          </div>

          <nav className={styles.adminNav} aria-label="Admin sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`${styles.adminLink} ${section === t.key ? styles.adminLinkActive : ""}`}
                onClick={() => go(t.key)}
                aria-current={section === t.key ? "page" : undefined}
              >
                {t.label}
                {t.key === "activity" && state.log.length > 0 ? <span className={styles.adminBadge}>{state.log.length}</span> : null}
              </button>
            ))}
          </nav>

          <div className={styles.adminTools}>
            <button type="button" className={styles.adminGhost} onClick={reset}>
              Reset demo
            </button>
            <a className={styles.adminGhost} href="/" target="_blank" rel="noreferrer">
              Public site ↗
            </a>
            <span className={styles.adminUser}>
              <span className={styles.adminAvatar} aria-hidden="true">
                FA
              </span>
              <span className={styles.adminEmail}>admin@fitspa.demo</span>
            </span>
            {onSignOut ? (
              <button type="button" className={styles.adminSignOut} onClick={onSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.demoNote} role="note">
        <strong>Demonstration</strong> Sample data only, built from the published Apply and Comply catalogues. Nothing live is touched, and changes live only
        in this browser tab.
      </div>

      <header className={styles.head}>
        <p className={styles.eyebrow}>FITSPA ADMIN</p>
        <h1 className={styles.title}>{head.title}</h1>
        <p className={styles.dek}>{head.dek}</p>
      </header>

      {section === "overview" && <Overview ctx={ctx} />}
      {section === "regulators" && <Regulators ctx={ctx} />}
      {section === "apply" && <Apply ctx={ctx} />}
      {section === "comply" && <Comply ctx={ctx} />}
      {section === "docsai" && <DocsAi ctx={ctx} />}
      {section === "members" && <Members ctx={ctx} />}
      {section === "publish" && <Publish ctx={ctx} />}
      {section === "activity" && <Activity ctx={ctx} />}

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
  );
}
