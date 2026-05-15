import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';
import {
  AgendamentoOrigem,
  AgendamentoStatus,
  PerfilTipo,
  Sexo,
  TipoAtendimento,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';

describe('Relatorios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senha = 'SenhaForte!2026';
  const suffix = 'relatorios-e2e';
  const periodoInicio = '2026-07-01';
  const periodoFim = '2026-07-07';

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
  let profissionalMedicoId: string;
  let profissionalNaoMedicoId: string;

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

    // Usuários
    await prisma.usuario.createMany({
      data: [
        {
          email: emails.admin,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Admin Relatorios E2E',
          perfil: PerfilTipo.ADMIN,
        },
        {
          email: emails.recepcao,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Recepcao Relatorios E2E',
          perfil: PerfilTipo.RECEPCAO,
        },
        {
          email: emails.medico,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'Medico Relatorios E2E',
          perfil: PerfilTipo.MEDICO,
        },
        {
          email: emails.profNaoMedico,
          senhaHash: await argon2.hash(senha),
          nomeCompleto: 'ProfNM Relatorios E2E',
          perfil: PerfilTipo.PROFISSIONAL_NAO_MEDICO,
        },
      ],
    });

    // Paciente
    const paciente = await prisma.paciente.create({
      data: {
        cpf: '93000000001',
        nomeCompleto: 'Paciente Relatorios E2E',
        dataNascimento: new Date('1985-04-20'),
        sexo: Sexo.NAO_INFORMADO,
        telefoneWhatsapp: '65988880001',
      },
    });
    pacienteId = paciente.id;

    // Profissional geral
    const profissional = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Prof Relatorios E2E',
        especialidade: 'Geral',
        ehMedico: false,
        ativo: true,
        cor: '#AA1122',
      },
    });
    profissionalId = profissional.id;

    // Profissional médico (vinculado ao usuário médico)
    const medicoUser = await prisma.usuario.findUniqueOrThrow({
      where: { email: emails.medico },
    });
    const profMedico = await prisma.profissional.create({
      data: {
        nomeCompleto: 'Medico Relatorios E2E Prof',
        especialidade: 'Clinica',
        ehMedico: true,
        ativo: true,
        usuarioId: medicoUser.id,
      },
    });
    profissionalMedicoId = profMedico.id;

    // Profissional não médico (vinculado ao usuário profNaoMedico)
    const profNaoMedicoUser = await prisma.usuario.findUniqueOrThrow({
      where: { email: emails.profNaoMedico },
    });
    const profNaoMedico = await prisma.profissional.create({
      data: {
        nomeCompleto: 'ProfNM Relatorios E2E Prof',
        especialidade: 'Fisioterapia',
        ehMedico: false,
        ativo: true,
        cor: '#BB2233',
        usuarioId: profNaoMedicoUser.id,
      },
    });
    profissionalNaoMedicoId = profNaoMedico.id;

    // Agendamentos no período
    await prisma.agendamento.createMany({
      data: [
        {
          pacienteId,
          profissionalId,
          dataHoraInicio: new Date(`${periodoInicio}T09:00:00Z`),
          dataHoraFim: new Date(`${periodoInicio}T09:30:00Z`),
          tipo: TipoAtendimento.CONSULTA,
          status: AgendamentoStatus.CONFIRMADO,
          origem: AgendamentoOrigem.RECEPCAO,
        },
        {
          pacienteId,
          profissionalId,
          dataHoraInicio: new Date(`${periodoFim}T10:00:00Z`),
          dataHoraFim: new Date(`${periodoFim}T10:30:00Z`),
          tipo: TipoAtendimento.RETORNO,
          status: AgendamentoStatus.FALTOU,
          origem: AgendamentoOrigem.BOT_WHATSAPP,
        },
        {
          pacienteId,
          profissionalId: profissionalMedicoId,
          dataHoraInicio: new Date(`${periodoInicio}T11:00:00Z`),
          dataHoraFim: new Date(`${periodoInicio}T11:30:00Z`),
          tipo: TipoAtendimento.CONSULTA,
          status: AgendamentoStatus.ATENDIDO,
          origem: AgendamentoOrigem.ADMIN,
        },
      ],
    });

    adminToken = await login(emails.admin);
    recepcaoToken = await login(emails.recepcao);
    medicoToken = await login(emails.medico);
    profNaoMedicoToken = await login(emails.profNaoMedico);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Agenda do dia
  // ---------------------------------------------------------------------------

  describe('GET /api/relatorios/agenda-dia', () => {
    it('admin recebe agenda do dia com dados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agenda-dia')
        .query({ data: periodoInicio })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(2);
      expect(res.body.data.agendamentos).toBeInstanceOf(Array);
      expect(res.body.data.generatedAt).toBeDefined();
    });

    it('recepção recebe agenda do dia', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agenda-dia')
        .query({ data: periodoInicio })
        .set('Authorization', `Bearer ${recepcaoToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('médico só recebe a própria agenda', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agenda-dia')
        .query({ data: periodoInicio })
        .set('Authorization', `Bearer ${medicoToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Todos os agendamentos devem pertencer ao profissional do médico
      for (const ag of res.body.data.agendamentos) {
        expect(ag.profissional.id).toBe(profissionalMedicoId);
      }
    });

    it('retorna lista vazia para data sem agendamentos', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agenda-dia')
        .query({ data: '2026-12-31' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.total).toBe(0);
      expect(res.body.data.agendamentos).toEqual([]);
    });

    it('rejeita sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/relatorios/agenda-dia')
        .query({ data: periodoInicio })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Agendamentos por status
  // ---------------------------------------------------------------------------

  describe('GET /api/relatorios/agendamentos-status', () => {
    it('admin recebe distribuição por status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agendamentos-status')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.porStatus).toBeDefined();
      expect(Object.keys(res.body.data.porStatus).length).toBeGreaterThan(0);
    });

    it('recepção acessa relatório de status', async () => {
      await request(app.getHttpServer())
        .get('/api/relatorios/agendamentos-status')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${recepcaoToken}`)
        .expect(200);
    });

    it('retorna 400 para período > 90 dias', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agendamentos-status')
        .query({ inicio: '2024-01-01', fim: '2026-06-01' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.error.code).toBe('PERIODO_MUITO_LONGO');
    });

    it('usa default 7 dias sem filtros e retorna 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agendamentos-status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.periodo.inicio).toBeDefined();
    });

    it('retorna porStatus vazio para período sem dados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agendamentos-status')
        .query({ inicio: '2030-01-01', fim: '2030-01-07' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.total).toBe(0);
      expect(res.body.data.porStatus).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // Pacientes cadastrados no período
  // ---------------------------------------------------------------------------

  describe('GET /api/relatorios/pacientes-periodo', () => {
    it('admin recebe lista de pacientes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/pacientes-periodo')
        .query({ inicio: '2026-04-16', fim: '2026-07-14' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pacientes[0]).toHaveProperty('cpf');
    });

    it('recepção acessa relatório de pacientes', async () => {
      await request(app.getHttpServer())
        .get('/api/relatorios/pacientes-periodo')
        .query({ inicio: '2026-04-16', fim: '2026-07-14' })
        .set('Authorization', `Bearer ${recepcaoToken}`)
        .expect(200);
    });

    it('médico recebe 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/pacientes-periodo')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${medicoToken}`)
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('profissional não médico recebe 403', async () => {
      await request(app.getHttpServer())
        .get('/api/relatorios/pacientes-periodo')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${profNaoMedicoToken}`)
        .expect(403);
    });

    it('retorna lista vazia para período sem cadastros', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/pacientes-periodo')
        .query({ inicio: '2030-01-01', fim: '2030-01-07' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.total).toBe(0);
      expect(res.body.data.pacientes).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Origem dos agendamentos
  // ---------------------------------------------------------------------------

  describe('GET /api/relatorios/origem', () => {
    it('admin recebe distribuição por origem', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/origem')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.distribuicao).toBeInstanceOf(Array);

      const origens = res.body.data.distribuicao.map((d: any) => d.origem);
      expect(origens).toContain('RECEPCAO');
      expect(origens).toContain('BOT_WHATSAPP');
    });

    it('percentuais somam 100 quando há dados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/origem')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const total = res.body.data.distribuicao.reduce(
        (sum: number, d: any) => sum + d.percentual,
        0,
      );
      expect(Math.round(total)).toBe(100);
    });

    it('recepção acessa relatório de origem', async () => {
      await request(app.getHttpServer())
        .get('/api/relatorios/origem')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${recepcaoToken}`)
        .expect(200);
    });

    it('retorna distribuição vazia para período sem dados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/origem')
        .query({ inicio: '2030-01-01', fim: '2030-01-07' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.total).toBe(0);
      expect(res.body.data.distribuicao).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Exports — permissão
  // ---------------------------------------------------------------------------

  describe('Exports — controle de acesso', () => {
    const exportRoutes = [
      '/api/relatorios/export/agenda-dia/xlsx',
      '/api/relatorios/export/agenda-dia/pdf',
      '/api/relatorios/export/agendamentos-status/xlsx',
      '/api/relatorios/export/agendamentos-status/pdf',
      '/api/relatorios/export/pacientes/xlsx',
      '/api/relatorios/export/pacientes/pdf',
      '/api/relatorios/export/origem/xlsx',
      '/api/relatorios/export/origem/pdf',
    ];

    for (const route of exportRoutes) {
      it(`recepção recebe 403 em ${route}`, async () => {
        await request(app.getHttpServer())
          .get(route)
          .query({
            data: periodoInicio,
            inicio: periodoInicio,
            fim: periodoFim,
          })
          .set('Authorization', `Bearer ${recepcaoToken}`)
          .expect(403);
      });

      it(`médico recebe 403 em ${route}`, async () => {
        await request(app.getHttpServer())
          .get(route)
          .query({
            data: periodoInicio,
            inicio: periodoInicio,
            fim: periodoFim,
          })
          .set('Authorization', `Bearer ${medicoToken}`)
          .expect(403);
      });
    }

    it('admin gera xlsx de agenda-dia', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/export/agenda-dia/xlsx')
        .query({ data: periodoInicio })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    });

    it('admin gera pdf de agenda-dia', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/export/agenda-dia/pdf')
        .query({ data: periodoInicio })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/pdf/);
    });

    it('admin gera xlsx de origem', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/export/origem/xlsx')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    });

    it('admin gera pdf de pacientes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/export/pacientes/pdf')
        .query({ inicio: '2026-04-16', fim: '2026-07-14' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/pdf/);
    });
  });

  // ---------------------------------------------------------------------------
  // Fix #1 — PROFISSIONAL_NAO_VINCULADO (controller lookup)
  // ---------------------------------------------------------------------------

  describe('PROFISSIONAL_NAO_VINCULADO — usuário sem vínculo (Fix #1)', () => {
    /**
     * We test this by creating a temporary user with MEDICO perfil but without
     * a linked Profissional record, then verifying the controller returns 403.
     */
    it('médico sem vínculo a profissional recebe 403 PROFISSIONAL_NAO_VINCULADO', async () => {
      const emailSemVinculo = `medico-sem-vinculo.${suffix}@clinicavida.local`;
      await prisma.usuario.create({
        data: {
          email: emailSemVinculo,
          senhaHash: await import('argon2').then((a) => a.hash(senha)),
          nomeCompleto: 'Medico Sem Vinculo E2E',
          perfil: PerfilTipo.MEDICO,
        },
      });

      let tokenSemVinculo: string;
      try {
        tokenSemVinculo = await login(emailSemVinculo);

        const res = await request(app.getHttpServer())
          .get('/api/relatorios/agenda-dia')
          .query({ data: periodoInicio })
          .set('Authorization', `Bearer ${tokenSemVinculo}`)
          .expect(403);

        expect(res.body.error.code).toBe('PROFISSIONAL_NAO_VINCULADO');
      } finally {
        await prisma.usuario.deleteMany({ where: { email: emailSemVinculo } });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Fix #4 — DTO rejeita ISO datetime completo
  // ---------------------------------------------------------------------------

  describe('DTO — rejeita ISO datetime completo (Fix #4)', () => {
    it('agenda-dia rejeita data=2026-06-01T00:00:00Z com 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agenda-dia')
        .query({ data: '2026-06-01T00:00:00Z' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('agendamentos-status rejeita inicio=2026-06-01T00:00:00Z com 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/relatorios/agendamentos-status')
        .query({ inicio: '2026-06-01T00:00:00Z', fim: '2026-06-07' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Auditoria de export
  // ---------------------------------------------------------------------------

  describe('Auditoria', () => {
    it('registra auditoria após export xlsx', async () => {
      const before = new Date();

      await request(app.getHttpServer())
        .get('/api/relatorios/export/origem/xlsx')
        .query({ inicio: periodoInicio, fim: periodoFim })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const audit = await prisma.auditoria.findFirst({
        where: {
          acao: 'EXPORT',
          entidade: 'Relatorio',
          dataHora: { gte: before },
        },
        orderBy: { dataHora: 'desc' },
      });

      expect(audit).not.toBeNull();
      expect((audit!.detalhes as any).relatorio).toBe('origem');
      expect((audit!.detalhes as any).formato).toBe('xlsx');
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, senha })
      .expect(200);
    return res.body.data.access_token as string;
  }

  async function cleanup() {
    const cpfs = ['93000000001'];
    await prisma.agendamentoHistorico.deleteMany({
      where: { agendamento: { paciente: { cpf: { in: cpfs } } } },
    });
    await prisma.agendamento.deleteMany({
      where: { paciente: { cpf: { in: cpfs } } },
    });
    await prisma.paciente.deleteMany({ where: { cpf: { in: cpfs } } });
    await prisma.profissional.deleteMany({
      where: { nomeCompleto: { startsWith: 'Prof Relatorios E2E' } },
    });
    await prisma.profissional.deleteMany({
      where: { nomeCompleto: { startsWith: 'Medico Relatorios E2E Prof' } },
    });
    await prisma.profissional.deleteMany({
      where: { nomeCompleto: { startsWith: 'ProfNM Relatorios E2E Prof' } },
    });
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
