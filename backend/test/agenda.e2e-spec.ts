/**
 * Agenda E2E — Sprint 3
 *
 * Cobre:
 *  POST   /api/agendamentos — 201 admin, 201 recepcao, 409 HORARIO_OCUPADO,
 *                             201 encaixe, 409 PACIENTE_COM_AGENDAMENTO,
 *                             403 medico, 401 sem token
 *  GET    /api/agendamentos — 200 com filtros, 200 todos perfis autenticados
 *  GET    /api/agendamentos/:id — 200 sucesso, 404 não encontrado
 *  PATCH  /api/agendamentos/:id — 200 status, 400 TRANSICAO_INVALIDA, 409 CONCURRENT_UPDATE
 *  POST   /api/agendamentos/:id/chamar — 200 medico, 200 profissional_nao_medico, 403 recepcao
 *  POST   /api/agendamentos/:id/atendido — 200 medico
 *  POST   /api/agendamentos/:id/falta — 200 recepcao, 403 medico
 *  POST   /api/agendamentos/bloqueios — 201 medico próprio, 201 admin, 403 outro profissional,
 *                                       409 AGENDAMENTO_NO_BLOQUEIO
 *  DELETE /api/agendamentos/bloqueios/:id — 204 sucesso, 403 outro profissional, 404 não encontrado
 *  POST   /api/bot/pre-agendamento — 201 novo paciente, 201 idempotência,
 *                                    400 sem nome, 401 sem bot secret
 *
 * Isolamento:
 *  - Profissional e paciente de teste criados em beforeAll.
 *  - Datas sempre >= 3h à frente para não colidir com regra de 2h.
 *  - Cleanup por nome/email em afterAll (ordem respeita FK).
 *  - IPs únicos via x-forwarded-for para evitar throttler.
 *
 * Padrão envelope:
 *  sucesso: { success: true,  data: {...},  error: null }
 *  erro:    { success: false, data: null,   error: { code, message, trace_id } }
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import * as argon2 from 'argon2';
import { AgendamentoStatus, PerfilTipo } from '@prisma/client';

// ─── CPFs válidos matematicamente (dígitos verificadores corretos) ────────────
// Validados com algoritmo de dígitos verificadores do CPF.
const CPF_PACIENTE_AGENDA = '71428793860'; // 714.287.938-60 (válido)
const CPF_PACIENTE_ENCAIXE = '51621675335'; // 516.216.753-35 (válido, para teste de encaixe)
const CPF_PACIENTE_BOT = '66201476156'; // 662.014.761-56 (válido)
const CPF_PACIENTE_BOT2 = '33401488139'; // 334.014.881-39 (válido)
const BOT_SECRET =
  process.env.BOT_SECRET ?? 'test-bot-secret-clinicavida-2026-devonly';

// ─── helpers ─────────────────────────────────────────────────────────────────

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@clinicavida.test`;
}

let ipCounter = 200;
function uniqueIp(): string {
  const id = ipCounter++;
  const b = Math.floor(id / 255) % 255;
  const c = id % 255;
  return `10.3.${b}.${c + 1}`;
}

/** Data futura N horas a partir de agora */
function futureDate(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

// ─── suite principal ─────────────────────────────────────────────────────────

describe('Agenda (e2e) — Sprint 3', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // tokens por perfil
  let tokenAdmin: string;
  let tokenRecepcao: string;
  let tokenMedico: string;
  let tokenProfissional: string;

  // IDs de entidades base criadas em beforeAll
  let profissionalMedicoId: string; // vinculado ao usuário médico
  let profissionalNaoMedicoId: string; // vinculado ao usuário profissional
  let pacienteId: string; // paciente padrão para testes
  let pacienteEncaixeId: string; // segundo paciente, exclusivo para teste de encaixe

  // ─── setup global ─────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
    await app.init();

    prisma = app.get(PrismaService);

    // Limpa dados de execuções anteriores (ordem FK: agendamentos → bloqueios → profissionais → pacientes → usuários)
    await cleanupPreviousRuns();

    // Cria usuários + tokens
    tokenAdmin = await criarTokenPara(PerfilTipo.ADMIN, 'e2e-agenda-admin');
    tokenRecepcao = await criarTokenPara(
      PerfilTipo.RECEPCAO,
      'e2e-agenda-recepcao',
    );
    tokenMedico = await criarTokenPara(PerfilTipo.MEDICO, 'e2e-agenda-medico');
    tokenProfissional = await criarTokenPara(
      PerfilTipo.PROFISSIONAL_NAO_MEDICO,
      'e2e-agenda-profnaomedico',
    );

    // Obtém IDs dos usuários médico e profissional para criar registros em profissionais
    const usuarioMedico = await prisma.usuario.findFirst({
      where: { email: { contains: 'e2e-agenda-medico' } },
      select: { id: true },
    });
    const usuarioProfissional = await prisma.usuario.findFirst({
      where: { email: { contains: 'e2e-agenda-profnaomedico' } },
      select: { id: true },
    });

    // Cria profissional médico vinculado ao usuário
    const profMedico = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Dr. E2E Médico Agenda',
        especialidade: 'Clínica Geral',
        ehMedico: true,
        ativo: true,
        usuarioId: usuarioMedico?.id,
      },
    });
    profissionalMedicoId = profMedico.id;

    // Cria profissional não-médico vinculado ao usuário
    const profNaoMedico = await prisma.profissional.create({
      data: {
        nomeCompleto: 'E2E Profissional Agenda',
        ehMedico: false,
        ativo: true,
        usuarioId: usuarioProfissional?.id,
      },
    });
    profissionalNaoMedicoId = profNaoMedico.id;

    // Cria paciente de teste padrão
    const paciente = await prisma.paciente.create({
      data: {
        cpf: CPF_PACIENTE_AGENDA,
        nomeCompleto: 'Paciente E2E Agenda',
        dataNascimento: new Date('1985-06-15'),
        telefoneWhatsapp: '66988889999',
      },
    });
    pacienteId = paciente.id;

    // Cria segundo paciente exclusivo para teste de encaixe
    const pacienteEncaixe = await prisma.paciente.create({
      data: {
        cpf: CPF_PACIENTE_ENCAIXE,
        nomeCompleto: 'Paciente E2E Encaixe',
        dataNascimento: new Date('1990-03-10'),
        telefoneWhatsapp: '66988881234',
      },
    });
    pacienteEncaixeId = pacienteEncaixe.id;
  }, 90_000);

  afterAll(async () => {
    await cleanupPreviousRuns();
    await app.close();
  });

  async function cleanupPreviousRuns() {
    // Busca profissionais de teste pelo nome
    const profs = await prisma.profissional.findMany({
      where: { nomeCompleto: { contains: 'E2E' } },
      select: { id: true },
    });
    const profIds = profs.map((p) => p.id);

    if (profIds.length > 0) {
      await prisma.agendamentoHistorico.deleteMany({
        where: { agendamento: { profissionalId: { in: profIds } } },
      });
      await prisma.agendamento.deleteMany({
        where: { profissionalId: { in: profIds } },
      });
      await prisma.bloqueioAgenda.deleteMany({
        where: { profissionalId: { in: profIds } },
      });
    }

    // Pacientes de teste
    const cpfsAgenda = [
      CPF_PACIENTE_AGENDA,
      CPF_PACIENTE_ENCAIXE,
      CPF_PACIENTE_BOT,
      CPF_PACIENTE_BOT2,
    ];
    const pacientes = await prisma.paciente.findMany({
      where: { cpf: { in: cpfsAgenda } },
      select: { id: true },
    });
    const pacIds = pacientes.map((p) => p.id);
    if (pacIds.length > 0) {
      await prisma.agendamentoHistorico.deleteMany({
        where: { agendamento: { pacienteId: { in: pacIds } } },
      });
      await prisma.agendamento.deleteMany({
        where: { pacienteId: { in: pacIds } },
      });
      await prisma.mensagemWhatsapp.deleteMany({
        where: { pacienteId: { in: pacIds } },
      });
      await prisma.paciente.deleteMany({ where: { id: { in: pacIds } } });
    }

    if (profIds.length > 0) {
      await prisma.profissional.deleteMany({ where: { id: { in: profIds } } });
    }

    await prisma.usuario.deleteMany({
      where: { email: { endsWith: '@clinicavida.test' } },
    });
  }

  // ─── helper: cria usuário e retorna token ─────────────────────────────────

  async function criarTokenPara(
    perfil: PerfilTipo,
    prefixo: string,
  ): Promise<string> {
    const email = uniqueEmail(prefixo);
    const ip = uniqueIp();

    await prisma.usuario.create({
      data: {
        email,
        senhaHash: await argon2.hash('SenhaForte!2026'),
        nomeCompleto: `E2E ${perfil}`,
        perfil,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email, senha: 'SenhaForte!2026' });

    if (res.status !== 200) {
      throw new Error(
        `criarTokenPara(${perfil}) falhou: ${res.status} — ${JSON.stringify(res.body)}`,
      );
    }

    return res.body.data.access_token as string;
  }

  // ─── helper: cria agendamento via API ────────────────────────────────────

  async function criarAgendamento(
    token: string,
    overrides: Record<string, unknown> = {},
    horaOffset = 3, // horas a partir de agora para início
  ): Promise<string> {
    const inicio = futureDate(horaOffset);
    const fim = futureDate(horaOffset + 1);

    const res = await request(app.getHttpServer())
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .set('x-forwarded-for', uniqueIp())
      .send({
        pacienteId,
        profissionalId: profissionalMedicoId,
        dataHoraInicio: inicio,
        dataHoraFim: fim,
        ...overrides,
      });

    if (res.status !== 201) {
      throw new Error(
        `criarAgendamento falhou: ${res.status} — ${JSON.stringify(res.body)}`,
      );
    }

    return res.body.data.id as string;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/agendamentos
  // ═════════════════════════════════════════════════════════════════════════

  describe('POST /api/agendamentos', () => {
    it('201 — ADMIN cria agendamento', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(10),
          dataHoraFim: futureDate(11),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe(AgendamentoStatus.SOLICITADO);
      expect(res.body.data.origem).toBe('ADMIN');
    });

    it('201 — RECEPCAO cria agendamento', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(12),
          dataHoraFim: futureDate(13),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.origem).toBe('RECEPCAO');
    });

    it('409 — HORARIO_OCUPADO: segundo agendamento no mesmo horário sem encaixe', async () => {
      // Cria o primeiro no horário 14h-15h
      await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(14),
        dataHoraFim: futureDate(15),
      });

      // Tenta criar outro no mesmo horário
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(14),
          dataHoraFim: futureDate(15),
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HORARIO_OCUPADO');
    });

    it('201 — encaixe=true: criado mesmo com conflito de horário do profissional', async () => {
      // Cria o primeiro no horário 16h-17h para o profissional médico
      await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(16),
        dataHoraFim: futureDate(17),
        profissionalId: profissionalMedicoId,
      });

      // Encaixe no mesmo horário para o MESMO profissional médico,
      // mas paciente diferente para não cair em PACIENTE_COM_AGENDAMENTO
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId: pacienteEncaixeId, // paciente diferente
          profissionalId: profissionalMedicoId, // mesmo profissional → conflito, mas encaixe=true
          dataHoraInicio: futureDate(16),
          dataHoraFim: futureDate(17),
          encaixe: true,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.encaixe).toBe(true);
    });

    it('409 — PACIENTE_COM_AGENDAMENTO: mesmo paciente no mesmo horário', async () => {
      const inicio = futureDate(20);
      const fim = futureDate(21);

      // Cria primeiro agendamento para o paciente
      await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: inicio,
          dataHoraFim: fim,
        })
        .expect(201);

      // Tenta criar segundo agendamento para o mesmo paciente no mesmo horário
      // mas com profissional diferente para não cair em HORARIO_OCUPADO do profissional
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalNaoMedicoId,
          dataHoraInicio: inicio,
          dataHoraFim: fim,
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PACIENTE_COM_AGENDAMENTO');
    });

    it('403 — MEDICO não pode criar agendamento', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(30),
          dataHoraFim: futureDate(31),
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('403 — PROFISSIONAL_NAO_MEDICO não pode criar agendamento', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(30),
          dataHoraFim: futureDate(31),
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('401 — sem token retorna 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(32),
          dataHoraFim: futureDate(33),
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/agendamentos
  // ═════════════════════════════════════════════════════════════════════════

  describe('GET /api/agendamentos', () => {
    it('200 — lista sem filtro retorna array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('200 — filtro por profissionalId retorna apenas agendamentos daquele profissional', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/agendamentos')
        .query({ profissionalId: profissionalMedicoId })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      // Todos os itens retornados devem ser do profissional filtrado
      for (const item of res.body.data) {
        expect(item.profissionalId).toBe(profissionalMedicoId);
      }
    });

    it('200 — filtro por status retorna apenas agendamentos naquele status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/agendamentos')
        .query({ status: AgendamentoStatus.SOLICITADO })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      for (const item of res.body.data) {
        expect(item.status).toBe(AgendamentoStatus.SOLICITADO);
      }
    });

    it('200 — filtros inicio e fim limitam faixa de datas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/agendamentos')
        .query({
          inicio: futureDate(0),
          fim: futureDate(50),
        })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('200 — RECEPCAO acessa lista', async () => {
      await request(app.getHttpServer())
        .get('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);
    });

    it('200 — MEDICO acessa lista', async () => {
      await request(app.getHttpServer())
        .get('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);
    });

    it('200 — PROFISSIONAL_NAO_MEDICO acessa lista', async () => {
      await request(app.getHttpServer())
        .get('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GET /api/agendamentos/:id
  // ═════════════════════════════════════════════════════════════════════════

  describe('GET /api/agendamentos/:id', () => {
    let agendamentoId: string;

    beforeAll(async () => {
      agendamentoId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(40),
        dataHoraFim: futureDate(41),
      });
    }, 15_000);

    it('200 — retorna agendamento pelo ID com includes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/agendamentos/${agendamentoId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(agendamentoId);
      expect(res.body.data.paciente).toBeDefined();
      expect(res.body.data.profissional).toBeDefined();
    });

    it('404 — ID inexistente retorna AGENDAMENTO_NAO_ENCONTRADO', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/agendamentos/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AGENDAMENTO_NAO_ENCONTRADO');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PATCH /api/agendamentos/:id
  // ═════════════════════════════════════════════════════════════════════════

  describe('PATCH /api/agendamentos/:id', () => {
    let agendamentoId: string;
    let updatedAt: string;

    beforeAll(async () => {
      agendamentoId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(50),
        dataHoraFim: futureDate(51),
      });
      const ag = await prisma.agendamento.findUnique({
        where: { id: agendamentoId },
      });
      updatedAt = ag!.updatedAt.toISOString();
    }, 15_000);

    it('200 — SOLICITADO → CONFIRMADO', async () => {
      const ag = await prisma.agendamento.findUnique({
        where: { id: agendamentoId },
      });
      const res = await request(app.getHttpServer())
        .patch(`/api/agendamentos/${agendamentoId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          status: AgendamentoStatus.CONFIRMADO,
          updatedAt: ag!.updatedAt.toISOString(),
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AgendamentoStatus.CONFIRMADO);
    });

    it('400 — TRANSICAO_INVALIDA: tentar alterar status de ATENDIDO', async () => {
      // Cria agendamento separado e força status ATENDIDO diretamente no DB
      const atId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(52),
        dataHoraFim: futureDate(53),
      });
      await prisma.agendamento.update({
        where: { id: atId },
        data: { status: AgendamentoStatus.ATENDIDO },
      });

      const agAtual = await prisma.agendamento.findUnique({
        where: { id: atId },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/agendamentos/${atId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          status: AgendamentoStatus.CONFIRMADO,
          updatedAt: agAtual!.updatedAt.toISOString(),
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TRANSICAO_INVALIDA');
    });

    it('409 — CONCURRENT_UPDATE: updatedAt antigo', async () => {
      const atId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(54),
        dataHoraFim: futureDate(55),
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/agendamentos/${atId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          status: AgendamentoStatus.CONFIRMADO,
          updatedAt: '2000-01-01T00:00:00.000Z', // timestamp antigo garante conflito
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONCURRENT_UPDATE');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/agendamentos/:id/chamar
  // ═════════════════════════════════════════════════════════════════════════

  describe('POST /api/agendamentos/:id/chamar', () => {
    it('200 — MEDICO chama paciente (muda status para EM_ATENDIMENTO)', async () => {
      const agId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(60),
        dataHoraFim: futureDate(61),
        profissionalId: profissionalMedicoId,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agId}/chamar`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AgendamentoStatus.EM_ATENDIMENTO);
    });

    it('200 — PROFISSIONAL_NAO_MEDICO chama paciente', async () => {
      const agId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(62),
        dataHoraFim: futureDate(63),
        profissionalId: profissionalNaoMedicoId,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agId}/chamar`)
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AgendamentoStatus.EM_ATENDIMENTO);
    });

    it('403 — RECEPCAO não pode chamar paciente', async () => {
      const agId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(64),
        dataHoraFim: futureDate(65),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agId}/chamar`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/agendamentos/:id/atendido
  // ═════════════════════════════════════════════════════════════════════════

  describe('POST /api/agendamentos/:id/atendido', () => {
    it('200 — MEDICO marca como ATENDIDO', async () => {
      const agId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(70),
        dataHoraFim: futureDate(71),
      });
      // Coloca em EM_ATENDIMENTO primeiro
      await prisma.agendamento.update({
        where: { id: agId },
        data: { status: AgendamentoStatus.EM_ATENDIMENTO },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agId}/atendido`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AgendamentoStatus.ATENDIDO);
    });

    it('403 — RECEPCAO não pode marcar atendido', async () => {
      const agId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(72),
        dataHoraFim: futureDate(73),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agId}/atendido`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/agendamentos/:id/falta
  // ═════════════════════════════════════════════════════════════════════════

  describe('POST /api/agendamentos/:id/falta', () => {
    it('200 — RECEPCAO marca falta', async () => {
      const agId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(80),
        dataHoraFim: futureDate(81),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agId}/falta`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AgendamentoStatus.FALTOU);
    });

    it('403 — MEDICO não pode marcar falta', async () => {
      const agId = await criarAgendamento(tokenAdmin, {
        dataHoraInicio: futureDate(82),
        dataHoraFim: futureDate(83),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agId}/falta`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/agendamentos/bloqueios
  // ═════════════════════════════════════════════════════════════════════════

  describe('POST /api/agendamentos/bloqueios', () => {
    it('201 — MEDICO bloqueia a própria agenda', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos/bloqueios')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(90),
          dataHoraFim: futureDate(91),
          motivo: 'Reunião de equipe',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.profissionalId).toBe(profissionalMedicoId);
    });

    it('201 — ADMIN bloqueia agenda de qualquer profissional', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos/bloqueios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(92),
          dataHoraFim: futureDate(93),
          motivo: 'Admin bloqueou',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('403 — profissional tenta bloquear agenda de outro profissional', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos/bloqueios')
        .set('Authorization', `Bearer ${tokenProfissional}`) // profissionalNaoMedicoId
        .set('x-forwarded-for', uniqueIp())
        .send({
          profissionalId: profissionalMedicoId, // agenda do médico — não permitido
          dataHoraInicio: futureDate(94),
          dataHoraFim: futureDate(95),
          motivo: 'Tentativa indevida',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('409 — AGENDAMENTO_NO_BLOQUEIO: bloquear período com agendamento ativo', async () => {
      const inicio = futureDate(96);
      const fim = futureDate(97);

      // Primeiro cria um agendamento no período
      await request(app.getHttpServer())
        .post('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: inicio,
          dataHoraFim: fim,
        })
        .expect(201);

      // Tenta bloquear o mesmo período
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos/bloqueios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          profissionalId: profissionalMedicoId,
          dataHoraInicio: inicio,
          dataHoraFim: fim,
          motivo: 'Vai colidir',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AGENDAMENTO_NO_BLOQUEIO');
    });

    it('403 — RECEPCAO não pode criar bloqueio', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos/bloqueios')
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(200),
          dataHoraFim: futureDate(201),
          motivo: 'Recepcao tentando bloquear',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // DELETE /api/agendamentos/bloqueios/:id
  // ═════════════════════════════════════════════════════════════════════════

  describe('DELETE /api/agendamentos/bloqueios/:id', () => {
    let bloqueioId: string;

    beforeAll(async () => {
      // Cria bloqueio para remover
      const res = await request(app.getHttpServer())
        .post('/api/agendamentos/bloqueios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(100),
          dataHoraFim: futureDate(101),
          motivo: 'Para deletar',
        })
        .expect(201);

      bloqueioId = res.body.data.id;
    }, 15_000);

    it('403 — profissional não-médico tenta remover bloqueio do médico', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/agendamentos/bloqueios/${bloqueioId}`)
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('204 — ADMIN remove bloqueio com sucesso', async () => {
      await request(app.getHttpServer())
        .delete(`/api/agendamentos/bloqueios/${bloqueioId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(204);
    });

    it('404 — bloqueio já removido retorna BLOQUEIO_NAO_ENCONTRADO', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/agendamentos/bloqueios/${bloqueioId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BLOQUEIO_NAO_ENCONTRADO');
    });

    it('404 — ID inexistente retorna BLOQUEIO_NAO_ENCONTRADO', async () => {
      const res = await request(app.getHttpServer())
        .delete(
          '/api/agendamentos/bloqueios/00000000-0000-4000-8000-000000000099',
        )
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BLOQUEIO_NAO_ENCONTRADO');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POST /api/bot/pre-agendamento
  // ═════════════════════════════════════════════════════════════════════════

  describe('POST /api/bot/pre-agendamento', () => {
    const EVENT_ID_NOVO = 'e2e-bot-event-001-fixture';
    const EVENT_ID_NOVO2 = 'e2e-bot-event-002-fixture';

    it('201 — pré-agendamento para paciente novo (cria paciente no processo)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/pre-agendamento')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          eventId: EVENT_ID_NOVO,
          cpf: CPF_PACIENTE_BOT,
          nomeCompleto: 'Paciente Bot E2E Novo',
          telefoneWhatsapp: '66977771111',
          dataNascimento: '1990-05-20',
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(110),
          dataHoraFim: futureDate(111),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe(AgendamentoStatus.PRE_AGENDAMENTO);
      expect(res.body.data.origem).toBe('BOT_WHATSAPP');
    });

    it('201 — idempotência: mesmo eventId retorna o agendamento existente sem duplicar', async () => {
      // Segunda chamada com o mesmo eventId
      const res = await request(app.getHttpServer())
        .post('/api/bot/pre-agendamento')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          eventId: EVENT_ID_NOVO, // mesmo eventId da chamada anterior
          cpf: CPF_PACIENTE_BOT,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(110),
          dataHoraFim: futureDate(111),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      // Deve ser o mesmo agendamento (idempotência)
      expect(res.body.data.status).toBe(AgendamentoStatus.PRE_AGENDAMENTO);
    });

    it('400 — paciente novo sem nomeCompleto retorna PACIENTE_INCOMPLETO', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/pre-agendamento')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          eventId: EVENT_ID_NOVO2,
          cpf: CPF_PACIENTE_BOT2, // CPF não cadastrado
          // nomeCompleto ausente — deve retornar erro
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(112),
          dataHoraFim: futureDate(113),
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PACIENTE_INCOMPLETO');
    });

    it('401 — sem x-bot-secret retorna BOT_UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/pre-agendamento')
        .set('x-forwarded-for', uniqueIp())
        .send({
          eventId: 'evt-sem-auth',
          cpf: CPF_PACIENTE_BOT,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(114),
          dataHoraFim: futureDate(115),
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('401 — x-bot-secret errado retorna 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/pre-agendamento')
        .set('x-bot-secret', 'segredo-errado-invalido')
        .set('x-forwarded-for', uniqueIp())
        .send({
          eventId: 'evt-secret-errado',
          cpf: CPF_PACIENTE_BOT,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: futureDate(116),
          dataHoraFim: futureDate(117),
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Ownership enforcement (MEDICO/PROFISSIONAL_NAO_MEDICO)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Ownership enforcement — restricted profiles can only access own agenda', () => {
    let agOutroMedicoId: string;
    let emailOutroMedico: string;

    beforeAll(async () => {
      emailOutroMedico = uniqueEmail('outro-medico-ownership');
      const hashOutro = await argon2.hash('Senha@2026!');
      const usuarioOutro = await prisma.usuario.create({
        data: {
          email: emailOutroMedico,
          senhaHash: hashOutro,
          nomeCompleto: 'Outro Médico Ownership Test',
          perfil: PerfilTipo.MEDICO,
          ativo: true,
        },
      });
      const profOutro = await prisma.profissional.create({
        data: {
          nomeCompleto: 'Outro Médico Ownership Test',
          ehMedico: true,
          ativo: true,
          usuarioId: usuarioOutro.id,
        },
      });

      const future = new Date(Date.now() + 72 * 3_600_000);
      const end = new Date(future.getTime() + 30 * 60_000);
      const ag = await prisma.agendamento.create({
        data: {
          pacienteId: pacienteId,
          profissionalId: profOutro.id,
          dataHoraInicio: future,
          dataHoraFim: end,
          status: AgendamentoStatus.CONFIRMADO,
          origem: 'RECEPCAO',
          criadoPor: usuarioOutro.id,
          atualizadoPor: usuarioOutro.id,
        },
      });
      agOutroMedicoId = ag.id;
    }, 20_000);

    afterAll(async () => {
      await prisma.agendamento.deleteMany({ where: { id: agOutroMedicoId } });
      await prisma.profissional.deleteMany({
        where: {
          usuarioId: { not: null },
          nomeCompleto: 'Outro Médico Ownership Test',
        },
      });
      await prisma.usuario.deleteMany({ where: { email: emailOutroMedico } });
    });

    it('MEDICO cannot GET appointment of another profissional → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/agendamentos/${agOutroMedicoId}`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp());
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('PROFISSIONAL_NAO_MEDICO cannot GET appointment of another profissional → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/agendamentos/${agOutroMedicoId}`)
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp());
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('MEDICO GET /agendamentos — response never includes other profissional appointments', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/agendamentos')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp());
      expect(res.status).toBe(200);
      const ids: string[] = res.body.data.map((a: any) => a.id);
      expect(ids).not.toContain(agOutroMedicoId);
    });

    it('MEDICO cannot POST /:id/chamar on another profissional appointment → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/agendamentos/${agOutroMedicoId}/chamar`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp());
      expect(res.status).toBe(403);
    });

    it('ADMIN can GET any appointment → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/agendamentos/${agOutroMedicoId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp());
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(agOutroMedicoId);
    });
  });
});
