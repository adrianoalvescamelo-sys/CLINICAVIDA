import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListaEsperaStatus } from '@prisma/client';
import { CreateListaEsperaDto } from './create-lista-espera.dto';

export class UpdateListaEsperaDto extends PartialType(CreateListaEsperaDto) {
  @IsOptional()
  @IsEnum(ListaEsperaStatus)
  status?: ListaEsperaStatus;
}

export class RegistrarRecusaDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivoRecusa?: string;
}
