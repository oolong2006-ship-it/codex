import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const app = await buildServer({ logger: true });
await app.listen({ port: config.port, host: "0.0.0.0" });
if (config.devPage) app.log.warn(`dev page enabled at http://localhost:${config.port}/dev`);
