import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ResponseInterceptor is registered as APP_INTERCEPTOR in AppModule so that
  // NestJS DI can inject Reflector (needed for @SkipResponseInterceptor()).
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`App escutando na porta ${port}`, 'Bootstrap');

  // ---------------------------------------------------------------------------
  // Graceful shutdown: SIGTERM e SIGINT
  // ---------------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    logger.log(
      `Sinal ${signal} recebido — iniciando graceful shutdown`,
      'Shutdown',
    );

    // Força saída se o drain demorar mais que GRACEFUL_SHUTDOWN_TIMEOUT_MS
    const forceExit = setTimeout(() => {
      logger.error(
        `Shutdown forçado após ${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms`,
        undefined,
        'Shutdown',
      );
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    forceExit.unref(); // não bloqueia o event loop se o app fechar antes

    try {
      await app.close(); // para de aceitar conexões, drena requests, desconecta Prisma
      logger.log('Shutdown concluído com sucesso', 'Shutdown');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error('Erro durante shutdown', err, 'Shutdown');
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Falha ao inicializar a aplicação:', err);
  process.exit(1);
});
