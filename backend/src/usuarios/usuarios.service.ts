import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditResultado, Usuario } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ResetSenhaDto } from './dto/reset-senha.dto';

type UsuarioPublic = Omit<Usuario, 'senhaHash'>;

function stripSenha(u: Usuario): UsuarioPublic {
  const { senhaHash: _senhaHash, ...rest } = u;
  void _senhaHash;
  return rest;
}

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateUsuarioDto,
    actor: { id: string; ip: string; traceId: string },
  ): Promise<UsuarioPublic> {
    const emailNorm = dto.email.toLowerCase().trim();

    const existing = await this.prisma.usuario.findUnique({
      where: { email: emailNorm },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_JA_CADASTRADO',
        message: 'E-mail já cadastrado',
      });
    }

    const senhaHash = await argon2.hash(dto.senha, { type: argon2.argon2id });
    const usuario = await this.prisma.usuario.create({
      data: {
        email: emailNorm,
        senhaHash,
        nomeCompleto: dto.nomeCompleto.trim(),
        perfil: dto.perfil,
      },
    });

    await this.audit.log({
      usuarioId: actor.id,
      acao: 'USUARIO_CRIADO',
      entidade: 'Usuario',
      registroId: usuario.id,
      ipDispositivo: actor.ip,
      resultado: AuditResultado.SUCESSO,
      traceId: actor.traceId,
      detalhes: { email: emailNorm, perfil: dto.perfil },
    });

    return stripSenha(usuario);
  }

  async findAll(): Promise<UsuarioPublic[]> {
    const rows = await this.prisma.usuario.findMany({
      orderBy: { nomeCompleto: 'asc' },
    });
    return rows.map(stripSenha);
  }

  async findOne(id: string): Promise<UsuarioPublic> {
    const u = await this.prisma.usuario.findUnique({ where: { id } });
    if (!u) {
      throw new NotFoundException({
        code: 'USUARIO_NAO_ENCONTRADO',
        message: 'Usuário não encontrado',
      });
    }
    return stripSenha(u);
  }

  async update(
    id: string,
    dto: UpdateUsuarioDto,
    actor: { id: string; ip: string; traceId: string },
  ): Promise<UsuarioPublic> {
    const atual = await this.prisma.usuario.findUnique({ where: { id } });
    if (!atual) {
      throw new NotFoundException({
        code: 'USUARIO_NAO_ENCONTRADO',
        message: 'Usuário não encontrado',
      });
    }

    // Guard: não permitir um admin se desativar nem rebaixar próprio perfil
    if (id === actor.id) {
      if (dto.ativo === false) {
        throw new BadRequestException({
          code: 'AUTO_DESATIVACAO_BLOQUEADA',
          message: 'Você não pode desativar a própria conta',
        });
      }
      if (dto.perfil && dto.perfil !== atual.perfil) {
        throw new BadRequestException({
          code: 'AUTO_PERFIL_BLOQUEADO',
          message: 'Você não pode alterar o próprio perfil',
        });
      }
    }

    const updated = await this.prisma.usuario.update({
      where: { id },
      data: {
        nomeCompleto: dto.nomeCompleto?.trim(),
        perfil: dto.perfil,
        ativo: dto.ativo,
      },
    });

    await this.audit.log({
      usuarioId: actor.id,
      acao: 'USUARIO_ATUALIZADO',
      entidade: 'Usuario',
      registroId: id,
      ipDispositivo: actor.ip,
      resultado: AuditResultado.SUCESSO,
      traceId: actor.traceId,
      detalhes: { mudancas: JSON.parse(JSON.stringify(dto)) },
    });

    return stripSenha(updated);
  }

  async resetSenha(
    id: string,
    dto: ResetSenhaDto,
    actor: { id: string; ip: string; traceId: string },
  ): Promise<{ id: string }> {
    const u = await this.prisma.usuario.findUnique({ where: { id } });
    if (!u) {
      throw new NotFoundException({
        code: 'USUARIO_NAO_ENCONTRADO',
        message: 'Usuário não encontrado',
      });
    }

    const senhaHash = await argon2.hash(dto.novaSenha, {
      type: argon2.argon2id,
    });

    // Reset senha + libera bloqueios + revoga todos refresh tokens do usuario
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id },
        data: {
          senhaHash,
          tentativasLogin: 0,
          bloqueadoAte: null,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { usuarioId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      usuarioId: actor.id,
      acao: 'SENHA_RESETADA',
      entidade: 'Usuario',
      registroId: id,
      ipDispositivo: actor.ip,
      resultado: AuditResultado.SUCESSO,
      traceId: actor.traceId,
      detalhes: { alvo: u.email },
    });

    return { id };
  }
}
