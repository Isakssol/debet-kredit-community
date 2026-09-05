import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { MFA_VERIFY_PATH, mfaGate } from "@/lib/mfa/aal";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login")
    || (process.env.DEMO_MODE === "1" && request.nextUrl.pathname.startsWith("/demo"));
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // Tvåstegsverifiering: en session som stannat på aal1 fast kontot har en
  // verifierad faktor är inte färdiginloggad, och når därför ingen sida —
  // oavsett vilken adress som skrivs in. Spärren sitter här och inte i
  // gränssnittet, för ett gränssnitt går alltid att gå förbi: sessionen är
  // äkta, token duger mot databasen, och det enda som skulle hindra någon vore
  // att vi låtit bli att rita menyn.
  //
  // Kostar inget extra nätanrop: getUser() ovan har redan bevisat att token är
  // äkta och lämnat färska factors, och aal läses lokalt ur samma token.
  // getSession() är bara en kakläsning.
  //
  // Gäller även demoläget. Ett undantag i en spärr är den sortens mönster som
  // kopieras vidare — och i demon är knappen som slår på faktorn låst i stället,
  // vilket är rätt ställe att göra skillnaden på.
  if (user) {
    const { data: { session } } = await supabase.auth.getSession();
    const gate = mfaGate({
      factors: user.factors,
      accessToken: session?.access_token,
      pathname: request.nextUrl.pathname,
    });
    // Kodsteget ligger under /login, och regeln nedan skickar hem en inloggad
    // användare därifrån. Den som står PÅ kodsteget måste därför serveras det
    // här, före den regeln — annars går de två i ring.
    if (gate === "on-verify-step") return supabaseResponse;
    if (gate === "verify-step") {
      const url = request.nextUrl.clone();
      url.pathname = MFA_VERIFY_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
