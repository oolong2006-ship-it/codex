import { z } from "zod";

export const STAMP_ICONS = ["☕", "⭐", "🥐", "🍩", "❤️", "🧋", "🍦", "✂️"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const designSchema = z.object({
  bg: hex.default("#3B2418"),
  fg: hex.default("#FFF7ED"),
  accent: hex.default("#F59E0B"),
  icon: z.enum(STAMP_ICONS).default("☕"),
});

export type CardDesign = z.infer<typeof designSchema>;

export function parseDesign(raw: unknown): CardDesign {
  const r = designSchema.safeParse(raw ?? {});
  return r.success ? r.data : designSchema.parse({});
}

/** "☕☕☕○○○○○○○" — used on wallet passes and the web card. */
export function stampRow(icon: string, current: number, required: number): string {
  const filled = Math.min(current, required);
  return icon.repeat(filled) + "○".repeat(Math.max(0, required - filled));
}
