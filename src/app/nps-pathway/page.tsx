import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import VaultClient from "./vault-client";

export default async function VaultPage() {
  const member = await requireMember();
  const supabase = await createClient();
  const { data: files } = await supabase.from("vault_docs").select("*").eq("member_id", member.id).order("uploaded_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Document vault</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Store your own compliance evidence and company documents — visible only to you and FITSPA staff.
      </p>
      <VaultClient memberId={member.id} initialFiles={files ?? []} />
    </div>
  );
}
