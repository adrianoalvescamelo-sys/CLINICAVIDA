import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TipoAtendimento } from '@prisma/client';

export class CreateAgendamentoDto {
  @IsUUID()
  pacienteId!: string;

  @IsUUID()
  profissionalId!: string;

  @IsDateString()
  dataHoraInicio!: string;

  @IsDateString()
  dataHoraFim!: string;

  @IsOptional()
  @IsEnum(TipoAtendimento)
  tipo?: TipoAtendimento;

  @IsOptional()
  @IsBoolean()
  encaixe?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}
