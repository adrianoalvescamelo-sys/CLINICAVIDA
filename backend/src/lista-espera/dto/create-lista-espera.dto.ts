import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateListaEsperaDto {
  @IsUUID()
  pacienteId!: string;

  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
  )
  especialidade?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(999)
  prioridade!: number;

  @IsOptional()
  @IsObject()
  melhoresHorarios?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacoes?: string;
}
