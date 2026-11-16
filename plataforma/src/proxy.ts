import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Renueva la sesión de Supabase en cada petición y protege las rutas privadas.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response; // la página mostrará el error de configuración

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista, cabeceras) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of lista) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(cabeceras ?? {})) response.headers.set(k, v);
      },
    },
  });

  // getClaims valida la firma del token; no confía en la cookie a ciegas.
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims?.sub);

  const privada = /^\/(panel|empleado)(\/|$)/.test(request.nextUrl.pathname);
  if (privada && !conSesion) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/acceso";
    destino.searchParams.set("siguiente", request.nextUrl.pathname);
    return NextResponse.redirect(destino);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
