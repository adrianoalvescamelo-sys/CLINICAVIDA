import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { TipoDocumento } from '@prisma/client';

export class CriarDocumentoDto {
  @IsEnum(TipoDocumento)
  tipo!: TipoDocumento;

  @IsOptional()
  @IsUUID()
  agendamentoId?: string;

  // conteúdo é validado por tipo no service (shape varia)
  @IsObject()
  conteudo!: Record<string, unknown>;
}
