import { redirect } from "next/navigation";
import { authConfigured, supabaseServer } from "@/lib/auth";
import AuthForm from "@/components/auth-form";
import { SetupState } from "@/components/setup-state";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!authConfigured()) return <SetupState />;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");
  return (
    <AuthForm
      confirmationError={(await searchParams).error === "confirmation"}
    />
  );
}
