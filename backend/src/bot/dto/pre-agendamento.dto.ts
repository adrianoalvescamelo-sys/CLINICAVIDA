import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TipoAtendimento } from '@prisma/client';
import { IsCpf, normalizeCpf } from '../../common/validators/cpf.validator';

export class PreAgendamentoBotDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  eventId!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeCpf(value) : value,
  )
  @IsCpf()
  cpf!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nomeCompleto?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @Length(10, 15)
  telefoneWhatsapp?: string;

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
  @IsString()
  @MaxLength(500)
  observacoes?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dataNascimento?: string;
}
