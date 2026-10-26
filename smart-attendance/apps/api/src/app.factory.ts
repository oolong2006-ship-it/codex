import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppConfig } from './config';
import { buildAppModule } from './app.module';

export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(buildAppModule(config), { logger: config.env === 'test' ? false : undefined });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('Thabt — Smart Attendance OS API')
    .setDescription('واجهة المنصة. الأخطاء بصيغة { error: { code, message_ar, message_en } }.')
    .setVersion('1.0.0')
    .setOpenAPIVersion('3.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, doc);
}
