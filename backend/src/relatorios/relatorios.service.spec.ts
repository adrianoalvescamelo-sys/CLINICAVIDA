import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  PerfilTipo,
  Sexo,
} from '@prisma/client';
import {
  RelatoriosService,
  CallerCtx,
  PERIODO_MAX_DIAS,
} from './relatorios.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueryRelatorioDto } from './dto/query-relatorio.dto';
import { QueryAgendaDiaDto } from './dto/query-agenda-dia.dto';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const mockAgendamento = (overrides: Partial<any> = {}): any => ({
  id: 'ag-1',
  dataHoraInicio: new Date('2026-06-01T09:00:00Z'),
  dataHoraFim: new Date('2026-06-01T09:30:00Z'),
  tipo: 'CONSULTA',
  status: AgendamentoStatus.CONFIRMADO,
  origem: AgendamentoOrigem.RECEPCAO,
  encaixe: false,
  paciente: { id: 'pac-1', nomeCompleto: 'Paciente Teste' },
  profissional: {
    id: 'prof-1',
    nomeCompleto: 'Dr. Teste',
    especialidade: 'Clínica Geral',
  },
  ...overrides,
});

const mockPaciente = (overrides: Partial<any> = {}): any => ({
  id: 'pac-1',
  nomeCompleto: 'Paciente Teste',
  cpf: '12345678901',
  dataNascimento: new Date('1990-01-01'),
  sexo: Sexo.NAO_INFORMADO,
  telefoneWhatsapp: '65999999999',
  createdAt: new Date('2026-06-01T08:00:00Z'),
  ...overrides,
});

const adminCtx: CallerCtx = {
  usuarioId: 'user-admin',
  perfil: PerfilTipo.ADMIN,
  ip: '127.0.0.1',
  traceId: 'trace-1',
};

const recepcaoCtx: CallerCtx = {
  usuarioId: 'user-recepcao',
  perfil: PerfilTipo.RECEPCAO,
  ip: '127.0.0.1',
  traceId: 'trace-2',
};

const medicoCtx: CallerCtx = {
  usuarioId: 'user-medico',
  perfil: PerfilTipo.MEDICO,
  ip: '127.0.0.1',
  traceId: 'trace-3',
  profissionalId: 'prof-1',
};

