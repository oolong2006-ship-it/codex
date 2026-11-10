import { renderMarketing } from "@/server/marketing";

let cached: string | null = null;

/** The public home page: the marketing site rendered with self-hosted fonts and links into the app. */
export async function GET() {
  if (!cached || process.env.NODE_ENV !== "production") cached = renderMarketing("app");
  return new Response(cached, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
