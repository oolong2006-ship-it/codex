import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApi, createApp } from './app.factory';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);
  if (config.env !== 'production') SwaggerModule.setup('docs', app, buildOpenApi(app));
  await app.listen(config.port);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
