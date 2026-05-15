import { IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

export class QueryAgendaDiaDto {
  /** Data do dia (YYYY-MM-DD). Default: hoje (America/Cuiaba). */
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD obrigatório' })
  data?: string;

  /** Filtrar por profissional. */
  @IsOptional()
  @IsUUID()
  profissionalId?: string;
}
