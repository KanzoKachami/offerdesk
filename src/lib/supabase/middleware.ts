import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, supabaseEnvProblem } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login", "/api/telegram"];

/** Понятная страница вместо «MIDDLEWARE_INVOCATION_FAILED». */
function problemPage(title: string, details: string) {
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>offerdesk — ошибка настройки</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;justify-content:center;padding:64px 16px}
main{max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px}h1{font-size:20px;margin:0 0 12px}
p{line-height:1.5;color:#334155}code{background:#f1f5f9;padding:2px 6px;border-radius:4px}</style></head>
<body><main><h1>${title}</h1><p>${details}</p>
<p>Vercel → проект → Settings → Environment Variables: проверь <code>NEXT_PUBLIC_SUPABASE_URL</code> и <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
(Supabase → Project Settings → API), затем Deployments → Redeploy.</p></main></body></html>`;
  return new NextResponse(html, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function updateSession(request: NextRequest) {
  const problem = supabaseEnvProblem();
  if (problem) return problemPage("CRM не может подключиться к базе", problem);

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // getClaims проверяет токен локально по ключам проекта — без похода в Supabase на каждый клик.
    // Если сессия истекла, он сам её обновит.
    let user: unknown = null;
    let broken = false;
    try {
      const { data } = await supabase.auth.getClaims();
      user = data?.claims ?? null;
    } catch {
      // битая или чужая сессия (например, после смены проекта Supabase) — просто считаем, что не вошёл
      user = null;
      broken = true;
    }

    const path = request.nextUrl.pathname;
    const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

    if (!user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const redirect = NextResponse.redirect(url);
      // старые куки от другого проекта мешают войти — чистим
      if (broken)
        request.cookies.getAll().forEach((c) => {
          if (c.name.startsWith("sb-")) redirect.cookies.delete(c.name);
        });
      return redirect;
    }
    if (user && path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return response;
  } catch (e) {
    return problemPage("Ошибка при проверке входа", e instanceof Error ? e.message : String(e));
  }
}
