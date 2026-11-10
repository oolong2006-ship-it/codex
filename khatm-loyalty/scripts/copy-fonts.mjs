// Copies the self-hosted font CSS + woff2 files used by the marketing home page into public/fonts.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const pkg of ["alexandria", "ibm-plex-sans-arabic"]) {
  const src = path.join(root, "node_modules", "@fontsource", pkg);
  if (!existsSync(src)) throw new Error(`missing @fontsource/${pkg}`);
  const dst = path.join(root, "public", "fonts", pkg);
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, filter: (f) => !/\.(md|json)$/.test(f) && !f.includes(`${path.sep}scss`) });
}
console.log("fonts copied to public/fonts");
