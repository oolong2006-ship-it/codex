"use client";

import { Languages } from "lucide-react";
import { useLang } from "@/lib/i18n/context";
import { Button } from "@/components/ui";

export function LangToggle() {
  const { lang, toggle } = useLang();
  return (
    <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle language">
      <Languages className="h-4 w-4" />
      {lang === "en" ? "العربية" : "English"}
    </Button>
  );
}
