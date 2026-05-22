/**
 * e2e — Documentos médicos (Sprint 8, sub-projeto 2)
 *
 * Matriz RBAC (ADMIN/MÉDICO/NÃO-MÉDICO/RECEPÇÃO), criação → listagem →
 * download PDF, isolamento de leitura do não-médico, validação de
 * conteúdo, agendamento de outro paciente e auditoria. DB real.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import * as argon2 from 'argon2';
import { AgendamentoStatus, PerfilTipo } from '@prisma/client';

const CPF_DOC = '29374658019'; // válido, distinto dos outros suites

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@clinicavida.test`;
}

describe('Documentos (e2e) — Sprint 8', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenAdmin: string;
  let tokenRecepcao: string;
  let tokenMedico: string;
  let tokenNaoMedico: string;

  let pacienteId: string;
  let agendamentoId: string;

  // estado compartilhado (ordem importa)
  let docMedicoId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
    await app.init();

    prisma = app.get(PrismaService);

    await cleanup();

    tokenAdmin = await criarToken(PerfilTipo.ADMIN, 'e2e-doc-admin');
    tokenRecepcao = await criarToken(PerfilTipo.RECEPCAO, 'e2e-doc-recepcao');
    tokenMedico = await criarToken(PerfilTipo.MEDICO, 'e2e-doc-medico');
    tokenNaoMedico = await criarToken(
      PerfilTipo.PROFISSIONAL_NAO_MEDICO,
      'e2e-doc-naomedico',
    );

    const usuarioMedico = await prisma.usuario.findFirst({
      where: { email: { contains: 'e2e-doc-medico' } },
      select: { id: true },
    });
    const usuarioNaoMedico = await prisma.usuario.findFirst({
      where: { email: { contains: 'e2e-doc-naomedico' } },
      select: { id: true },
    });

    const profMedico = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Dr. E2E Documentos',
        especialidade: 'Clínica Geral',
        ehMedico: true,
        ativo: true,
        usuarioId: usuarioMedico?.id,
      },
    });
    await prisma.profissional.create({
      data: {
        nomeCompleto: 'E2E Documentos NaoMedico',
        ehMedico: false,
        ativo: true,
        usuarioId: usuarioNaoMedico?.id,
      },
    });

    const paciente = await prisma.paciente.create({
      data: {
        cpf: CPF_DOC,
        nomeCompleto: 'Paciente E2E Documentos',
        dataNascimento: new Date('1990-03-20'),
        telefoneWhatsapp: '66977776666',
      },
    });
    pacienteId = paciente.id;

    const ag = await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId: profMedico.id,
        dataHoraInicio: new Date(Date.now() - 3_600_000),
        dataHoraFim: new Date(Date.now() - 1_800_000),
        tipo: 'CONSULTA',
        status: AgendamentoStatus.ATENDIDO,
        origem: 'RECEPCAO',
        eventId: `e2e-doc-${Date.now()}`,
      },
    });
    agendamentoId = ag.id;
  }, 90_000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    const profs = await prisma.profissional.findMany({
      where: { nomeCompleto: { contains: 'E2E Documentos' } },
      select: { id: true },
    });
    const profIds = profs.map((p) => p.id);

    const pacs = await prisma.paciente.findMany({
      where: { cpf: CPF_DOC },
      select: { id: true },
    });
    const pacIds = pacs.map((p) => p.id);

    if (pacIds.length > 0) {
      await prisma.documentoMedico.deleteMany({
        where: { pacienteId: { in: pacIds } },
      });
      await prisma.agendamentoHistorico.deleteMany({
        where: { agendamento: { pacienteId: { in: pacIds } } },
      });
      await prisma.agendamento.deleteMany({
        where: { pacienteId: { in: pacIds } },
      });
      await prisma.paciente.deleteMany({ where: { id: { in: pacIds } } });
    }
    if (profIds.length > 0) {
      await prisma.profissional.deleteMany({ where: { id: { in: profIds } } });
    }
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: '@clinicavida.test' } },
    });
  }

  async function criarToken(
    perfil: PerfilTipo,
    prefixo: string,
  ): Promise<string> {
    const email = uniqueEmail(prefixo);
    await prisma.usuario.create({
      data: {
        email,
        senhaHash: await argon2.hash('SenhaForte!2026'),
        nomeCompleto: `E2E ${perfil}`,
        perfil,
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, senha: 'SenhaForte!2026' });
    return res.body.data.access_token as string;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // 1. RECEPÇÃO POST → 403
  it('RECEPÇÃO POST /api/pacientes/:id/documentos → 403', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenRecepcao))
      .send({ tipo: 'ORIENTACOES', conteudo: { texto: 'teste' } });
    expect(res.status).toBe(403);
  });

  // 2. MÉDICO cria ATESTADO → 201; sem campo pdf; guarda docMedicoId
  it('MÉDICO POST ATESTADO → 201; resposta sem campo pdf', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenMedico))
      .send({ tipo: 'ATESTADO', conteudo: { diasAfastamento: 3 } });
    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.pdf).toBeUndefined();
    docMedicoId = res.body.data.id as string;
    expect(docMedicoId).toBeTruthy();
  });

  // 3. MÉDICO lista documentos → length >= 1
  it('MÉDICO GET /api/pacientes/:id/documentos → 200; lista com ao menos 1', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenMedico));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  // 4. MÉDICO GET pdf → 200; Content-Type application/pdf; body começa com %PDF
  it('MÉDICO GET /api/documentos/:id/pdf → 200; PDF válido', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/documentos/${docMedicoId}/pdf`)
      .set(auth(tokenMedico))
      .buffer(true)
      .parse((r, cb) => {
        const data: Buffer[] = [];
        r.on('data', (c) => data.push(c as Buffer));
        r.on('end', () => cb(null, Buffer.concat(data)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  // 5. NÃO-MÉDICO cria RECEITA → 403
  it('NÃO-MÉDICO POST RECEITA → 403', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenNaoMedico))
      .send({
        tipo: 'RECEITA',
        conteudo: {
          medicamentos: [{ nome: 'Ibuprofeno', posologia: '1 cp 8/8h' }],
        },
      });
    expect(res.status).toBe(403);
  });

  // 6. NÃO-MÉDICO cria ORIENTACOES → 201
  it('NÃO-MÉDICO POST ORIENTACOES → 201', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenNaoMedico))
      .send({ tipo: 'ORIENTACOES', conteudo: { texto: 'repouso por 48h' } });
    expect(res.status).toBe(201);
    expect(res.body.data.autorEhMedico).toBe(false);
  });

  // 7. NÃO-MÉDICO lista → NÃO inclui docMedicoId
  it('NÃO-MÉDICO GET documentos → 200; não contém o doc do médico', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenNaoMedico));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(docMedicoId);
  });

  // 8. NÃO-MÉDICO GET doc do médico → 404
  it('NÃO-MÉDICO GET /api/documentos/:docMedicoId → 404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/documentos/${docMedicoId}`)
      .set(auth(tokenNaoMedico));
    expect(res.status).toBe(404);
  });

  // 9. ADMIN POST → 403; ADMIN GET lista → 200
  it('ADMIN POST documento → 403; ADMIN GET documentos → 200', async () => {
    const create = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenAdmin))
      .send({ tipo: 'ORIENTACOES', conteudo: { texto: 'x' } });
    expect(create.status).toBe(403);

    const list = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenAdmin));
    expect(list.status).toBe(200);
  });

  // 10. MÉDICO POST ATESTADO com conteúdo inválido → 400
  it('MÉDICO POST ATESTADO com conteúdo inválido → 400', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/documentos`)
      .set(auth(tokenMedico))
      .send({ tipo: 'ATESTADO', conteudo: {} });
    expect(res.status).toBe(400);
  });

  // 11. MÉDICO POST com agendamentoId de outro paciente → 400
  it('MÉDICO POST com agendamento de outro paciente → 400', async () => {
    // cria paciente extra com CPF distinto e agendamento próprio
    const outroPaciente = await prisma.paciente.create({
      data: {
        cpf: '84719263058',
        nomeCompleto: 'Paciente E2E Doc Outro',
        dataNascimento: new Date('1995-07-10'),
        telefoneWhatsapp: '66955554444',
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${outroPaciente.id}/documentos`)
      .set(auth(tokenMedico))
      .send({
        tipo: 'ORIENTACOES',
        conteudo: { texto: 'teste cross-patient' },
        agendamentoId, // agendamento pertence a pacienteId, não a outroPaciente
      });
    expect(res.status).toBe(400);

    // cleanup do paciente extra
    await prisma.documentoMedico.deleteMany({
      where: { pacienteId: outroPaciente.id },
    });
    await prisma.paciente.delete({ where: { id: outroPaciente.id } });
  });

  // 12. Auditoria registra GERACAO_DOCUMENTO e DOWNLOAD_DOCUMENTO
  it('auditoria registra GERACAO_DOCUMENTO e DOWNLOAD_DOCUMENTO', async () => {
    const gerou = await prisma.auditoria.findFirst({
      where: { acao: 'GERACAO_DOCUMENTO' },
      orderBy: { dataHora: 'desc' },
    });
    expect(gerou).not.toBeNull();

    const baixou = await prisma.auditoria.findFirst({
      where: { acao: 'DOWNLOAD_DOCUMENTO' },
      orderBy: { dataHora: 'desc' },
    });
    expect(baixou).not.toBeNull();
  });
});
