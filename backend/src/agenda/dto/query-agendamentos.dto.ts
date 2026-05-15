import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AgendamentoStatus } from '@prisma/client';

export class QueryAgendamentosDto {
  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsDateString()
  fim?: string;

  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  @IsOptional()
  @IsUUID()
  pacienteId?: string;

  @IsOptional()
  @IsEnum(AgendamentoStatus)
  status?: AgendamentoStatus;
}
