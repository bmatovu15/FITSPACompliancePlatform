import { createClient } from "@/lib/supabase/server";
import DocumentsClient from "./documents-client";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const [{ data: docs }, { data: regulators }] = await Promise.all([
    supabase.from("documents").select("*, regulators(name)").order("created_at", { ascending: false }),
    supabase.from("regulators").select("id,name").eq("status", "Active").order("name"),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Documents</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Upload a regulator document, tag its kind (Act, Regulation, Form, Checklist, Policy, Circular…),
        and it's automatically indexed for search and scanned by the AI agent for candidate obligations
        (which land in the Obligations review queue).
      </p>
      <DocumentsClient initial={docs ?? []} regulators={regulators ?? []} />
    </div>
  );
}
