import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) //whitlist delete any field not exist on dto , forbidNonWhitelisted throw error if any field not exist on dto throw an error 
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
