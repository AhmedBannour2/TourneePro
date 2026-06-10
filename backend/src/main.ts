import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded files (inspection photos, documents, etc.)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // Security headers
  app.use(helmet());

  // CORS — allow only known origins
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('TourneePro API')
    .setDescription('TourneePro backend API for STP logistics')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 TourneePro backend running on http://localhost:${port}`);
  console.log(`📚 API documentation available at http://localhost:${port}/api`);
}
bootstrap();
