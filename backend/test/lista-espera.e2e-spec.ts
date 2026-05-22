import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';
import { ListaEsperaStatus, PerfilTipo, Sexo } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';

describe('ListaEspera (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senha = 'SenhaForte!2026';
  const suffix = 'lista-espera-e2e';
  const emails = {
    admin: `admin.${suffix}@clinicavida.local`,
    recepcao: `recepcao.${suffix}@clinicavida.local`,
    medico: `medico.${suffix}@clinicavida.local`,
  };

  let adminToken: string;
  let recepcaoToken: string;
  let medicoToken: string;
  let pacienteId: string;
  let profissionalId: string;

  beforeAll(async () => {
    loadRootEnv();
    const { AppModule } = await import('../src/app.module');
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

    await app.init();
    prisma = app.get(PrismaService);

    await cleanup();

    await prisma.usuario.createMany({
      data: [
        {
          email: emails.admin,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Admin Lista Espera E2E',
          perfil: PerfilTipo.ADMIN,
        },
        {
          email: emails.recepcao,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Recepcao Lista Espera E2E',
          perfil: PerfilTipo.RECEPCAO,
        },
        {
          email: emails.medico,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Medico Lista Espera E2E',
          perfil: PerfilTipo.MEDICO,
        },
      ],
    });

    const paciente = await prisma.paciente.create({
      data: {
        cpf: '91000000001',
        nomeCompleto: 'Paciente Lista Espera E2E',
        dataNascimento: new Date('1990-01-01'),
        sexo: Sexo.NAO_INFORMADO,
        telefoneWhatsapp: '65999990001',
      },
    });
    pacienteId = paciente.id;

    const profissional = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Profissional Lista Espera E2E',
        especialidade: 'Cardiologia E2E',
        ehMedico: true,
        ativo: true,
      },
    });
    profissionalId = profissional.id;

    adminToken = await login(emails.admin);
    recepcaoToken = await login(emails.recepcao);
    medicoToken = await login(emails.medico);
  });

  afterEach(async () => {
    // Remove itens de lista de espera deste paciente de teste para não vazar entre suites paralelas
    await prisma.listaEspera.deleteMany({
      where: { paciente: { cpf: '91000000001' } },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('POST /api/lista-espera cria item ativo e bloqueia duplicado ativo', async () => {
    const payload = {
      pacienteId,
      profissionalId,
      especialidade: 'Cardiologia E2E',
      prioridade: 42,
      melhoresHorarios: { manha: true, dias: ['segunda'] },
      observacoes: 'Preferencia por manha',
    };

    const res = await request(app.getHttpServer())
      .post('/api/lista-espera')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe(ListaEsperaStatus.ATIVO);
    expect(res.body.data.pacienteId).toBe(pacienteId);
    expect(res.body.data.profissionalId).toBe(profissionalId);

    const duplicate = await request(app.getHttpServer())
      .post('/api/lista-espera')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(409);

    expect(duplicate.body.error.code).toBe('LISTA_ESPERA_DUPLICADA');
  });

  it('GET /api/lista-espera ordena por prioridade desc e createdAt asc quando empata', async () => {
    await prisma.listaEspera.deleteMany({ where: { pacienteId } });

    const firstSamePriority = await createWaitingItem(10, 'Ortopedia E2E A');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const secondSamePriority = await createWaitingItem(10, 'Ortopedia E2E B');
    const highestPriority = await createWaitingItem(99, 'Ortopedia E2E C');

    const res = await request(app.getHttpServer())
      .get('/api/lista-espera')
      .query({ profissionalId })
      .set('Authorization', `Bearer ${recepcaoToken}`)
      .expect(200);

    const items = res.body.data.items;
    expect(Array.isArray(items)).toBe(true);
    expect(res.body.data).toHaveProperty('nextCursor');

    const ids = items.map((item: { id: string }) => item.id);
    expect(ids.slice(0, 3)).toEqual([
      highestPriority.id,
      firstSamePriority.id,
      secondSamePriority.id,
    ]);
    expect(items[0].paciente).toMatchObject({
      id: pacienteId,
      nomeCompleto: 'Paciente Lista Espera E2E',
      telefoneWhatsapp: '65999990001',
    });
    expect(items[0].profissional).toMatchObject({
      id: profissionalId,
      nomeCompleto: 'Profissional Lista Espera E2E',
      especialidade: 'Cardiologia E2E',
    });
  });

  it('permite admin e recepcao, mas bloqueia medico', async () => {
    const payload = {
      pacienteId,
      prioridade: 3,
      especialidade: 'Dermatologia E2E',
    };

    await request(app.getHttpServer())
      .post('/api/lista-espera')
      .set('Authorization', `Bearer ${recepcaoToken}`)
      .send(payload)
      .expect(201);

    const forbidden = await request(app.getHttpServer())
      .get('/api/lista-espera')
      .set('Authorization', `Bearer ${medicoToken}`)
      .expect(403);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('endpoints de status atualizam status e timestamps', async () => {
    const item = await createWaitingItem(7, 'Neurologia E2E');

    const ofertado = await request(app.getHttpServer())
      .post(`/api/lista-espera/${item.id}/ofertar-vaga`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(ofertado.body.data.status).toBe(ListaEsperaStatus.CONTATADO);
    expect(ofertado.body.data.ultimaOfertaEm).toBeDefined();

    const recusado = await request(app.getHttpServer())
      .post(`/api/lista-espera/${item.id}/registrar-recusa`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ motivoRecusa: 'Paciente indisponivel' })
      .expect(201);

    expect(recusado.body.data.status).toBe(ListaEsperaStatus.RECUSADO);
    expect(recusado.body.data.ultimaRespostaEm).toBeDefined();
    expect(recusado.body.data.motivoRecusa).toBe('Paciente indisponivel');

    const reagendavel = await createWaitingItem(8, 'Pediatria E2E');
    const agendado = await request(app.getHttpServer())
      .post(`/api/lista-espera/${reagendavel.id}/marcar-agendado`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(agendado.body.data.status).toBe(ListaEsperaStatus.AGENDADO);
    expect(agendado.body.data.ultimaRespostaEm).toBeDefined();
  });

  it('bloqueia transicao a partir de status final', async () => {
    const item = await createWaitingItem(11, 'Geriatria E2E');

    await request(app.getHttpServer())
      .post(`/api/lista-espera/${item.id}/registrar-recusa`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ motivoRecusa: 'Paciente recusou' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/lista-espera/${item.id}/ofertar-vaga`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(res.body.error.code).toBe('TRANSICAO_LISTA_ESPERA_INVALIDA');
  });

  it('PATCH aplica invariantes de status e rejeita campos desconhecidos', async () => {
    const item = await createWaitingItem(12, 'Oftalmologia E2E');

    const updated = await request(app.getHttpServer())
      .patch(`/api/lista-espera/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: ListaEsperaStatus.AGENDADO })
      .expect(200);

    expect(updated.body.data.status).toBe(ListaEsperaStatus.AGENDADO);
    expect(updated.body.data.ultimaRespostaEm).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/api/lista-espera/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ campoInesperado: true })
      .expect(400);
  });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, senha })
      .expect(200);

    return res.body.data.access_token as string;
  }

  async function createWaitingItem(prioridade: number, especialidade: string) {
    return prisma.listaEspera.create({
      data: {
        pacienteId,
        profissionalId,
        prioridade,
        especialidade,
        status: ListaEsperaStatus.ATIVO,
      },
    });
  }

  async function cleanup() {
    await prisma.listaEspera.deleteMany({
      where: {
        OR: [
          { paciente: { cpf: '91000000001' } },
          { profissional: { nomeCompleto: 'Profissional Lista Espera E2E' } },
          { especialidade: { contains: 'E2E' } },
        ],
      },
    });
    await prisma.auditoria.deleteMany({
      where: { usuario: { email: { in: Object.values(emails) } } },
    });
    await prisma.profissional.deleteMany({
      where: { nomeCompleto: 'Profissional Lista Espera E2E' },
    });
    await prisma.paciente.deleteMany({ where: { cpf: '91000000001' } });
    await prisma.usuario.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
  }

  function loadRootEnv() {
    const envPath = path.resolve(__dirname, '../../.env');
    const env = fs.readFileSync(envPath, 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator);
      const value = trimmed.slice(separator + 1);
      process.env[key] = process.env[key] ?? value;
    }
  }
});
