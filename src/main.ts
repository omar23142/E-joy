import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Chrome extension
  app.enableCors({
    origin: true, // Allow all origins in development. In production, specify extension ID
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // increase the limit of json body to handle large subtitle files
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  ); //whitlist delete any field not exist on dto , forbidNonWhitelisted throw error if any field not exist on dto throw an error
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
