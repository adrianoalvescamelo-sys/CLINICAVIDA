import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Sexo } from '@prisma/client';
import { IsCpf, normalizeCpf } from '../../common/validators/cpf.validator';

export class CreatePacienteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nomeCompleto!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeCpf(value) : value,
  )
  @IsCpf()
  cpf!: string;

  @IsDateString({}, { message: 'data_nascimento inválida (use ISO 8601)' })
  dataNascimento!: string;

  @IsOptional()
  @IsEnum(Sexo)
  sexo?: Sexo;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'telefone_whatsapp inválido' })
  telefoneWhatsapp!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'telefone_secundario inválido' })
  telefoneSecundario?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsavelNome?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeCpf(value) : value,
  )
  @IsCpf()
  @Length(11, 11)
  responsavelCpf?: string;

  @IsOptional()
  @IsObject()
  endereco?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}
