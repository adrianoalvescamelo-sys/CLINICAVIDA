import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ListaEsperaStatus } from '@prisma/client';

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
}
