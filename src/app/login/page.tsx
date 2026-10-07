import { signIn } from "@/lib/actions";
import { btnCls, inputCls } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={signIn} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Offerdesk</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в систему</p>
        </div>
        {sp.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{sp.error}</p>}
        <input name="email" type="email" required placeholder="Email" className={inputCls} autoComplete="email" />
        <input name="password" type="password" required placeholder="Пароль" className={inputCls} autoComplete="current-password" />
        <button type="submit" className={`${btnCls.primary} w-full`}>
          Войти
        </button>
      </form>
    </main>
  );
}
