import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ListaEsperaStatus } from '@prisma/client';
import { PAGINATION_MAX_LIMIT } from '../../common/pagination/cursor.dto';

export class QueryListaEsperaDto {
  @IsOptional()
  @IsEnum(ListaEsperaStatus)
  status?: ListaEsperaStatus;

  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  @IsOptional()
  @IsUUID()
  pacienteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
  )
  especialidade?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  limit?: number;
}
