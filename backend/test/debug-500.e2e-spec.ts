import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import * as argon2 from 'argon2';
import { PerfilTipo } from '@prisma/client';

describe('Debug 500', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: false });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.usuario.deleteMany({
      where: { email: 'debug500@clinicavida.test' },
    });
    await prisma.usuario.create({
      data: {
        email: 'debug500@clinicavida.test',
        senhaHash: await argon2.hash('Senha!123456'),
        nomeCompleto: 'Debug 500',
        perfil: PerfilTipo.ADMIN,
      },
    });
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: 'debug500@clinicavida.test' },
    });
    await app.close();
  });

  it('login debug — should log actual response', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-forwarded-for', '1.2.3.4')
      .send({ email: 'debug500@clinicavida.test', senha: 'Senha!123456' });

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(200);
  });
});
