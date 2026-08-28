import { NextRequest, NextResponse } from "next/server";

export default async function proxy(request: NextRequest) {
  if (!process.env.WORKOS_CLIENT_ID) return NextResponse.next();
  const { authkit, handleAuthkitHeaders } = await import("@workos-inc/authkit-nextjs");
  const { session, headers, authorizationUrl } = await authkit(request);
  const protectedPath = request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/api/");
  if (protectedPath && request.nextUrl.pathname !== "/api/health" && !session.user && authorizationUrl) return handleAuthkitHeaders(request, headers, { redirect: authorizationUrl });
  return handleAuthkitHeaders(request, headers);
}

export const config = { matcher: ["/", "/admin", "/invite/:path*", "/api/:path*"] };
