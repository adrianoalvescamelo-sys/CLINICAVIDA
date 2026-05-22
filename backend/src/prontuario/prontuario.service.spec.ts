import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado } from '@prisma/client';
import { ProntuarioService } from './prontuario.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const PAC = '22222222-2222-4222-8222-222222222222';
const AG = '33333333-3333-4333-8333-333333333333';
const PRONT = '44444444-4444-4444-8444-444444444444';
const EVO = '55555555-5555-4555-8555-555555555555';
const MEDICO = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'm@x',
  perfil: 'MEDICO',
};
const NAOMED = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'n@x',
  perfil: 'PROFISSIONAL_NAO_MEDICO',
};

function makePrisma() {
  const tx = {
    prontuario: { findUnique: jest.fn(), create: jest.fn() },
    evolucao: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    auditoria: { create: jest.fn() },
  };
  return {
    ...tx,
    agendamento: { findUnique: jest.fn() },
    profissional: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
}
function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('ProntuarioService', () => {
  let service: ProntuarioService;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(async () => {
    prisma = makePrisma();
    audit = makeAudit();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProntuarioService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = mod.get(ProntuarioService);
  });
  afterEach(() => jest.clearAllMocks());

  describe('criarEvolucao', () => {
    it('cria evolução vinculada ao agendamento do paciente, autor=usuário, audita', async () => {
      prisma.agendamento.findUnique.mockResolvedValue({ id: AG, pacienteId: PAC });
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma.prontuario.findUnique.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.create.mockResolvedValue({ id: EVO, prontuarioId: PRONT, versao: 1 });

      const dto = {
        agendamentoId: AG,
        subjetivo: 's',
        objetivo: 'o',
        avaliacao: 'a',
        plano: 'p',
      };
      const r = await service.criarEvolucao(
        PAC,
        dto as never,
        MEDICO as never,
        '1.2.3.4',
        'trace-1',
      );

      expect(r.id).toBe(EVO);
      expect(prisma.evolucao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prontuarioId: PRONT,
            agendamentoId: AG,
            autorUsuarioId: MEDICO.id,
            autorEhMedico: true,
            versao: 1,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'CRIACAO_EVOLUCAO',
          resultado: AuditResultado.SUCESSO,
        }),
      );
    });

    it('cria prontuário lazy quando ainda não existe', async () => {
      prisma.agendamento.findUnique.mockResolvedValue({ id: AG, pacienteId: PAC });
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: false });
      prisma.prontuario.findUnique.mockResolvedValue(null);
      prisma.prontuario.create.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.create.mockResolvedValue({ id: EVO, prontuarioId: PRONT, versao: 1 });

      await service.criarEvolucao(
        PAC,
        {
          agendamentoId: AG,
          subjetivo: 's',
          objetivo: 'o',
          avaliacao: 'a',
          plano: 'p',
        } as never,
        NAOMED as never,
        'ip',
        't',
      );

      expect(prisma.prontuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pacienteId: PAC }),
        }),
      );
    });

    it('rejeita quando agendamento não pertence ao paciente (400)', async () => {
      prisma.agendamento.findUnique.mockResolvedValue({ id: AG, pacienteId: 'outro' });
      await expect(
        service.criarEvolucao(
          PAC,
          {
            agendamentoId: AG,
            subjetivo: 's',
            objetivo: 'o',
            avaliacao: 'a',
            plano: 'p',
          } as never,
          MEDICO as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.evolucao.create).not.toHaveBeenCalled();
    });
  });

  describe('listarProntuario', () => {
    it('médico vê todas as evoluções atuais e audita visualização', async () => {
      prisma.prontuario.findUnique.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.findMany.mockResolvedValue([{ id: EVO }]);

      const r = await service.listarProntuario(PAC, MEDICO as never, 'ip', 't');

      expect(r.evolucoes).toHaveLength(1);
      expect(prisma.evolucao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ prontuarioId: PRONT, replacedBy: null }),
        }),
      );
      const whereArg = prisma.evolucao.findMany.mock.calls[0][0].where;
      expect(whereArg.autorUsuarioId).toBeUndefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'VISUALIZACAO_PRONTUARIO' }),
      );
    });

    it('não-médico só vê as próprias evoluções (filtro autorUsuarioId)', async () => {
      prisma.prontuario.findUnique.mockResolvedValue({ id: PRONT, pacienteId: PAC });
      prisma.evolucao.findMany.mockResolvedValue([]);

      await service.listarProntuario(PAC, NAOMED as never, 'ip', 't');

      const whereArg = prisma.evolucao.findMany.mock.calls[0][0].where;
      expect(whereArg.autorUsuarioId).toBe(NAOMED.id);
    });

    it('prontuário inexistente: retorna evoluções vazias (não 404)', async () => {
      prisma.prontuario.findUnique.mockResolvedValue(null);
      const r = await service.listarProntuario(PAC, MEDICO as never, 'ip', 't');
      expect(r.evolucoes).toEqual([]);
    });
  });

  describe('obterEvolucao', () => {
    it('retorna evolução e audita VISUALIZACAO_EVOLUCAO', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({ id: EVO, autorUsuarioId: MEDICO.id });
      const r = await service.obterEvolucao(EVO, MEDICO as never, 'ip', 't');
      expect(r.id).toBe(EVO);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'VISUALIZACAO_EVOLUCAO', registroId: EVO }),
      );
    });

    it('não-médico tentando ler evolução de outro: 404', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({ id: EVO, autorUsuarioId: 'outro' });
      await expect(
        service.obterEvolucao(EVO, NAOMED as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('evolução inexistente: 404', async () => {
      prisma.evolucao.findUnique.mockResolvedValue(null);
      await expect(
        service.obterEvolucao(EVO, MEDICO as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('retificar', () => {
    const dto = { subjetivo: 's2', objetivo: 'o2', avaliacao: 'a2', plano: 'p2' };

    it('cria nova versão com replacesId e versao+1, audita', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({
        id: EVO,
        prontuarioId: PRONT,
        agendamentoId: AG,
        autorUsuarioId: MEDICO.id,
        autorEhMedico: true,
        versao: 1,
        replacedBy: null,
      });
      prisma.evolucao.create.mockResolvedValue({ id: 'nova', versao: 2, replacesId: EVO });

      const r = await service.retificar(EVO, dto as never, MEDICO as never, 'ip', 't');

      expect(prisma.evolucao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            replacesId: EVO,
            versao: 2,
            prontuarioId: PRONT,
            autorUsuarioId: MEDICO.id,
          }),
        }),
      );
      expect(r.versao).toBe(2);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'RETIFICACAO_EVOLUCAO' }),
      );
    });

    it('retificar de outro autor: 403', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({
        id: EVO,
        autorUsuarioId: 'outro',
        versao: 1,
        replacedBy: null,
      });
      await expect(
        service.retificar(EVO, dto as never, MEDICO as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('retificar versão já substituída: 409', async () => {
      prisma.evolucao.findUnique.mockResolvedValue({
        id: EVO,
        autorUsuarioId: MEDICO.id,
        versao: 1,
        replacedBy: { id: 'nova' },
      });
      await expect(
        service.retificar(EVO, dto as never, MEDICO as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('evolução inexistente: 404', async () => {
      prisma.evolucao.findUnique.mockResolvedValue(null);
      await expect(
        service.retificar(EVO, dto as never, MEDICO as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
