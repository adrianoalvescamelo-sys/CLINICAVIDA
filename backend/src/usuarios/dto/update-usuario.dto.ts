import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PerfilTipo } from '@prisma/client';

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nomeCompleto?: string;

  @IsOptional()
  @IsEnum(PerfilTipo)
  perfil?: PerfilTipo;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
