import { buildServer } from "./server.js";

const port = Number(process.env.VOICE_GATEWAY_PORT ?? 4100);
const app = await buildServer({ logger: true });
await app.listen({ port, host: "0.0.0.0" });
