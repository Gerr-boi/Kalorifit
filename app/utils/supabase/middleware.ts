import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  try {
    let response = NextResponse.next({
      request,
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    await supabase.auth.getUser();

    return response;
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.next({
      request,
    });
  }
}
