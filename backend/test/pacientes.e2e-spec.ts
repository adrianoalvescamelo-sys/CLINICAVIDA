/**
 * Pacientes E2E — Sprint 2
 *
 * Cobre:
 *  - POST   /api/pacientes — sucesso ADMIN, sucesso RECEPCAO, 409 CPF duplicado,
 *                            400 input inválido, 403 MEDICO, 401 sem token
 *  - GET    /api/pacientes — lista, busca por nome/CPF/telefone, paginação, empty state
 *  - GET    /api/pacientes/:id — sucesso, 404 não encontrado
 *  - GET    /api/pacientes/:id/historico — sucesso
 *  - PATCH  /api/pacientes/:id — sucesso ADMIN, sucesso RECEPCAO, 409 CONCURRENT_UPDATE,
 *                                409 CPF duplicado, 403 PROFISSIONAL_NAO_MEDICO
 *  - DELETE /api/pacientes/:id — sucesso ADMIN (204), 403 RECEPCAO, 404 não encontrado
 *
 * Isolamento:
 *  - CPFs únicos por teste via sufixo numérico.
 *  - IPs únicos via x-forwarded-for → evita throttler.
 *  - Cleanup por CPF em afterAll.
 *
 * Padrão envelope:
 *  sucesso: { success: true,  data: {...}, error: null }
 *  erro:    { success: false, data: null,  error: { code, message, trace_id } }
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { Logger } from 'nestjs-pino';
import * as argon2 from 'argon2';
import { PerfilTipo } from '@prisma/client';

// ─── CPFs válidos (matematicamente corretos, gerados com dígitos verificadores) ─
// Cada teste que cria paciente usa CPF diferente → sem colisão entre testes.
const CPFS = {
  admin:            '52998224725', // 529.982.247-25  (bem conhecido, válido)
  recepcao:         '11144477735', // 111.444.777-35  (bem conhecido, válido)
  duplicado:        '12345678909', // 123.456.789-09
  findone:          '23456789092', // 234.567.890-92  (exclusivo para GET :id suite)
  delete:           '34567890175', // 345.678.901-75
  outro:            '45678901249', // 456.789.012-49
  historico:        '56789012303', // 567.890.123-03
  busca_nome:       '67890123469', // 678.901.234-69
  busca_cpf:        '78901234505', // 789.012.345-05
  busca_tel:        '89012345642', // 890.123.456-42
  paginacao_a:      '90123456770', // 901.234.567-70
  paginacao_b:      '11122233396', // 111.222.333-96
  patch_admin:      '22233344405', // 222.333.444-05  (exclusivo para PATCH suite — admin)
  patch_recepcao:   '33344455508', // 333.444.555-08
  patch_concurrent: '44455566619', // 444.555.666-19
  patch_cpf_dup:    '55566677720', // 555.666.777-20
  patch_cpf_dup2:   '66677788830', // 666.777.888-30
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@clinicavida.test`;
}

let ipCounter = 100;
function uniqueIp(): string {
  const id = ipCounter++;
  const b = Math.floor(id / 255) % 255;
  const c = id % 255;
  return `10.2.${b}.${c + 1}`;
}

// ─── suite principal ──────────────────────────────────────────────────────────

describe('Pacientes (e2e) — Sprint 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens por perfil — criados uma vez em beforeAll
  let tokenAdmin: string;
  let tokenRecepcao: string;
  let tokenMedico: string;
  let tokenProfissional: string;

  // ─── setup global ───────────────────────────────────────────────────────────

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

    // Limpa dados antigos de testes anteriores (respeita FK order)
    const cpfsArray = Object.values(CPFS);
    const pacientesAntigos = await prisma.paciente.findMany({
      where: { cpf: { in: cpfsArray } },
      select: { id: true },
    });
    const ids = pacientesAntigos.map((p) => p.id);
    if (ids.length > 0) {
      // Remove dependências antes dos pacientes
      await prisma.agendamentoHistorico.deleteMany({
        where: { agendamento: { pacienteId: { in: ids } } },
      });
      await prisma.agendamento.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.mensagemWhatsapp.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.listaEspera.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.pacienteHistorico.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.paciente.deleteMany({ where: { id: { in: ids } } });
    }

    // Cria usuários e obtém tokens
    tokenAdmin = await criarTokenPara(PerfilTipo.ADMIN, 'e2e-pacientes-admin');
    tokenRecepcao = await criarTokenPara(PerfilTipo.RECEPCAO, 'e2e-pacientes-recepcao');
    tokenMedico = await criarTokenPara(PerfilTipo.MEDICO, 'e2e-pacientes-medico');
    tokenProfissional = await criarTokenPara(
      PerfilTipo.PROFISSIONAL_NAO_MEDICO,
      'e2e-pacientes-profissional',
    );
  }, 60_000);

  afterAll(async () => {
    // Cleanup: remove pacientes de teste e usuários (respeita FK order)
    const cpfsArray = Object.values(CPFS);
    const pacientesRestantes = await prisma.paciente.findMany({
      where: { cpf: { in: cpfsArray } },
      select: { id: true },
    });
    const ids = pacientesRestantes.map((p) => p.id);
    if (ids.length > 0) {
      await prisma.agendamentoHistorico.deleteMany({
        where: { agendamento: { pacienteId: { in: ids } } },
      });
      await prisma.agendamento.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.mensagemWhatsapp.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.listaEspera.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.pacienteHistorico.deleteMany({ where: { pacienteId: { in: ids } } });
      await prisma.paciente.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: '@clinicavida.test' } },
    });
    await app.close();
  });

  // ─── helper: cria usuário e retorna access_token ──────────────────────────

  async function criarTokenPara(perfil: PerfilTipo, prefixo: string): Promise<string> {
    const email = uniqueEmail(prefixo);
    const ip = uniqueIp();

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
      .set('x-forwarded-for', ip)
      .send({ email, senha: 'SenhaForte!2026' });

    if (res.status !== 200) {
      throw new Error(
        `criarTokenPara(${perfil}) falhou: ${res.status} — ${JSON.stringify(res.body)}`,
      );
    }

    return res.body.data.access_token as string;
  }

  // ─── helper: cria paciente via API (como admin) ───────────────────────────

  async function criarPaciente(
    cpf: string,
    nomeCompleto = 'Paciente Teste',
    token = tokenAdmin,
  ): Promise<{ id: string; updatedAt: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/pacientes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-forwarded-for', uniqueIp())
      .send({
        cpf: cpf.replace(/\D/g, ''),
        nomeCompleto,
        dataNascimento: '1985-06-15',
        telefoneWhatsapp: '66988887777',
      });

    if (res.status !== 201) {
      throw new Error(
        `criarPaciente(${cpf}) falhou: ${res.status} — ${JSON.stringify(res.body)}`,
      );
    }

    return { id: res.body.data.id as string, updatedAt: res.body.data.updatedAt as string };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // POST /api/pacientes
  // ═════════════════════════════════════════════════════════════════════════════

  describe('POST /api/pacientes', () => {
    it('201 — ADMIN cria paciente com dados mínimos válidos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.admin,
          nomeCompleto: 'Admin Criação Teste',
          dataNascimento: '1990-03-15',
          telefoneWhatsapp: '66999990001',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.cpf).toBe(CPFS.admin);
      expect(res.body.data.nomeCompleto).toBe('Admin Criação Teste');
    });

    it('201 — RECEPCAO cria paciente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.recepcao,
          nomeCompleto: 'Recepcao Criação Teste',
          dataNascimento: '1995-07-20',
          telefoneWhatsapp: '66999990002',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cpf).toBe(CPFS.recepcao);
    });

    it('409 — CPF duplicado retorna code CPF_DUPLICADO com dados do paciente existente', async () => {
      // Garante que o paciente do CPF CPFS.admin já foi criado acima
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.admin, // mesmo CPF do teste anterior
          nomeCompleto: 'Outro Nome',
          dataNascimento: '1991-01-01',
          telefoneWhatsapp: '66999990099',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeNull();
      expect(res.body.error.code).toBe('CPF_DUPLICADO');
      // Deve retornar dados do existente para conferência autorizada
      expect(res.body.error.details.pacienteExistente).toBeDefined();
    });

    it('400 — CPF inválido (todos zeros)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: '00000000000',
          nomeCompleto: 'CPF Inválido',
          dataNascimento: '1990-01-01',
          telefoneWhatsapp: '66999990003',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — campos obrigatórios ausentes', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          nomeCompleto: 'Sem CPF',
          dataNascimento: '1990-01-01',
          // cpf e telefoneWhatsapp ausentes
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — nome muito curto (< 3 chars)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.outro,
          nomeCompleto: 'AB', // menos de 3 caracteres
          dataNascimento: '1990-01-01',
          telefoneWhatsapp: '66999990004',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('403 — MEDICO não pode criar paciente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.outro,
          nomeCompleto: 'Tentativa Médico',
          dataNascimento: '1990-01-01',
          telefoneWhatsapp: '66999990005',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('403 — PROFISSIONAL_NAO_MEDICO não pode criar paciente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.outro,
          nomeCompleto: 'Tentativa Profissional',
          dataNascimento: '1990-01-01',
          telefoneWhatsapp: '66999990006',
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('401 — sem token retorna 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.outro,
          nomeCompleto: 'Sem Token',
          dataNascimento: '1990-01-01',
          telefoneWhatsapp: '66999990007',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('400 — data_nascimento inválida', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.outro,
          nomeCompleto: 'Data Invalida',
          dataNascimento: 'nao-e-data',
          telefoneWhatsapp: '66999990008',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — telefone com menos de 10 dígitos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.outro,
          nomeCompleto: 'Fone Invalido',
          dataNascimento: '1990-01-01',
          telefoneWhatsapp: '1234', // muito curto
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('201 — CPF aceito com formatação (pontos e traço) — normalizado automaticamente', async () => {
      // CPFS.outro = '45678901249' → formatado: 456.789.012-49
      const res = await request(app.getHttpServer())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: '456.789.012-49',
          nomeCompleto: 'CPF Formatado',
          dataNascimento: '1992-04-10',
          telefoneWhatsapp: '66988880009',
        })
        .expect(201);

      expect(res.body.data.cpf).toBe(CPFS.outro); // normalizado para somente dígitos
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // GET /api/pacientes
  // ═════════════════════════════════════════════════════════════════════════════

  describe('GET /api/pacientes', () => {
    beforeAll(async () => {
      // Cria pacientes específicos para busca
      await criarPaciente(CPFS.busca_nome, 'Zeferino Buscável Santos');
      await criarPaciente(CPFS.busca_cpf, 'Paciente CPF Busca');
      await criarPaciente(CPFS.busca_tel, 'Paciente Tel Busca').then(async () => {
        // Atualiza telefone para valor único buscável
        const p = await prisma.paciente.findUnique({ where: { cpf: CPFS.busca_tel } });
        if (p) {
          await prisma.paciente.update({
            where: { id: p.id },
            data: { telefoneWhatsapp: '66977776666' },
          });
        }
      });
      await criarPaciente(CPFS.paginacao_a, 'Paginacao Paciente A');
      await criarPaciente(CPFS.paginacao_b, 'Paginacao Paciente B');
    }, 30_000);

    it('200 — lista paginada sem filtro', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagina).toBe(1);
      expect(res.body.data.limite).toBe(20);
      expect(Array.isArray(res.body.data.itens)).toBe(true);
    });

    it('200 — busca por nome (q=Zeferino) retorna resultado relevante', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .query({ q: 'Zeferino' })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.itens.length).toBeGreaterThanOrEqual(1);
      const encontrado = res.body.data.itens.find((i: any) =>
        i.nomeCompleto.includes('Zeferino'),
      );
      expect(encontrado).toBeDefined();
    });

    it('200 — busca por CPF (q parcial com dígitos) retorna paciente', async () => {
      // Primeiros 7 dígitos do CPF de busca_cpf
      const prefixoCpf = CPFS.busca_cpf.slice(0, 7);
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .query({ q: prefixoCpf })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.itens.length).toBeGreaterThanOrEqual(1);
    });

    it('200 — busca por telefone retorna paciente correto', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .query({ q: '66977776666' })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.itens.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.itens[0].telefoneWhatsapp).toBe('66977776666');
    });

    it('200 — paginação: página 1 limite 1 retorna apenas 1 item com total maior', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .query({ pagina: '1', limite: '1' })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.itens).toHaveLength(1);
      expect(res.body.data.total).toBeGreaterThan(1);
      expect(res.body.data.limite).toBe(1);
    });

    it('200 — empty state: busca sem resultados retorna itens vazio e total 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .query({ q: 'XYZ_NENHUM_RESULTADO_ESPERADO_9Z9Z9' })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.itens).toHaveLength(0);
      expect(res.body.data.total).toBe(0);
    });

    it('200 — MEDICO acessa lista', async () => {
      await request(app.getHttpServer())
        .get('/api/pacientes')
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);
    });

    it('200 — PROFISSIONAL_NAO_MEDICO acessa lista (dados básicos)', async () => {
      await request(app.getHttpServer())
        .get('/api/pacientes')
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);
    });

    it('400 — ordenarPor inválido retorna erro de validação', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .query({ ordenarPor: 'deletedAt' })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('401 — sem token', async () => {
      await request(app.getHttpServer())
        .get('/api/pacientes')
        .set('x-forwarded-for', uniqueIp())
        .expect(401);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // GET /api/pacientes/:id
  // ═════════════════════════════════════════════════════════════════════════════

  describe('GET /api/pacientes/:id', () => {
    let pacienteId: string;

    beforeAll(async () => {
      const p = await criarPaciente(CPFS.findone, 'Paciente FindOne');
      pacienteId = p.id;
    }, 15_000);

    it('200 — retorna paciente pelo ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pacientes/${pacienteId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(pacienteId);
      expect(res.body.data.cpf).toBe(CPFS.findone);
    });

    it('404 — ID inexistente retorna PACIENTE_NAO_ENCONTRADO', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PACIENTE_NAO_ENCONTRADO');
    });

    it('400 — UUID malformado retorna erro de validação', async () => {
      await request(app.getHttpServer())
        .get('/api/pacientes/nao-e-uuid')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(400);
    });

    it('200 — RECEPCAO acessa ficha', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pacientes/${pacienteId}`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.id).toBe(pacienteId);
    });

    it('200 — MEDICO acessa ficha completa', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pacientes/${pacienteId}`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.id).toBe(pacienteId);
    });

    it('200 — PROFISSIONAL_NAO_MEDICO acessa dados básicos do paciente', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pacientes/${pacienteId}`)
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.data.id).toBe(pacienteId);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // GET /api/pacientes/:id/historico
  // ═════════════════════════════════════════════════════════════════════════════

  describe('GET /api/pacientes/:id/historico', () => {
    let pacienteId: string;

    beforeAll(async () => {
      const p = await criarPaciente(CPFS.historico, 'Paciente Historico E2E');
      pacienteId = p.id;
    }, 15_000);

    it('200 — retorna array de histórico (ao menos 1 entrada de CREATE)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/pacientes/${pacienteId}/historico`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].acao).toBe('CREATE');
    });

    it('404 — histórico de ID inexistente', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes/00000000-0000-4000-8000-000000000001/historico')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.error.code).toBe('PACIENTE_NAO_ENCONTRADO');
    });

    it('200 — RECEPCAO acessa histórico', async () => {
      await request(app.getHttpServer())
        .get(`/api/pacientes/${pacienteId}/historico`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // PATCH /api/pacientes/:id
  // ═════════════════════════════════════════════════════════════════════════════

  describe('PATCH /api/pacientes/:id', () => {
    let pacienteIdAdmin: string;
    let updatedAtAdmin: string;
    let pacienteIdRecepcao: string;
    let updatedAtRecepcao: string;
    let pacienteIdConcurrent: string;
    let updatedAtConcurrent: string;
    let pacienteIdCpfDup1: string;
    let pacienteIdCpfDup2: string;
    let updatedAtCpfDup2: string;

    beforeAll(async () => {
      // Cada CPF é exclusivo desta suite — não compartilhado com outros describes
      const pAdmin = await criarPaciente(CPFS.patch_admin, 'Patch Admin');
      pacienteIdAdmin = pAdmin.id;
      updatedAtAdmin = pAdmin.updatedAt;

      const pRecepcao = await criarPaciente(CPFS.patch_recepcao, 'Patch Recepcao');
      pacienteIdRecepcao = pRecepcao.id;
      updatedAtRecepcao = pRecepcao.updatedAt;

      const pConcurrent = await criarPaciente(CPFS.patch_concurrent, 'Patch Concurrent');
      pacienteIdConcurrent = pConcurrent.id;
      updatedAtConcurrent = pConcurrent.updatedAt;

      const pDup1 = await criarPaciente(CPFS.patch_cpf_dup, 'Patch CPF Dup 1');
      pacienteIdCpfDup1 = pDup1.id;

      const pDup2 = await criarPaciente(CPFS.patch_cpf_dup2, 'Patch CPF Dup 2');
      pacienteIdCpfDup2 = pDup2.id;
      updatedAtCpfDup2 = pDup2.updatedAt;
    }, 30_000);

    it('200 — ADMIN atualiza nome do paciente', async () => {
      // Re-lê updatedAt atual do paciente (pode ter sido alterado por outro teste)
      const atual = await prisma.paciente.findUnique({ where: { cpf: CPFS.patch_recepcao } });
      if (!atual) throw new Error('Paciente não encontrado para patch admin test');

      const res = await request(app.getHttpServer())
        .patch(`/api/pacientes/${atual.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          nomeCompleto: 'Nome Atualizado Pelo Admin',
          updatedAt: atual.updatedAt.toISOString(),
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.nomeCompleto).toBe('Nome Atualizado Pelo Admin');
    });

    it('200 — RECEPCAO atualiza telefone do paciente', async () => {
      const atual = await prisma.paciente.findUnique({ where: { cpf: CPFS.patch_recepcao } });
      if (!atual) throw new Error('Paciente não encontrado para patch recepcao test');

      const res = await request(app.getHttpServer())
        .patch(`/api/pacientes/${atual.id}`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          telefoneWhatsapp: '66911112222',
          updatedAt: atual.updatedAt.toISOString(),
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.telefoneWhatsapp).toBe('66911112222');
    });

    it('409 — CONCURRENT_UPDATE: updatedAt divergente retorna code correto', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/pacientes/${pacienteIdConcurrent}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          nomeCompleto: 'Tentativa Concorrente',
          updatedAt: '2000-01-01T00:00:00.000Z', // timestamp antigo → conflito garantido
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONCURRENT_UPDATE');
      expect(res.body.error.details.atualizadoEm).toBeDefined();
    });

    it('409 — CPF duplicado: tentativa de alterar para CPF de outro paciente', async () => {
      const atual = await prisma.paciente.findUnique({ where: { cpf: CPFS.patch_cpf_dup2 } });
      if (!atual) throw new Error('Paciente não encontrado para patch cpf dup test');

      const res = await request(app.getHttpServer())
        .patch(`/api/pacientes/${atual.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: CPFS.patch_cpf_dup, // CPF do primeiro paciente
          updatedAt: atual.updatedAt.toISOString(),
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CPF_DUPLICADO');
    });

    it('403 — PROFISSIONAL_NAO_MEDICO não pode editar paciente', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/pacientes/${pacienteIdConcurrent}`)
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .send({ nomeCompleto: 'Bloqueado' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('403 — MEDICO não pode editar paciente', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/pacientes/${pacienteIdConcurrent}`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .send({ nomeCompleto: 'Bloqueado Medico' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('404 — PATCH em ID inexistente', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/pacientes/00000000-0000-4000-8000-000000000002')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({ nomeCompleto: 'Inexistente' })
        .expect(404);

      expect(res.body.error.code).toBe('PACIENTE_NAO_ENCONTRADO');
    });

    it('400 — PATCH com CPF inválido retorna erro de validação', async () => {
      const atual = await prisma.paciente.findUnique({ where: { cpf: CPFS.patch_concurrent } });
      if (!atual) throw new Error('Paciente não encontrado');

      await request(app.getHttpServer())
        .patch(`/api/pacientes/${atual.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .send({
          cpf: '00000000000',
          updatedAt: atual.updatedAt.toISOString(),
        })
        .expect(400);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // DELETE /api/pacientes/:id
  // ═════════════════════════════════════════════════════════════════════════════

  describe('DELETE /api/pacientes/:id', () => {
    let pacienteIdParaDeletar: string;

    beforeAll(async () => {
      const p = await criarPaciente(CPFS.delete, 'Paciente Para Deletar');
      pacienteIdParaDeletar = p.id;
    }, 15_000);

    it('403 — RECEPCAO não pode deletar paciente', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/pacientes/${pacienteIdParaDeletar}`)
        .set('Authorization', `Bearer ${tokenRecepcao}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('403 — MEDICO não pode deletar paciente', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pacientes/${pacienteIdParaDeletar}`)
        .set('Authorization', `Bearer ${tokenMedico}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);
    });

    it('403 — PROFISSIONAL_NAO_MEDICO não pode deletar', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pacientes/${pacienteIdParaDeletar}`)
        .set('Authorization', `Bearer ${tokenProfissional}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(403);
    });

    it('204 — ADMIN deleta paciente (soft delete)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pacientes/${pacienteIdParaDeletar}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(204);

      // Verifica no banco que deletedAt foi preenchido
      const deletado = await prisma.paciente.findUnique({
        where: { id: pacienteIdParaDeletar },
      });
      expect(deletado).toBeTruthy();
      expect(deletado!.deletedAt).not.toBeNull();
    });

    it('404 — DELETE em paciente já deletado (soft delete: não aparece mais)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/pacientes/${pacienteIdParaDeletar}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.error.code).toBe('PACIENTE_NAO_ENCONTRADO');
    });

    it('404 — DELETE em ID inexistente', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/pacientes/00000000-0000-4000-8000-000000000003')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(404);

      expect(res.body.error.code).toBe('PACIENTE_NAO_ENCONTRADO');
    });

    it('401 — sem token em DELETE', async () => {
      await request(app.getHttpServer())
        .delete(`/api/pacientes/${pacienteIdParaDeletar}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(401);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Envelope de resposta — verificações de schema
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Schema do envelope de resposta', () => {
    it('sucesso: { success:true, error:null, data:{...} }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('x-forwarded-for', uniqueIp())
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        error: null,
        data: expect.objectContaining({ total: expect.any(Number) }),
      });
    });

    it('erro 401: { success:false, data:null, error:{code,message,trace_id} }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .set('x-forwarded-for', uniqueIp())
        .expect(401);

      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: {
          code: expect.any(String),
          message: expect.any(String),
          trace_id: expect.any(String),
        },
      });
    });

    it('trace_id ausente no header → gerado automaticamente no erro', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/pacientes')
        .set('x-forwarded-for', uniqueIp())
        .expect(401);

      expect(res.body.error.trace_id).toBeDefined();
      expect(typeof res.body.error.trace_id).toBe('string');
      expect(res.body.error.trace_id.length).toBeGreaterThan(0);
    });
  });
});
