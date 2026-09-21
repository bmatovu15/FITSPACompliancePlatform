"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  member_id: string;
  company_name: string;
  fitspa_member_id: string | null;
  member_status: string;
  regulator_name: string;
  licence_name: string;
  licence_status: string;
  verified: boolean;
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
};

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
  useEffect(() => {
    runSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
        FITSPA member lookup
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Browse every active FITSPA member below, or search by company name or FITSPA member ID. Click a member to
        see their full details.
      </p>

      <form className="mt-6 flex gap-2" onSubmit={search}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company name or FITSPA member ID"
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
        {q && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQ("");
              runSearch("");
            }}
          >
            Clear
          </button>
        )}
      </form>

      <div className="mt-6">
        {loading && rows === null && (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading members…
          </p>
        )}
        {rows !== null && rows.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No active member matched that search.
          </p>
        )}
        {grouped && Object.keys(grouped).length > 0 && (
          <table className="data w-full">
            <thead>
              <tr>
                <th>Company</th>
                <th>FITSPA ID</th>
                <th>Regulators / licences</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([company, licences]) => (
                <tr
                  key={company}
                  onClick={() => openMember(licences[0].member_id, company)}
                  style={{ cursor: "pointer" }}
                  className="hover:opacity-80"
                >
                  <td className="font-semibold">{company}</td>
                  <td>{licences[0].fitspa_member_id ?? "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {licences.map((l, i) => (
                        <span key={i} className={`badge ${l.licence_status === "Active" ? "badge-green" : "badge-amber"}`}>
                          {l.regulator_name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-right" style={{ color: "var(--color-text-muted)" }}>
                    View details →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16, 27, 45, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 300,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            className="card"
            style={{ maxWidth: "36rem", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "1.5rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
                {selected.name}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} aria-label="Close">
                ✕
              </button>
            </div>

            {detailLoading && (
              <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Loading details…
              </p>
            )}

            {!detailLoading && detail && detail.length > 0 && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <div className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                      FITSPA member ID
                    </div>
                    <div>{detail[0].fitspa_member_id ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                      Status
                    </div>
                    <span className="badge badge-green">Active member</span>
                  </div>
                  <div>
                    <div className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                      Member type
                    </div>
                    <div>{detail[0].member_type ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                      Fintech vertical
                    </div>
                    <div>{detail[0].vertical_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                      Office location
                    </div>
                    <div>{detail[0].office_location ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase" style={{ color: "var(--color-text-muted)" }}>
                      Member since
                    </div>
                    <div>{detail[0].member_since ?? "—"}</div>
                  </div>
                </div>

                <h3 className="mt-6 mb-2 text-sm font-semibold">Regulator licences</h3>
                <table className="data w-full">
                  <thead>
                    <tr>
                      <th>Regulator</th>
                      <th>Licence</th>
                      <th>Status</th>
                      <th>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((l, i) => (
                      <tr key={i}>
                        <td>{l.regulator_name}</td>
                        <td>{l.licence_name}</td>
                        <td>
                          <span className={`badge ${l.licence_status === "Active" ? "badge-green" : "badge-amber"}`}>
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
              <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Couldn&apos;t load details for this member.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
