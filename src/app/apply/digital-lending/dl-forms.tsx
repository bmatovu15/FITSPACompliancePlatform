"use client";

// Schema-driven renderer for the Digital Lending requirement drawers. Emits the
// design prototype's markup and class names (see digital-lending-apply.css).
// All of the 17 drawers are produced from FormSchema blocks (dl-schemas.ts).

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MemberLicenceApplicationFile } from "@/lib/types";
import type { Block, Field, FormSchema, RowFile } from "./dl-schemas";
import { condMet, getPath, latestFileForSlot, newRowId, setPath, trimDeep, type Answers } from "./dl-engine";

export type FormHost = {
  schema: FormSchema;
  route: string | null;
  sourceUrl: string | null;
  answers: Answers; // stored answers
  files: MemberLicenceApplicationFile[]; // this requirement's files
  onCommit: (answers: Answers) => Promise<boolean>;
  onUpload: (slot: string, label: string, file: File, answers: Answers) => Promise<boolean>;
  onDeleteSlot: (slot: string) => Promise<void>;
  registerFlush: (fn: (() => Promise<void>) | null) => void;
};

const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg";

type Row = Record<string, unknown> & { rowId?: string };
type Scope = { get: (k: string) => unknown; set: (k: string, v: unknown) => void; id: string };

