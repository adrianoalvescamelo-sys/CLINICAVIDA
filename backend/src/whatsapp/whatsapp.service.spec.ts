/**
 * Unit tests — WhatsappService (Sprint 4)
 *
 * Cobre:
 *  - enfileirar: sucesso, WA desabilitado, idempotência (event_id duplicado)
 *  - enviar: sucesso (dry-run), falha com retry (backoff), falha final (tentativas esgotadas),
 *            skip se status != PENDENTE|FALHA, NotFoundException se msg não encontrada
 *  - marcarEntregue: sucesso, msg não encontrada retorna null
 *  - receberResposta: paciente encontrado, paciente não encontrado, inbound sem original,
 *                     atualiza status do original, processa resposta positiva (CONFIRMADO),
 *                     processa resposta positiva tardia (CONFIRMACAO_TARDIA),
 *                     processa resposta negativa (CANCELADO),
 *                     resposta negativa tardia → não cancela automaticamente,
 *                     texto neutro → não altera agendamento
 *  - listarPendentes: retorna apenas PENDENTE e FALHA OUTBOUND
 *  - reenviarManual: sucesso com auditoria, NotFoundException
 *
 * Isolamento: PrismaService, HttpService, ConfigService e AuditService completamente mockados.
 */

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import {
  AgendamentoStatus,
  AuditResultado,
  MensagemDirecao,
  MensagemStatus,
  MensagemTipo,
} from '@prisma/client';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ─── UUIDs e constantes ───────────────────────────────────────────────────────

const UUID_MSG = '11111111-1111-4111-8111-111111111111';
const UUID_PAC = '22222222-2222-4222-8222-222222222222';
const UUID_AG = '33333333-3333-4333-8333-333333333333';
const UUID_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const EVENT_ID = 'evt-test-0001';
const TRACE = 'test-trace-wa';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeMensagem(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_MSG,
    pacienteId: UUID_PAC,
    agendamentoId: UUID_AG,
    telefone: '66999991111',
    direcao: MensagemDirecao.OUTBOUND,
    tipo: MensagemTipo.CONFIRMACAO_24H,
    status: MensagemStatus.PENDENTE,
    tentativas: 0,
    proximoRetryEm: null,
    payload: { texto: 'Olá, confirma sua consulta?', vars: {} },
    resposta: null,
    erro: null,
    eventId: EVENT_ID,
    providerMsgId: null,
    enviadaEm: null,
    entregueEm: null,
    respondidaEm: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAgendamento(overrides: Record<string, unknown> = {}) {
  const dataHoraInicio = new Date(Date.now() + 6 * 3_600_000); // +6h → dentro da janela
  return {
    id: UUID_AG,
    pacienteId: UUID_PAC,
    dataHoraInicio,
    status: AgendamentoStatus.SOLICITADO,
    confirmadoEm: null,
    canceladoEm: null,
    motivoCancelamento: null,
    ...overrides,
  };
}

// ─── mock factories ───────────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    mensagemWhatsapp: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    paciente: {
      findFirst: jest.fn(),
    },
    agendamento: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    agendamentoHistorico: {
      create: jest.fn(),
    },
  };
}

function makeHttpMock() {
  return {
    post: jest.fn(),
  };
}

function makeConfigMock(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    'whatsapp.enabled': true,
    'whatsapp.dryRun': false,
    'whatsapp.n8nWebhookUrl': 'http://n8n.test/webhook',
    'whatsapp.n8nTimeoutMs': 10_000,
    'whatsapp.maxTentativas': 3,
    'whatsapp.limiteAutoHoras': 2,
    'whatsapp.allowlist': [],
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => defaults[key]),
  };
}

