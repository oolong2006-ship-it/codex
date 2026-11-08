import { existsSync } from "node:fs";
import path from "node:path";

const file = path.join(__dirname, "..", ".env");
if (existsSync(file)) process.loadEnvFile(file);
