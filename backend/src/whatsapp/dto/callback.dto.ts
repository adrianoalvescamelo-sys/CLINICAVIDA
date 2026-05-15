import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CallbackStatusDto {
  @IsString()
  @Length(8, 128)
  eventId!: string;

  @IsEnum(['ENTREGUE', 'FALHA'])
  status!: 'ENTREGUE' | 'FALHA';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerMsgId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  erro?: string;
}

export class CallbackInboundDto {
  @IsString()
  @MaxLength(20)
  telefone!: string;

  @IsString()
  @MaxLength(4000)
  texto!: string;

  @IsOptional()
  @IsString()
  eventIdOriginal?: string;

  @IsOptional()
  @IsString()
  providerMsgId?: string;
}
