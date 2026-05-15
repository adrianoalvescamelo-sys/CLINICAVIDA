import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'refresh_token é obrigatório' })
  refresh_token!: string;
}
