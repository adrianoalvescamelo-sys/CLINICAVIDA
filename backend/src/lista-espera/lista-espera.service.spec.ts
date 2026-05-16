/**
 * Unit tests — ListaEsperaService (Sprint 5)
 *
 * Cobre:
 *  - create: sucesso, PACIENTE_NAO_ENCONTRADO, PROFISSIONAL_NAO_ENCONTRADO,
 *            LISTA_ESPERA_DUPLICADA (mesmo paciente+profissional+especialidade ativo)
 *  - findAll: sem filtro, com filtro de status, profissionalId, pacienteId, especialidade
 *  - update: sucesso (prioridade), sucesso (status AGENDADO), TRANSICAO_INVALIDA de status final
 *  - ofertarVaga: sucesso (ATIVO → CONTATADO, ultimaOfertaEm setado), TRANSICAO_INVALIDA
 *  - registrarRecusa: sucesso (CONTATADO → RECUSADO, motivoRecusa, ultimaRespostaEm),
 *                     TRANSICAO_INVALIDA de status final
 *  - marcarAgendado: sucesso (ATIVO → AGENDADO, ultimaRespostaEm), TRANSICAO_INVALIDA de final
 *  - auditoria: disparada em create, update, ofertarVaga, registrarRecusa, marcarAgendado
 *
 * Isolamento: PrismaService e AuditService completamente mockados.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ListaEsperaService } from './lista-espera.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditResultado, ListaEsperaStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// ─── constantes ─────────────────────────────────────────────────────────────

const UUID_PAC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_PROF = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_LE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UUID_USER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const IP = '127.0.0.1';
const TRACE = 'test-trace-id';

const CTX = { usuarioId: UUID_USER, ip: IP, traceId: TRACE };

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeListaEsperaDb(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_LE,
    pacienteId: UUID_PAC,
    profissionalId: UUID_PROF,
    especialidade: 'Cardiologia',
    prioridade: 50,
    melhoresHorarios: null,
    observacoes: null,
    status: ListaEsperaStatus.ATIVO,
    ultimaOfertaEm: null,
    ultimaRespostaEm: null,
    motivoRecusa: null,
    criadoPor: UUID_USER,
    createdAt: new Date('2026-06-01T08:00:00Z'),
    updatedAt: new Date('2026-06-01T08:00:00Z'),
    paciente: {
      id: UUID_PAC,
      nomeCompleto: 'Paciente Teste',
      telefoneWhatsapp: '65999991111',
    },
    profissional: {
      id: UUID_PROF,
      nomeCompleto: 'Dr. Teste',
      especialidade: 'Cardiologia',
    },
    ...overrides,
  };
}

function makeCreateDto(overrides: Record<string, unknown> = {}) {
  return {
    pacienteId: UUID_PAC,
    profissionalId: UUID_PROF,
    especialidade: 'Cardiologia',
    prioridade: 50,
    ...overrides,
  };
}

// ─── mock factories ──────────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    listaEspera: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    paciente: {
      findFirst: jest.fn(),
    },
    profissional: {
      findUnique: jest.fn(),
    },
  };
}

function makeAuditMock() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  };
}

// ═════════════════════════════════════════════════════════════════════════════

describe('ListaEsperaService', () => {
  let service: ListaEsperaService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    audit = makeAuditMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListaEsperaService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<ListaEsperaService>(ListaEsperaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═════════════════════════════════════════════════════════════════════════
  // create
  // ═════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('sucesso: retorna item criado e dispara auditoria', async () => {
      const dto = makeCreateDto();
      const criado = makeListaEsperaDb();

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({
        id: UUID_PROF,
        ativo: true,
      });
      prisma.listaEspera.findFirst.mockResolvedValue(null); // sem duplicidade
      prisma.listaEspera.create.mockResolvedValue(criado);

      const result = await service.create(dto as any, CTX);

      expect(result).toEqual(criado);
      expect(prisma.listaEspera.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'CREATE',
          entidade: 'ListaEspera',
          resultado: AuditResultado.SUCESSO,
          traceId: TRACE,
        }),
      );
    });

    it('PACIENTE_NAO_ENCONTRADO: lança NotFoundException quando paciente não existe', async () => {
      prisma.paciente.findFirst.mockResolvedValue(null);

      await expect(service.create(makeCreateDto() as any, CTX)).rejects.toThrow(
        NotFoundException,
      );

      try {
        await service.create(makeCreateDto() as any, CTX);
      } catch (e: any) {
        expect(e.response.code).toBe('PACIENTE_NAO_ENCONTRADO');
      }

      expect(prisma.listaEspera.create).not.toHaveBeenCalled();
    });

    it('PROFISSIONAL_NAO_ENCONTRADO: lança NotFoundException quando profissional inexiste ou inativo', async () => {
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue(null);

      await expect(service.create(makeCreateDto() as any, CTX)).rejects.toThrow(
        NotFoundException,
      );

      try {
        await service.create(makeCreateDto() as any, CTX);
      } catch (e: any) {
        expect(e.response.code).toBe('PROFISSIONAL_NAO_ENCONTRADO');
      }

      // Profissional existe mas está inativo
      prisma.profissional.findUnique.mockResolvedValue({
        id: UUID_PROF,
        ativo: false,
      });

      await expect(service.create(makeCreateDto() as any, CTX)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('LISTA_ESPERA_DUPLICADA: lança ConflictException quando já existe item ativo', async () => {
      const dto = makeCreateDto();
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({
        id: UUID_PROF,
        ativo: true,
      });
      prisma.listaEspera.findFirst.mockResolvedValue({ id: 'existing-id' });

      await expect(service.create(dto as any, CTX)).rejects.toThrow(
        ConflictException,
      );

      try {
        await service.create(dto as any, CTX);
      } catch (e: any) {
        expect(e.response.code).toBe('LISTA_ESPERA_DUPLICADA');
        expect(e.response.details.existenteId).toBe('existing-id');
      }

      expect(prisma.listaEspera.create).not.toHaveBeenCalled();
    });

    it('LISTA_ESPERA_DUPLICADA via P2002: mapDuplicidade captura erro Prisma', async () => {
      const dto = makeCreateDto();
      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      prisma.profissional.findUnique.mockResolvedValue({
        id: UUID_PROF,
        ativo: true,
      });
      prisma.listaEspera.findFirst.mockResolvedValue(null); // sem duplicidade em checkagem manual

      const prismaError = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['lista_espera_ativa_unica'] },
        },
      );
      prisma.listaEspera.create.mockRejectedValue(prismaError);

      await expect(service.create(dto as any, CTX)).rejects.toThrow(
        ConflictException,
      );

      try {
        await service.create(dto as any, CTX);
      } catch (e: any) {
        expect(e.response.code).toBe('LISTA_ESPERA_DUPLICADA');
      }
    });

    it('sem profissionalId: cria sem profissional quando profissionalId omitido', async () => {
      const dto = makeCreateDto({ profissionalId: undefined });
      const criado = makeListaEsperaDb({ profissionalId: null });

      prisma.paciente.findFirst.mockResolvedValue({ id: UUID_PAC });
      // profissionalId undefined → assertProfissional retorna sem consulta
      prisma.listaEspera.findFirst.mockResolvedValue(null);
      prisma.listaEspera.create.mockResolvedValue(criado);

      const result = await service.create(dto as any, CTX);

      expect(result).toEqual(criado);
      expect(prisma.profissional.findUnique).not.toHaveBeenCalled();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // findAll
  // ═════════════════════════════════════════════════════════════════════════

  describe('findAll', () => {
    it('sem filtro: usa status ATIVO como default e retorna lista', async () => {
      const items = [makeListaEsperaDb()];
      prisma.listaEspera.findMany.mockResolvedValue(items);

      const result = await service.findAll({} as any);

      expect(result).toEqual(items);
      expect(prisma.listaEspera.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ListaEsperaStatus.ATIVO }),
          orderBy: [{ prioridade: 'desc' }, { createdAt: 'asc' }],
          take: 500,
        }),
      );
    });

    it('filtra por status explícito', async () => {
      prisma.listaEspera.findMany.mockResolvedValue([]);

      await service.findAll({ status: ListaEsperaStatus.CONTATADO } as any);

      expect(prisma.listaEspera.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ListaEsperaStatus.CONTATADO,
          }),
        }),
      );
    });

    it('filtra por profissionalId', async () => {
      prisma.listaEspera.findMany.mockResolvedValue([]);

      await service.findAll({ profissionalId: UUID_PROF } as any);

      expect(prisma.listaEspera.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ profissionalId: UUID_PROF }),
        }),
      );
    });

    it('filtra por pacienteId', async () => {
      prisma.listaEspera.findMany.mockResolvedValue([]);

      await service.findAll({ pacienteId: UUID_PAC } as any);

      expect(prisma.listaEspera.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ pacienteId: UUID_PAC }),
        }),
      );
    });

    it('filtra por especialidade (contains insensitive)', async () => {
      prisma.listaEspera.findMany.mockResolvedValue([]);

      await service.findAll({ especialidade: 'Cardio' } as any);

      expect(prisma.listaEspera.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            especialidade: { contains: 'Cardio', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('empty state: retorna array vazio quando não há dados', async () => {
      prisma.listaEspera.findMany.mockResolvedValue([]);

      const result = await service.findAll({} as any);

      expect(result).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // update
  // ═════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    it('sucesso: atualiza prioridade e dispara auditoria', async () => {
      const atual = makeListaEsperaDb();
      const atualizado = makeListaEsperaDb({ prioridade: 99 });

      prisma.listaEspera.findUnique.mockResolvedValue(atual);
      prisma.listaEspera.findFirst.mockResolvedValue(null); // sem duplicidade
      prisma.listaEspera.update.mockResolvedValue(atualizado);

      const result = await service.update(
        UUID_LE,
        { prioridade: 99 } as any,
        CTX,
      );

      expect(result).toEqual(atualizado);
      expect(prisma.listaEspera.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: UUID_LE },
          data: expect.objectContaining({ prioridade: 99 }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'UPDATE',
          entidade: 'ListaEspera',
          resultado: AuditResultado.SUCESSO,
        }),
      );
    });

    it('sucesso: transição ATIVO → AGENDADO seta ultimaRespostaEm', async () => {
      const atual = makeListaEsperaDb({ status: ListaEsperaStatus.ATIVO });
      const atualizado = makeListaEsperaDb({
        status: ListaEsperaStatus.AGENDADO,
        ultimaRespostaEm: new Date(),
      });

      prisma.listaEspera.findUnique.mockResolvedValue(atual);
      prisma.listaEspera.update.mockResolvedValue(atualizado);

      const result = await service.update(
        UUID_LE,
        { status: ListaEsperaStatus.AGENDADO } as any,
        CTX,
      );

      expect(result.status).toBe(ListaEsperaStatus.AGENDADO);
    });

    it('LISTA_ESPERA_NAO_ENCONTRADA: lança NotFoundException para ID inexistente', async () => {
      prisma.listaEspera.findUnique.mockResolvedValue(null);

      await expect(
        service.update(
          '00000000-0000-4000-8000-000000000000',
          { prioridade: 5 } as any,
          CTX,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('TRANSICAO_INVALIDA: não permite update de status final', async () => {
      const recusado = makeListaEsperaDb({
        status: ListaEsperaStatus.RECUSADO,
      });
      prisma.listaEspera.findUnique.mockResolvedValue(recusado);

      await expect(
        service.update(
          UUID_LE,
          { status: ListaEsperaStatus.CONTATADO } as any,
          CTX,
        ),
      ).rejects.toThrow(ConflictException);

      try {
        await service.update(
          UUID_LE,
          { status: ListaEsperaStatus.CONTATADO } as any,
          CTX,
        );
      } catch (e: any) {
        expect(e.response.code).toBe('TRANSICAO_LISTA_ESPERA_INVALIDA');
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ofertarVaga
  // ═════════════════════════════════════════════════════════════════════════

  describe('ofertarVaga', () => {
    it('sucesso: ATIVO → CONTATADO e seta ultimaOfertaEm', async () => {
      const atual = makeListaEsperaDb({ status: ListaEsperaStatus.ATIVO });
      const atualizado = makeListaEsperaDb({
        status: ListaEsperaStatus.CONTATADO,
        ultimaOfertaEm: new Date(),
      });

      prisma.listaEspera.findUnique.mockResolvedValue(atual);
      prisma.listaEspera.update.mockResolvedValue(atualizado);

      const result = await service.ofertarVaga(UUID_LE, CTX);

      expect(result.status).toBe(ListaEsperaStatus.CONTATADO);
      expect(result.ultimaOfertaEm).toBeDefined();
      expect(prisma.listaEspera.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: UUID_LE },
          data: expect.objectContaining({
            status: ListaEsperaStatus.CONTATADO,
            ultimaOfertaEm: expect.any(Date),
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'OFERTAR_VAGA' }),
      );
    });

    it('TRANSICAO_INVALIDA: não pode ofertar vaga a partir de RECUSADO', async () => {
      const recusado = makeListaEsperaDb({
        status: ListaEsperaStatus.RECUSADO,
      });
      prisma.listaEspera.findUnique.mockResolvedValue(recusado);

      await expect(service.ofertarVaga(UUID_LE, CTX)).rejects.toThrow(
        ConflictException,
      );

      try {
        await service.ofertarVaga(UUID_LE, CTX);
      } catch (e: any) {
        expect(e.response.code).toBe('TRANSICAO_LISTA_ESPERA_INVALIDA');
      }

      expect(prisma.listaEspera.update).not.toHaveBeenCalled();
    });

    it('TRANSICAO_INVALIDA: não pode ofertar vaga a partir de AGENDADO', async () => {
      const agendado = makeListaEsperaDb({
        status: ListaEsperaStatus.AGENDADO,
      });
      prisma.listaEspera.findUnique.mockResolvedValue(agendado);

      await expect(service.ofertarVaga(UUID_LE, CTX)).rejects.toThrow(
        ConflictException,
      );
    });

    it('item não encontrado: lança NotFoundException', async () => {
      prisma.listaEspera.findUnique.mockResolvedValue(null);

      await expect(service.ofertarVaga(UUID_LE, CTX)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // registrarRecusa
  // ═════════════════════════════════════════════════════════════════════════

  describe('registrarRecusa', () => {
    it('sucesso: CONTATADO → RECUSADO com motivoRecusa e ultimaRespostaEm', async () => {
      const contatado = makeListaEsperaDb({
        status: ListaEsperaStatus.CONTATADO,
      });
      const recusado = makeListaEsperaDb({
        status: ListaEsperaStatus.RECUSADO,
        motivoRecusa: 'Paciente indisponível',
        ultimaRespostaEm: new Date(),
      });

      prisma.listaEspera.findUnique.mockResolvedValue(contatado);
      prisma.listaEspera.update.mockResolvedValue(recusado);

      const result = await service.registrarRecusa(
        UUID_LE,
        { motivoRecusa: 'Paciente indisponível' },
        CTX,
      );

      expect(result.status).toBe(ListaEsperaStatus.RECUSADO);
      expect(result.motivoRecusa).toBe('Paciente indisponível');
      expect(result.ultimaRespostaEm).toBeDefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'REGISTRAR_RECUSA' }),
      );
    });

    it('TRANSICAO_INVALIDA: não pode recusar a partir de AGENDADO', async () => {
      const agendado = makeListaEsperaDb({
        status: ListaEsperaStatus.AGENDADO,
      });
      prisma.listaEspera.findUnique.mockResolvedValue(agendado);

      await expect(service.registrarRecusa(UUID_LE, {}, CTX)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.listaEspera.update).not.toHaveBeenCalled();
    });

    it('sem motivoRecusa: aceita recusa sem motivo', async () => {
      const contatado = makeListaEsperaDb({
        status: ListaEsperaStatus.CONTATADO,
      });
      const recusado = makeListaEsperaDb({
        status: ListaEsperaStatus.RECUSADO,
        motivoRecusa: null,
        ultimaRespostaEm: new Date(),
      });

      prisma.listaEspera.findUnique.mockResolvedValue(contatado);
      prisma.listaEspera.update.mockResolvedValue(recusado);

      const result = await service.registrarRecusa(UUID_LE, {}, CTX);
      expect(result.status).toBe(ListaEsperaStatus.RECUSADO);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // marcarAgendado
  // ═════════════════════════════════════════════════════════════════════════

  describe('marcarAgendado', () => {
    it('sucesso: ATIVO → AGENDADO e seta ultimaRespostaEm', async () => {
      const ativo = makeListaEsperaDb({ status: ListaEsperaStatus.ATIVO });
      const agendado = makeListaEsperaDb({
        status: ListaEsperaStatus.AGENDADO,
        ultimaRespostaEm: new Date(),
      });

      prisma.listaEspera.findUnique.mockResolvedValue(ativo);
      prisma.listaEspera.update.mockResolvedValue(agendado);

      const result = await service.marcarAgendado(UUID_LE, CTX);

      expect(result.status).toBe(ListaEsperaStatus.AGENDADO);
      expect(result.ultimaRespostaEm).toBeDefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'MARCAR_AGENDADO' }),
      );
    });

    it('TRANSICAO_INVALIDA: não pode agendar a partir de RECUSADO', async () => {
      const recusado = makeListaEsperaDb({
        status: ListaEsperaStatus.RECUSADO,
      });
      prisma.listaEspera.findUnique.mockResolvedValue(recusado);

      await expect(service.marcarAgendado(UUID_LE, CTX)).rejects.toThrow(
        ConflictException,
      );

      try {
        await service.marcarAgendado(UUID_LE, CTX);
      } catch (e: any) {
        expect(e.response.code).toBe('TRANSICAO_LISTA_ESPERA_INVALIDA');
      }
    });

    it('item não encontrado: lança NotFoundException', async () => {
      prisma.listaEspera.findUnique.mockResolvedValue(null);

      await expect(service.marcarAgendado(UUID_LE, CTX)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Regras de transição de estado
  // ═════════════════════════════════════════════════════════════════════════

  describe('validarTransicao (via operações)', () => {
    it('ATIVO → CONTATADO: permitido via ofertarVaga', async () => {
      const ativo = makeListaEsperaDb({ status: ListaEsperaStatus.ATIVO });
      const contatado = makeListaEsperaDb({
        status: ListaEsperaStatus.CONTATADO,
      });

      prisma.listaEspera.findUnique.mockResolvedValue(ativo);
      prisma.listaEspera.update.mockResolvedValue(contatado);

      await expect(service.ofertarVaga(UUID_LE, CTX)).resolves.not.toThrow();
    });

    it('CANCELADO → qualquer: bloqueado como status final', async () => {
      const cancelado = makeListaEsperaDb({
        status: ListaEsperaStatus.CANCELADO,
      });
      prisma.listaEspera.findUnique.mockResolvedValue(cancelado);

      await expect(service.ofertarVaga(UUID_LE, CTX)).rejects.toThrow(
        ConflictException,
      );
    });

    it('CONTATADO → RECUSADO: permitido via registrarRecusa', async () => {
      const contatado = makeListaEsperaDb({
        status: ListaEsperaStatus.CONTATADO,
      });
      const recusado = makeListaEsperaDb({
        status: ListaEsperaStatus.RECUSADO,
      });

      prisma.listaEspera.findUnique.mockResolvedValue(contatado);
      prisma.listaEspera.update.mockResolvedValue(recusado);

      await expect(
        service.registrarRecusa(UUID_LE, {}, CTX),
      ).resolves.not.toThrow();
    });
  });
});
