"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, X } from "lucide-react";
import { Button, Input, Label, Textarea, Badge } from "@/components/ui";
import { runCatalogExtractionAction, approveExtractedProductAction, discardExtractedProductAction } from "./actions";

interface Job {
  id: string; status: string; model: string | null; fileName: string | null; createdAt: string;
  products: { id: string; nameEn: string | null; brand: string | null; model: string | null; description: string | null; confidence: number | null; approved: boolean }[];
}

export function CatalogTool({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const res = await runCatalogExtractionAction(fd);
            setMsg(res.ok ? `Extracted ${res.count} products — review below.` : res.error ?? "Failed");
            if (res.ok) { formRef.current?.reset(); router.refresh(); }
          });
        }}
        className="space-y-3"
      >
        <div>
          <Label>Catalog file</Label>
          <Input name="file" type="file" accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" />
        </div>
        <div>
          <Label>…or paste catalog text</Label>
          <Textarea name="text" rows={5} placeholder="Paste product lines, one per row…" />
        </div>
        <Button type="submit" disabled={pending}>
          <Sparkles className="h-4 w-4" /> {pending ? "Analyzing…" : "Run AI extraction"}
        </Button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </form>

      {jobs.map((job) => (
        <div key={job.id} className="rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{job.fileName ?? "Pasted text"}</span>
              <Badge tone="neutral">{job.model}</Badge>
              <Badge tone={job.status === "NEEDS_REVIEW" ? "warning" : job.status === "APPROVED" ? "success" : "info"}>{job.status.replace(/_/g, " ")}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</span>
          </div>
          {job.products.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No products extracted.</p>
          ) : (
            <ul className="divide-y divide-border">
              {job.products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{p.nameEn ?? "Untitled"}</span>
                      {p.confidence != null && <span className="text-xs text-muted-foreground">{Math.round(p.confidence * 100)}%</span>}
                      {p.approved && <Badge tone="success">Approved</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{[p.brand, p.model, p.description].filter(Boolean).join(" · ")}</div>
                  </div>
                  {!p.approved && (
                    <div className="flex shrink-0 gap-1">
                      <ReviewBtn tone="success" onClick={() => approveExtractedProductAction(p.id)}><Check className="h-4 w-4" /></ReviewBtn>
                      <ReviewBtn tone="danger" onClick={() => discardExtractedProductAction(p.id)}><X className="h-4 w-4" /></ReviewBtn>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ReviewBtn({ tone, onClick, children }: { tone: "success" | "danger"; onClick: () => Promise<{ ok: boolean }>; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { await onClick(); router.refresh(); })}
      className={`rounded-md border p-1.5 ${tone === "success" ? "border-[hsl(var(--success))]/40 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10" : "border-[hsl(var(--danger))]/40 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10"}`}
    >
      {children}
    </button>
  );
}
