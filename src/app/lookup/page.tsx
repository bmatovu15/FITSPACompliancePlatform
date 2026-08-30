"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  company_name: string;
  fitspa_member_id: string | null;
  member_status: string;
  regulator_name: string;
  licence_name: string;
  licence_status: string;
  verified: boolean;
};

export default function LookupPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("public_member_lookup", { q });
    setRows(error ? [] : (data as Row[]));
    setLoading(false);
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
        Confirm whether a company is an active FITSPA member and which regulator licences it holds.
        Enter a company name or FITSPA member ID.
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
      </form>

      {rows !== null && (
        <div className="mt-6 space-y-4">
          {rows.length === 0 && (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No active member matched that search.
            </p>
          )}
          {grouped &&
            Object.entries(grouped).map(([company, licences]) => (
              <div key={company} className="card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{company}</h3>
                  <span className="badge badge-green">Active member</span>
                </div>
                {licences[0].fitspa_member_id && (
                  <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    FITSPA ID: {licences[0].fitspa_member_id}
                  </p>
                )}
                <table className="data mt-3">
                  <thead>
                    <tr>
                      <th>Regulator</th>
                      <th>Licence</th>
                      <th>Status</th>
                      <th>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licences.map((l, i) => (
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
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
