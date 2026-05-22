import { IsDateString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryPainelTvDto {
  /**
   * Data alvo (YYYY-MM-DD). Default: hoje no fuso da clínica.
   * Geralmente o painel TV omite — usa data atual.
   */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  data?: string;
}
