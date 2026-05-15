import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  senha!: string;
}
