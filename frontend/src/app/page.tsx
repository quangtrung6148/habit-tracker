import { redirect } from "next/navigation";
import { authConfigured, supabaseServer } from "@/lib/auth";
import HabitApp from "@/components/habit-app";
import { SetupState } from "@/components/setup-state";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (!authConfigured()) return <SetupState />;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <HabitApp email={user.email || ""} />;
}
