/** يولّد apps/api/openapi.json من الكود (prompts/phase-1: OpenAPI يُولَّد تلقائيًا). */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApi, createApp } from './app.factory';
import { loadConfig } from './config';

async function run(): Promise<void> {
  const app = await createApp(loadConfig());
  const doc = buildOpenApi(app);
  const out = join(__dirname, '..', 'openapi.json');
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  await app.close();
  process.stdout.write(`Wrote ${out} (${Object.keys(doc.paths).length} paths)\n`);
}

run().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
