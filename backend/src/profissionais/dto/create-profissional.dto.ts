import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProfissionalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nomeCompleto!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  especialidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registroConselho?: string;

  @IsOptional()
  @IsBoolean()
  ehMedico?: boolean;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'cor deve ser hex #RRGGBB' })
  cor?: string;
}
