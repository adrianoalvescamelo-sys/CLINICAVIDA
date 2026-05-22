import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado, TipoDocumento } from '@prisma/client';
import { DocumentosService } from './documentos.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { gerarDocumentoPdf } from './documentos.pdf';

jest.mock('./documentos.pdf', () => ({
  gerarDocumentoPdf: jest.fn(async () => Buffer.from('%PDF-mock')),
}));
const gerarPdfMock = gerarDocumentoPdf as jest.MockedFunction<
  typeof gerarDocumentoPdf
>;

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
    paciente: { findUnique: jest.fn(), findFirst: jest.fn() },
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
      prisma.profissional.findUnique.mockResolvedValue({
        ehMedico: true,
        nomeCompleto: 'Dra. Ana',
        registroConselho: 'CRM-MT 1234',
      });
      prisma.paciente.findFirst.mockResolvedValue({ nomeCompleto: 'Fulano' });
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
      // TD-DOC-5: PDF usa nome do profissional (+ registro), não email
      expect(gerarPdfMock).toHaveBeenCalledWith(
        expect.objectContaining({ autor: 'Dra. Ana (CRM-MT 1234)' }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'GERACAO_DOCUMENTO',
          resultado: AuditResultado.SUCESSO,
        }),
      );
    });

    it('autor sem registro de profissional usa email (fallback)', async () => {
      prisma.profissional.findUnique.mockResolvedValue(null);
      prisma.paciente.findFirst.mockResolvedValue({ nomeCompleto: 'Fulano' });
      prisma._tx.documentoMedico.create.mockResolvedValue({ id: DOC });
      await service.criarDocumento(
        PAC,
        { tipo: TipoDocumento.ORIENTACOES, conteudo: { texto: 'x' } } as never,
        MEDICO as never,
        'ip',
        't',
      );
      expect(gerarPdfMock).toHaveBeenCalledWith(
        expect.objectContaining({ autor: MEDICO.email }),
      );
    });

    it('texto de ORIENTACOES acima do limite → 400 (TD-DOC-6)', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma.paciente.findFirst.mockResolvedValue({ nomeCompleto: 'F' });
      await expect(
        service.criarDocumento(
          PAC,
          {
            tipo: TipoDocumento.ORIENTACOES,
            conteudo: { texto: 'a'.repeat(5001) },
          } as never,
          MEDICO as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
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

    it('não-médico tentando RECEITA: audita NEGADO', async () => {
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
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'GERACAO_DOCUMENTO',
          resultado: AuditResultado.NEGADO,
        }),
      );
    });

    it('paciente inexistente ou soft-deletado → 404', async () => {
      prisma.profissional.findUnique.mockResolvedValue({ ehMedico: true });
      prisma.paciente.findFirst.mockResolvedValue(null);
      await expect(
        service.criarDocumento(
          PAC,
          {
            tipo: TipoDocumento.ORIENTACOES,
            conteudo: { texto: 'x' },
          } as never,
          MEDICO as never,
          'ip',
          't',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
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

  describe('listar', () => {
    it('médico lista todos do paciente (sem filtro de autor) e audita', async () => {
      prisma.paciente.findFirst.mockResolvedValue({ id: PAC });
      prisma.documentoMedico.findMany.mockResolvedValue([{ id: DOC }]);
      const r = await service.listar(PAC, MEDICO as never, 'ip', 't');
      expect(r).toHaveLength(1);
      const whereArg = prisma.documentoMedico.findMany.mock.calls[0][0].where;
      expect(whereArg.pacienteId).toBe(PAC);
      expect(whereArg.autorUsuarioId).toBeUndefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'VISUALIZACAO_DOCUMENTO' }),
      );
    });

    it('não-médico lista só os próprios (filtro autorUsuarioId)', async () => {
      prisma.paciente.findFirst.mockResolvedValue({ id: PAC });
      prisma.documentoMedico.findMany.mockResolvedValue([]);
      await service.listar(PAC, NAOMED as never, 'ip', 't');
      const whereArg = prisma.documentoMedico.findMany.mock.calls[0][0].where;
      expect(whereArg.autorUsuarioId).toBe(NAOMED.id);
    });

    it('paciente inexistente ou soft-deletado → 404 (TD-DOC-3)', async () => {
      prisma.paciente.findFirst.mockResolvedValue(null);
      await expect(
        service.listar(PAC, MEDICO as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.documentoMedico.findMany).not.toHaveBeenCalled();
    });
  });

  describe('obter', () => {
    it('retorna metadados (sem pdf) e audita', async () => {
      prisma.documentoMedico.findUnique.mockResolvedValue({
        id: DOC,
        autorUsuarioId: MEDICO.id,
      });
      const r = await service.obter(DOC, MEDICO as never, 'ip', 't');
      expect(r.id).toBe(DOC);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'VISUALIZACAO_DOCUMENTO',
          registroId: DOC,
        }),
      );
    });

    it('não-médico obtendo doc de outro → 404', async () => {
      prisma.documentoMedico.findUnique.mockResolvedValue({
        id: DOC,
        autorUsuarioId: 'outro',
      });
      await expect(
        service.obter(DOC, NAOMED as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('baixarPdf', () => {
    it('retorna pdf+tipo e audita DOWNLOAD_DOCUMENTO', async () => {
      const pdf = Buffer.from('%PDF-1.3 fake');
      prisma.documentoMedico.findUnique.mockResolvedValue({
        id: DOC,
        autorUsuarioId: MEDICO.id,
        tipo: TipoDocumento.RECEITA,
        pdf,
      });
      const r = await service.baixarPdf(DOC, MEDICO as never, 'ip', 't');
      expect(r.pdf).toBe(pdf);
      expect(r.tipo).toBe(TipoDocumento.RECEITA);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'DOWNLOAD_DOCUMENTO',
          registroId: DOC,
        }),
      );
    });

    it('não-médico baixando doc de outro → 404', async () => {
      prisma.documentoMedico.findUnique.mockResolvedValue({
        id: DOC,
        autorUsuarioId: 'outro',
        tipo: TipoDocumento.RECEITA,
        pdf: Buffer.from('x'),
      });
      await expect(
        service.baixarPdf(DOC, NAOMED as never, 'ip', 't'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
