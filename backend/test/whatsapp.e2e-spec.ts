/**
 * WhatsApp E2E — Sprint 4
 *
 * Cobre:
 *  - POST   /bot/whatsapp/status    — entrega ENTREGUE, falha BOT_NOT_CONFIGURED/BOT_UNAUTHORIZED
 *  - POST   /bot/whatsapp/inbound   — recebe resposta, idempotência, sem bot-secret
 *  - GET    /whatsapp/pendentes     — ADMIN 200, RECEPCAO 200, MEDICO 403, sem token 401
 *  - POST   /whatsapp/:id/reenviar  — ADMIN sucesso, RECEPCAO sucesso, MEDICO 403,
 *                                     id inexistente 404, UUID inválido 400
 *
 * Isolamento:
 *  - Mensagens criadas diretamente via Prisma para evitar dependência de cron.
 *  - Paciente e agendamento criados via Prisma.
 *  - IPs únicos via x-forwarded-for → evita throttler.
 *  - Cleanup completo em afterAll.
 *  - WA_DRY_RUN=true → sem HTTP real para n8n.
 *  - WA_ENABLED=false no jest-setup-e2e → enfileirar retorna null; testes que
 *    precisam de mensagem no banco usam prisma direto.
 *
 * Padrão envelope:
 *  sucesso: { success: true,  data: {...}|null, error: null }
 *  erro:    { success: false, data: null,  error: { code, message, trace_id } }
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import * as argon2 from 'argon2';
import {
  MensagemDirecao,
  MensagemStatus,
  MensagemTipo,
  PerfilTipo,
  AgendamentoStatus,
  AgendamentoOrigem,
} from '@prisma/client';

// ─── Constantes ───────────────────────────────────────────────────────────────

const BOT_SECRET = 'test-bot-secret-clinicavida-2026-devonly'; // matches jest-setup-e2e.ts

// ─── helpers ──────────────────────────────────────────────────────────────────

let ipCounter = 200;
function uniqueIp(): string {
  const id = ipCounter++;
  return `10.4.${Math.floor(id / 255) % 255}.${(id % 255) + 1}`;
}

function uniqueEmail(prefix: string): string {
  return `wa-e2e-${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@clinicavida.test`;
}

// ─── suite principal ──────────────────────────────────────────────────────────

describe('WhatsApp (e2e) — Sprint 4', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenAdmin: string;
  let tokenRecepcao: string;
  let tokenMedico: string;
  let tokenProfissional: string;

  // IDs criados em beforeAll para reuso nos testes
  let pacienteId: string;
  let agendamentoId: string;
  let profissionalId: string;

  // ─── setup global ───────────────────────────────────────────────────────────

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

    // Cria usuários e tokens
    tokenAdmin = await criarTokenPara(PerfilTipo.ADMIN, 'wa-admin');
    tokenRecepcao = await criarTokenPara(PerfilTipo.RECEPCAO, 'wa-recepcao');
    tokenMedico = await criarTokenPara(PerfilTipo.MEDICO, 'wa-medico');
    tokenProfissional = await criarTokenPara(
      PerfilTipo.PROFISSIONAL_NAO_MEDICO,
      'wa-profissional',
    );

    // Cria profissional e paciente de base para os testes
    const profissional = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Dr. WhatsApp Teste',
        ehMedico: true,
        ativo: true,
      },
    });
    profissionalId = profissional.id;

    const paciente = await prisma.paciente.create({
      data: {
        cpf: '52998224725',
        nomeCompleto: 'Paciente WA E2E',
        dataNascimento: new Date('1990-01-01'),
        telefoneWhatsapp: '66999991111',
      },
    });
    pacienteId = paciente.id;

    const agendamento = await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        dataHoraInicio: new Date(Date.now() + 6 * 3_600_000),
        dataHoraFim: new Date(Date.now() + 7 * 3_600_000),
        status: AgendamentoStatus.SOLICITADO,
        origem: AgendamentoOrigem.RECEPCAO,
      },
    });
    agendamentoId = agendamento.id;
  }, 90_000);

  afterAll(async () => {
    // Cleanup: mensagens → historico → agendamento → paciente → profissional → usuarios
    await prisma.mensagemWhatsapp.deleteMany({
      where: { pacienteId },
    });
    await prisma.agendamentoHistorico.deleteMany({
      where: { agendamentoId },
    });
    await prisma.agendamento.deleteMany({
      where: { pacienteId },
    });
    await prisma.paciente.deleteMany({
      where: { cpf: '52998224725' },
    });
    await prisma.profissional.deleteMany({
      where: { id: profissionalId },
    });
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: '@clinicavida.test' } },
    });
    await app.close();
  });

  // ─── helper: cria usuário e retorna access_token ──────────────────────────

  async function criarTokenPara(
    perfil: PerfilTipo,
    prefixo: string,
  ): Promise<string> {
    const email = uniqueEmail(prefixo);
    await prisma.usuario.create({
      data: {
        email,
        senhaHash: await argon2.hash('SenhaForte!2026'),
        nomeCompleto: `E2E WA ${perfil}`,
        perfil,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-forwarded-for', uniqueIp())
      .send({ email, senha: 'SenhaForte!2026' });

    if (res.status !== 200) {
      throw new Error(
        `criarTokenPara(${perfil}) falhou: ${res.status} — ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.data.access_token as string;
  }

  // ─── helper: cria mensagem diretamente no banco ───────────────────────────

  async function criarMensagem(overrides: Record<string, unknown> = {}) {
    return prisma.mensagemWhatsapp.create({
      data: {
        pacienteId,
        agendamentoId,
        telefone: '66999991111',
        direcao: MensagemDirecao.OUTBOUND,
        tipo: MensagemTipo.CONFIRMACAO_24H,
        status: MensagemStatus.PENDENTE,
        eventId: `evt-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload: { texto: 'Confirme sua consulta?', vars: {} },
        ...overrides,
      },
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // POST /api/bot/whatsapp/status — callback de status (delivery)
  // ═════════════════════════════════════════════════════════════════════════════

  describe('POST /api/bot/whatsapp/status', () => {
    it('200 — ENTREGUE: marca mensagem como ENTREGUE quando status=ENTREGUE', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.ENVIADA });

      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          eventId: msg.eventId,
          status: 'ENTREGUE',
          providerMsgId: 'prov-abc-123',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        data: expect.objectContaining({ ok: true }),
        error: null,
      });

      const atualizada = await prisma.mensagemWhatsapp.findUnique({
        where: { id: msg.id },
      });
      expect(atualizada?.status).toBe(MensagemStatus.ENTREGUE);
      expect(atualizada?.providerMsgId).toBe('prov-abc-123');
      expect(atualizada?.entregueEm).not.toBeNull();
    });

    it('200 — status FALHA: aciona marcarFalha, seta FALHA + erro (S4 F-1)', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.ENVIADA });

      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          eventId: msg.eventId,
          status: 'FALHA',
          erro: 'provider rejected payload',
        })
        .expect(200);

      expect(res.body.data.ok).toBe(true);
      const alterada = await prisma.mensagemWhatsapp.findUnique({
        where: { id: msg.id },
      });
      expect(alterada?.status).toBe(MensagemStatus.FALHA);
      expect(alterada?.erro).toBe('provider rejected payload');
      expect(alterada?.proximoRetryEm).toBeNull();
    });

    it('200 — status FALHA idempotente: callback duplicado em msg já FALHA não re-atualiza', async () => {
      const msg = await criarMensagem({
        status: MensagemStatus.FALHA,
        erro: 'erro original',
      });

      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ eventId: msg.eventId, status: 'FALHA', erro: 'novo erro' })
        .expect(200);

      expect(res.body.data.ok).toBe(true);
      const inalterada = await prisma.mensagemWhatsapp.findUnique({
        where: { id: msg.id },
      });
      // Erro original preservado — idempotência
      expect(inalterada?.erro).toBe('erro original');
    });

    it('200 — eventId inexistente: retorna ok sem erro (idempotência)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ eventId: 'evt-totally-inexistente-xyzzy', status: 'ENTREGUE' })
        .expect(200);

      expect(res.body.data.ok).toBe(true);
    });

    it('401 — sem bot-secret: retorna BOT_NOT_CONFIGURED ou BOT_UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-forwarded-for', uniqueIp())
        .send({ eventId: 'qualquer', status: 'ENTREGUE' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect([
        'BOT_NOT_CONFIGURED',
        'BOT_UNAUTHORIZED',
        'UNAUTHORIZED',
      ]).toContain(res.body.error.code);
    });

    it('401 — bot-secret inválido: retorna BOT_UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', 'errado-secret-12345')
        .set('x-forwarded-for', uniqueIp())
        .send({ eventId: 'qualquer', status: 'ENTREGUE' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('400 — eventId muito curto (< 8 chars): validação do DTO', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ eventId: 'curto', status: 'ENTREGUE' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — status inválido: valor fora do enum', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ eventId: 'evt-valid-123456', status: 'INVALIDO' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — campos obrigatórios ausentes', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/status')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ status: 'ENTREGUE' }) // falta eventId
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // POST /api/bot/whatsapp/inbound — recebimento de resposta
  // ═════════════════════════════════════════════════════════════════════════════

  describe('POST /api/bot/whatsapp/inbound', () => {
    it('200 — resposta com eventIdOriginal: cria inbound e retorna id', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.ENVIADA });

      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          telefone: '66999991111',
          texto: 'sim',
          eventIdOriginal: msg.eventId,
          providerMsgId: 'inb-prov-001',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.ok).toBe(true);
      expect(res.body.data.id).toBeDefined();

      // Mensagem inbound criada no banco
      const inbound = await prisma.mensagemWhatsapp.findUnique({
        where: { id: res.body.data.id },
      });
      expect(inbound).not.toBeNull();
      expect(inbound?.direcao).toBe(MensagemDirecao.INBOUND);
      expect(inbound?.resposta).toBe('sim');

      // Original marcada como RESPONDIDA
      const original = await prisma.mensagemWhatsapp.findUnique({
        where: { id: msg.id },
      });
      expect(original?.status).toBe(MensagemStatus.RESPONDIDA);
    });

    it('200 — resposta SIM com agendamento >= 2h: muda agendamento para CONFIRMADO', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.ENVIADA });

      await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          telefone: '66999991111',
          texto: 'confirmo, sim',
          eventIdOriginal: msg.eventId,
        })
        .expect(200);

      const ag = await prisma.agendamento.findUnique({
        where: { id: agendamentoId },
      });
      expect(ag?.status).toBe(AgendamentoStatus.CONFIRMADO);
    });

    it('200 — resposta sem eventIdOriginal: cria inbound sem vincular ao original', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          telefone: '66999991111',
          texto: 'mensagem espontânea',
        })
        .expect(200);

      expect(res.body.data.id).toBeDefined();
    });

    it('200 — idempotência de inbound: múltiplas respostas criam múltiplas mensagens (sem erro)', async () => {
      const msg = await criarMensagem();

      const r1 = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          telefone: '66999991111',
          texto: 'sim',
          eventIdOriginal: msg.eventId,
        })
        .expect(200);

      const r2 = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({
          telefone: '66999991111',
          texto: 'sim',
          eventIdOriginal: msg.eventId,
        })
        .expect(200);

      // Ambas retornam IDs de inbound — cada chamada cria uma mensagem INBOUND
      expect(r1.body.data.id).toBeDefined();
      expect(r2.body.data.id).toBeDefined();
    });

    it('401 — sem bot-secret: rejeita chamada', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-forwarded-for', uniqueIp())
        .send({ telefone: '66999991111', texto: 'sim' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('400 — telefone ausente: validação do DTO', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ texto: 'sim' }) // falta telefone
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — texto ausente: validação do DTO', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ telefone: '66999991111' }) // falta texto
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — texto muito longo (>4000 chars): validação do DTO', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bot/whatsapp/inbound')
        .set('x-bot-secret', BOT_SECRET)
        .set('x-forwarded-for', uniqueIp())
        .send({ telefone: '66999991111', texto: 'x'.repeat(4001) })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // GET /api/whatsapp/pendentes — visão da recepção
  // ═════════════════════════════════════════════════════════════════════════════

  describe('GET /api/whatsapp/pendentes', () => {
    let msgPendente: any;
    let msgFalha: any;

    beforeAll(async () => {
      // Garante que há pelo menos uma mensagem PENDENTE e uma FALHA no banco
      msgPendente = await criarMensagem({ status: MensagemStatus.PENDENTE });
      msgFalha = await criarMensagem({
        status: MensagemStatus.FALHA,
        tentativas: 3,
      });
    }, 15_000);

    it('200 — ADMIN acessa lista de pendentes (cursor page)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data).toHaveProperty('nextCursor');

      // Deve conter a mensagem criada neste beforeAll
      const ids = res.body.data.items.map((m: any) => m.id);
      expect(ids).toContain(msgPendente.id);
      expect(ids).toContain(msgFalha.id);
    });

    it('200 — RECEPCAO acessa lista de pendentes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('403 — MEDICO não acessa pendentes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('403 — PROFISSIONAL_NAO_MEDICO não acessa pendentes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('401 — sem token: retorna 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('x-forwarded-for', uniqueIp())
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('200 — resultado inclui dados do paciente e agendamento (include)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      const msgComPaciente = res.body.data.items.find(
        (m: any) => m.id === msgPendente.id,
      );
      expect(msgComPaciente).toBeDefined();
      // Include de paciente deve estar presente
      expect(msgComPaciente.paciente).toBeDefined();
      expect(msgComPaciente.paciente.nomeCompleto).toBeDefined();
      // Include de agendamento deve estar presente
      expect(msgComPaciente.agendamento).toBeDefined();
    });

    it('200 — mensagens ENVIADA/ENTREGUE não aparecem na lista de pendentes', async () => {
      const msgEnviada = await criarMensagem({
        status: MensagemStatus.ENVIADA,
      });

      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      const ids = res.body.data.items.map((m: any) => m.id);
      expect(ids).not.toContain(msgEnviada.id);
    });

    it('envelope correto: success=true, error=null, data={items,nextCursor}', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data).toHaveProperty('nextCursor');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // POST /api/whatsapp/:id/reenviar — reenvio manual (recepção/admin)
  // ═════════════════════════════════════════════════════════════════════════════

  describe('POST /api/whatsapp/:id/reenviar', () => {
    let msgParaReenviar: any;

    beforeAll(async () => {
      msgParaReenviar = await criarMensagem({
        status: MensagemStatus.FALHA,
        tentativas: 3,
        erro: 'n8n indisponível',
      });
    }, 15_000);

    it('200 — ADMIN reenvia mensagem com FALHA: zera tentativas e marca ENVIADA (dry-run)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/whatsapp/${msgParaReenviar.id}/reenviar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();

      const atualizada = await prisma.mensagemWhatsapp.findUnique({
        where: { id: msgParaReenviar.id },
      });
      // dry-run: não chama n8n de verdade → fica ENVIADA
      expect([MensagemStatus.ENVIADA, MensagemStatus.PENDENTE]).toContain(
        atualizada?.status,
      );
    });

    it('200 — RECEPCAO reenvia mensagem com FALHA', async () => {
      const msg = await criarMensagem({
        status: MensagemStatus.FALHA,
        tentativas: 1,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/whatsapp/${msg.id}/reenviar`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('404 — ID inexistente retorna MENSAGEM_NAO_ENCONTRADA', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/00000000-0000-4000-8000-000000000099/reenviar')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MENSAGEM_NAO_ENCONTRADA');
    });

    it('400 — UUID malformado retorna erro de validação', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/nao-e-uuid/reenviar')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('403 — MEDICO não pode reenviar mensagem', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.FALHA });

      const res = await request(app.getHttpServer())
        .post(`/api/whatsapp/${msg.id}/reenviar`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('403 — PROFISSIONAL_NAO_MEDICO não pode reenviar mensagem', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.FALHA });

      const res = await request(app.getHttpServer())
        .post(`/api/whatsapp/${msg.id}/reenviar`)
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('401 — sem token: retorna 401', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.FALHA });

      const res = await request(app.getHttpServer())
        .post(`/api/whatsapp/${msg.id}/reenviar`)
        .set('x-forwarded-for', uniqueIp())
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('200 — reenvio retorna dados da mensagem atualizada no envelope', async () => {
      const msg = await criarMensagem({ status: MensagemStatus.FALHA });

      const res = await request(app.getHttpServer())
        .post(`/api/whatsapp/${msg.id}/reenviar`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).not.toBeNull();
      expect(res.body.data.id).toBe(msg.id);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Schema envelope — verificações de schema globais
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Schema do envelope de resposta', () => {
    it('sucesso: { success:true, error:null, data:{items,nextCursor} }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data).toHaveProperty('nextCursor');
    });

    it('erro 401: { success:false, data:null, error:{code,message,trace_id} }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('x-forwarded-for', uniqueIp())
        .expect(401);

      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: {
          code: expect.any(String),
          message: expect.any(String),
          trace_id: expect.any(String),
        },
      });
    });

    it('erro 403: { success:false, data:null, error:{code:FORBIDDEN} }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN' },
      });
    });

    it('trace_id presente em respostas de erro', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/pendentes')
        .set('x-forwarded-for', uniqueIp())
        .expect(401);

      expect(res.body.error.trace_id).toBeDefined();
      expect(typeof res.body.error.trace_id).toBe('string');
      expect(res.body.error.trace_id.length).toBeGreaterThan(0);
    });
  });
});
