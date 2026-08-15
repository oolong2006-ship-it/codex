import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Route protection. Procurement areas require a procurement role; the supplier
 * portal requires the SUPPLIER role. Fine-grained action authorization is still
 * enforced server-side in each server action / route handler.
 */
export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const path = req.nextUrl.pathname;
    const role = token?.role as string | undefined;

    const isProc = role === "SUPER_ADMIN" || role === "PROCUREMENT_ADMIN" || role === "PROCUREMENT_USER";

    if (path.startsWith("/portal") && role !== "SUPPLIER") {
      return NextResponse.redirect(new URL(isProc ? "/dashboard" : "/login", req.url));
    }

    const procAreas = ["/dashboard", "/suppliers", "/search", "/coverage", "/shortlists", "/activity", "/admin"];
    if (procAreas.some((p) => path.startsWith(p)) && !isProc) {
      return NextResponse.redirect(new URL(role === "SUPPLIER" ? "/portal" : "/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: { authorized: ({ token }) => Boolean(token) },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/suppliers/:path*",
    "/search/:path*",
    "/coverage/:path*",
    "/shortlists/:path*",
    "/activity/:path*",
    "/admin/:path*",
    "/portal/:path*",
  ],
};
