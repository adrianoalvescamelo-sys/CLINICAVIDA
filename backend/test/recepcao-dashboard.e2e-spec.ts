import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  ListaEsperaStatus,
  MensagemDirecao,
  MensagemStatus,
  MensagemTipo,
  PerfilTipo,
  Sexo,
  TipoAtendimento,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';

describe('RecepcaoDashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senha = 'SenhaForte!2026';
  const suffix = 'recepcao-dashboard-e2e';
  const selectedDate = '2026-06-15';
  const emptyDate = '2026-06-16';
  const emails = {
    admin: `admin.${suffix}@clinicavida.local`,
    recepcao: `recepcao.${suffix}@clinicavida.local`,
    medico: `medico.${suffix}@clinicavida.local`,
    profNaoMedico: `profnm.${suffix}@clinicavida.local`,
  };

  let adminToken: string;
  let recepcaoToken: string;
  let medicoToken: string;
  let profNaoMedicoToken: string;
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
          nomeCompleto: 'Admin Recepcao Dashboard E2E',
          perfil: PerfilTipo.ADMIN,
        },
        {
          email: emails.recepcao,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Recepcao Dashboard E2E',
          perfil: PerfilTipo.RECEPCAO,
        },
        {
          email: emails.medico,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Medico Recepcao Dashboard E2E',
          perfil: PerfilTipo.MEDICO,
        },
        {
          email: emails.profNaoMedico,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'ProfNM Recepcao Dashboard E2E',
          perfil: PerfilTipo.PROFISSIONAL_NAO_MEDICO,
        },
      ],
    });

    const paciente = await prisma.paciente.create({
      data: {
        cpf: '92000000001',
        nomeCompleto: 'Paciente Recepcao Dashboard E2E',
        dataNascimento: new Date('1991-02-03'),
        sexo: Sexo.NAO_INFORMADO,
        telefoneWhatsapp: '65999992001',
      },
    });
    pacienteId = paciente.id;

    const profissional = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Profissional Recepcao Dashboard E2E',
        especialidade: 'Clinica Geral E2E',
        ehMedico: true,
        ativo: true,
        cor: '#1A7F64',
      },
    });
    profissionalId = profissional.id;

    adminToken = await login(emails.admin);
    recepcaoToken = await login(emails.recepcao);
    medicoToken = await login(emails.medico);
    profNaoMedicoToken = await login(emails.profNaoMedico);
  });

  afterEach(async () => {
    await cleanupDashboardData();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('GET /api/recepcao/dashboard retorna payload agregado para recepcao e admin', async () => {
    await seedDashboardData();

    for (const token of [recepcaoToken, adminToken]) {
      const res = await request(app.getHttpServer())
        .get('/api/recepcao/dashboard')
        .query({ data: selectedDate, profissionalId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Object.keys(res.body.data).sort()).toEqual([
        'agendaDoDia',
        'aguardando',
        'confirmacoesPendentes',
        'emAtendimento',
        'generatedAt',
        'listaEspera',
        'mensagensPendentes',
      ]);
      expect(res.body.data.generatedAt).toEqual(expect.any(String));
      expect(new Date(res.body.data.generatedAt).toISOString()).toBe(
        res.body.data.generatedAt,
      );
      expect(res.body.data.agendaDoDia).toHaveLength(4);
      expect(res.body.data.emAtendimento).toHaveLength(1);
      expect(res.body.data.emAtendimento[0].status).toBe(
        AgendamentoStatus.EM_ATENDIMENTO,
      );
      expect(res.body.data.agendaDoDia[0].paciente).toMatchObject({
        id: pacienteId,
        nomeCompleto: 'Paciente Recepcao Dashboard E2E',
        telefoneWhatsapp: '65999992001',
      });
      expect(res.body.data.agendaDoDia[0].profissional).toMatchObject({
        id: profissionalId,
        nomeCompleto: 'Profissional Recepcao Dashboard E2E',
        cor: '#1A7F64',
      });
      expect(res.body.data.aguardando).toHaveLength(1);
      expect(res.body.data.aguardando[0].status).toBe(
        AgendamentoStatus.AGUARDANDO,
      );
      expect(res.body.data.confirmacoesPendentes).toHaveLength(1);
      expect(res.body.data.confirmacoesPendentes[0].status).toBe(
        AgendamentoStatus.SOLICITADO,
      );
      expect(res.body.data.mensagensPendentes).toHaveLength(1);
      expect(
        res.body.data.agendaDoDia.some(
          (item: { observacoes?: string }) =>
            item.observacoes === 'Recepcao dashboard E2E noite local',
        ),
      ).toBe(true);
      expect(
        res.body.data.agendaDoDia.some(
          (item: { observacoes?: string }) =>
            item.observacoes === 'Recepcao dashboard E2E dia anterior local',
        ),
      ).toBe(false);
      expect(res.body.data.mensagensPendentes[0].paciente).toMatchObject({
        id: pacienteId,
      });
      expect(res.body.data.listaEspera).toHaveLength(1);
      expect(res.body.data.listaEspera[0].profissional).toMatchObject({
        id: profissionalId,
        nomeCompleto: 'Profissional Recepcao Dashboard E2E',
        especialidade: 'Clinica Geral E2E',
      });
    }
  });

  it('bloqueia medico no dashboard da recepcao', async () => {
    await request(app.getHttpServer())
      .get('/api/recepcao/dashboard')
      .query({ data: selectedDate })
      .set('Authorization', `Bearer ${medicoToken}`)
      .expect(403);
  });

  it('bloqueia profissional não médico no dashboard (403)', async () => {
    await request(app.getHttpServer())
      .get('/api/recepcao/dashboard')
      .query({ data: selectedDate })
      .set('Authorization', `Bearer ${profNaoMedicoToken}`)
      .expect(403);
  });

  it('sem Authorization header retorna 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/dashboard')
      .query({ data: selectedDate })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeNull();
  });

  it('data com formato inválido retorna 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/dashboard')
      .query({ data: 'nao-eh-data' })
      .set('Authorization', `Bearer ${recepcaoToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeNull();
  });

  it('data ausente retorna 400 (campo obrigatório)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/dashboard')
      .set('Authorization', `Bearer ${recepcaoToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('retorna arrays vazios e generatedAt para data sem fixtures', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/recepcao/dashboard')
      // Filtra por profissionalId para garantir isolamento contra outros testes paralelos
      .query({ data: emptyDate, profissionalId })
      .set('Authorization', `Bearer ${recepcaoToken}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      agendaDoDia: [],
      aguardando: [],
      confirmacoesPendentes: [],
      emAtendimento: [],
      mensagensPendentes: [],
      listaEspera: [],
    });
    expect(res.body.data.generatedAt).toEqual(expect.any(String));
  });

  async function seedDashboardData() {
    const agendamentoAguardando = await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        dataHoraInicio: new Date(`${selectedDate}T09:00:00.000Z`),
        dataHoraFim: new Date(`${selectedDate}T09:30:00.000Z`),
        tipo: TipoAtendimento.CONSULTA,
        status: AgendamentoStatus.AGUARDANDO,
        origem: AgendamentoOrigem.RECEPCAO,
        encaixe: false,
        observacoes: 'Recepcao dashboard E2E aguardando',
      },
    });

    await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        dataHoraInicio: new Date(`${selectedDate}T10:00:00.000Z`),
        dataHoraFim: new Date(`${selectedDate}T10:30:00.000Z`),
        tipo: TipoAtendimento.RETORNO,
        status: AgendamentoStatus.SOLICITADO,
        origem: AgendamentoOrigem.RECEPCAO,
        encaixe: false,
        observacoes: 'Recepcao dashboard E2E solicitado',
      },
    });

    await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        dataHoraInicio: new Date(`${selectedDate}T10:30:00.000Z`),
        dataHoraFim: new Date(`${selectedDate}T11:00:00.000Z`),
        tipo: TipoAtendimento.CONSULTA,
        status: AgendamentoStatus.EM_ATENDIMENTO,
        origem: AgendamentoOrigem.RECEPCAO,
        encaixe: false,
        observacoes: 'Recepcao dashboard E2E em atendimento',
      },
    });

    await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        dataHoraInicio: new Date('2026-06-16T00:30:00.000Z'),
        dataHoraFim: new Date('2026-06-16T01:00:00.000Z'),
        tipo: TipoAtendimento.CONSULTA,
        status: AgendamentoStatus.CONFIRMADO,
        origem: AgendamentoOrigem.RECEPCAO,
        encaixe: false,
        observacoes: 'Recepcao dashboard E2E noite local',
      },
    });

    const foraDoDiaLocal = await prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        dataHoraInicio: new Date('2026-06-15T03:30:00.000Z'),
        dataHoraFim: new Date('2026-06-15T04:00:00.000Z'),
        tipo: TipoAtendimento.CONSULTA,
        status: AgendamentoStatus.CONFIRMADO,
        origem: AgendamentoOrigem.RECEPCAO,
        encaixe: false,
        observacoes: 'Recepcao dashboard E2E dia anterior local',
      },
    });

    await prisma.listaEspera.create({
      data: {
        pacienteId,
        profissionalId,
        prioridade: 50,
        especialidade: 'Clinica Geral E2E',
        status: ListaEsperaStatus.ATIVO,
        observacoes: 'Recepcao dashboard E2E lista',
      },
    });

    await prisma.mensagemWhatsapp.create({
      data: {
        pacienteId,
        agendamentoId: agendamentoAguardando.id,
        telefone: '65999992001',
        direcao: MensagemDirecao.OUTBOUND,
        tipo: MensagemTipo.CUSTOM,
        status: MensagemStatus.PENDENTE,
        payload: { origem: 'recepcao-dashboard-e2e' },
        eventId: `recepcao-dashboard-e2e-${Date.now()}`,
      },
    });

    await prisma.mensagemWhatsapp.create({
      data: {
        pacienteId,
        agendamentoId: foraDoDiaLocal.id,
        telefone: '65999992001',
        direcao: MensagemDirecao.OUTBOUND,
        tipo: MensagemTipo.CUSTOM,
        status: MensagemStatus.PENDENTE,
        payload: { origem: 'recepcao-dashboard-e2e-fora-dia' },
        eventId: `recepcao-dashboard-e2e-fora-dia-${Date.now()}`,
      },
    });
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, senha })
      .expect(200);

    return res.body.data.access_token as string;
  }

  async function cleanup() {
    await cleanupDashboardData();
    await prisma.auditoria.deleteMany({
      where: { usuario: { email: { in: Object.values(emails) } } },
    });
    await prisma.profissional.deleteMany({
      where: { nomeCompleto: 'Profissional Recepcao Dashboard E2E' },
    });
    await prisma.paciente.deleteMany({ where: { cpf: '92000000001' } });
    await prisma.usuario.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
  }

  async function cleanupDashboardData() {
    await prisma.mensagemWhatsapp.deleteMany({
      where: {
        OR: [
          { paciente: { cpf: '92000000001' } },
          { eventId: { startsWith: 'recepcao-dashboard-e2e-' } },
        ],
      },
    });
    await prisma.agendamentoHistorico.deleteMany({
      where: { agendamento: { paciente: { cpf: '92000000001' } } },
    });
    await prisma.agendamento.deleteMany({
      where: { paciente: { cpf: '92000000001' } },
    });
    await prisma.listaEspera.deleteMany({
      where: { paciente: { cpf: '92000000001' } },
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
