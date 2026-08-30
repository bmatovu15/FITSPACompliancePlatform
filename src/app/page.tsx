import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
          Uganda fintech regulatory compliance
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl" style={{ fontFamily: "var(--font-serif)" }}>
          One home for every regulator, licence, and obligation your fintech is bound to.
        </h1>
        <p className="mt-5 max-w-2xl text-lg" style={{ color: "var(--color-text-muted)" }}>
          FITSPA members track compliance obligations across the Bank of Uganda, the Microfinance
          Regulatory Department, and other regulators in one place — with a public wizard that tells
          anyone, member or not, exactly what a licence requires.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn btn-primary text-base" href="/wizard">Start the requirements wizard</Link>
          <Link className="btn btn-accent text-base" href="/signup">Join as a member</Link>
          <Link className="btn btn-ghost text-base" href="/login">Member sign in</Link>
        </div>
      </section>

      <section className="border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
          <Link className="card block p-6 transition hover:shadow-sm" href="/wizard">
            <h2 className="text-lg font-semibold">Requirements wizard</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Know which licence you need, or not sure yet? Either way, get a downloadable, ordered
              checklist of every requirement and form.
            </p>
          </Link>
          <Link className="card block p-6 transition hover:shadow-sm" href="/search">
            <h2 className="text-lg font-semibold">Document &amp; obligation search</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Search the regulator document library — Acts, regulations, guidelines, and forms — and
              every published compliance obligation.
            </p>
          </Link>
          <Link className="card block p-6 transition hover:shadow-sm" href="/lookup">
            <h2 className="text-lg font-semibold">FITSPA member lookup</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Confirm whether a company is a FITSPA member in good standing, and which regulator
              licences it holds.
            </p>
          </Link>
          <Link className="card block p-6 transition hover:shadow-sm" href="/assistant">
            <h2 className="text-lg font-semibold">Ask the AI assistant</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Ask a regulatory question in plain language and get an answer grounded in — and cited
              to — the indexed regulator documents.
            </p>
          </Link>
        </div>
      </section>
    </>
  );
}
