"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BeaconNav from "@/components/beacon-nav";
import styles from "./lookup.module.css";

type Row = {
  member_id: string;
  company_name: string;
  fitspa_member_id: string | null;
  member_status: string;
  regulator_name: string;
  licence_name: string;
  licence_status: string;
  verified: boolean;
  office_location: string | null;
  services_offered: string | null;
  short_description: string | null;
};

type DetailRow = {
  company_name: string;
  fitspa_member_id: string | null;
  member_type: string | null;
  vertical_name: string | null;
  office_location: string | null;
  member_status: string;
  member_since: string | null;
  logo_url: string | null;
  regulator_name: string;
  licence_name: string;
  licence_status: string;
  verified: boolean;
  contact_name: string | null;
  contact_role: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  services_offered: string | null;
  short_description: string | null;
};

function splitServices(services: string | null): string[] {
  if (!services) return [];
  return services
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function PinIcon() {
  return (
    <svg className={styles.pin} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className={styles.contactIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className={styles.contactIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

export default function LookupPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [detail, setDetail] = useState<DetailRow[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function runSearch(term: string) {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("public_member_lookup", { q: term });
    setRows(error ? [] : (data as Row[]));
    setLoading(false);
  }

  // Load the full member table (all active members) as soon as the page
  // opens, so there's something to browse before anyone types a search.
  // Deferred a tick (rather than calling runSearch synchronously in the
  // effect body) so the initial fetch's setState calls don't run inside the
  // effect's own synchronous call stack.
  useEffect(() => {
    const id = setTimeout(() => {
      runSearch("");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(q);
  }

  async function openMember(memberId: string, companyName: string) {
    setSelected({ id: memberId, name: companyName });
    setDetail(null);
    setDetailLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("public_member_detail", { p_member_id: memberId });
    setDetail(error ? [] : (data as DetailRow[]));
    setDetailLoading(false);
  }

  const grouped = rows?.reduce<Record<string, Row[]>>((acc, r) => {
    acc[r.company_name] = acc[r.company_name] || [];
    acc[r.company_name].push(r);
    return acc;
  }, {});

  const d = detail && detail.length > 0 ? detail[0] : null;

  return (
    <div className={styles.luRoot}>
      <BeaconNav active="lookup" />
      <main className={styles.main}>
        <div className={styles.eyebrow}>Member Directory</div>
        <h1 className={styles.title}>FITSPA member lookup</h1>
        <p className={styles.dek}>
          Browse every active FITSPA member below, or search by company name or FITSPA member ID. Select a member
          to see their full profile, services, and regulator licences.
        </p>

        <form className={styles.searchRow} onSubmit={search}>
          <input
            className={styles.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Company name or FITSPA member ID"
          />
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
          {q && (
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                setQ("");
                runSearch("");
              }}
            >
              Clear
            </button>
          )}
        </form>

        {loading && rows === null && <p className={styles.hint}>Loading members…</p>}
        {rows !== null && rows.length === 0 && <p className={styles.hint}>No active member matched that search.</p>}

        {grouped && Object.keys(grouped).length > 0 && (
          <div className={styles.grid}>
            {Object.entries(grouped).map(([company, licences]) => {
              const first = licences[0];
              const services = splitServices(first.services_offered).slice(0, 3);
              return (
                <button
                  key={company}
                  type="button"
                  className={styles.card}
                  onClick={() => openMember(first.member_id, company)}
                >
                  <div className={styles.cardHead}>
                    <div>
                      <div className={styles.cardName}>{company}</div>
                      <div className={styles.cardId}>{first.fitspa_member_id ?? "—"}</div>
                    </div>
                  </div>

                  {first.office_location && (
                    <div className={styles.cardMeta}>
                      <PinIcon />
                      {first.office_location}
                    </div>
                  )}

                  {first.short_description && <p className={styles.cardDek}>{first.short_description}</p>}

                  {services.length > 0 && (
                    <div className={styles.chipRow}>
                      {services.map((s, i) => (
                        <span key={i} className={styles.chip}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={styles.badgeRow}>
                    {licences.map((l, i) => (
                      <span key={i} className={`${styles.badge} ${l.licence_status === "Active" ? styles.badgeGreen : styles.badgeAmber}`}>
                        {l.regulator_name}
                      </span>
                    ))}
                  </div>

                  <span className={styles.cardAction}>View full profile →</span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {selected && (
        <div role="dialog" aria-modal="true" className={styles.overlay} onClick={() => setSelected(null)}>
          <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelName}>{selected.name}</h2>
              <button className={styles.panelClose} onClick={() => setSelected(null)} aria-label="Close">
                ✕
              </button>
            </div>

            {detailLoading && <p className={styles.hint}>Loading details…</p>}

            {!detailLoading && d && (
              <>
                {d.short_description && <p className={styles.panelDek}>{d.short_description}</p>}

                <div className={styles.metaGrid}>
                  <div>
                    <div className={styles.metaLabel}>FITSPA member ID</div>
                    <div className={styles.metaValue}>{d.fitspa_member_id ?? "—"}</div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>Status</div>
                    <span className={`${styles.badge} ${styles.badgeGreen}`}>Active member</span>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>Member type</div>
                    <div className={styles.metaValue}>{d.member_type ?? "—"}</div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>Fintech vertical</div>
                    <div className={styles.metaValue}>{d.vertical_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>Office location</div>
                    <div className={styles.metaValue}>
                      {d.office_location && <PinIcon />}
                      {d.office_location ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>Member since</div>
                    <div className={styles.metaValue}>{d.member_since ?? "—"}</div>
                  </div>
                </div>

                {splitServices(d.services_offered).length > 0 && (
                  <>
                    <div className={styles.sectionLabel}>Services offered</div>
                    <div className={styles.chipRow}>
                      {splitServices(d.services_offered).map((s, i) => (
                        <span key={i} className={styles.chip}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {(d.contact_name || d.contact_phone || d.contact_email) && (
                  <>
                    <div className={styles.sectionLabel}>Contact</div>
                    <div className={styles.contactBox}>
                      {d.contact_name && (
                        <div className={styles.contactRow}>
                          <strong>{d.contact_name}</strong>
                          {d.contact_role && <span style={{ color: "var(--lu-muted)" }}>— {d.contact_role}</span>}
                        </div>
                      )}
                      {d.contact_phone && (
                        <div className={styles.contactRow}>
                          <PhoneIcon />
                          {d.contact_phone}
                        </div>
                      )}
                      {d.contact_email && (
                        <div className={styles.contactRow}>
                          <MailIcon />
                          {d.contact_email}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className={styles.sectionLabel}>Regulator licences</div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Regulator</th>
                      <th>Licence</th>
                      <th>Status</th>
                      <th>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail!.map((l, i) => (
                      <tr key={i}>
                        <td>{l.regulator_name}</td>
                        <td>{l.licence_name}</td>
                        <td>
                          <span className={`${styles.badge} ${l.licence_status === "Active" ? styles.badgeGreen : styles.badgeAmber}`}>
                            {l.licence_status}
                          </span>
                        </td>
                        <td>{l.verified ? "✓ Verified" : "Pending"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {!detailLoading && detail && detail.length === 0 && (
              <p className={styles.hint}>Couldn&apos;t load details for this member.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
