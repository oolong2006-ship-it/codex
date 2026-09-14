"use client";
import { APPROVAL_FLOW } from "@/lib/constants";
import { DECISION_LABEL, ROLE_LABEL, STAGE_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { Badge } from "./ui";
import type { ApprovalRow, ApprovalStage, PurchaseRequestRow } from "@/types/database";

const DECISION_TONE: Record<string, string> = {
  approved: "bg-brand-50 text-brand-700 ring-brand-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  returned: "bg-amber-50 text-amber-800 ring-amber-200",
  submitted: "bg-sky-50 text-sky-700 ring-sky-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** شريط مراحل الاعتماد الخمس */
export function StageProgress({ request }: { request: PurchaseRequestRow }) {
  const doneUpTo = request.status === "completed"
    ? APPROVAL_FLOW.length
    : request.current_stage
      ? APPROVAL_FLOW.indexOf(request.current_stage)
      : -1;

  return (
    <ol className="flex flex-wrap gap-2">
      {APPROVAL_FLOW.map((stage: ApprovalStage, i) => {
        const done = i < doneUpTo;
        const active = request.current_stage === stage;
        return (
          <li key={stage}
            className={[
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ring-1",
              done ? "bg-brand-50 text-brand-700 ring-brand-200"
                : active ? "bg-amber-50 text-amber-800 ring-amber-300"
                  : "bg-slate-50 text-slate-400 ring-slate-200",
            ].join(" ")}>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full
                             bg-white/70 text-[10px] font-bold ring-1 ring-current">
              {done ? "✓" : i + 1}
            </span>
            {STAGE_LABEL[stage]}
          </li>
        );
      })}
    </ol>
  );
}

/** الخط الزمني التفصيلي لكل قرار */
export function ApprovalTimeline({ approvals }: { approvals: ApprovalRow[] }) {
  if (approvals.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">
      لم يبدأ مسار الاعتماد بعد
    </p>;
  }
  return (
    <ol className="space-y-3">
      {approvals.map((a) => (
        <li key={a.id} className="rounded-lg bg-slate-50 p-3.5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={DECISION_TONE[a.decision ?? ""] ?? ""}>
                {a.decision ? DECISION_LABEL[a.decision] : "إجراء"}
              </Badge>
              {a.stage && (
                <span className="text-sm font-semibold text-slate-700">
                  {STAGE_LABEL[a.stage]}
                </span>
              )}
              {a.is_override && (
                <Badge className="bg-purple-50 text-purple-700 ring-purple-200">
                  تجاوز إداري
                </Badge>
              )}
            </div>
            <time className="text-xs text-slate-400">{formatDateTime(a.created_at)}</time>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            <span className="font-medium">{a.actor_name ?? "—"}</span>
            {a.actor_role && (
              <span className="text-slate-400"> — {ROLE_LABEL[a.actor_role]}</span>
            )}
          </p>

          {a.note && (
            <p className="mt-2 rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
              {a.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
