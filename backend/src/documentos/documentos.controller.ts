import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { Request } from 'express';
import { PerfilTipo } from '@prisma/client';
import { DocumentosService } from './documentos.service';
import { CriarDocumentoDto } from './dto/criar-documento.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { SkipResponseInterceptor } from '../common/decorators/skip-response-interceptor.decorator';

@Controller()
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  private ip(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
  private trace(req: Request): string {
    return (req as unknown as { trace_id?: string }).trace_id ?? 'unknown';
  }

  @Post('pacientes/:pacienteId/documentos')
  @Roles(PerfilTipo.MEDICO, PerfilTipo.PROFISSIONAL_NAO_MEDICO)
  @HttpCode(HttpStatus.CREATED)
  criar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @Body() dto: CriarDocumentoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentos.criarDocumento(
      pacienteId,
      dto,
      user,
      this.ip(req),
      this.trace(req),
    );
  }

  @Get('pacientes/:pacienteId/documentos')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  listar(
    @Param('pacienteId', new ParseUUIDPipe()) pacienteId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentos.listar(
      pacienteId,
      user,
      this.ip(req),
      this.trace(req),
    );
  }

  @Get('documentos/:id')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  obter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.documentos.obter(id, user, this.ip(req), this.trace(req));
  }

  @Get('documentos/:id/pdf')
  @Roles(
    PerfilTipo.ADMIN,
    PerfilTipo.MEDICO,
    PerfilTipo.PROFISSIONAL_NAO_MEDICO,
  )
  @Header('Content-Type', 'application/pdf')
  @SkipResponseInterceptor()
  async baixar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const { pdf, tipo } = await this.documentos.baixarPdf(
      id,
      user,
      this.ip(req),
      this.trace(req),
    );
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${tipo.toLowerCase()}-${id}.pdf"`,
    });
  }
}
