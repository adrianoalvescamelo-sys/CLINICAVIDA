import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggerModule } from 'nestjs-pino';
import configuration, { validateEnv } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { PacientesModule } from './pacientes/pacientes.module';
import { ProfissionaisModule } from './profissionais/profissionais.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { AgendaModule } from './agenda/agenda.module';
import { BotModule } from './bot/bot.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ListaEsperaModule } from './lista-espera/lista-espera.module';
import { RecepcaoModule } from './recepcao/recepcao.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { ProntuarioModule } from './prontuario/prontuario.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottlerProxyGuard } from './common/guards/throttler-proxy.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        customProps: (req) => ({ trace_id: (req as any).trace_id }),
        redact: ['req.headers.authorization', 'req.body.senha'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    HealthModule,
    PacientesModule,
    ProfissionaisModule,
    UsuariosModule,
    ConfiguracoesModule,
    AgendaModule,
    BotModule,
    WhatsappModule,
    ListaEsperaModule,
    RecepcaoModule,
    RelatoriosModule,
    ProntuarioModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerProxyGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
