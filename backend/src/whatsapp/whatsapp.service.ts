import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  AgendamentoStatus,
  AuditResultado,
  MensagemDirecao,
  MensagemStatus,
  MensagemTipo,
  Prisma,
} from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface EnfileirarOpts {
  agendamentoId?: string;
  pacienteId?: string;
  telefone: string;
  tipo: MensagemTipo;
  texto: string;
  vars?: Record<string, unknown>;
  eventId?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async enfileirar(opts: EnfileirarOpts) {
    if (!this.config.get<boolean>('whatsapp.enabled')) {
      this.logger.warn('WhatsApp desabilitado por config');
      return null;
    }

    const eventId = opts.eventId ?? uuid();
    const existente = await this.prisma.mensagemWhatsapp.findUnique({
      where: { eventId },
    });
    if (existente) return existente;

    return this.prisma.mensagemWhatsapp.create({
      data: {
        pacienteId: opts.pacienteId,
        agendamentoId: opts.agendamentoId,
        telefone: opts.telefone,
        direcao: MensagemDirecao.OUTBOUND,
        tipo: opts.tipo,
        status: MensagemStatus.PENDENTE,
        eventId,
        payload: {
          texto: opts.texto,
          vars: opts.vars ?? {},
        } as Prisma.InputJsonValue,
      },
    });
  }

  async enviar(mensagemId: string): Promise<void> {
    const msg = await this.prisma.mensagemWhatsapp.findUnique({
      where: { id: mensagemId },
    });
    if (!msg) {
      throw new NotFoundException({
        code: 'MENSAGEM_NAO_ENCONTRADA',
        message: 'Mensagem não encontrada',
      });
    }
    if (
      msg.status !== MensagemStatus.PENDENTE &&
      msg.status !== MensagemStatus.FALHA
    ) {
      return;
    }

    const maxTentativas = this.config.get<number>('whatsapp.maxTentativas')!;
    const webhookUrl = this.config.get<string>('whatsapp.n8nWebhookUrl')!;
    const timeoutMs = this.config.get<number>('whatsapp.n8nTimeoutMs')!;
    const dryRun = this.config.get<boolean>('whatsapp.dryRun');

    const payload = msg.payload as { texto: string; vars?: unknown };
    const body = {
      eventId: msg.eventId,
      to: msg.telefone,
      tipo: msg.tipo,
      texto: payload.texto,
      vars: payload.vars,
      agendamentoId: msg.agendamentoId,
    };

    try {
      if (dryRun || !webhookUrl) {
        this.logger.log(
          { msgId: msg.id, dryRun: true, body },
          'WhatsApp DRY-RUN — pulando envio HTTP',
        );
      } else {
        await firstValueFrom(
          this.http.post(webhookUrl, body, { timeout: timeoutMs }),
        );
      }

      await this.prisma.mensagemWhatsapp.update({
        where: { id: msg.id },
        data: {
          status: MensagemStatus.ENVIADA,
          tentativas: msg.tentativas + 1,
          enviadaEm: new Date(),
          proximoRetryEm: null,
          erro: null,
        },
      });
    } catch (err: unknown) {
      const tentativas = msg.tentativas + 1;
      const motivo =
        err instanceof Error ? err.message : 'erro desconhecido n8n';
      const falhouTudo = tentativas >= maxTentativas;
      const backoffMs = Math.min(60_000 * Math.pow(2, tentativas - 1), 600_000);

      await this.prisma.mensagemWhatsapp.update({
        where: { id: msg.id },
        data: {
          status: falhouTudo ? MensagemStatus.FALHA : MensagemStatus.PENDENTE,
          tentativas,
          proximoRetryEm: falhouTudo ? null : new Date(Date.now() + backoffMs),
          erro: motivo.slice(0, 500),
        },
      });

      if (falhouTudo) {
        await this.audit.log({
          usuarioId: null,
          acao: 'WHATSAPP_FALHOU',
          entidade: 'MensagemWhatsapp',
          registroId: msg.id,
          ipDispositivo: 'system',
          resultado: AuditResultado.FALHA,
          traceId: msg.eventId,
          detalhes: { motivo, tentativas },
        });
      }

      this.logger.error(
        { msgId: msg.id, tentativas, motivo },
        'Falha ao enviar WhatsApp',
      );
    }
  }

  async marcarEntregue(eventId: string, providerMsgId?: string) {
    const msg = await this.prisma.mensagemWhatsapp.findUnique({
      where: { eventId },
    });
    if (!msg) return null;
    return this.prisma.mensagemWhatsapp.update({
      where: { id: msg.id },
      data: {
        status: MensagemStatus.ENTREGUE,
        entregueEm: new Date(),
        providerMsgId,
      },
    });
  }

  async receberResposta(opts: {
    eventIdOriginal?: string;
    telefone: string;
    texto: string;
    providerMsgId?: string;
  }) {
    const limpo = opts.telefone.replace(/\D/g, '');
    const paciente = await this.prisma.paciente.findFirst({
      where: {
        telefoneWhatsapp: { contains: limpo.slice(-9) },
        deletedAt: null,
      },
    });

    const original = opts.eventIdOriginal
      ? await this.prisma.mensagemWhatsapp.findUnique({
          where: { eventId: opts.eventIdOriginal },
        })
      : null;

    const agora = new Date();
    const eventId = uuid();
    const inbound = await this.prisma.mensagemWhatsapp.create({
      data: {
        pacienteId: paciente?.id,
        agendamentoId: original?.agendamentoId,
        telefone: limpo,
        direcao: MensagemDirecao.INBOUND,
        tipo: MensagemTipo.CUSTOM,
        status: MensagemStatus.ENTREGUE,
        eventId,
        providerMsgId: opts.providerMsgId,
        payload: { texto: opts.texto } as Prisma.InputJsonValue,
        resposta: opts.texto,
        respondidaEm: agora,
      },
    });

    if (original) {
      await this.prisma.mensagemWhatsapp.update({
        where: { id: original.id },
        data: {
          status: MensagemStatus.RESPONDIDA,
          resposta: opts.texto,
          respondidaEm: agora,
        },
      });
    }

    if (original?.agendamentoId) {
      await this.processarRespostaAgendamento(
        original.agendamentoId,
        opts.texto,
      );
    }

    return inbound;
  }

  private async processarRespostaAgendamento(
    agendamentoId: string,
    texto: string,
  ) {
    const ag = await this.prisma.agendamento.findUnique({
      where: { id: agendamentoId },
    });
    if (!ag) return;

    const positivo = /\b(sim|s|confirmo|ok|pode|presente|vou)\b/i.test(texto);
    const negativo = /\b(n[aã]o|cancelar|cancela|desmarc)\b/i.test(texto);

    if (!positivo && !negativo) return;

    const limiteAutoHoras = this.config.get<number>(
      'whatsapp.limiteAutoHoras',
    )!;
    const horasAte = (ag.dataHoraInicio.getTime() - Date.now()) / 3_600_000;

    let novoStatus: AgendamentoStatus | null = null;
    if (positivo) {
      novoStatus =
        horasAte >= limiteAutoHoras
          ? AgendamentoStatus.CONFIRMADO
          : AgendamentoStatus.CONFIRMACAO_TARDIA;
    } else if (negativo && horasAte >= limiteAutoHoras) {
      novoStatus = AgendamentoStatus.CANCELADO;
    }

    if (!novoStatus) return;

    await this.prisma.agendamento.update({
      where: { id: agendamentoId },
      data: {
        status: novoStatus,
        confirmadoEm:
          novoStatus === AgendamentoStatus.CONFIRMADO ||
          novoStatus === AgendamentoStatus.CONFIRMACAO_TARDIA
            ? new Date()
            : ag.confirmadoEm,
        canceladoEm:
          novoStatus === AgendamentoStatus.CANCELADO
            ? new Date()
            : ag.canceladoEm,
        motivoCancelamento:
          novoStatus === AgendamentoStatus.CANCELADO
            ? 'Paciente cancelou via WhatsApp'
            : ag.motivoCancelamento,
      },
    });

    await this.prisma.agendamentoHistorico.create({
      data: {
        agendamentoId,
        usuarioId: null,
        acao: `STATUS:${novoStatus}`,
        statusAnterior: ag.status,
        statusNovo: novoStatus,
        diff: { origem: 'WHATSAPP', resposta: texto } as Prisma.InputJsonValue,
        traceId: uuid(),
      },
    });
  }

  listarPendentes() {
    return this.prisma.mensagemWhatsapp.findMany({
      where: {
        status: { in: [MensagemStatus.PENDENTE, MensagemStatus.FALHA] },
        direcao: MensagemDirecao.OUTBOUND,
      },
      include: {
        paciente: { select: { id: true, nomeCompleto: true } },
        agendamento: {
          select: { id: true, dataHoraInicio: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async reenviarManual(id: string, usuarioId: string, traceId: string) {
    const msg = await this.prisma.mensagemWhatsapp.findUnique({
      where: { id },
    });
    if (!msg) {
      throw new NotFoundException({
        code: 'MENSAGEM_NAO_ENCONTRADA',
        message: 'Mensagem não encontrada',
      });
    }
    await this.prisma.mensagemWhatsapp.update({
      where: { id },
      data: { status: MensagemStatus.PENDENTE, tentativas: 0, erro: null },
    });
    await this.enviar(id);
    await this.audit.log({
      usuarioId,
      acao: 'WHATSAPP_REENVIO_MANUAL',
      entidade: 'MensagemWhatsapp',
      registroId: id,
      ipDispositivo: 'manual',
      resultado: AuditResultado.SUCESSO,
      traceId,
    });
    return this.prisma.mensagemWhatsapp.findUnique({ where: { id } });
  }
}