export default function SchemaForm({ host }: { host: FormHost }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [draft, setDraftState] = useState<Answers>(() => JSON.parse(JSON.stringify(host.answers ?? {})));
  const draftRef = useRef(draft);
  const hostRef = useRef(host);
  hostRef.current = host;
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [uploadErr, setUploadErr] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDraft = useCallback((next: Answers) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const commit = useCallback(
    async (next?: Answers) => {
      const value = trimDeep(next ?? draftRef.current);
      setState("saving");
      const ok = await hostRef.current.onCommit(value);
      setState(ok ? "saved" : "error");
      if (timer.current) clearTimeout(timer.current);
      if (ok) timer.current = setTimeout(() => setState("idle"), 2500);
    },
    []
  );

  // Autosave anything typed but not explicitly saved when the drawer closes /
  // another drawer opens (the prototype silently dropped it).
  const flush = useCallback(async () => {
    const stored = JSON.stringify(trimDeep(hostRef.current.answers ?? {}));
    const current = JSON.stringify(trimDeep(draftRef.current));
    if (stored !== current) await commit();
  }, [commit]);

  useEffect(() => {
    hostRef.current.registerFlush(flush);
    return () => hostRef.current.registerFlush(null);
  }, [flush]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function doUpload(slot: string, label: string, file: File) {
    setBusy((b) => ({ ...b, [slot]: true }));
    setUploadErr((e) => {
      const { [slot]: _drop, ...rest } = e;
      void _drop;
      return rest;
    });
    const ok = await hostRef.current.onUpload(slot, label, file, trimDeep(draftRef.current));
    setBusy((b) => ({ ...b, [slot]: false }));
    if (!ok) setUploadErr((e) => ({ ...e, [slot]: "That file couldn’t be uploaded. Please try again." }));
  }

  const topScope: Scope = {
    id: "root",
    get: (k) => getPath(draftRef.current, k),
    set: (k, v) => setDraft(setPath(draftRef.current, k, v)),
  };

  function rowScope(arrayKey: string, index: number): Scope {
    return {
      id: `${arrayKey}${index}`,
      get: (k) => {
        const rows = draftRef.current[arrayKey];
        return Array.isArray(rows) ? (rows[index] as Row | undefined)?.[k] : undefined;
      },
      set: (k, v) => {
        const rows = Array.isArray(draftRef.current[arrayKey]) ? [...(draftRef.current[arrayKey] as Row[])] : [];
        rows[index] = { ...(rows[index] ?? {}), [k]: v };
        setDraft({ ...draftRef.current, [arrayKey]: rows });
      },
    };
  }

  function objectScope(key: string): Scope {
    return {
      id: key,
      get: (k) => {
        const o = draftRef.current[key];
        return o && typeof o === "object" ? (o as Row)[k] : undefined;
      },
      set: (k, v) => {
        const o = draftRef.current[key] && typeof draftRef.current[key] === "object" ? (draftRef.current[key] as Row) : {};
        setDraft({ ...draftRef.current, [key]: { ...o, [k]: v } });
      },
    };
  }

  function renderField(f: Field, scope: Scope): ReactNode {
    const id = `${uid}-${scope.id}-${f.key.replace(/\./g, "-")}`;
    const value = String(scope.get(f.key) ?? "");
    const common = {
      id,
      value,
      onChange: (e: { target: { value: string } }) => scope.set(f.key, e.target.value),
      onBlur: () => {
        void flush();
      },
    };
    return (
      <div className="field" key={f.key}>
        <label htmlFor={id}>{f.label}</label>
        {f.type === "textarea" ? (
          <textarea {...common} />
        ) : (
          <input type={f.type === "date" ? "date" : "text"} {...common} />
        )}
      </div>
    );
  }

  function renderFields(fields: Field[], cols: 1 | 2 | undefined, scope: Scope): ReactNode {
    const nodes = fields.map((f) => renderField(f, scope));
    return cols === 2 ? <div className="field-grid">{nodes}</div> : <>{nodes}</>;
  }

  function uploadCard(slot: string, label: string) {
    const f = latestFileForSlot(host.files, slot);
    const id = `${uid}-up-${slot}`;
    return (
      <div className="upload" key={slot}>
        <div className="upload-top">
          <div>
            <label className="upload-title" htmlFor={id}>
              {label}
            </label>
            {busy[slot] ? (
              <div className="upload-meta">Uploading…</div>
            ) : uploadErr[slot] ? (
              <div className="upload-meta err">{uploadErr[slot]}</div>
            ) : f ? (
              <div className="upload-meta">
                {f.file_name} · v{f.version}
              </div>
            ) : null}
          </div>
          <input
            id={id}
            className="file-input"
            type="file"
            accept={ACCEPT}
            disabled={!!busy[slot]}
            data-file-slot={slot}
            onChange={(e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              void doUpload(slot, label, file).finally(() => {
                input.value = "";
              });
            }}
          />
        </div>
      </div>
    );
  }

  function rowFileField(rf: RowFile, slot: string) {
    const f = latestFileForSlot(host.files, slot);
    const id = `${uid}-rowfile-${slot}`;
    return (
      <div className="field">
        <label htmlFor={id}>{rf.label}</label>
        <input
          id={id}
          type="file"
          disabled={!!busy[slot]}
          data-file-slot={slot}
          onChange={(e) => {
            const input = e.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            void doUpload(slot, rf.label, file).finally(() => {
              input.value = "";
            });
          }}
        />
        <small className={uploadErr[slot] ? "err" : undefined} style={uploadErr[slot] ? { color: "#b3261e" } : undefined}>
          {busy[slot] ? "Uploading…" : uploadErr[slot] ?? (f ? `Added: ${f.file_name}` : rf.hint)}
        </small>
      </div>
    );
  }

  function renderBlock(b: Block, i: number): ReactNode {
    const key = `${b.kind}-${i}`;
    switch (b.kind) {
      case "fields":
        return <div key={key}>{renderFields(b.fields, b.cols, topScope)}</div>;
      case "choice": {
        const current = topScope.get(b.key);
        const row = (
          <div className="choice-row" style={b.mt ? { marginTop: b.mt } : undefined}>
            {b.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`choice${current === o.value ? " selected" : ""}`}
                data-choice={`${b.key}:${o.value}`}
                onClick={() => {
                  const next = setPath(draftRef.current, b.key, o.value);
                  setDraft(next);
                  void commit(next);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        );
        return b.label ? (
          <div className="field" key={key}>
            <label>{b.label}</label>
            {row}
          </div>
        ) : (
          <div key={key}>{row}</div>
        );
      }
      case "section":
        return (
          <div className="drawer-section" key={key} style={b.mt ? { marginTop: b.mt } : undefined}>
            {b.title && <h3>{b.title}</h3>}
            {b.blocks.map((c, j) => renderBlock(c, j))}
          </div>
        );
      case "text":
        return <p key={key}>{b.text}</p>;
      case "note":
        return (
          <div className="mini-note" key={key}>
            {b.text}
          </div>
        );
      case "check": {
        const checked = topScope.get(b.key) === true;
        return (
          <label className="check-row" key={key}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                const next = setPath(draftRef.current, b.key, e.target.checked);
                setDraft(next);
                if (b.saveOnToggle) void commit(next);
              }}
            />{" "}
            {b.label}
          </label>
        );
      }
      case "checks":
        return (
          <div key={key}>
            {b.items.map((it) => (
              <label className="check-row" key={it.key}>
                <input
                  type="checkbox"
                  checked={topScope.get(it.key) === true}
                  onChange={(e) => setDraft(setPath(draftRef.current, it.key, e.target.checked))}
                />{" "}
                {it.label}
              </label>
            ))}
          </div>
        );
      case "checkArray": {
        const arr = Array.isArray(draft[b.key]) ? (draft[b.key] as string[]) : [];
        return (
          <div key={key}>
            {b.options.map((o) => (
              <label className="check-row" key={o}>
                <input
                  type="checkbox"
                  checked={arr.includes(o)}
                  onChange={(e) =>
                    setDraft({
                      ...draftRef.current,
                      [b.key]: e.target.checked ? [...arr.filter((x) => x !== o), o] : arr.filter((x) => x !== o),
                    })
                  }
                />{" "}
                {o}
              </label>
            ))}
          </div>
        );
      }
      case "upload": {
        const v = b.labelIf ? topScope.get(b.labelIf.key) : undefined;
        const label = (typeof v === "string" && b.labelIf?.map[v]) || b.label;
        return <div key={key}>{uploadCard(b.slot, label)}</div>;
      }
      case "multiupload": {
        const mine = host.files.filter((f) => f.slot.startsWith(b.slotPrefix));
        const slots = [...new Map(mine.map((f) => [f.slot, latestFileForSlot(mine, f.slot)!])).values()];
        const id = `${uid}-multi`;
        return (
          <div key={key}>
            <div className="field">
              <label htmlFor={id}>{b.label}</label>
              <input
                id={id}
                type="file"
                multiple
                data-file-slot={`${b.slotPrefix}*`}
                onChange={(e) => {
                  const input = e.currentTarget;
                  const list = Array.from(input.files ?? []);
                  if (!list.length) return;
                  void (async () => {
                    for (const file of list) await doUpload(`${b.slotPrefix}${newRowId()}`, b.fileLabel, file);
                    input.value = "";
                  })();
                }}
              />
              <small>{slots.length ? `${slots.length} document${slots.length === 1 ? "" : "s"} added` : ""}</small>
            </div>
            {slots.map((m) => (
              <div className="upload" key={m.slot}>
                <div className="upload-title">{m.file_name}</div>
                <div className="upload-meta">v{m.version}</div>
              </div>
            ))}
          </div>
        );
      }
      case "repeater": {
        const rows = Array.isArray(draft[b.key]) ? (draft[b.key] as Row[]) : [];
        return (
          <div key={key}>
            {rows.map((r, idx) => {
              const scope = rowScope(b.key, idx);
              const rowId = String(r.rowId ?? "");
              return (
                <div className={b.cardClass} key={rowId || idx}>
                  <button
                    type="button"
                    className="remove-mini"
                    onClick={async () => {
                      const next = { ...draftRef.current, [b.key]: rows.filter((_, k) => k !== idx) };
                      setDraft(next);
                      if (b.file && rowId) await hostRef.current.onDeleteSlot(`${b.file.slotPrefix}${rowId}`);
                      await commit(next);
                    }}
                  >
                    Remove
                  </button>
                  <h4>
                    {b.itemLabel} {idx + 1}
                  </h4>
                  {renderFields(b.fields, b.cols, scope)}
                  {b.file && rowFileField(b.file, `${b.file.slotPrefix}${rowId}`)}
                </div>
              );
            })}
            <button
              type="button"
              className="subtle-btn"
              onClick={() => {
                const next = { ...draftRef.current, [b.key]: [...rows, { rowId: newRowId() }] };
                setDraft(next);
                void commit(next);
              }}
            >
              {b.addLabel}
            </button>
          </div>
        );
      }
      case "person": {
        const scope = objectScope(b.key);
        return (
          <div className={b.cardClass} key={key}>
            <h4>{b.title}</h4>
            {renderFields(b.fields, b.cols, scope)}
            {b.file && rowFileField(b.file, `${b.file.slotPrefix}${b.key}`)}
          </div>
        );
      }
      case "link":
        return (
          <div className="drawer-actions" key={key}>
            {host.sourceUrl ? (
              <a className="subtle-btn" href={host.sourceUrl} target="_blank" rel="noopener noreferrer">
                {b.label}
              </a>
            ) : null}
          </div>
        );
      case "when": {
        if (!condMet(b.cond, draft, host.route)) return null;
        const inner = b.blocks.map((c, j) => renderBlock(c, j));
        return (
          <div key={key} style={b.mt ? { marginTop: b.mt } : undefined}>
            {inner}
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div>
      {host.schema.blocks.map((b, i) => renderBlock(b, i))}
      {host.schema.save_label && (
        <div className="drawer-actions">
          <button type="button" className="save-btn" disabled={state === "saving"} onClick={() => void commit()}>
            {host.schema.save_label}
          </button>
          {state === "saved" && <span className="save-note ok">Saved</span>}
          {state === "error" && <span className="save-note err">Couldn’t save — please try again</span>}
        </div>
      )}
      {!host.schema.save_label && state === "error" && (
        <p className="form-hint">Couldn’t save — please try again</p>
      )}
    </div>
  );
}
