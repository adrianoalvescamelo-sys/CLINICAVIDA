import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { AgendamentoStatus } from '@prisma/client';

export class QueryRelatorioDto {
  /** Data inicial do período (YYYY-MM-DD). Default: 7 dias atrás. */
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD obrigatório' })
  inicio?: string;

  /** Data final do período (YYYY-MM-DD). Default: hoje. */
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD obrigatório' })
  fim?: string;

  /** Filtrar por profissional. */
  @IsOptional()
  @IsUUID()
  profissionalId?: string;

  /** Filtrar por status (quando aplicável). */
  @IsOptional()
  @IsEnum(AgendamentoStatus)
  status?: AgendamentoStatus;
}
