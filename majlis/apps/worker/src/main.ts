import { JobRegistry } from "./jobs.js";

const registry = new JobRegistry();
console.log(`[worker] started with ${registry.registered().length} registered jobs`);
