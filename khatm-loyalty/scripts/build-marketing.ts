import { writeFileSync } from "node:fs";
import path from "node:path";
import { renderMarketing } from "../src/server/marketing";

/** Writes marketing/index.html: the self-contained marketing page for any static host. */
const demo = process.argv[2] ?? "https://claude.ai/artifact/D8J55xU3WtBx2Jv7fRcZvk";
writeFileSync(path.join(__dirname, "..", "marketing", "index.html"), renderMarketing("standalone", { demoUrl: demo }));
console.log("marketing/index.html written");
