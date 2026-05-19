import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetSenhaDto {
  @IsString()
  @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' })
  @MaxLength(72)
  @Matches(/[A-Z]/, {
    message: 'Senha deve conter ao menos uma letra maiúscula',
  })
  @Matches(/[a-z]/, {
    message: 'Senha deve conter ao menos uma letra minúscula',
  })
  @Matches(/[0-9]/, { message: 'Senha deve conter ao menos um número' })
  novaSenha!: string;
}
