import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims as { email?: string } | undefined;
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-3 text-lg font-extrabold tracking-tight">
          offer<span className="text-indigo-600">desk</span>
        </div>
        <Nav />
        <div className="mt-auto border-t border-slate-100 px-3 pt-4 text-xs text-slate-500">
          <div className="truncate">{user.email}</div>
          <form action={signOut}>
            <button className="mt-1 text-slate-400 hover:text-slate-700">Выйти</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-4 md:hidden">
          <Nav />
        </div>
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
