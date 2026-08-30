import { createClient } from "@/lib/supabase/server";
import VerticalsClient from "./verticals-client";

export default async function VerticalsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("fintech_verticals").select("*").order("status").order("name");
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Fintech verticals</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Members can propose a new vertical at signup. Approve it to make it available platform-wide.
      </p>
      <VerticalsClient initial={data ?? []} />
    </div>
  );
}
