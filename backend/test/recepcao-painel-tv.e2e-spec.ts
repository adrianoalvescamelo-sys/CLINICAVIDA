/**
 * Painel TV (e2e) — Sprint 6 hardening
 *
 * Cobre:
 *  - GET /api/recepcao/painel-tv
 *    - 200 com x-tv-token correto: payload { chamadoAgora, proximos[≤3], generatedAt }
 *    - Nome completo exibido sem truncamento
 *    - Limite 3 em proximos mesmo com 4 aguardando
 *    - 401 sem header
 *    - 401 token comprimento diferente (TV_UNAUTHORIZED)
 *    - 401 token mesmo tamanho mas conteúdo errado (timing-safe)
 *
 * Isolamento:
 *  - Profissional + paciente dedicados (sufixo painel-tv-e2e)
 *  - afterAll cleanup completo
 *  - Não exige JWT — endpoint @Public + TvAuthGuard
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  Sexo,
  TipoAtendimento,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';

const TV_SECRET = 'test-tv-secret-clinicavida-2026-devonly';
const targetDate = '2026-06-17';

describe('RecepcaoPainelTV (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let profissionalId: string;
  let pacienteId: string;

  beforeAll(async () => {
    loadRootEnv();
    const { AppModule } = await import('../src/app.module');
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

    await app.init();
    prisma = app.get(PrismaService);

    await cleanup();

    const paciente = await prisma.paciente.create({
      data: {
        cpf: '93000000001',
        nomeCompleto: 'Paciente Nome Completo Sem Truncamento Painel TV E2E',
        dataNascimento: new Date('1990-04-10'),
        sexo: Sexo.NAO_INFORMADO,
        telefoneWhatsapp: '65999993001',
      },
    });
    pacienteId = paciente.id;

    const profissional = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Dra. Profissional Painel TV E2E',
        especialidade: 'Clinica Geral E2E',
        ehMedico: true,
        ativo: true,
        cor: '#0A66FF',
      },
    });
    profissionalId = profissional.id;

    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('200 com x-tv-token correto retorna chamadoAgora + proximos (≤3) + generatedAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/painel-tv')
      .query({ data: targetDate })
      .set('x-tv-token', TV_SECRET)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'chamadoAgora',
      'generatedAt',
      'proximos',
    ]);
    expect(res.body.data.generatedAt).toEqual(expect.any(String));

    expect(res.body.data.chamadoAgora).not.toBeNull();
    expect(res.body.data.chamadoAgora.paciente.nomeCompleto).toBe(
      'Paciente Nome Completo Sem Truncamento Painel TV E2E',
    );
    expect(res.body.data.chamadoAgora.profissional.nomeCompleto).toBe(
      'Dra. Profissional Painel TV E2E',
    );

    expect(res.body.data.proximos).toHaveLength(3);
    expect(res.body.data.proximos[0].paciente.nomeCompleto).toBe(
      'Paciente Nome Completo Sem Truncamento Painel TV E2E',
    );
  });

  it('401 sem x-tv-token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/painel-tv')
      .query({ data: targetDate })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TV_UNAUTHORIZED');
  });

  it('401 com x-tv-token de comprimento diferente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/painel-tv')
      .query({ data: targetDate })
      .set('x-tv-token', 'curto')
      .expect(401);

    expect(res.body.error.code).toBe('TV_UNAUTHORIZED');
  });

  it('401 com x-tv-token mesmo comprimento mas conteúdo errado', async () => {
    const wrong = 'X'.repeat(TV_SECRET.length);
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/painel-tv')
      .query({ data: targetDate })
      .set('x-tv-token', wrong)
      .expect(401);

    expect(res.body.error.code).toBe('TV_UNAUTHORIZED');
  });

  // ---------------------------------------------------------------------------

  async function seed() {
    // chamadoAgora: EM_ATENDIMENTO (mais recente updatedAt)
    await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        dataHoraInicio: new Date(`${targetDate}T13:00:00.000Z`),
        dataHoraFim: new Date(`${targetDate}T13:30:00.000Z`),
        tipo: TipoAtendimento.CONSULTA,
        status: AgendamentoStatus.EM_ATENDIMENTO,
        origem: AgendamentoOrigem.RECEPCAO,
        encaixe: false,
        observacoes: 'Painel TV E2E em atendimento',
      },
    });

    // 4 aguardando — service deve retornar só 3
    for (let i = 0; i < 4; i++) {
      const hora = 14 + i;
      await prisma.agendamento.create({
        data: {
          pacienteId,
          profissionalId,
          dataHoraInicio: new Date(
            `${targetDate}T${hora.toString().padStart(2, '0')}:00:00.000Z`,
          ),
          dataHoraFim: new Date(
            `${targetDate}T${hora.toString().padStart(2, '0')}:30:00.000Z`,
          ),
          tipo: TipoAtendimento.CONSULTA,
          status: AgendamentoStatus.AGUARDANDO,
          origem: AgendamentoOrigem.RECEPCAO,
          encaixe: false,
          observacoes: `Painel TV E2E aguardando ${i}`,
        },
      });
    }
  }

  async function cleanup() {
    await prisma.agendamentoHistorico.deleteMany({
      where: { agendamento: { paciente: { cpf: '93000000001' } } },
    });
    await prisma.mensagemWhatsapp.deleteMany({
      where: { paciente: { cpf: '93000000001' } },
    });
    await prisma.agendamento.deleteMany({
      where: { paciente: { cpf: '93000000001' } },
    });
    await prisma.profissional.deleteMany({
      where: { nomeCompleto: 'Dra. Profissional Painel TV E2E' },
    });
    await prisma.paciente.deleteMany({ where: { cpf: '93000000001' } });
  }

  function loadRootEnv() {
    const envPath = path.resolve(__dirname, '../../.env');
    if (!fs.existsSync(envPath)) return;
    const env = fs.readFileSync(envPath, 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator);
      const value = trimmed.slice(separator + 1);
      process.env[key] = process.env[key] ?? value;
    }
  }
});
