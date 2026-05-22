/**
 * e2e — Prontuário base (Sprint 8, sub-projeto 1)
 *
 * Matriz RBAC (ADMIN/MÉDICO/NÃO-MÉDICO/RECEPÇÃO), criação → leitura →
 * retificação ponta a ponta, isolamento de leitura do não-médico, e auditoria
 * de visualização. DB real.
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

const CPF_PRONT = '71428793860'; // válido

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@clinicavida.test`;
}

describe('Prontuário (e2e) — Sprint 8', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenAdmin: string;
  let tokenRecepcao: string;
  let tokenMedico: string;
  let tokenNaoMedico: string;

  let pacienteId: string;
  let agendamentoId: string;

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

    tokenAdmin = await criarToken(PerfilTipo.ADMIN, 'e2e-pront-admin');
    tokenRecepcao = await criarToken(PerfilTipo.RECEPCAO, 'e2e-pront-recepcao');
    tokenMedico = await criarToken(PerfilTipo.MEDICO, 'e2e-pront-medico');
    tokenNaoMedico = await criarToken(
      PerfilTipo.PROFISSIONAL_NAO_MEDICO,
      'e2e-pront-naomedico',
    );

    const usuarioMedico = await prisma.usuario.findFirst({
      where: { email: { contains: 'e2e-pront-medico' } },
      select: { id: true },
    });
    const usuarioNaoMedico = await prisma.usuario.findFirst({
      where: { email: { contains: 'e2e-pront-naomedico' } },
      select: { id: true },
    });

    const profMedico = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Dr. E2E Prontuario',
        especialidade: 'Clínica Geral',
        ehMedico: true,
        ativo: true,
        usuarioId: usuarioMedico?.id,
      },
    });
    await prisma.profissional.create({
      data: {
        nomeCompleto: 'E2E Prontuario NaoMedico',
        ehMedico: false,
        ativo: true,
        usuarioId: usuarioNaoMedico?.id,
      },
    });

    const paciente = await prisma.paciente.create({
      data: {
        cpf: CPF_PRONT,
        nomeCompleto: 'Paciente E2E Prontuario',
        dataNascimento: new Date('1985-06-15'),
        telefoneWhatsapp: '66988887777',
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
        eventId: `e2e-pront-${Date.now()}`,
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
      where: { nomeCompleto: { contains: 'E2E Prontuario' } },
      select: { id: true },
    });
    const profIds = profs.map((p) => p.id);
    const pacs = await prisma.paciente.findMany({
      where: { cpf: CPF_PRONT },
      select: { id: true },
    });
    const pacIds = pacs.map((p) => p.id);

    if (pacIds.length > 0) {
      const pronts = await prisma.prontuario.findMany({
        where: { pacienteId: { in: pacIds } },
        select: { id: true },
      });
      const prontIds = pronts.map((p) => p.id);
      if (prontIds.length > 0) {
        // evoluções: remover filhas (replaces) antes — desfaz cadeia
        await prisma.evolucao.deleteMany({
          where: { prontuarioId: { in: prontIds }, replacesId: { not: null } },
        });
        await prisma.evolucao.deleteMany({
          where: { prontuarioId: { in: prontIds } },
        });
        await prisma.prontuario.deleteMany({
          where: { id: { in: prontIds } },
        });
      }
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

  const evolucaoBody = {
    queixaPrincipal: 'Dor de cabeça',
    subjetivo: 'Paciente relata cefaleia há 3 dias',
    objetivo: 'PA 120x80, afebril',
    avaliacao: 'Cefaleia tensional',
    plano: 'Analgésico e retorno em 7 dias',
  };

  // estado compartilhado entre os testes (ordem importa)
  let evolucaoMedicoId: string;

  it('RECEPÇÃO não acessa prontuário → 403', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/prontuario`)
      .set(auth(tokenRecepcao));
    expect(res.status).toBe(403);
  });

  it('MÉDICO cria evolução (agendamento do paciente) → 201, versão 1', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/prontuario/evolucoes`)
      .set(auth(tokenMedico))
      .send({ ...evolucaoBody, agendamentoId });
    expect(res.status).toBe(201);
    expect(res.body.data.versao).toBe(1);
    expect(res.body.data.autorEhMedico).toBe(true);
    evolucaoMedicoId = res.body.data.id;
  });

  it('MÉDICO lista prontuário → vê a evolução criada', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/prontuario`)
      .set(auth(tokenMedico));
    expect(res.status).toBe(200);
    expect(res.body.data.evolucoes.length).toBeGreaterThanOrEqual(1);
  });

  it('NÃO-MÉDICO cria a própria evolução → 201', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/prontuario/evolucoes`)
      .set(auth(tokenNaoMedico))
      .send({
        ...evolucaoBody,
        agendamentoId,
        subjetivo: 'evolução enfermagem',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.autorEhMedico).toBe(false);
  });

  it('NÃO-MÉDICO lista prontuário → vê só a própria (não a do médico)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/prontuario`)
      .set(auth(tokenNaoMedico));
    expect(res.status).toBe(200);
    const ids = res.body.data.evolucoes.map((e: { id: string }) => e.id);
    expect(ids).not.toContain(evolucaoMedicoId);
  });

  it('NÃO-MÉDICO GET evolução do médico → 404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/evolucoes/${evolucaoMedicoId}`)
      .set(auth(tokenNaoMedico));
    expect(res.status).toBe(404);
  });

  it('MÉDICO retifica a própria evolução → 201, versão 2, replacesId', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/evolucoes/${evolucaoMedicoId}/retificar`)
      .set(auth(tokenMedico))
      .send({ ...evolucaoBody, avaliacao: 'Cefaleia tensional (corrigido)' });
    expect(res.status).toBe(201);
    expect(res.body.data.versao).toBe(2);
    expect(res.body.data.replacesId).toBe(evolucaoMedicoId);
  });

  it('MÉDICO lista → evolução atual é a versão 2 (versão 1 não aparece)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/prontuario`)
      .set(auth(tokenMedico));
    const ids = res.body.data.evolucoes.map((e: { id: string }) => e.id);
    expect(ids).not.toContain(evolucaoMedicoId); // v1 substituída
  });

  it('MÉDICO retifica versão já substituída → 409', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/evolucoes/${evolucaoMedicoId}/retificar`)
      .set(auth(tokenMedico))
      .send({ ...evolucaoBody });
    expect(res.status).toBe(409);
  });

  it('NÃO-MÉDICO retifica evolução do médico → 403', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/evolucoes/${evolucaoMedicoId}/retificar`)
      .set(auth(tokenNaoMedico))
      .send({ ...evolucaoBody });
    // 403 (não autor) — evolução existe; não-médico não é o autor
    expect([403, 404]).toContain(res.status);
  });

  it('criar evolução com agendamento de outro paciente → 400', async () => {
    const outro = await prisma.paciente.create({
      data: {
        cpf: '51621675335',
        nomeCompleto: 'Paciente E2E Prontuario Outro',
        dataNascimento: new Date('1990-01-01'),
        telefoneWhatsapp: '66911112222',
      },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/pacientes/${outro.id}/prontuario/evolucoes`)
      .set(auth(tokenMedico))
      .send({ ...evolucaoBody, agendamentoId }); // agendamento é do pacienteId, não de "outro"
    expect(res.status).toBe(400);
    await prisma.paciente.delete({ where: { id: outro.id } });
  });

  it('ADMIN lista prontuário → 200; ADMIN cria evolução → 403', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/prontuario`)
      .set(auth(tokenAdmin));
    expect(list.status).toBe(200);

    const create = await request(app.getHttpServer())
      .post(`/api/pacientes/${pacienteId}/prontuario/evolucoes`)
      .set(auth(tokenAdmin))
      .send({ ...evolucaoBody, agendamentoId });
    expect(create.status).toBe(403);
  });

  it('auditoria registra VISUALIZACAO_PRONTUARIO', async () => {
    await request(app.getHttpServer())
      .get(`/api/pacientes/${pacienteId}/prontuario`)
      .set(auth(tokenMedico));
    const log = await prisma.auditoria.findFirst({
      where: { acao: 'VISUALIZACAO_PRONTUARIO' },
      orderBy: { dataHora: 'desc' },
    });
    expect(log).not.toBeNull();
  });
});
