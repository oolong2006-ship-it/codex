"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui";
import { submitApplicationAction } from "./actions";

export function SubmitButton({ disabled, disabledReason }: { disabled: boolean; disabledReason?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const res = await submitApplicationAction();
            if (!res.ok) setError(res.error ?? "Failed");
            else router.refresh();
          })
        }
      >
        <Send className="h-4 w-4" /> {pending ? "Submitting…" : "Submit application"}
      </Button>
      {disabled && disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
      {error && <p className="text-xs text-[hsl(var(--danger))]">{error}</p>}
    </div>
  );
}