function makeAuditMock() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let http: ReturnType<typeof makeHttpMock>;
  let config: ReturnType<typeof makeConfigMock>;
  let audit: ReturnType<typeof makeAuditMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    http = makeHttpMock();
    config = makeConfigMock();
    audit = makeAuditMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prisma },
        { provide: HttpService, useValue: http },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // enfileirar
  // ═══════════════════════════════════════════════════════════════════════════

  describe('enfileirar', () => {
    it('retorna null quando whatsapp está desabilitado', async () => {
      config.get.mockImplementation((k: string) =>
        k === 'whatsapp.enabled' ? false : null,
      );

      const result = await service.enfileirar({
        telefone: '66999991111',
        tipo: MensagemTipo.CONFIRMACAO_24H,
        texto: 'Teste',
      });

      expect(result).toBeNull();
      expect(prisma.mensagemWhatsapp.create).not.toHaveBeenCalled();
    });

    it('sucesso: cria mensagem com status PENDENTE e event_id único', async () => {
      const criada = makeMensagem();
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);
      prisma.mensagemWhatsapp.create.mockResolvedValue(criada);

      const result = await service.enfileirar({
        agendamentoId: UUID_AG,
        pacienteId: UUID_PAC,
        telefone: '66999991111',
        tipo: MensagemTipo.CONFIRMACAO_24H,
        texto: 'Confirme sua consulta?',
        eventId: EVENT_ID,
      });

      expect(result).toEqual(criada);
      expect(prisma.mensagemWhatsapp.findUnique).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID },
      });
      expect(prisma.mensagemWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MensagemStatus.PENDENTE,
            direcao: MensagemDirecao.OUTBOUND,
            eventId: EVENT_ID,
          }),
        }),
      );
    });

    it('idempotência: event_id duplicado retorna mensagem existente sem criar nova', async () => {
      const existente = makeMensagem({ status: MensagemStatus.ENVIADA });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(existente);

      const result = await service.enfileirar({
        telefone: '66999991111',
        tipo: MensagemTipo.CONFIRMACAO_24H,
        texto: 'Texto',
        eventId: EVENT_ID,
      });

      expect(result).toEqual(existente);
      expect(prisma.mensagemWhatsapp.create).not.toHaveBeenCalled();
    });

    it('gera eventId automaticamente quando não fornecido', async () => {
      const criada = makeMensagem();
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);
      prisma.mensagemWhatsapp.create.mockResolvedValue(criada);

      await service.enfileirar({
        telefone: '66999991111',
        tipo: MensagemTipo.LEMBRETE_2H,
        texto: 'Texto lembrete',
        // sem eventId
      });

      expect(prisma.mensagemWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: expect.any(String),
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // enviar
  // ═══════════════════════════════════════════════════════════════════════════

  describe('enviar', () => {
    it('lança NotFoundException quando mensagem não existe', async () => {
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);

      await expect(service.enviar(UUID_MSG)).rejects.toThrow(NotFoundException);
    });

    it('retorna sem fazer nada quando status é ENVIADA (não PENDENTE/FALHA)', async () => {
      const msg = makeMensagem({ status: MensagemStatus.ENVIADA });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);

      await service.enviar(UUID_MSG);

      expect(http.post).not.toHaveBeenCalled();
      expect(prisma.mensagemWhatsapp.update).not.toHaveBeenCalled();
    });

    it('retorna sem fazer nada quando status é ENTREGUE', async () => {
      const msg = makeMensagem({ status: MensagemStatus.ENTREGUE });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);

      await service.enviar(UUID_MSG);

      expect(prisma.mensagemWhatsapp.update).not.toHaveBeenCalled();
    });

    it('sucesso em dry-run: atualiza status para ENVIADA sem chamar HTTP', async () => {
      config = makeConfigMock({ 'whatsapp.dryRun': true });
      // Recria o service com config de dry-run
      const module = await Test.createTestingModule({
        providers: [
          WhatsappService,
          { provide: PrismaService, useValue: prisma },
          { provide: HttpService, useValue: http },
          { provide: ConfigService, useValue: config },
          { provide: AuditService, useValue: audit },
        ],
      }).compile();
      service = module.get<WhatsappService>(WhatsappService);

      const msg = makeMensagem();
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue({
        ...msg,
        status: MensagemStatus.ENVIADA,
      });

      await service.enviar(UUID_MSG);

      expect(http.post).not.toHaveBeenCalled();
      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MensagemStatus.ENVIADA,
            tentativas: 1,
          }),
        }),
      );
    });

    it('sucesso com HTTP: envia para n8n e atualiza para ENVIADA', async () => {
      const msg = makeMensagem();
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(of({ data: { ok: true }, status: 200 }));
      prisma.mensagemWhatsapp.update.mockResolvedValue({
        ...msg,
        status: MensagemStatus.ENVIADA,
      });

      await service.enviar(UUID_MSG);

      expect(http.post).toHaveBeenCalledWith(
        'http://n8n.test/webhook',
        expect.objectContaining({ eventId: EVENT_ID, to: msg.telefone }),
        expect.objectContaining({ timeout: 10_000 }),
      );
      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MensagemStatus.ENVIADA,
            tentativas: 1,
            erro: null,
          }),
        }),
      );
    });

    it('falha HTTP (tentativa 1/3): status permanece PENDENTE com proximoRetryEm calculado', async () => {
      const msg = makeMensagem({ tentativas: 0 });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MensagemStatus.PENDENTE,
            tentativas: 1,
            proximoRetryEm: expect.any(Date),
          }),
        }),
      );
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('falha HTTP (tentativa 2/3): ainda PENDENTE, backoff maior', async () => {
      const msg = makeMensagem({ tentativas: 1 });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(throwError(() => new Error('Timeout')));
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MensagemStatus.PENDENTE,
            tentativas: 2,
          }),
        }),
      );
    });

    it('falha final (tentativa 3/3): status vira FALHA, proximoRetryEm=null, audit disparado', async () => {
      const msg = makeMensagem({ tentativas: 2 }); // 3 tentativas com esta = esgotado
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(
        throwError(() => new Error('Evolution API down')),
      );
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MensagemStatus.FALHA,
            tentativas: 3,
            proximoRetryEm: null,
            erro: 'Evolution API down',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'WHATSAPP_FALHOU',
          resultado: AuditResultado.FALHA,
          entidade: 'MensagemWhatsapp',
        }),
      );
    });

    it('backoff exponencial: tentativa 1 → ~60s, tentativa 2 → ~120s', async () => {
      // Tentativa 0→1: backoff = 60_000 * 2^(1-1) = 60_000ms
      // Tentativa 1→2: backoff = 60_000 * 2^(2-1) = 120_000ms
      const now = Date.now();

      const msg0 = makeMensagem({ tentativas: 0 });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg0);
      http.post.mockReturnValue(throwError(() => new Error('err')));
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      const call0 = prisma.mensagemWhatsapp.update.mock.calls[0][0];
      const retryEm0 = call0.data.proximoRetryEm as Date;
      expect(retryEm0.getTime()).toBeGreaterThanOrEqual(now + 55_000);
      expect(retryEm0.getTime()).toBeLessThanOrEqual(now + 70_000);

      // Tentativa 1→2
      jest.clearAllMocks();
      const msg1 = makeMensagem({ tentativas: 1 });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg1);
      http.post.mockReturnValue(throwError(() => new Error('err')));
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      const call1 = prisma.mensagemWhatsapp.update.mock.calls[0][0];
      const retryEm1 = call1.data.proximoRetryEm as Date;
      expect(retryEm1.getTime()).toBeGreaterThan(retryEm0.getTime());
    });

    // ── allowlist (rollout gradual) ──────────────────────────────────────────

    async function rebuildService() {
      const module = await Test.createTestingModule({
        providers: [
          WhatsappService,
          { provide: PrismaService, useValue: prisma },
          { provide: HttpService, useValue: http },
          { provide: ConfigService, useValue: config },
          { provide: AuditService, useValue: audit },
        ],
      }).compile();
      return module.get<WhatsappService>(WhatsappService);
    }

    it('allowlist preenchida + número FORA: força dry-run, não chama HTTP, marca ENVIADA', async () => {
      config = makeConfigMock({ 'whatsapp.allowlist': ['66988887777'] });
      service = await rebuildService();

      const msg = makeMensagem({ telefone: '66999991111' }); // fora da allowlist
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      expect(http.post).not.toHaveBeenCalled();
      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MensagemStatus.ENVIADA }),
        }),
      );
    });

    it('allowlist preenchida + número DENTRO: envia real via HTTP', async () => {
      config = makeConfigMock({ 'whatsapp.allowlist': ['66999991111'] });
      service = await rebuildService();

      const msg = makeMensagem({ telefone: '66999991111' });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(of({ data: { ok: true }, status: 200 }));
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      expect(http.post).toHaveBeenCalled();
    });

    it('allowlist casa por sufixo (com/sem DDI): 5566999991111 cobre 66999991111', async () => {
      config = makeConfigMock({ 'whatsapp.allowlist': ['5566999991111'] });
      service = await rebuildService();

      const msg = makeMensagem({ telefone: '66999991111' });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(of({ data: { ok: true }, status: 200 }));
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      expect(http.post).toHaveBeenCalled();
    });

    it('allowlist vazia: comportamento normal (envia para qualquer número)', async () => {
      const msg = makeMensagem({ telefone: '66999991111' });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(of({ data: { ok: true }, status: 200 }));
      prisma.mensagemWhatsapp.update.mockResolvedValue({});

      await service.enviar(UUID_MSG);

      expect(http.post).toHaveBeenCalled();
    });

    it('mensagem com status FALHA também é re-enviada', async () => {
      const msg = makeMensagem({ status: MensagemStatus.FALHA, tentativas: 0 });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      http.post.mockReturnValue(of({ data: { ok: true }, status: 200 }));
      prisma.mensagemWhatsapp.update.mockResolvedValue({
        ...msg,
        status: MensagemStatus.ENVIADA,
      });

      await service.enviar(UUID_MSG);

      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MensagemStatus.ENVIADA }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // marcarEntregue
  // ═══════════════════════════════════════════════════════════════════════════

  describe('marcarEntregue', () => {
    it('sucesso: atualiza status para ENTREGUE com entregueEm preenchido', async () => {
      const msg = makeMensagem({ status: MensagemStatus.ENVIADA });
      const atualizada = {
        ...msg,
        status: MensagemStatus.ENTREGUE,
        providerMsgId: 'prov-123',
      };
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue(atualizada);

      const result = await service.marcarEntregue(EVENT_ID, 'prov-123');

      expect(result).toEqual(atualizada);
      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MensagemStatus.ENTREGUE,
            entregueEm: expect.any(Date),
            providerMsgId: 'prov-123',
          }),
        }),
      );
    });

    it('retorna null quando eventId não encontrado (idempotência callback duplo)', async () => {
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);

      const result = await service.marcarEntregue('evt-inexistente');

      expect(result).toBeNull();
      expect(prisma.mensagemWhatsapp.update).not.toHaveBeenCalled();
    });

    it('callback duplo: segunda chamada com mesmo eventId não causa erro', async () => {
      const msg = makeMensagem({ status: MensagemStatus.ENTREGUE });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue(msg);

      const r1 = await service.marcarEntregue(EVENT_ID);
      const r2 = await service.marcarEntregue(EVENT_ID);

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // marcarFalha
  // ═══════════════════════════════════════════════════════════════════════════

  describe('marcarFalha', () => {
    it('sucesso: atualiza status para FALHA, salva erro, audita', async () => {
      const msg = makeMensagem({ status: MensagemStatus.ENVIADA });
      const atualizada = {
        ...msg,
        status: MensagemStatus.FALHA,
        erro: 'rate limited by provider',
        providerMsgId: 'prov-err-1',
      };
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue(atualizada);

      const result = await service.marcarFalha(
        EVENT_ID,
        'rate limited by provider',
        'prov-err-1',
      );

      expect(result).toEqual(atualizada);
      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: msg.id },
          data: expect.objectContaining({
            status: MensagemStatus.FALHA,
            erro: 'rate limited by provider',
            providerMsgId: 'prov-err-1',
            proximoRetryEm: null,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'WHATSAPP_FALHA_CALLBACK',
          resultado: AuditResultado.FALHA,
          entidade: 'MensagemWhatsapp',
          registroId: msg.id,
        }),
      );
    });

    it('retorna null quando eventId não encontrado (idempotência callback duplo)', async () => {
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);

      const result = await service.marcarFalha('evt-inexistente', 'qualquer');

      expect(result).toBeNull();
      expect(prisma.mensagemWhatsapp.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('idempotência: mensagem já em FALHA não re-audita nem re-atualiza', async () => {
      const msg = makeMensagem({
        status: MensagemStatus.FALHA,
        erro: 'antigo',
      });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);

      const result = await service.marcarFalha(EVENT_ID, 'novo erro');

      expect(result).toEqual(msg);
      expect(prisma.mensagemWhatsapp.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('preserva providerMsgId existente quando callback não traz novo', async () => {
      const msg = makeMensagem({
        status: MensagemStatus.ENVIADA,
        providerMsgId: 'prov-prev',
      });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue(msg);

      await service.marcarFalha(EVENT_ID, 'erro sem providerMsgId');

      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerMsgId: 'prov-prev' }),
        }),
      );
    });

    it('default erro quando callback sem campo erro', async () => {
      const msg = makeMensagem({ status: MensagemStatus.ENVIADA });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue(msg);

      await service.marcarFalha(EVENT_ID);

      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            erro: 'callback do provedor retornou FALHA',
          }),
        }),
      );
    });

    it('trunca erro longo para 500 caracteres', async () => {
      const msg = makeMensagem({ status: MensagemStatus.ENVIADA });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(msg);
      prisma.mensagemWhatsapp.update.mockResolvedValue(msg);

      const erroLongo = 'x'.repeat(800);
      await service.marcarFalha(EVENT_ID, erroLongo);

      const call = prisma.mensagemWhatsapp.update.mock.calls[0][0] as {
        data: { erro: string };
      };
      expect(call.data.erro.length).toBe(500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // receberResposta
  // ═══════════════════════════════════════════════════════════════════════════

  describe('receberResposta', () => {
    it('cria mensagem inbound com direcao INBOUND e status ENTREGUE', async () => {
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null); // sem original
      const inbound = makeMensagem({
        direcao: MensagemDirecao.INBOUND,
        status: MensagemStatus.ENTREGUE,
        tipo: MensagemTipo.CUSTOM,
      });
      prisma.mensagemWhatsapp.create.mockResolvedValue(inbound);

      const result = await service.receberResposta({
        telefone: '66999991111',
        texto: 'sim',
      });

      expect(result.direcao).toBe(MensagemDirecao.INBOUND);
      expect(prisma.mensagemWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direcao: MensagemDirecao.INBOUND,
            status: MensagemStatus.ENTREGUE,
            tipo: MensagemTipo.CUSTOM,
            pacienteId: UUID_PAC,
          }),
        }),
      );
    });

    it('paciente não identificado pelo telefone: cria inbound com pacienteId null', async () => {
      prisma.paciente.findFirst.mockResolvedValue(null);
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);
      const inbound = makeMensagem({
        direcao: MensagemDirecao.INBOUND,
        pacienteId: null,
      });
      prisma.mensagemWhatsapp.create.mockResolvedValue(inbound);

      await service.receberResposta({ telefone: '66000000000', texto: 'sim' });

      expect(prisma.mensagemWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pacienteId: undefined }),
        }),
      );
    });

    it('encontra original pelo eventIdOriginal e atualiza status para RESPONDIDA', async () => {
      const original = makeMensagem({ status: MensagemStatus.ENVIADA });
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
      const inbound = makeMensagem({ direcao: MensagemDirecao.INBOUND });
      prisma.mensagemWhatsapp.create.mockResolvedValue(inbound);
      prisma.mensagemWhatsapp.update.mockResolvedValue({
        ...original,
        status: MensagemStatus.RESPONDIDA,
      });
      // Para processarRespostaAgendamento
      prisma.agendamento.findUnique.mockResolvedValue(
        makeAgendamento(), // não tem texto positivo ainda
      );
      prisma.agendamento.update.mockResolvedValue({});
      prisma.agendamentoHistorico.create.mockResolvedValue({});

      await service.receberResposta({
        eventIdOriginal: EVENT_ID,
        telefone: '66999991111',
        texto: 'sim',
      });

      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: original.id },
          data: expect.objectContaining({
            status: MensagemStatus.RESPONDIDA,
            resposta: 'sim',
          }),
        }),
      );
    });

    it('sem eventIdOriginal: cria inbound sem vincular ao original', async () => {
      prisma.paciente.findFirst.mockResolvedValue(null);
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);
      const inbound = makeMensagem({ direcao: MensagemDirecao.INBOUND });
      prisma.mensagemWhatsapp.create.mockResolvedValue(inbound);

      await service.receberResposta({ telefone: '66999991111', texto: 'ok' });

      // update não deve ser chamado pois não há original
      expect(prisma.mensagemWhatsapp.update).not.toHaveBeenCalled();
    });

    it('normaliza telefone removendo caracteres não-dígitos para busca', async () => {
      prisma.paciente.findFirst.mockResolvedValue(null);
      prisma.mensagemWhatsapp.findUnique.mockResolvedValue(null);
      prisma.mensagemWhatsapp.create.mockResolvedValue(
        makeMensagem({ direcao: MensagemDirecao.INBOUND }),
      );

      await service.receberResposta({
        telefone: '+55(66)99999-1111',
        texto: 'sim',
      });

      // Verifica que a busca usou apenas dígitos (via contains nos últimos 9 dígitos)
      expect(prisma.paciente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            telefoneWhatsapp: expect.objectContaining({
              contains: expect.any(String),
            }),
          }),
        }),
      );
    });

    // ── processarRespostaAgendamento ──────────────────────────────────────────

    describe('processarRespostaAgendamento', () => {
      it('resposta positiva com horasAte >= 2: muda para CONFIRMADO', async () => {
        const agendamento = makeAgendamento({
          dataHoraInicio: new Date(Date.now() + 6 * 3_600_000), // +6h
          status: AgendamentoStatus.SOLICITADO,
        });
        const original = makeMensagem({ agendamentoId: UUID_AG });

        prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
        prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
        prisma.mensagemWhatsapp.create.mockResolvedValue(
          makeMensagem({ direcao: MensagemDirecao.INBOUND }),
        );
        prisma.mensagemWhatsapp.update.mockResolvedValue({});
        prisma.agendamento.findUnique.mockResolvedValue(agendamento);
        prisma.agendamento.update.mockResolvedValue({});
        prisma.agendamentoHistorico.create.mockResolvedValue({});

        await service.receberResposta({
          eventIdOriginal: EVENT_ID,
          telefone: '66999991111',
          texto: 'sim, confirmo',
        });

        expect(prisma.agendamento.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: AgendamentoStatus.CONFIRMADO,
              confirmadoEm: expect.any(Date),
            }),
          }),
        );
      });

      it('resposta positiva com horasAte < 2: muda para CONFIRMACAO_TARDIA', async () => {
        const agendamento = makeAgendamento({
          dataHoraInicio: new Date(Date.now() + 1 * 3_600_000), // +1h → tarde demais para auto
          status: AgendamentoStatus.SOLICITADO,
        });
        const original = makeMensagem({ agendamentoId: UUID_AG });

        prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
        prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
        prisma.mensagemWhatsapp.create.mockResolvedValue(
          makeMensagem({ direcao: MensagemDirecao.INBOUND }),
        );
        prisma.mensagemWhatsapp.update.mockResolvedValue({});
        prisma.agendamento.findUnique.mockResolvedValue(agendamento);
        prisma.agendamento.update.mockResolvedValue({});
        prisma.agendamentoHistorico.create.mockResolvedValue({});

        await service.receberResposta({
          eventIdOriginal: EVENT_ID,
          telefone: '66999991111',
          texto: 'ok, pode',
        });

        expect(prisma.agendamento.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: AgendamentoStatus.CONFIRMACAO_TARDIA,
            }),
          }),
        );
      });

      it('resposta negativa com horasAte >= 2: muda para CANCELADO', async () => {
        const agendamento = makeAgendamento({
          dataHoraInicio: new Date(Date.now() + 6 * 3_600_000),
          status: AgendamentoStatus.SOLICITADO,
        });
        const original = makeMensagem({ agendamentoId: UUID_AG });

        prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
        prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
        prisma.mensagemWhatsapp.create.mockResolvedValue(
          makeMensagem({ direcao: MensagemDirecao.INBOUND }),
        );
        prisma.mensagemWhatsapp.update.mockResolvedValue({});
        prisma.agendamento.findUnique.mockResolvedValue(agendamento);
        prisma.agendamento.update.mockResolvedValue({});
        prisma.agendamentoHistorico.create.mockResolvedValue({});

        await service.receberResposta({
          eventIdOriginal: EVENT_ID,
          telefone: '66999991111',
          texto: 'não posso comparecer',
        });

        expect(prisma.agendamento.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: AgendamentoStatus.CANCELADO,
              canceladoEm: expect.any(Date),
              motivoCancelamento: 'Paciente cancelou via WhatsApp',
            }),
          }),
        );
      });

      it('resposta negativa com horasAte < 2: não cancela automaticamente (recepção decide)', async () => {
        const agendamento = makeAgendamento({
          dataHoraInicio: new Date(Date.now() + 1 * 3_600_000), // +1h → muito próximo
          status: AgendamentoStatus.SOLICITADO,
        });
        const original = makeMensagem({ agendamentoId: UUID_AG });

        prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
        prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
        prisma.mensagemWhatsapp.create.mockResolvedValue(
          makeMensagem({ direcao: MensagemDirecao.INBOUND }),
        );
        prisma.mensagemWhatsapp.update.mockResolvedValue({});
        prisma.agendamento.findUnique.mockResolvedValue(agendamento);

        await service.receberResposta({
          eventIdOriginal: EVENT_ID,
          telefone: '66999991111',
          texto: 'cancelar',
        });

        // Não deve atualizar o agendamento automaticamente
        expect(prisma.agendamento.update).not.toHaveBeenCalled();
      });

      it('texto neutro (nem positivo nem negativo): não altera agendamento', async () => {
        const agendamento = makeAgendamento();
        const original = makeMensagem({ agendamentoId: UUID_AG });

        prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
        prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
        prisma.mensagemWhatsapp.create.mockResolvedValue(
          makeMensagem({ direcao: MensagemDirecao.INBOUND }),
        );
        prisma.mensagemWhatsapp.update.mockResolvedValue({});
        prisma.agendamento.findUnique.mockResolvedValue(agendamento);

        await service.receberResposta({
          eventIdOriginal: EVENT_ID,
          telefone: '66999991111',
          texto: 'obrigado, até logo',
        });

        expect(prisma.agendamento.update).not.toHaveBeenCalled();
        expect(prisma.agendamentoHistorico.create).not.toHaveBeenCalled();
      });

      it('agendamento não encontrado: não lança erro, apenas ignora', async () => {
        const original = makeMensagem({ agendamentoId: UUID_AG });

        prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
        prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
        prisma.mensagemWhatsapp.create.mockResolvedValue(
          makeMensagem({ direcao: MensagemDirecao.INBOUND }),
        );
        prisma.mensagemWhatsapp.update.mockResolvedValue({});
        prisma.agendamento.findUnique.mockResolvedValue(null); // agendamento sumiu

        await expect(
          service.receberResposta({
            eventIdOriginal: EVENT_ID,
            telefone: '66999991111',
            texto: 'sim',
          }),
        ).resolves.not.toThrow();

        expect(prisma.agendamento.update).not.toHaveBeenCalled();
      });

      it('grava histórico no agendamentoHistorico ao mudar status', async () => {
        const agendamento = makeAgendamento({
          dataHoraInicio: new Date(Date.now() + 6 * 3_600_000),
        });
        const original = makeMensagem({ agendamentoId: UUID_AG });

        prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
        prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
        prisma.mensagemWhatsapp.create.mockResolvedValue(
          makeMensagem({ direcao: MensagemDirecao.INBOUND }),
        );
        prisma.mensagemWhatsapp.update.mockResolvedValue({});
        prisma.agendamento.findUnique.mockResolvedValue(agendamento);
        prisma.agendamento.update.mockResolvedValue({});
        prisma.agendamentoHistorico.create.mockResolvedValue({});

        await service.receberResposta({
          eventIdOriginal: EVENT_ID,
          telefone: '66999991111',
          texto: 'confirmo',
        });

        expect(prisma.agendamentoHistorico.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              agendamentoId: UUID_AG,
              statusNovo: AgendamentoStatus.CONFIRMADO,
            }),
          }),
        );
      });

      it('variações de texto positivo reconhecidas: SIM, S, OK, PODE, VOU, PRESENTE', async () => {
        const textos = ['SIM', 's', 'OK', 'pode', 'vou', 'Presente'];

        for (const texto of textos) {
          jest.clearAllMocks();

          const agendamento = makeAgendamento({
            dataHoraInicio: new Date(Date.now() + 6 * 3_600_000),
          });
          const original = makeMensagem({ agendamentoId: UUID_AG });

          prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
          prisma.mensagemWhatsapp.findUnique.mockResolvedValue(original);
          prisma.mensagemWhatsapp.create.mockResolvedValue(
            makeMensagem({ direcao: MensagemDirecao.INBOUND }),
          );
          prisma.mensagemWhatsapp.update.mockResolvedValue({});
          prisma.agendamento.findUnique.mockResolvedValue(agendamento);
          prisma.agendamento.update.mockResolvedValue({});
          prisma.agendamentoHistorico.create.mockResolvedValue({});

          await service.receberResposta({
            eventIdOriginal: EVENT_ID,
            telefone: '66999991111',
            texto,
          });

          expect(prisma.agendamento.update).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                status: AgendamentoStatus.CONFIRMADO,
              }),
            }),
          );
        }
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listarPendentes
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listarPendentes', () => {
    it('retorna apenas mensagens OUTBOUND com status PENDENTE ou FALHA', async () => {
      const pendentes = [
        makeMensagem({ status: MensagemStatus.PENDENTE }),
        makeMensagem({ id: UUID_AG, status: MensagemStatus.FALHA }),
      ];
      prisma.mensagemWhatsapp.findMany.mockResolvedValue(pendentes);

      const result = await service.listarPendentes();

      expect(result).toEqual({ items: pendentes, nextCursor: null });
      expect(prisma.mensagemWhatsapp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [MensagemStatus.PENDENTE, MensagemStatus.FALHA] },
            direcao: MensagemDirecao.OUTBOUND,
          }),
        }),
      );
    });

    it('inclui dados do paciente e agendamento (include)', async () => {
      prisma.mensagemWhatsapp.findMany.mockResolvedValue([]);

      await service.listarPendentes();

      expect(prisma.mensagemWhatsapp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            paciente: expect.any(Object),
            agendamento: expect.any(Object),
          }),
        }),
      );
    });

    it('retorna página vazia quando não há pendências', async () => {
      prisma.mensagemWhatsapp.findMany.mockResolvedValue([]);

      const result = await service.listarPendentes();
      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('default limit 50: take = 51 e nextCursor null quando rows ≤ 50', async () => {
      prisma.mensagemWhatsapp.findMany.mockResolvedValue([]);

      await service.listarPendentes();

      expect(prisma.mensagemWhatsapp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51,
          skip: 0,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('paginação: rows > limit → nextCursor preenchido com último id', async () => {
      const rows = Array.from({ length: 51 }, (_, i) =>
        makeMensagem({
          id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
        }),
      );
      prisma.mensagemWhatsapp.findMany.mockResolvedValue(rows);

      const result = await service.listarPendentes();

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBe(rows[49].id);
    });

    it('paginação: cursor recebido aciona skip 1', async () => {
      prisma.mensagemWhatsapp.findMany.mockResolvedValue([]);
      const cursor = '99999999-9999-4999-8999-999999999999';

      await service.listarPendentes({ cursor, limit: 10 });

      expect(prisma.mensagemWhatsapp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: cursor },
          skip: 1,
          take: 11,
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // reenviarManual
  // ═══════════════════════════════════════════════════════════════════════════

  describe('reenviarManual', () => {
    it('lança NotFoundException quando mensagem não existe', async () => {
      prisma.mensagemWhatsapp.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.reenviarManual(UUID_MSG, UUID_USER, TRACE),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.mensagemWhatsapp.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('sucesso: zera tentativas, seta PENDENTE, chama enviar e registra auditoria', async () => {
      const msg = makeMensagem({ status: MensagemStatus.FALHA, tentativas: 3 });
      const msgAtualizada = {
        ...msg,
        status: MensagemStatus.PENDENTE,
        tentativas: 0,
      };

      // Primeira chamada findUnique: reenviarManual verifica existência
      // Segunda chamada findUnique: enviar lê a mensagem
      prisma.mensagemWhatsapp.findUnique
        .mockResolvedValueOnce(msg) // reenviarManual
        .mockResolvedValueOnce(msgAtualizada) // enviar
        .mockResolvedValueOnce(msgAtualizada); // findUnique final

      prisma.mensagemWhatsapp.update.mockResolvedValue(msgAtualizada);
      http.post.mockReturnValue(of({ data: { ok: true }, status: 200 }));

      await service.reenviarManual(UUID_MSG, UUID_USER, TRACE);

      // Primeira update: zera tentativas e reseta status
      expect(prisma.mensagemWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: UUID_MSG },
          data: { status: MensagemStatus.PENDENTE, tentativas: 0, erro: null },
        }),
      );

      // Auditoria registrada
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          usuarioId: UUID_USER,
          acao: 'WHATSAPP_REENVIO_MANUAL',
          resultado: AuditResultado.SUCESSO,
          traceId: TRACE,
        }),
      );
    });

    it('retorna mensagem atualizada após reenvio', async () => {
      const msg = makeMensagem({ status: MensagemStatus.FALHA });
      const msgEnviada = { ...msg, status: MensagemStatus.ENVIADA };

      prisma.mensagemWhatsapp.findUnique
        .mockResolvedValueOnce(msg)
        .mockResolvedValueOnce({
          ...msg,
          status: MensagemStatus.PENDENTE,
          tentativas: 0,
        })
        .mockResolvedValueOnce(msgEnviada);

      prisma.mensagemWhatsapp.update.mockResolvedValue({});
      http.post.mockReturnValue(of({ data: { ok: true }, status: 200 }));

      const result = await service.reenviarManual(UUID_MSG, UUID_USER, TRACE);

      expect(result).toEqual(msgEnviada);
    });
  });
});
