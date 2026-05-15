import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePacienteDto } from './dto/create-paciente.dto';
import { UpdatePacienteDto } from './dto/update-paciente.dto';
import { QueryPacientesDto } from './dto/query-pacientes.dto';
import { AuditResultado } from '@prisma/client';

@Injectable()
export class PacientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreatePacienteDto,
    usuarioId: string,
    ip: string,
    traceId: string,
  ) {
    const existing = await this.prisma.paciente.findUnique({
      where: { cpf: dto.cpf },
      select: { id: true, nomeCompleto: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException({
        code: 'CPF_DUPLICADO',
        message: 'CPF já cadastrado',
        details: { pacienteExistente: existing },
      });
    }

    const paciente = await this.prisma.paciente.create({
      data: {
        cpf: dto.cpf,
        nomeCompleto: dto.nomeCompleto,
        dataNascimento: new Date(dto.dataNascimento),
        sexo: dto.sexo,
        telefoneWhatsapp: dto.telefoneWhatsapp,
        telefoneSecundario: dto.telefoneSecundario,
        email: dto.email?.toLowerCase(),
        responsavelNome: dto.responsavelNome,
        responsavelCpf: dto.responsavelCpf,
        endereco: dto.endereco as Prisma.InputJsonValue,
        observacoes: dto.observacoes,
        criadoPor: usuarioId,
        atualizadoPor: usuarioId,
      },
    });

    await this.prisma.pacienteHistorico.create({
      data: {
        pacienteId: paciente.id,
        usuarioId,
        acao: 'CREATE',
        diff: dto as unknown as Prisma.InputJsonValue,
        traceId,
      },
    });

    await this.audit.log({
      usuarioId,
      acao: 'CREATE',
      entidade: 'Paciente',
      registroId: paciente.id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
    });

    return paciente;
  }

  async findAll(query: QueryPacientesDto) {
    const { q, pagina, limite, ordenarPor } = query;
    const skip = (pagina - 1) * limite;

    const where: Prisma.PacienteWhereInput = { deletedAt: null };
    if (q && q.trim()) {
      const term = q.trim();
      const onlyDigits = term.replace(/\D/g, '');
      const ors: Prisma.PacienteWhereInput[] = [
        { nomeCompleto: { contains: term, mode: 'insensitive' } },
      ];
      if (onlyDigits.length >= 4) {
        ors.push({ cpf: { startsWith: onlyDigits } });
        ors.push({ telefoneWhatsapp: { contains: onlyDigits } });
      }
      where.OR = ors;
    }

    const [total, itens] = await this.prisma.$transaction([
      this.prisma.paciente.count({ where }),
      this.prisma.paciente.findMany({
        where,
        skip,
        take: limite,
        orderBy: { [ordenarPor ?? 'nomeCompleto']: 'asc' },
        select: {
          id: true,
          nomeCompleto: true,
          cpf: true,
          dataNascimento: true,
          telefoneWhatsapp: true,
          updatedAt: true,
        },
      }),
    ]);

    return { total, pagina, limite, itens };
  }

  async findOne(id: string) {
    const paciente = await this.prisma.paciente.findFirst({
      where: { id, deletedAt: null },
    });
    if (!paciente) {
      throw new NotFoundException({
        code: 'PACIENTE_NAO_ENCONTRADO',
        message: 'Paciente não encontrado',
      });
    }
    return paciente;
  }

  async update(
    id: string,
    dto: UpdatePacienteDto,
    usuarioId: string,
    ip: string,
    traceId: string,
  ) {
    const atual = await this.findOne(id);

    if (dto.updatedAt) {
      const sent = new Date(dto.updatedAt).getTime();
      const current = atual.updatedAt.getTime();
      if (sent !== current) {
        throw new ConflictException({
          code: 'CONCURRENT_UPDATE',
          message:
            'Registro foi alterado por outro usuário. Recarregue e tente novamente.',
          details: { atualizadoEm: atual.updatedAt },
        });
      }
    }

    if (dto.cpf && dto.cpf !== atual.cpf) {
      const conflito = await this.prisma.paciente.findUnique({
        where: { cpf: dto.cpf },
        select: { id: true },
      });
      if (conflito && conflito.id !== id) {
        throw new ConflictException({
          code: 'CPF_DUPLICADO',
          message: 'CPF já cadastrado em outro paciente',
        });
      }
    }

    const data: Prisma.PacienteUpdateInput = { atualizadoPor: usuarioId };
    if (dto.cpf !== undefined) data.cpf = dto.cpf;
    if (dto.nomeCompleto !== undefined) data.nomeCompleto = dto.nomeCompleto;
    if (dto.dataNascimento !== undefined)
      data.dataNascimento = new Date(dto.dataNascimento);
    if (dto.sexo !== undefined) data.sexo = dto.sexo;
    if (dto.telefoneWhatsapp !== undefined)
      data.telefoneWhatsapp = dto.telefoneWhatsapp;
    if (dto.telefoneSecundario !== undefined)
      data.telefoneSecundario = dto.telefoneSecundario;
    if (dto.email !== undefined) data.email = dto.email?.toLowerCase();
    if (dto.responsavelNome !== undefined)
      data.responsavelNome = dto.responsavelNome;
    if (dto.responsavelCpf !== undefined)
      data.responsavelCpf = dto.responsavelCpf;
    if (dto.endereco !== undefined)
      data.endereco = dto.endereco as Prisma.InputJsonValue;
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes;

    const atualizado = await this.prisma.paciente.update({
      where: { id },
      data,
    });

    await this.prisma.pacienteHistorico.create({
      data: {
        pacienteId: id,
        usuarioId,
        acao: 'UPDATE',
        diff: this.calcDiff(
          atual as unknown as Record<string, unknown>,
          dto as unknown as Record<string, unknown>,
        ) as unknown as Prisma.InputJsonValue,
        traceId,
      },
    });

    await this.audit.log({
      usuarioId,
      acao: 'UPDATE',
      entidade: 'Paciente',
      registroId: id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
    });

    return atualizado;
  }

  async softDelete(id: string, usuarioId: string, ip: string, traceId: string) {
    await this.findOne(id);
    await this.prisma.paciente.update({
      where: { id },
      data: { deletedAt: new Date(), atualizadoPor: usuarioId },
    });

    await this.audit.log({
      usuarioId,
      acao: 'DELETE',
      entidade: 'Paciente',
      registroId: id,
      ipDispositivo: ip,
      resultado: AuditResultado.SUCESSO,
      traceId,
    });
  }

  async historico(pacienteId: string) {
    await this.findOne(pacienteId);
    return this.prisma.pacienteHistorico.findMany({
      where: { pacienteId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private calcDiff(
    atual: Record<string, unknown>,
    dto: Record<string, unknown>,
  ) {
    const diff: Record<string, { de: unknown; para: unknown }> = {};
    for (const [key, valor] of Object.entries(dto)) {
      if (key === 'updatedAt') continue;
      if (valor === undefined) continue;
      const antes = atual[key];
      if (JSON.stringify(antes) !== JSON.stringify(valor)) {
        diff[key] = { de: antes ?? null, para: valor };
      }
    }
    return diff;
  }
}
