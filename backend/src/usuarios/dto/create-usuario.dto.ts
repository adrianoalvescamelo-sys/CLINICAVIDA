import {
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PerfilTipo } from '@prisma/client';

export class CreateUsuarioDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' })
  @MaxLength(72, { message: 'Senha não pode exceder 72 caracteres' })
  @Matches(/[A-Z]/, {
    message: 'Senha deve conter ao menos uma letra maiúscula',
  })
  @Matches(/[a-z]/, {
    message: 'Senha deve conter ao menos uma letra minúscula',
  })
  @Matches(/[0-9]/, { message: 'Senha deve conter ao menos um número' })
  senha!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nomeCompleto!: string;

  @IsEnum(PerfilTipo)
  perfil!: PerfilTipo;
}
