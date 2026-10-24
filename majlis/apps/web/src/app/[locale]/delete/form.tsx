"use client";

import { t, type Locale } from "@majlis/i18n";
import { useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { eraseParticipationAction } from "./actions";

export function DeletionForm({ locale }: { locale: Locale }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<"done" | "not_found" | null>(null);
  const [pending, start] = useTransition();

  if (result === "done") {
    return (
      <p role="status" className="font-semibold text-palm">
        {t(locale, "deletion.done")}
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await eraseParticipationAction(code)));
      }}
    >
      <Field label={t(locale, "deletion.code")}>
        <input
          className={`${inputClass} font-mono tracking-widest`}
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          required
        />
      </Field>
      {result === "not_found" && (
        <p role="alert" className="text-red-700">
          {t(locale, "deletion.notFound")}
        </p>
      )}
      <Button type="submit" variant="danger" disabled={pending}>
        {t(locale, "deletion.submit")}
      </Button>
    </form>
  );
}
