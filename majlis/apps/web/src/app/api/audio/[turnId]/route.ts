import { audioRefForClient, audioRefForReviewer } from "@majlis/db";
import { canReview, currentUser, db, recordings } from "@/lib/server";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { wav: "audio/wav", ogg: "audio/ogg" };

/**
 * A participant's recorded utterance. Reviewers of the organization may always
 * listen (to correct transcripts); everyone else only when the participant
 * separately allowed audio playback.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params;
  const user = await currentUser();
  const store = recordings();
  if (!user || !store || !/^[0-9a-f-]{36}$/.test(turnId))
    return new Response(null, { status: 404 });
  const ref = canReview(user)
    ? await audioRefForReviewer(db(), user.orgId, turnId)
    : await audioRefForClient(db(), user.orgId, turnId);
  const audio = ref ? await store.get(ref) : null;
  if (!ref || !audio) return new Response(null, { status: 404 });
  return new Response(Buffer.from(audio), {
    headers: {
      "Content-Type": TYPES[ref.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}
