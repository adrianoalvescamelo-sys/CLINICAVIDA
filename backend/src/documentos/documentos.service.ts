import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado, Prisma, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CriarDocumentoDto } from './dto/criar-documento.dto';
import { gerarDocumentoPdf } from './documentos.pdf';

const SO_MEDICO: TipoDocumento[] = [
  TipoDocumento.RECEITA,
  TipoDocumento.ATESTADO,
];

@Injectable()
export class DocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async dadosAutor(
    user: AuthUser,
  ): Promise<{ ehMedico: boolean; nome: string }> {
    const prof = await this.prisma.profissional.findUnique({
      where: { usuarioId: user.id },
      select: { ehMedico: true, nomeCompleto: true, registroConselho: true },
    });
    if (prof) {
      const reg = prof.registroConselho ? ` (${prof.registroConselho})` : '';
      return { ehMedico: prof.ehMedico, nome: `${prof.nomeCompleto}${reg}` };
    }
    return { ehMedico: user.perfil === 'MEDICO', nome: user.email };
  }

  private isMedicoOuAdmin(user: AuthUser): boolean {
    return user.perfil === 'MEDICO' || user.perfil === 'ADMIN';
  }

  private validarConteudo(tipo: TipoDocumento, c: Record<string, unknown>) {
    const erro = () => {
      throw new BadRequestException({
        code: 'CONTEUDO_INVALIDO',
        message: `Conteúdo inválido para ${tipo}`,
      });
    };
    // Limites de comprimento (TD-DOC-6): evita overflow/abuso em texto livre
    const tooLong = (v: unknown, max: number) =>
      typeof v === 'string' && v.length > max;
    if (tipo === TipoDocumento.ATESTADO) {
      if (typeof c.diasAfastamento !== 'number' || c.diasAfastamento < 1)
        erro();
      if (tooLong(c.motivo, 500) || tooLong(c.cid, 10)) erro();
    } else if (tipo === TipoDocumento.RECEITA) {
      const m = c.medicamentos;
      if (!Array.isArray(m) || m.length === 0 || m.length > 50) erro();
      for (const item of m as { nome?: unknown; posologia?: unknown }[]) {
        if (tooLong(item?.nome, 200) || tooLong(item?.posologia, 500)) erro();
      }
    } else if (tipo === TipoDocumento.PEDIDO_EXAME) {
      const e = c.exames;
      if (!Array.isArray(e) || e.length === 0 || e.length > 50) erro();
      for (const ex of e as unknown[]) if (tooLong(ex, 200)) erro();
    } else if (tipo === TipoDocumento.ORIENTACOES) {
      if (typeof c.texto !== 'string' || c.texto.trim() === '') erro();
      if (tooLong(c.texto, 5000)) erro();
    }
  }

  async criarDocumento(
    pacienteId: string,
    dto: CriarDocumentoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const autor = await this.dadosAutor(user);

    if (SO_MEDICO.includes(dto.tipo) && !autor.ehMedico) {
      await this.audit.log({
        usuarioId: user.id,
        acao: 'GERACAO_DOCUMENTO',
        entidade: 'DocumentoMedico',
        registroId: null,
        ipDispositivo: ip,
        resultado: AuditResultado.NEGADO,
        traceId: trace,
        detalhes: { tipo: dto.tipo, pacienteId } as Prisma.InputJsonValue,
      });
      throw new ForbiddenException({
        code: 'PERFIL_NAO_AUTORIZADO_DOCUMENTO',
        message: 'Apenas médico pode emitir receita ou atestado',
      });
    }

    this.validarConteudo(dto.tipo, dto.conteudo);

    if (dto.agendamentoId) {
      const ag = await this.prisma.agendamento.findUnique({
        where: { id: dto.agendamentoId },
        select: { id: true, pacienteId: true },
      });
      if (!ag || ag.pacienteId !== pacienteId) {
        throw new BadRequestException({
          code: 'AGENDAMENTO_INVALIDO',
          message: 'Agendamento não pertence ao paciente',
        });
      }
    }

    const paciente = await this.prisma.paciente.findFirst({
      where: { id: pacienteId, deletedAt: null },
      select: { nomeCompleto: true },
    });
    if (!paciente) {
      throw new NotFoundException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }

    const pdf = await gerarDocumentoPdf({
      tipo: dto.tipo,
      paciente: paciente.nomeCompleto,
      autor: autor.nome,
      conteudo: dto.conteudo,
    });

    const doc = await this.prisma.$transaction((tx) =>
      tx.documentoMedico.create({
        data: {
          pacienteId,
          autorUsuarioId: user.id,
          autorEhMedico: autor.ehMedico,
          agendamentoId: dto.agendamentoId,
          tipo: dto.tipo,
          conteudo: dto.conteudo as Prisma.InputJsonValue,
          pdf,
        },
        select: {
          id: true,
          tipo: true,
          conteudo: true,
          pacienteId: true,
          autorUsuarioId: true,
          autorEhMedico: true,
          agendamentoId: true,
          createdAt: true,
        },
      }),
    );

    await this.audit.log({
      usuarioId: user.id,
      acao: 'GERACAO_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: doc.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { tipo: dto.tipo, pacienteId } as Prisma.InputJsonValue,
    });

    return doc;
  }

  private readonly metaSelect = {
    id: true,
    tipo: true,
    conteudo: true,
    pacienteId: true,
    autorUsuarioId: true,
    autorEhMedico: true,
    agendamentoId: true,
    createdAt: true,
  };

  async listar(pacienteId: string, user: AuthUser, ip: string, trace: string) {
    const paciente = await this.prisma.paciente.findFirst({
      where: { id: pacienteId, deletedAt: null },
      select: { id: true },
    });
    if (!paciente) {
      throw new NotFoundException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }
    const where: Prisma.DocumentoMedicoWhereInput = { pacienteId };
    if (!this.isMedicoOuAdmin(user)) {
      where.autorUsuarioId = user.id;
    }
    const docs = await this.prisma.documentoMedico.findMany({
      where,
      select: this.metaSelect,
      orderBy: { createdAt: 'desc' },
    });

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: null,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
      detalhes: { pacienteId } as Prisma.InputJsonValue,
    });

    return docs;
  }

  async obter(id: string, user: AuthUser, ip: string, trace: string) {
    const doc = await this.prisma.documentoMedico.findUnique({
      where: { id },
      select: this.metaSelect,
    });
    if (
      !doc ||
      (!this.isMedicoOuAdmin(user) && doc.autorUsuarioId !== user.id)
    ) {
      throw new NotFoundException({
        code: 'DOCUMENTO_NAO_ENCONTRADO',
        message: 'Documento não encontrado',
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'VISUALIZACAO_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: doc.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
    });

    return doc;
  }

  async baixarPdf(id: string, user: AuthUser, ip: string, trace: string) {
    const doc = await this.prisma.documentoMedico.findUnique({
      where: { id },
      select: { id: true, autorUsuarioId: true, tipo: true, pdf: true },
    });
    if (
      !doc ||
      (!this.isMedicoOuAdmin(user) && doc.autorUsuarioId !== user.id)
    ) {
      throw new NotFoundException({
        code: 'DOCUMENTO_NAO_ENCONTRADO',
        message: 'Documento não encontrado',
      });
    }

    await this.audit.log({
      usuarioId: user.id,
      acao: 'DOWNLOAD_DOCUMENTO',
      entidade: 'DocumentoMedico',
      registroId: doc.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId: trace,
    });

    return { pdf: doc.pdf as Buffer, tipo: doc.tipo };
  }
}
