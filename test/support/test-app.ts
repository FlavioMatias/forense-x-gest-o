import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';

export async function createScenarioApp(): Promise<INestApplication<App>> {
  const database = process.env.DB_DATABASE?.toLowerCase();
  if (!process.env.DB_HOST || !database?.includes('_test')) {
    throw new Error('Cenários exigem DB_HOST e um DB_DATABASE isolado contendo "_test".');
  }
  if (process.env.DB_SYNCHRONIZE !== 'true') {
    throw new Error('Cenários exigem DB_SYNCHRONIZE=true no banco isolado de testes.');
  }

  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<App>();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}