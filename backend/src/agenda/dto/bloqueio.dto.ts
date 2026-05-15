import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateBloqueioDto {
  @IsUUID()
  profissionalId!: string;

  @IsDateString()
  dataHoraInicio!: string;

  @IsDateString()
  dataHoraFim!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
