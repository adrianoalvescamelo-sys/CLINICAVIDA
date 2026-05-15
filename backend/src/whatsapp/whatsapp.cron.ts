import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  AgendamentoStatus,
  MensagemStatus,
  MensagemTipo,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';

const STATUS_ELEGIVEIS: AgendamentoStatus[] = [
  AgendamentoStatus.SOLICITADO,
  AgendamentoStatus.PRE_AGENDAMENTO,
  AgendamentoStatus.CONFIRMADO,
];

@Injectable()
export class WhatsappCron {
  private readonly logger = new Logger(WhatsappCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'wa-confirmacao-24h' })
  async scanConfirmacao24h() {
    if (!this.config.get<boolean>('whatsapp.enabled')) return;
    const horas = this.config.get<number>('whatsapp.confirmacaoHorasAntes')!;
    const inicio = new Date(Date.now() + (horas - 0.25) * 3_600_000);
    const fim = new Date(Date.now() + (horas + 0.25) * 3_600_000);

    const candidatos = await this.prisma.agendamento.findMany({
      where: {
        dataHoraInicio: { gte: inicio, lte: fim },
        status: { in: STATUS_ELEGIVEIS },
        mensagens: { none: { tipo: MensagemTipo.CONFIRMACAO_24H } },
      },
      include: { paciente: true },
      take: 200,
    });

    for (const ag of candidatos) {
      const msg = await this.whatsapp.enfileirar({
        agendamentoId: ag.id,
        pacienteId: ag.pacienteId,
        telefone: ag.paciente.telefoneWhatsapp,
        tipo: MensagemTipo.CONFIRMACAO_24H,
        texto: this.tplConfirmacao24h(
          ag.paciente.nomeCompleto,
          ag.dataHoraInicio,
        ),
        vars: {
          paciente: ag.paciente.nomeCompleto,
          quando: ag.dataHoraInicio.toISOString(),
        },
        eventId: `conf24-${ag.id}`,
      });
      if (msg) await this.whatsapp.enviar(msg.id);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'wa-lembrete-2h' })
  async scanLembrete2h() {
    if (!this.config.get<boolean>('whatsapp.enabled')) return;
    const horas = this.config.get<number>('whatsapp.lembreteHorasAntes')!;
    const inicio = new Date(Date.now() + (horas - 0.25) * 3_600_000);
    const fim = new Date(Date.now() + (horas + 0.25) * 3_600_000);

    const candidatos = await this.prisma.agendamento.findMany({
      where: {
        dataHoraInicio: { gte: inicio, lte: fim },
        status: { in: STATUS_ELEGIVEIS },
        mensagens: { none: { tipo: MensagemTipo.LEMBRETE_2H } },
      },
      include: { paciente: true },
      take: 200,
    });

    for (const ag of candidatos) {
      const msg = await this.whatsapp.enfileirar({
        agendamentoId: ag.id,
        pacienteId: ag.pacienteId,
        telefone: ag.paciente.telefoneWhatsapp,
        tipo: MensagemTipo.LEMBRETE_2H,
        texto: this.tplLembrete2h(ag.paciente.nomeCompleto, ag.dataHoraInicio),
        eventId: `lemb2-${ag.id}`,
      });
      if (msg) await this.whatsapp.enviar(msg.id);
    }
  }

  @Cron('*/2 * * * *', { name: 'wa-retry-fila' })
  async retryPendentes() {
    const agora = new Date();
    const pendentes = await this.prisma.mensagemWhatsapp.findMany({
      where: {
        status: MensagemStatus.PENDENTE,
        OR: [{ proximoRetryEm: null }, { proximoRetryEm: { lte: agora } }],
        tentativas: { gt: 0 },
      },
      take: 50,
    });

    for (const msg of pendentes) {
      await this.whatsapp.enviar(msg.id);
    }
  }

  private tplConfirmacao24h(nome: string, quando: Date) {
    return (
      `Olá ${nome.split(' ')[0]}! Lembrete: você tem consulta agendada na Clínica Vida em ` +
      `${quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. ` +
      `Confirma sua presença? Responda SIM ou NÃO.`
    );
  }

  private tplLembrete2h(nome: string, quando: Date) {
    return (
      `${nome.split(' ')[0]}, sua consulta na Clínica Vida é em ` +
      `${quando.toLocaleString('pt-BR', { timeStyle: 'short' })}. ` +
      `Ainda não recebemos sua confirmação. Responda SIM para confirmar.`
    );
  }
}
