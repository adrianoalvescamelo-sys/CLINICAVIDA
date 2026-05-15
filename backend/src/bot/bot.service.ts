import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  AuditResultado,
  PerfilTipo,
  Sexo,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgendaService } from '../agenda/agenda.service';
import { PreAgendamentoBotDto } from './dto/pre-agendamento.dto';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agenda: AgendaService,
  ) {}

  async preAgendamento(dto: PreAgendamentoBotDto, ip: string, traceId: string) {
    const paciente = await this.encontrarOuCriarPaciente(dto, traceId);

    const ag = await this.agenda.create(
      {
        pacienteId: paciente.id,
        profissionalId: dto.profissionalId,
        dataHoraInicio: dto.dataHoraInicio,
        dataHoraFim: dto.dataHoraFim,
        tipo: dto.tipo,
        observacoes: dto.observacoes,
      },
      {
        usuarioId: paciente.id,
        perfil: PerfilTipo.RECEPCAO,
        ip,
        traceId,
      },
      {
        origem: AgendamentoOrigem.BOT_WHATSAPP,
        statusInicial: AgendamentoStatus.PRE_AGENDAMENTO,
        eventId: dto.eventId,
      },
    );

    await this.audit.log({
      usuarioId: null,
      acao: 'PRE_AGENDAMENTO_BOT',
      entidade: 'Agendamento',
      registroId: ag.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
      detalhes: { eventId: dto.eventId, pacienteId: paciente.id },
    });

    return ag;
  }

  private async encontrarOuCriarPaciente(
    dto: PreAgendamentoBotDto,
    traceId: string,
  ) {
    const existente = await this.prisma.paciente.findUnique({
      where: { cpf: dto.cpf },
    });
    if (existente && !existente.deletedAt) return existente;
    if (existente && existente.deletedAt) {
      throw new BadRequestException({
        code: 'PACIENTE_INATIVO',
        message:
          'Paciente com este CPF está inativo. Entre em contato com a recepção.',
      });
    }

    if (!dto.nomeCompleto || !dto.telefoneWhatsapp || !dto.dataNascimento) {
      throw new BadRequestException({
        code: 'PACIENTE_INCOMPLETO',
        message:
          'Paciente não cadastrado. Bot deve enviar nome, telefone e data de nascimento.',
      });
    }

    this.logger.log({ traceId, cpf: dto.cpf }, 'Bot criando novo paciente');

    return this.prisma.paciente.create({
      data: {
        cpf: dto.cpf,
        nomeCompleto: dto.nomeCompleto,
        dataNascimento: new Date(dto.dataNascimento),
        telefoneWhatsapp: dto.telefoneWhatsapp,
        sexo: Sexo.NAO_INFORMADO,
      },
    });
  }
}
