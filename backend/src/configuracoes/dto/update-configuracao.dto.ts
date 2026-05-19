import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const HORA_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateConfiguracaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nomeClinica?: string;

  @IsOptional()
  @Matches(HORA_PATTERN, { message: 'horaAbertura deve ser HH:mm' })
  horaAbertura?: string;

  @IsOptional()
  @Matches(HORA_PATTERN, { message: 'horaFechamento deve ser HH:mm' })
  horaFechamento?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasFuncionamento?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(240)
  duracaoConsultaMin?: number;

  @IsOptional()
  @Matches(HORA_PATTERN, { message: 'intervaloAlmocoIni deve ser HH:mm' })
  intervaloAlmocoIni?: string | null;

  @IsOptional()
  @Matches(HORA_PATTERN, { message: 'intervaloAlmocoFim deve ser HH:mm' })
  intervaloAlmocoFim?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}
