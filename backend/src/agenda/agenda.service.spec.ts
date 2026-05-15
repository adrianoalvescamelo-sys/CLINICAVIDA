/**
 * Unit tests — AgendaService (Sprint 3)
 *
 * Cobre:
 *  - create: sucesso, PACIENTE_NAO_ENCONTRADO, PROFISSIONAL_NAO_ENCONTRADO,
 *            HORARIO_OCUPADO sem encaixe, HORARIO_OCUPADO com encaixe (passa),
 *            HORARIO_BLOQUEADO sem encaixe, HORARIO_BLOQUEADO com encaixe (passa),
 *            PACIENTE_COM_AGENDAMENTO, idempotência via eventId
 *  - findAll: com e sem filtros
 *  - findOne: sucesso, não encontrado
 *  - update: sucesso, CONCURRENT_UPDATE, TRANSICAO_INVALIDA (de status final),
 *            LIMITE_AUTOMACAO_EXPIRADO (bot < 2h)
 *  - criarBloqueio: sucesso admin, sucesso próprio profissional,
 *                   FORBIDDEN outro profissional, AGENDAMENTO_NO_BLOQUEIO
 *  - removerBloqueio: sucesso, BLOQUEIO_NAO_ENCONTRADO, FORBIDDEN
 *
 * Isolamento: PrismaService e AuditService completamente mockados.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AgendaService } from './agenda.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  PerfilTipo,
} from '@prisma/client';

// ─── UUIDs e constantes de teste ──────────────────────────────────────────────

const UUID_AG   = '11111111-1111-4111-8111-111111111111';
const UUID_PAC  = '22222222-2222-4222-8222-222222222222';
const UUID_PROF = '33333333-3333-4333-8333-333333333333';
const UUID_PROF2= '44444444-4444-4444-8444-444444444444';
const UUID_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_BLOC = '55555555-5555-4555-8555-555555555555';

const IP    = '127.0.0.1';
const TRACE = 'test-trace';

// Horário futuro (6h à frente) para não cair na regra dos 2h de automação
const INICIO = new Date(Date.now() + 6 * 3_600_000);
const FIM    = new Date(Date.now() + 7 * 3_600_000);

// Horário próximo (<2h) para testar LIMITE_AUTOMACAO_EXPIRADO
const INICIO_PROXIMO = new Date(Date.now() + 30 * 60_000);   // +30min
const FIM_PROXIMO    = new Date(Date.now() + 90 * 60_000);   // +90min

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeCtx(perfil: PerfilTipo = PerfilTipo.RECEPCAO) {
  return { usuarioId: UUID_USER, perfil, ip: IP, traceId: TRACE };
}

function makeCreateDto(overrides: Record<string, unknown> = {}) {
  return {
    pacienteId: UUID_PAC,
    profissionalId: UUID_PROF,
    dataHoraInicio: INICIO.toISOString(),
    dataHoraFim: FIM.toISOString(),
    ...overrides,
  };
}

function makeAgendamento(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_AG,
    pacienteId: UUID_PAC,
    profissionalId: UUID_PROF,
    dataHoraInicio: INICIO,
    dataHoraFim: FIM,
    status: AgendamentoStatus.SOLICITADO,
    origem: AgendamentoOrigem.RECEPCAO,
    encaixe: false,
    observacoes: null,
    eventId: null,
    criadoPor: UUID_USER,
    atualizadoPor: UUID_USER,
    confirmadoEm: null,
    canceladoEm: null,
    motivoCancelamento: null,
    tipo: 'CONSULTA',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

function makeBloqueio(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_BLOC,
    profissionalId: UUID_PROF,
    dataHoraInicio: INICIO,
    dataHoraFim: FIM,
    motivo: 'Reunião',
    criadoPor: UUID_USER,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

// ─── mock factories ───────────────────────────────────────────────────────────

function makeTxMock() {
  return {
    agendamento: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeAgendamento()),
      findUnique: jest.fn(),
    },
    bloqueioAgenda: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    agendamentoHistorico: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function makePrismaMock() {
  const tx = makeTxMock();
  return {
    agendamento: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    profissional: {
      findUnique: jest.fn(),
    },
    paciente: {
      findFirst: jest.fn(),
    },
    bloqueioAgenda: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    agendamentoHistorico: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    _tx: tx, // expõe para configurar nos testes
  };
}

function makeAuditMock() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('AgendaService', () => {
  let service: AgendaService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    audit  = makeAuditMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgendaService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit  },
      ],
    }).compile();

    service = module.get<AgendaService>(AgendaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // create
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('sucesso: cria agendamento e registra histórico', async () => {
      const dto = makeCreateDto();
      const ag  = makeAgendamento();

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: true });
      prisma._tx.agendamento.findFirst.mockResolvedValue(null);   // sem conflito profissional
      prisma._tx.bloqueioAgenda.findFirst.mockResolvedValue(null); // sem bloqueio
      // findFirst para paciente (choque) também null
      prisma._tx.agendamento.create.mockResolvedValue(ag);

      const result = await service.create(dto as any, makeCtx(), {
        origem: AgendamentoOrigem.RECEPCAO,
      });

      expect(result).toEqual(ag);
      expect(prisma._tx.agendamentoHistorico.create).toHaveBeenCalledTimes(1);
    });

    it('PACIENTE_NAO_ENCONTRADO: lança NotFoundException', async () => {
      prisma.paciente.findFirst.mockResolvedValue(null);

      await expect(
        service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        }),
      ).rejects.toThrow(NotFoundException);

      try {
        await service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        });
      } catch (e: any) {
        expect(e.response.code).toBe('PACIENTE_NAO_ENCONTRADO');
      }
    });

    it('PROFISSIONAL_NAO_ENCONTRADO: profissional inexistente lança NotFoundException', async () => {
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue(null);

      await expect(
        service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        }),
      ).rejects.toThrow(NotFoundException);

      try {
        await service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        });
      } catch (e: any) {
        expect(e.response.code).toBe('PROFISSIONAL_NAO_ENCONTRADO');
      }
    });

    it('PROFISSIONAL_NAO_ENCONTRADO: profissional inativo lança NotFoundException', async () => {
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: false });

      await expect(
        service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('HORARIO_OCUPADO sem encaixe: lança ConflictException', async () => {
      const conflito = makeAgendamento();

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: true });

      // $transaction chama fn(tx) — configuramos tx para retornar conflito na primeira chamada
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          agendamento: {
            findFirst: jest.fn()
              .mockResolvedValueOnce(conflito)  // conflito de profissional
              .mockResolvedValue(null),
            create: jest.fn(),
          },
          bloqueioAgenda: { findFirst: jest.fn().mockResolvedValue(null) },
          agendamentoHistorico: { create: jest.fn() },
        };
        return fn(tx);
      });

      await expect(
        service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        }),
      ).rejects.toThrow(ConflictException);

      try {
        prisma.$transaction.mockImplementation(async (fn: any) => {
          const tx = {
            agendamento: {
              findFirst: jest.fn().mockResolvedValueOnce(conflito).mockResolvedValue(null),
              create: jest.fn(),
            },
            bloqueioAgenda: { findFirst: jest.fn().mockResolvedValue(null) },
            agendamentoHistorico: { create: jest.fn() },
          };
          return fn(tx);
        });
        await service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        });
      } catch (e: any) {
        expect(e.response.code).toBe('HORARIO_OCUPADO');
      }
    });

    it('HORARIO_OCUPADO com encaixe=true: agendamento criado mesmo com conflito de profissional', async () => {
      const conflito = makeAgendamento();
      const ag = makeAgendamento({ encaixe: true });

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: true });

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          agendamento: {
            findFirst: jest.fn()
              .mockResolvedValueOnce(conflito)   // conflito profissional (mas encaixe=true → ignora)
              .mockResolvedValue(null),           // sem choque de paciente
            create: jest.fn().mockResolvedValue(ag),
          },
          bloqueioAgenda: { findFirst: jest.fn().mockResolvedValue(null) },
          agendamentoHistorico: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.create(
        { ...makeCreateDto(), encaixe: true } as any,
        makeCtx(),
        { origem: AgendamentoOrigem.RECEPCAO },
      );

      expect(result.encaixe).toBe(true);
    });

    it('HORARIO_BLOQUEADO sem encaixe: lança ConflictException', async () => {
      const bloqueio = makeBloqueio();

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: true });

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          agendamento: {
            findFirst: jest.fn().mockResolvedValue(null), // sem conflito profissional
            create: jest.fn(),
          },
          bloqueioAgenda: { findFirst: jest.fn().mockResolvedValue(bloqueio) },
          agendamentoHistorico: { create: jest.fn() },
        };
        return fn(tx);
      });

      await expect(
        service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        }),
      ).rejects.toThrow(ConflictException);

      try {
        prisma.$transaction.mockImplementation(async (fn: any) => {
          const tx = {
            agendamento: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
            bloqueioAgenda: { findFirst: jest.fn().mockResolvedValue(bloqueio) },
            agendamentoHistorico: { create: jest.fn() },
          };
          return fn(tx);
        });
        await service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        });
      } catch (e: any) {
        expect(e.response.code).toBe('HORARIO_BLOQUEADO');
      }
    });

    it('HORARIO_BLOQUEADO com encaixe=true: agendamento criado mesmo com horário bloqueado', async () => {
      const bloqueio = makeBloqueio();
      const ag = makeAgendamento({ encaixe: true });

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: true });

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          agendamento: {
            findFirst: jest.fn()
              .mockResolvedValueOnce(null)   // sem conflito profissional
              .mockResolvedValue(null),       // sem choque de paciente
            create: jest.fn().mockResolvedValue(ag),
          },
          bloqueioAgenda: {
            findFirst: jest.fn().mockResolvedValue(bloqueio), // bloqueio existe, encaixe ignora
          },
          agendamentoHistorico: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.create(
        { ...makeCreateDto(), encaixe: true } as any,
        makeCtx(),
        { origem: AgendamentoOrigem.RECEPCAO },
      );

      expect(result).toBeDefined();
    });

    it('PACIENTE_COM_AGENDAMENTO: lança ConflictException quando paciente tem choque', async () => {
      const choque = makeAgendamento({ pacienteId: UUID_PAC });

      // The service calls inside transaction:
      //  1. tx.agendamento.findFirst  → conflito profissional (null = nenhum)
      //  2. tx.bloqueioAgenda.findFirst → bloqueio (null = nenhum)
      //  3. tx.agendamento.findFirst  → choque de paciente
      const makeTx = () => ({
        agendamento: {
          findFirst: jest.fn()
            .mockResolvedValueOnce(null)   // 1st call: sem conflito profissional
            .mockResolvedValue(choque),    // 2nd call: choque de paciente
          create: jest.fn(),
        },
        bloqueioAgenda: { findFirst: jest.fn().mockResolvedValue(null) },
        agendamentoHistorico: { create: jest.fn() },
      });

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: true });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(makeTx()));

      await expect(
        service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        }),
      ).rejects.toThrow(ConflictException);

      try {
        prisma.$transaction.mockImplementation(async (fn: any) => fn(makeTx()));
        await service.create(makeCreateDto() as any, makeCtx(), {
          origem: AgendamentoOrigem.RECEPCAO,
        });
      } catch (e: any) {
        expect(e.response.code).toBe('PACIENTE_COM_AGENDAMENTO');
      }
    });

    it('idempotência: eventId já existente retorna o agendamento existente sem criar novo', async () => {
      const existente = makeAgendamento({ eventId: 'evt-123' });
      prisma.agendamento.findUnique.mockResolvedValue(existente);

      const result = await service.create(
        makeCreateDto() as any,
        makeCtx(),
        { origem: AgendamentoOrigem.BOT_WHATSAPP, eventId: 'evt-123' },
      );

      expect(result).toEqual(existente);
      // Não deve chamar findFirst de paciente/profissional nem $transaction
      expect(prisma.paciente.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('idempotência: eventId sem agendamento existente prossegue com criação normal', async () => {
      const ag = makeAgendamento({ eventId: 'evt-novo' });

      prisma.agendamento.findUnique.mockResolvedValue(null); // novo event_id
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({ id: UUID_PROF, ativo: true });

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          agendamento: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(ag),
          },
          bloqueioAgenda: { findFirst: jest.fn().mockResolvedValue(null) },
          agendamentoHistorico: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.create(
        makeCreateDto() as any,
        makeCtx(),
        { origem: AgendamentoOrigem.BOT_WHATSAPP, eventId: 'evt-novo' },
      );

      expect(result.eventId).toBe('evt-novo');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findAll
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findAll', () => {
    it('sem filtros: chama findMany sem where restritivo e retorna lista', async () => {
      const lista = [makeAgendamento()];
      prisma.agendamento.findMany.mockResolvedValue(lista);

      const result = await service.findAll({});

      expect(result).toEqual(lista);
      expect(prisma.agendamento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { dataHoraInicio: 'asc' }, take: 500 }),
      );
    });

    it('filtro profissionalId: inclui where.profissionalId', async () => {
      prisma.agendamento.findMany.mockResolvedValue([]);

      await service.findAll({ profissionalId: UUID_PROF } as any);

      const call = prisma.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe(UUID_PROF);
    });

    it('filtro status: inclui where.status', async () => {
      prisma.agendamento.findMany.mockResolvedValue([]);

      await service.findAll({ status: AgendamentoStatus.CONFIRMADO } as any);

      const call = prisma.agendamento.findMany.mock.calls[0][0];
      expect(call.where.status).toBe(AgendamentoStatus.CONFIRMADO);
    });

    it('filtros inicio e fim: inclui where.dataHoraInicio com gte/lte', async () => {
      prisma.agendamento.findMany.mockResolvedValue([]);

      const inicio = '2026-06-01T00:00:00.000Z';
      const fim    = '2026-06-30T23:59:59.999Z';

      await service.findAll({ inicio, fim } as any);

      const call = prisma.agendamento.findMany.mock.calls[0][0];
      expect(call.where.dataHoraInicio).toMatchObject({
        gte: new Date(inicio),
        lte: new Date(fim),
      });
    });

    it('sem filtros: where vazio (sem props restritivas)', async () => {
      prisma.agendamento.findMany.mockResolvedValue([]);

      await service.findAll({});

      const call = prisma.agendamento.findMany.mock.calls[0][0];
      expect(Object.keys(call.where)).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findOne
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findOne', () => {
    it('sucesso: retorna agendamento com paciente e profissional', async () => {
      const ag = { ...makeAgendamento(), paciente: {}, profissional: {} };
      prisma.agendamento.findUnique.mockResolvedValue(ag);

      const result = await service.findOne(UUID_AG);

      expect(result).toEqual(ag);
      expect(prisma.agendamento.findUnique).toHaveBeenCalledWith({
        where: { id: UUID_AG },
        include: { paciente: true, profissional: true },
      });
    });

    it('não encontrado: lança NotFoundException com code AGENDAMENTO_NAO_ENCONTRADO', async () => {
      prisma.agendamento.findUnique.mockResolvedValue(null);

      await expect(service.findOne(UUID_AG)).rejects.toThrow(NotFoundException);

      try {
        await service.findOne(UUID_AG);
      } catch (e: any) {
        expect(e.response.code).toBe('AGENDAMENTO_NAO_ENCONTRADO');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // update
  // ═══════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    const atualizadoEm = new Date('2026-01-01T10:00:00Z');

    function mockFindOne(overrides: Record<string, unknown> = {}) {
      const ag = makeAgendamento({ updatedAt: atualizadoEm, ...overrides });
      // findOne usa agendamento.findUnique
      prisma.agendamento.findUnique.mockResolvedValue({
        ...ag,
        paciente: {},
        profissional: {},
      });
      return ag;
    }

    it('sucesso: atualiza status, grava histórico e auditoria', async () => {
      const atual = mockFindOne();
      const atualizado = makeAgendamento({
        status: AgendamentoStatus.CONFIRMADO,
        updatedAt: new Date(),
      });

      prisma.agendamento.update.mockResolvedValue(atualizado);

      const result = await service.update(
        UUID_AG,
        { status: AgendamentoStatus.CONFIRMADO, updatedAt: atualizadoEm.toISOString() },
        makeCtx(),
      );

      expect(result.status).toBe(AgendamentoStatus.CONFIRMADO);
      expect(prisma.agendamentoHistorico.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'UPDATE',
          entidade: 'Agendamento',
        }),
      );
    });

    it('CONCURRENT_UPDATE: updatedAt divergente lança ConflictException', async () => {
      mockFindOne({ updatedAt: new Date('2026-01-01T12:00:00Z') });

      await expect(
        service.update(
          UUID_AG,
          { updatedAt: '2026-01-01T10:00:00.000Z' }, // timestamp antigo
          makeCtx(),
        ),
      ).rejects.toThrow(ConflictException);

      try {
        mockFindOne({ updatedAt: new Date('2026-01-01T12:00:00Z') });
        await service.update(
          UUID_AG,
          { updatedAt: '2026-01-01T10:00:00.000Z' },
          makeCtx(),
        );
      } catch (e: any) {
        expect(e.response.code).toBe('CONCURRENT_UPDATE');
      }
    });

    it('TRANSICAO_INVALIDA: de status ATENDIDO lança BadRequestException', async () => {
      mockFindOne({ status: AgendamentoStatus.ATENDIDO });

      await expect(
        service.update(
          UUID_AG,
          { status: AgendamentoStatus.CONFIRMADO },
          makeCtx(),
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        mockFindOne({ status: AgendamentoStatus.ATENDIDO });
        await service.update(UUID_AG, { status: AgendamentoStatus.CONFIRMADO }, makeCtx());
      } catch (e: any) {
        expect(e.response.code).toBe('TRANSICAO_INVALIDA');
      }
    });

    it('TRANSICAO_INVALIDA: de status CANCELADO lança BadRequestException', async () => {
      mockFindOne({ status: AgendamentoStatus.CANCELADO });

      await expect(
        service.update(
          UUID_AG,
          { status: AgendamentoStatus.CONFIRMADO },
          makeCtx(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('TRANSICAO_INVALIDA: de status FALTOU lança BadRequestException', async () => {
      mockFindOne({ status: AgendamentoStatus.FALTOU });

      await expect(
        service.update(
          UUID_AG,
          { status: AgendamentoStatus.CONFIRMADO },
          makeCtx(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('LIMITE_AUTOMACAO_EXPIRADO: cancelamento bot (puro, sem mudança de datas) com <2h de antecedência lança BadRequestException', async () => {
      // Agendamento em menos de 2h — cancelamento puro (só muda status)
      mockFindOne({
        dataHoraInicio: INICIO_PROXIMO,
        dataHoraFim: FIM_PROXIMO,
        status: AgendamentoStatus.CONFIRMADO,
      });

      await expect(
        service.update(
          UUID_AG,
          { status: AgendamentoStatus.CANCELADO },
          makeCtx(),
          AgendamentoOrigem.PACIENTE_WHATSAPP,
        ),
      ).rejects.toThrow(BadRequestException);

      // Verifica o código do erro
      mockFindOne({
        dataHoraInicio: INICIO_PROXIMO,
        dataHoraFim: FIM_PROXIMO,
        status: AgendamentoStatus.CONFIRMADO,
      });
      try {
        await service.update(
          UUID_AG,
          { status: AgendamentoStatus.CANCELADO },
          makeCtx(),
          AgendamentoOrigem.PACIENTE_WHATSAPP,
        );
      } catch (e: any) {
        expect(e.response.code).toBe('LIMITE_AUTOMACAO_EXPIRADO');
      }
    });

    it('LIMITE_AUTOMACAO_EXPIRADO: remarcação bot com <2h de antecedência lança BadRequestException', async () => {
      mockFindOne({
        dataHoraInicio: INICIO_PROXIMO,
        dataHoraFim: FIM_PROXIMO,
        status: AgendamentoStatus.CONFIRMADO,
      });

      await expect(
        service.update(
          UUID_AG,
          { dataHoraInicio: new Date(Date.now() + 5 * 3_600_000).toISOString() },
          makeCtx(),
          AgendamentoOrigem.PACIENTE_WHATSAPP,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancelamento bot com >2h de antecedência é permitido', async () => {
      mockFindOne({
        dataHoraInicio: INICIO,
        dataHoraFim: FIM,
        status: AgendamentoStatus.CONFIRMADO,
      });
      const atualizado = makeAgendamento({ status: AgendamentoStatus.CANCELADO });
      prisma.agendamento.update.mockResolvedValue(atualizado);

      // Não deve lançar
      await expect(
        service.update(
          UUID_AG,
          { status: AgendamentoStatus.CANCELADO },
          makeCtx(),
          AgendamentoOrigem.PACIENTE_WHATSAPP,
        ),
      ).resolves.toBeDefined();
    });

    it('sem updatedAt no DTO: não verifica concorrência e atualiza normalmente', async () => {
      mockFindOne();
      const atualizado = makeAgendamento({ status: AgendamentoStatus.CONFIRMADO });
      prisma.agendamento.update.mockResolvedValue(atualizado);

      await expect(
        service.update(UUID_AG, { status: AgendamentoStatus.CONFIRMADO }, makeCtx()),
      ).resolves.toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // criarBloqueio
  // ═══════════════════════════════════════════════════════════════════════════

  describe('criarBloqueio', () => {
    const dto = {
      profissionalId: UUID_PROF,
      dataHoraInicio: INICIO.toISOString(),
      dataHoraFim: FIM.toISOString(),
      motivo: 'Reunião',
    };

    it('sucesso admin: pode bloquear qualquer profissional', async () => {
      const bloqueio = makeBloqueio();
      prisma.agendamento.findFirst.mockResolvedValue(null);
      prisma.bloqueioAgenda.create.mockResolvedValue(bloqueio);

      const result = await service.criarBloqueio(
        dto,
        makeCtx(PerfilTipo.ADMIN),
        UUID_PROF2, // profissional diferente do dto — admin pode mesmo assim
      );

      expect(result).toEqual(bloqueio);
    });

    it('sucesso profissional próprio: pode bloquear a própria agenda', async () => {
      const bloqueio = makeBloqueio();
      prisma.agendamento.findFirst.mockResolvedValue(null);
      prisma.bloqueioAgenda.create.mockResolvedValue(bloqueio);

      const result = await service.criarBloqueio(
        dto,
        makeCtx(PerfilTipo.MEDICO),
        UUID_PROF, // mesmo profissionalId do dto
      );

      expect(result).toEqual(bloqueio);
    });

    it('FORBIDDEN: profissional tenta bloquear agenda de outro', async () => {
      await expect(
        service.criarBloqueio(
          dto,
          makeCtx(PerfilTipo.MEDICO),
          UUID_PROF2, // profissional do caller diferente do dto.profissionalId
        ),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.criarBloqueio(
          dto,
          makeCtx(PerfilTipo.MEDICO),
          UUID_PROF2,
        );
      } catch (e: any) {
        expect(e.response.code).toBe('FORBIDDEN');
      }
    });

    it('AGENDAMENTO_NO_BLOQUEIO: agendamento ativo no período lança ConflictException', async () => {
      const conflito = makeAgendamento();
      prisma.agendamento.findFirst.mockResolvedValue(conflito);

      await expect(
        service.criarBloqueio(
          dto,
          makeCtx(PerfilTipo.ADMIN),
          undefined,
        ),
      ).rejects.toThrow(ConflictException);

      try {
        prisma.agendamento.findFirst.mockResolvedValue(conflito);
        await service.criarBloqueio(
          dto,
          makeCtx(PerfilTipo.ADMIN),
          undefined,
        );
      } catch (e: any) {
        expect(e.response.code).toBe('AGENDAMENTO_NO_BLOQUEIO');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // removerBloqueio
  // ═══════════════════════════════════════════════════════════════════════════

  describe('removerBloqueio', () => {
    it('sucesso admin: remove qualquer bloqueio', async () => {
      const bloqueio = makeBloqueio();
      prisma.bloqueioAgenda.findUnique.mockResolvedValue(bloqueio);
      prisma.bloqueioAgenda.delete.mockResolvedValue(undefined);

      await expect(
        service.removerBloqueio(UUID_BLOC, makeCtx(PerfilTipo.ADMIN), UUID_PROF2),
      ).resolves.toBeUndefined();

      expect(prisma.bloqueioAgenda.delete).toHaveBeenCalledWith({
        where: { id: UUID_BLOC },
      });
    });

    it('sucesso profissional próprio: remove o próprio bloqueio', async () => {
      const bloqueio = makeBloqueio({ profissionalId: UUID_PROF });
      prisma.bloqueioAgenda.findUnique.mockResolvedValue(bloqueio);
      prisma.bloqueioAgenda.delete.mockResolvedValue(undefined);

      await expect(
        service.removerBloqueio(UUID_BLOC, makeCtx(PerfilTipo.MEDICO), UUID_PROF),
      ).resolves.toBeUndefined();
    });

    it('BLOQUEIO_NAO_ENCONTRADO: lança NotFoundException', async () => {
      prisma.bloqueioAgenda.findUnique.mockResolvedValue(null);

      await expect(
        service.removerBloqueio(UUID_BLOC, makeCtx(PerfilTipo.ADMIN), undefined),
      ).rejects.toThrow(NotFoundException);

      try {
        prisma.bloqueioAgenda.findUnique.mockResolvedValue(null);
        await service.removerBloqueio(UUID_BLOC, makeCtx(PerfilTipo.ADMIN), undefined);
      } catch (e: any) {
        expect(e.response.code).toBe('BLOQUEIO_NAO_ENCONTRADO');
      }
    });

    it('FORBIDDEN: profissional tenta remover bloqueio de outro', async () => {
      const bloqueio = makeBloqueio({ profissionalId: UUID_PROF });
      prisma.bloqueioAgenda.findUnique.mockResolvedValue(bloqueio);

      await expect(
        service.removerBloqueio(UUID_BLOC, makeCtx(PerfilTipo.MEDICO), UUID_PROF2),
      ).rejects.toThrow(ForbiddenException);

      try {
        prisma.bloqueioAgenda.findUnique.mockResolvedValue(bloqueio);
        await service.removerBloqueio(UUID_BLOC, makeCtx(PerfilTipo.MEDICO), UUID_PROF2);
      } catch (e: any) {
        expect(e.response.code).toBe('FORBIDDEN');
      }
    });
  });
});
