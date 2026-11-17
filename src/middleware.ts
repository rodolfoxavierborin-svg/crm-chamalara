import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const isSuspended = process.env.APP_SUSPENDED === 'true';
  const isSuspendedPage = request.nextUrl.pathname.startsWith('/suspenso');

  // Modo de suspensão controlado pela variável de ambiente APP_SUSPENDED na Vercel
  if (isSuspended) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Sistema temporariamente indisponível, entre em contato com o suporte.' },
        { status: 503 }
      );
    }

    if (!isSuspendedPage) {
      return NextResponse.redirect(new URL('/suspenso', request.url));
    }

    return NextResponse.next();
  }

  // Se o sistema estiver ativo, evita acesso manual à página de suspensão
  if (isSuspendedPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith('/login');

  // Se não estiver logado e tentar acessar qualquer página do CRM, redireciona para /login no servidor
  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Se já estiver logado e tentar acessar /login, redireciona para a raiz /
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};