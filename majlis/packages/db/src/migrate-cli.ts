import { createDb, runMigrations } from "./client.js";

const handle = createDb();
await runMigrations(handle);
await handle.close();
console.log("migrations applied");
