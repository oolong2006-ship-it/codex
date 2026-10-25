import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter';

/** Shared between main.ts and the e2e tests so both run the exact same pipeline. */
export function setupApp(app: INestApplication, opts: { swagger?: boolean } = {}) {
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:3100')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-WPS-Errors'],
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  if (opts.swagger !== false) {
    const config = new DocumentBuilder()
      .setTitle('Shuoon API — شؤون')
      .setDescription('HR & payroll for multi-branch Saudi businesses. All labor-law math comes from @taqam/core.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  return app;
}
