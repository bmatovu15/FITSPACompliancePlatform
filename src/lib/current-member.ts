import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Member } from "@/lib/types";

export async function requireMember(): Promise<Member> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("members").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (!member) redirect("/login");
  return member as Member;
}

export async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) redirect("/dashboard");
  return user;
}