const profNaoMedicoCtx: CallerCtx = {
  usuarioId: 'user-pnm',
  perfil: PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  ip: '127.0.0.1',
  traceId: 'trace-4',
  profissionalId: 'prof-2',
};

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const prismaMock = {
  agendamento: {
    findMany: jest.fn(),
  },
  paciente: {
    findMany: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RelatoriosService', () => {
  let service: RelatoriosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelatoriosService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<RelatoriosService>(RelatoriosService);
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // agendaDia
  // -------------------------------------------------------------------------

  describe('agendaDia', () => {
    it('retorna agendamentos do dia para admin', async () => {
      const ags = [mockAgendamento()];
      prismaMock.agendamento.findMany.mockResolvedValue(ags);

      const result = await service.agendaDia({ data: '2026-06-01' }, adminCtx);

      expect(result.total).toBe(1);
      expect(result.agendamentos).toHaveLength(1);
      expect(result.generatedAt).toBeDefined();
      expect(prismaMock.agendamento.findMany).toHaveBeenCalledTimes(1);
    });

    it('usa default hoje quando data não informada', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      const result = await service.agendaDia({}, adminCtx);
      expect(result.data).toBeDefined();
      expect(result.total).toBe(0);
    });

    it('retorna lista vazia (não erro) quando sem dados', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      const result = await service.agendaDia({ data: '2026-06-01' }, adminCtx);
      expect(result.total).toBe(0);
      expect(result.agendamentos).toEqual([]);
    });

    it('médico filtra somente a própria agenda (profissionalId do ctx)', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      await service.agendaDia({ data: '2026-06-01' }, medicoCtx);

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe('prof-1');
    });

    it('profissional não médico filtra somente a própria agenda', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      await service.agendaDia({ data: '2026-06-01' }, profNaoMedicoCtx);

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe('prof-2');
    });

    it('admin pode filtrar por profissionalId específico', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      await service.agendaDia(
        { data: '2026-06-01', profissionalId: 'prof-99' },
        adminCtx,
      );

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe('prof-99');
    });
  });

  // -------------------------------------------------------------------------
  // agendamentosPorStatus
  // -------------------------------------------------------------------------

  describe('agendamentosPorStatus', () => {
    it('agrupa corretamente por status', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([
        mockAgendamento({ status: AgendamentoStatus.CONFIRMADO }),
        mockAgendamento({ id: 'ag-2', status: AgendamentoStatus.FALTOU }),
        mockAgendamento({ id: 'ag-3', status: AgendamentoStatus.CONFIRMADO }),
      ]);

      const result = await service.agendamentosPorStatus(
        { inicio: '2026-06-01', fim: '2026-06-07' },
        adminCtx,
      );

      expect(result.total).toBe(3);
      expect(result.porStatus['CONFIRMADO'].count).toBe(2);
      expect(result.porStatus['FALTOU'].count).toBe(1);
    });

    it('retorna porStatus vazio quando sem dados', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      const result = await service.agendamentosPorStatus({}, adminCtx);
      expect(result.total).toBe(0);
      expect(result.porStatus).toEqual({});
    });

    it('lança 400 quando período > 90 dias', async () => {
      await expect(
        service.agendamentosPorStatus(
          { inicio: '2025-01-01', fim: '2026-06-01' },
          adminCtx,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('usa default 7 dias quando sem filtros de data', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      const result = await service.agendamentosPorStatus({}, adminCtx);
      expect(result.periodo.inicio).toBeDefined();
      expect(result.periodo.fim).toBeDefined();
    });

    it('médico só recebe agendamentos da própria agenda', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      await service.agendamentosPorStatus(
        { inicio: '2026-06-01', fim: '2026-06-07' },
        medicoCtx,
      );

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe('prof-1');
    });
  });

  // -------------------------------------------------------------------------
  // pacientesCadastrados
  // -------------------------------------------------------------------------

  describe('pacientesCadastrados', () => {
    it('retorna lista de pacientes para admin', async () => {
      prismaMock.paciente.findMany.mockResolvedValue([mockPaciente()]);
      const result = await service.pacientesCadastrados(
        { inicio: '2026-06-01', fim: '2026-06-07' },
        adminCtx,
      );
      expect(result.total).toBe(1);
      expect(result.pacientes[0].cpf).toBe('12345678901');
    });

    it('retorna lista de pacientes para recepção', async () => {
      prismaMock.paciente.findMany.mockResolvedValue([mockPaciente()]);
      const result = await service.pacientesCadastrados({}, recepcaoCtx);
      expect(result.total).toBe(1);
    });

    it('lança 403 para médico', async () => {
      await expect(service.pacientesCadastrados({}, medicoCtx)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lança 403 para profissional não médico', async () => {
      await expect(
        service.pacientesCadastrados({}, profNaoMedicoCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('retorna lista vazia (não erro) quando sem dados', async () => {
      prismaMock.paciente.findMany.mockResolvedValue([]);
      const result = await service.pacientesCadastrados({}, adminCtx);
      expect(result.total).toBe(0);
      expect(result.pacientes).toEqual([]);
    });

    it('lança 400 quando período > 90 dias', async () => {
      await expect(
        service.pacientesCadastrados(
          { inicio: '2025-01-01', fim: '2026-06-01' },
          adminCtx,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // origemAgendamentos
  // -------------------------------------------------------------------------

  describe('origemAgendamentos', () => {
    it('calcula distribuição por origem corretamente', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([
        { id: 'ag-1', origem: AgendamentoOrigem.RECEPCAO },
        { id: 'ag-2', origem: AgendamentoOrigem.BOT_WHATSAPP },
        { id: 'ag-3', origem: AgendamentoOrigem.RECEPCAO },
        { id: 'ag-4', origem: AgendamentoOrigem.ADMIN },
      ]);

      const result = await service.origemAgendamentos(
        { inicio: '2026-06-01', fim: '2026-06-07' },
        adminCtx,
      );

      expect(result.total).toBe(4);
      const recepcao = result.distribuicao.find((d) => d.origem === 'RECEPCAO');
      expect(recepcao?.count).toBe(2);
      expect(recepcao?.percentual).toBe(50);
    });

    it('retorna distribuição vazia quando sem dados', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      const result = await service.origemAgendamentos({}, adminCtx);
      expect(result.total).toBe(0);
      expect(result.distribuicao).toEqual([]);
    });

    it('lança 400 quando período > 90 dias', async () => {
      await expect(
        service.origemAgendamentos(
          { inicio: '2025-01-01', fim: '2026-06-01' },
          adminCtx,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // exportExcel / exportPdf — permissão
  // -------------------------------------------------------------------------

  describe('exportExcel', () => {
    it('lança 403 para perfil recepção', async () => {
      await expect(
        service.exportExcel('agenda-dia', {}, recepcaoCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lança 403 para médico', async () => {
      await expect(
        service.exportExcel('origem', {}, medicoCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('gera StreamableFile para admin', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([mockAgendamento()]);
      const result = await service.exportExcel(
        'agenda-dia',
        { data: '2026-06-01' },
        adminCtx,
      );
      expect(result).toBeDefined();
    });
  });

  describe('exportPdf', () => {
    it('lança 403 para perfil recepção', async () => {
      await expect(
        service.exportPdf('pacientes', {}, recepcaoCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('gera StreamableFile (pdf) para admin — agenda-dia', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([mockAgendamento()]);
      const result = await service.exportPdf(
        'agenda-dia',
        { data: '2026-06-01' },
        adminCtx,
      );
      expect(result).toBeDefined();
    });

    it('gera StreamableFile (pdf) vazio para admin — sem dados', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      const result = await service.exportPdf(
        'origem',
        { inicio: '2026-06-01', fim: '2026-06-07' },
        adminCtx,
      );
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // PERIODO_MAX_DIAS constant
  // -------------------------------------------------------------------------

  it('PERIODO_MAX_DIAS está definido como 90', () => {
    expect(PERIODO_MAX_DIAS).toBe(90);
  });

  // -------------------------------------------------------------------------
  // Fix #1 — profissionalId no ctx do médico
  // -------------------------------------------------------------------------

  describe('médico com profissionalId resolvido no ctx (Fix #1)', () => {
    it('agendaDia usa profissionalId do ctx quando perfil é MEDICO', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      // medicoCtx já tem profissionalId: 'prof-1' — simula lookup feito pelo controller
      await service.agendaDia({ data: '2026-06-01' }, medicoCtx);

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe('prof-1');
    });

    it('agendamentosPorStatus usa profissionalId do ctx quando perfil é MEDICO', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      await service.agendamentosPorStatus(
        { inicio: '2026-06-01', fim: '2026-06-07' },
        medicoCtx,
      );

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe('prof-1');
    });

    it('origemAgendamentos usa profissionalId do ctx quando perfil é MEDICO', async () => {
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      await service.origemAgendamentos(
        { inicio: '2026-06-01', fim: '2026-06-07' },
        medicoCtx,
      );

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      expect(call.where.profissionalId).toBe('prof-1');
    });

    it('service aplica profissionalId=undefined quando ctx.profissionalId não está preenchido (simula bug pré-fix)', async () => {
      // Garante que Prisma receberia undefined se o controller não populasse profissionalId.
      // O service deve receber o valor já resolvido pelo controller — este teste
      // confirma que sem o lookup o where seria undefined (comportamento bugado).
      const ctxSemVinculo: CallerCtx = {
        usuarioId: 'user-medico',
        perfil: PerfilTipo.MEDICO,
        ip: '127.0.0.1',
        traceId: 'trace-bug',
        // profissionalId omitido — simula estado pré-fix
      };
      prismaMock.agendamento.findMany.mockResolvedValue([]);
      await service.agendaDia({ data: '2026-06-01' }, ctxSemVinculo);

      const call = prismaMock.agendamento.findMany.mock.calls[0][0];
      // Sem o fix do controller, profissionalId seria undefined — filtro não funciona
      expect(call.where.profissionalId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Fix #4 — DTO rejeita ISO datetime completo
  // -------------------------------------------------------------------------

  describe('QueryRelatorioDto — validação de formato de data (Fix #4)', () => {
    it('aceita data no formato YYYY-MM-DD', async () => {
      const dto = Object.assign(new QueryRelatorioDto(), {
        inicio: '2026-06-01',
        fim: '2026-06-07',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejeita ISO datetime completo 2026-06-01T00:00:00Z com erro de validação', async () => {
      const dto = Object.assign(new QueryRelatorioDto(), {
        inicio: '2026-06-01T00:00:00Z',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const constraints = errors[0].constraints ?? {};
      const messages = Object.values(constraints).join(' ');
      expect(messages).toMatch(/YYYY-MM-DD/);
    });

    it('rejeita ISO datetime com offset 2026-06-01T00:00:00-04:00', async () => {
      const dto = Object.assign(new QueryRelatorioDto(), {
        fim: '2026-06-01T00:00:00-04:00',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejeita string de data inválida', async () => {
      const dto = Object.assign(new QueryRelatorioDto(), {
        inicio: 'not-a-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('QueryAgendaDiaDto — validação de formato de data (Fix #4)', () => {
    it('aceita data no formato YYYY-MM-DD', async () => {
      const dto = Object.assign(new QueryAgendaDiaDto(), {
        data: '2026-06-15',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejeita ISO datetime completo 2026-06-01T00:00:00Z', async () => {
      const dto = Object.assign(new QueryAgendaDiaDto(), {
        data: '2026-06-01T00:00:00Z',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const constraints = errors[0].constraints ?? {};
      const messages = Object.values(constraints).join(' ');
      expect(messages).toMatch(/YYYY-MM-DD/);
    });
  });
});
