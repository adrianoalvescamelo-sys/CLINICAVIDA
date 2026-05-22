import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

  private async ehMedico(user: AuthUser): Promise<boolean> {
    const prof = await this.prisma.profissional.findUnique({
      where: { usuarioId: user.id },
      select: { ehMedico: true },
    });
    if (prof) return prof.ehMedico;
    return user.perfil === 'MEDICO';
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
    if (tipo === TipoDocumento.ATESTADO) {
      if (typeof c.diasAfastamento !== 'number' || c.diasAfastamento < 1)
        erro();
    } else if (tipo === TipoDocumento.RECEITA) {
      const m = c.medicamentos;
      if (!Array.isArray(m) || m.length === 0) erro();
    } else if (tipo === TipoDocumento.PEDIDO_EXAME) {
      const e = c.exames;
      if (!Array.isArray(e) || e.length === 0) erro();
    } else if (tipo === TipoDocumento.ORIENTACOES) {
      if (typeof c.texto !== 'string' || c.texto.trim() === '') erro();
    }
  }

  async criarDocumento(
    pacienteId: string,
    dto: CriarDocumentoDto,
    user: AuthUser,
    ip: string,
    trace: string,
  ) {
    const autorEhMedico = await this.ehMedico(user);

    if (SO_MEDICO.includes(dto.tipo) && !autorEhMedico) {
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

    const paciente = await this.prisma.paciente.findUnique({
      where: { id: pacienteId },
      select: { nomeCompleto: true },
    });
    if (!paciente) {
      throw new BadRequestException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }

    const pdf = await gerarDocumentoPdf({
      tipo: dto.tipo,
      paciente: paciente.nomeCompleto,
      autor: user.email,
      conteudo: dto.conteudo,
    });

    const doc = await this.prisma.$transaction((tx) =>
      tx.documentoMedico.create({
        data: {
          pacienteId,
          autorUsuarioId: user.id,
          autorEhMedico,
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
}
