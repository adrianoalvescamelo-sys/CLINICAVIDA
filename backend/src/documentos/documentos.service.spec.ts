import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditResultado, TipoDocumento } from '@prisma/client';
import { DocumentosService } from './documentos.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const PAC = '22222222-2222-4222-8222-222222222222';
const AG = '33333333-3333-4333-8333-333333333333';
const DOC = '66666666-6666-4666-8666-666666666666';
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
    documentoMedico: { create: jest.fn() },
    auditoria: { create: jest.fn() },
  };
  return {
    documentoMedico: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    agendamento: { findUnique: jest.fn() },
    profissional: { findUnique: jest.fn() },
    paciente: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    _tx: tx,
  };
}
function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('DocumentosService', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(async () => {
    prisma = makePrisma();
    audit = makeAudit();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentosService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = mod.get(DocumentosService);
  });
  afterEach(() => jest.clearAllMocks());

  describe('criarDocumento', () => {
    it('médico cria ORIENTACOES: gera PDF, persiste, audita', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma.paciente.findUnique.mockResolvedValue({ nomeCompleto: 'Fulano' });
      prisma._tx.documentoMedico.create.mockResolvedValue({
        id: DOC,
        tipo: TipoDocumento.ORIENTACOES,
        pacienteId: PAC,
      });

      const r = await service.criarDocumento(
        PAC,
        {
          tipo: TipoDocumento.ORIENTACOES,
          conteudo: { texto: 'Repouso' },
        } as never,
        MEDICO as never,
        'ip',
        't',
      );

      expect(r.id).toBe(DOC);
      expect((r as Record<string, unknown>).pdf).toBeUndefined();
      const createArg = prisma._tx.documentoMedico.create.mock.calls[0][0];
      expect(Buffer.isBuffer(createArg.data.pdf)).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'GERACAO_DOCUMENTO',
          resultado: AuditResultado.SUCESSO,
        }),
      );
    });

    it('não-médico tentando RECEITA → 403', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: false });
      await expect(
        service.criarDocumento(
          PAC,
          {
            tipo: TipoDocumento.RECEITA,
            conteudo: { medicamentos: [{ nome: 'x', posologia: 'y' }] },
          } as never,
          NAOMED as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma._tx.documentoMedico.create).not.toHaveBeenCalled();
    });

    it('conteúdo inválido p/ ATESTADO (sem diasAfastamento) → 400', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      await expect(
        service.criarDocumento(
          PAC,
          { tipo: TipoDocumento.ATESTADO, conteudo: {} } as never,
          MEDICO as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('agendamento de outro paciente → 400', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma.agendamento.findUnique.mockResolvedValue({
        id: AG,
        pacienteId: 'outro',
      });
      await expect(
        service.criarDocumento(
          PAC,
          {
            tipo: TipoDocumento.ORIENTACOES,
            agendamentoId: AG,
            conteudo: { texto: 'x' },
          } as never,
          MEDICO as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
