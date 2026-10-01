import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/public-config";
import BeaconNav from "@/components/beacon-nav";
import styles from "./search.module.css";

type DocResult = {
  id: string;
  title: string;
  doc_kind: string | null;
  storage_path: string | null;
  file_name: string | null;
  regulators: { name: string } | null;
};

type ObligationResult = {
  id: string;
  title: string;
  description: string | null;
  frequency: string | null;
  penalty: string | null;
  risk: string | null;
  regulators: { name: string } | null;
};

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

  let docs: DocResult[] = [];
  let obligations: ObligationResult[] = [];

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
    docs = (d as unknown as DocResult[]) ?? [];
    obligations = (o as unknown as ObligationResult[]) ?? [];
  }

  return (
    <div className={styles.seRoot}>
      <BeaconNav active="search" />
      <main className={styles.main}>
        <div className={styles.eyebrow}>Regulatory Library</div>
        <h1 className={styles.title}>Document &amp; obligation search</h1>
        <p className={styles.dek}>
          Search published Acts, regulations, guidelines, forms, and compliance obligations across every
          regulator on the platform.
        </p>

        <form className={styles.searchRow} action="/search">
          <input
            className={styles.input}
            type="text"
            name="q"
            defaultValue={q}
            placeholder="e.g. capital adequacy, agent banking, data protection..."
          />
          <button className={styles.btn} type="submit">
            Search
          </button>
        </form>

        {q && (
          <div className={styles.results}>
            <section>
              <h2 className={styles.sectionLabel}>Documents ({docs.length})</h2>
              {docs.length === 0 ? (
                <p className={styles.hint}>No matching published documents yet.</p>
              ) : (
                <div className={styles.docList}>
                  {docs.map((d) => (
                    <div key={d.id} className={styles.docCard}>
                      <div>
                        <p className={styles.docTitle}>{d.title}</p>
                        <p className={styles.docMeta}>
                          {d.regulators?.name ?? "Unassigned"} · {d.doc_kind}
                        </p>
                      </div>
                      {d.storage_path && (
                        <a className={styles.btnGhost} href={fileUrl(base, d.storage_path) ?? "#"} target="_blank" rel="noreferrer">
                          Open / Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className={styles.sectionLabel}>Compliance obligations ({obligations.length})</h2>
              {obligations.length === 0 ? (
                <p className={styles.hint}>No matching published obligations yet.</p>
              ) : (
                <table className={styles.obTable}>
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
                          <p className={styles.docTitle}>{o.title}</p>
                          {o.description && <p className={styles.obDesc}>{o.description}</p>}
                        </td>
                        <td>{o.frequency ?? "—"}</td>
                        <td>{o.risk ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
