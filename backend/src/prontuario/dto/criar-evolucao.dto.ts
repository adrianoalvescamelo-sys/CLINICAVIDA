import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CriarEvolucaoDto {
  @IsUUID()
  agendamentoId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  queixaPrincipal?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  subjetivo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  objetivo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  avaliacao!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  plano!: string;
}
