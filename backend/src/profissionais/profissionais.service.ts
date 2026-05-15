import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfissionalDto } from './dto/create-profissional.dto';
import { UpdateProfissionalDto } from './dto/update-profissional.dto';

@Injectable()
export class ProfissionaisService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProfissionalDto) {
    if (dto.usuarioId) {
      const ja = await this.prisma.profissional.findUnique({
        where: { usuarioId: dto.usuarioId },
      });
      if (ja) {
        throw new ConflictException({
          code: 'USUARIO_JA_VINCULADO',
          message: 'Usuário já está vinculado a outro profissional',
        });
      }
    }
    return this.prisma.profissional.create({ data: dto });
  }

  findAll(somenteAtivos = false) {
    return this.prisma.profissional.findMany({
      where: somenteAtivos ? { ativo: true } : undefined,
      orderBy: { nomeCompleto: 'asc' },
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.profissional.findUnique({ where: { id } });
    if (!p) {
      throw new NotFoundException({
        code: 'PROFISSIONAL_NAO_ENCONTRADO',
        message: 'Profissional não encontrado',
      });
    }
    return p;
  }

  async update(id: string, dto: UpdateProfissionalDto) {
    await this.findOne(id);
    return this.prisma.profissional.update({ where: { id }, data: dto });
  }
}
