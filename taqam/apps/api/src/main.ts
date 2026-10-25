import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // API_DOCS=false hides the Swagger UI (/api/docs), e.g. on the public production server
  setupApp(app, { swagger: process.env.API_DOCS !== 'false' });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4100);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Shuoon API listening on :${port}${process.env.API_DOCS === 'false' ? '' : ' (docs at /api/docs)'}`);
}

bootstrap();
