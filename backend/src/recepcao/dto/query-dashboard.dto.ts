import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AgendamentoStatus } from '@prisma/client';

export class QueryDashboardDto {
  @IsDateString()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() ? value.trim() : value,
  )
  data!: string;

  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  @IsOptional()
  @IsEnum(AgendamentoStatus)
  status?: AgendamentoStatus;
}
