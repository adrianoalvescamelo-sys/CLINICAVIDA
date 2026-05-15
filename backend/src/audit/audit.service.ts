import { Injectable } from '@nestjs/common';
import { AuditResultado, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  usuarioId: string | null;
  acao: string;
  entidade: string;
  registroId: string | null;
  ipDispositivo: string;
  resultado: AuditResultado;
  traceId: string;
  detalhes?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditoria.create({
      data: {
        usuarioId: entry.usuarioId ?? undefined,
        acao: entry.acao,
        entidade: entry.entidade,
        registroId: entry.registroId ?? undefined,
        ipDispositivo: entry.ipDispositivo,
        resultado: entry.resultado,
        traceId: entry.traceId,
        detalhes: entry.detalhes ?? undefined,
      },
    });
  }
}
