import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AgendamentoStatus } from '@prisma/client';

export class UpdateAgendamentoDto {
  @IsOptional()
  @IsDateString()
  dataHoraInicio?: string;

  @IsOptional()
  @IsDateString()
  dataHoraFim?: string;

  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  @IsOptional()
  @IsEnum(AgendamentoStatus)
  status?: AgendamentoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivoCancelamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;

  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}
