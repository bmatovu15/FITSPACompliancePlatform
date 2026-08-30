import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/public-config";

function fileUrl(base: string, path: string | null) {
  if (!path) return null;
  return `${base}/storage/v1/object/public/regulatory-library/${path}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const base = SUPABASE_URL;

  let docs: any[] = [];
  let obligations: any[] = [];

  if (q && q.trim().length > 0) {
    const term = `%${q.trim()}%`;
    const [{ data: d }, { data: o }] = await Promise.all([
      supabase
        .from("documents")
        .select("id, title, doc_kind, storage_path, file_name, regulators(name)")
        .eq("status", "Published")
        .or(`title.ilike.${term}`)
        .limit(30),
      supabase
        .from("obligations")
        .select("id, title, description, frequency, penalty, risk, regulators(name)")
        .is("member_id", null)
        .eq("status", "Active")
        .or(`title.ilike.${term},description.ilike.${term}`)
        .limit(30),
    ]);
    docs = d ?? [];
    obligations = o ?? [];
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
        Document &amp; obligation search
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Search published Acts, regulations, guidelines, forms, and compliance obligations across every
        regulator on the platform.
      </p>

      <form className="mt-6 flex gap-2" action="/search">
        <input
          className="input"
          type="text"
          name="q"
          defaultValue={q}
          placeholder="e.g. capital adequacy, agent banking, data protection..."
        />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      {q && (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Documents ({docs.length})
            </h2>
            {docs.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>No matching published documents yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="card flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {d.regulators?.name ?? "Unassigned"} · {d.doc_kind}
                      </p>
                    </div>
                    {d.storage_path && (
                      <a
                        className="btn btn-ghost btn-sm"
                        href={fileUrl(base, d.storage_path) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open / Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Compliance obligations ({obligations.length})
            </h2>
            {obligations.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>No matching published obligations yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto card">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Regulator</th>
                      <th>Obligation</th>
                      <th>Frequency</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.map((o) => (
                      <tr key={o.id}>
                        <td>{o.regulators?.name ?? "—"}</td>
                        <td>
                          <p className="font-medium">{o.title}</p>
                          {o.description && (
                            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{o.description}</p>
                          )}
                        </td>
                        <td>{o.frequency ?? "—"}</td>
                        <td>{o.risk ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
