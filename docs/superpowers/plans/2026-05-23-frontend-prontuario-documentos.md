# Frontend Prontuário + Documentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a UI (Vite/React) de prontuário (evoluções SOAP) e documentos médicos PDF dentro da ficha do paciente (`/pacientes/:id`), consumindo os backends já existentes.

**Architecture:** `PacienteEditarPage` vira página com abas (`Dados | Prontuário | Documentos`), aba ativa via query param. Novos módulos de API tipados e um helper de download `/api` same-origin compartilhado. Modais para criar evolução, retificar e criar documento. RBAC esconde ações que o perfil não pode executar; backend continua a autoridade.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5, `react-router-dom` v6, `axios` (client em `frontend/src/api/client.ts`, baseURL `/api`), Vitest + Testing Library, zustand (`useAuthStore`).

---

## Convenções (ler antes de começar)

- Rodar 1 teste: `npm --workspace frontend test -- --run <caminho>`
- Suite + lint: `npm --workspace frontend test -- --run` e `npm --workspace frontend run lint`
- Envelope de resposta da API: `{ success, data, error }`. Os módulos retornam `data.data`.
- Perfil do usuário: `useAuthStore((s) => s.user)?.perfil`.
- Padrão de teste de página: `MemoryRouter` + `QueryClientProvider` (ver `frontend/src/pages/PacientesListPage.test.tsx`). Setar perfil com `useAuthStore.setState({ user: { id, email, nomeCompleto, perfil } })`.
- Modais usam `useModalA11y(open, onClose, dialogRef)` (`frontend/src/hooks/useModalA11y.ts`).
- **Atenção EOL (Windows):** o repo tem `core.autocrlf=true`. Ao commitar, stage apenas os arquivos reais da task (`git add <arquivos>`), nunca `git add -A`, para evitar churn de CRLF. Se aparecer ruído, `git checkout -- <arquivos não relacionados>`.

---

## File Structure

Criar:
- `frontend/src/api/download.ts` — helper de download autenticado same-origin `/api`.
- `frontend/src/api/prontuario.ts` — funções dos 4 endpoints de prontuário.
- `frontend/src/api/documentos.ts` — funções dos 4 endpoints de documentos.
- `frontend/src/types/prontuario.ts` — `Evolucao`, `Prontuario`, payloads.
- `frontend/src/types/documento.ts` — `DocumentoMedico`, `TipoDocumento`, conteúdos por tipo.
- `frontend/src/components/PacienteDadosTab.tsx` — aba Dados (form de edição extraído).
- `frontend/src/components/ProntuarioTab.tsx` — aba Prontuário.
- `frontend/src/components/DocumentosTab.tsx` — aba Documentos.
- `frontend/src/components/EvolucaoFormModal.tsx` — criar evolução.
- `frontend/src/components/RetificarEvolucaoModal.tsx` — retificar evolução.
- `frontend/src/components/DocumentoFormModal.tsx` — criar documento (form dinâmico por tipo).
- Testes correspondentes `*.test.tsx` / `*.test.ts`.

Modificar:
- `frontend/src/api/relatorios.ts` — usar `download.ts` (remove `buildUrl`/`fetchAndDownload` locais).
- `frontend/src/api/agenda.ts` — `listAgendamentos` aceita `pacienteId`.
- `frontend/src/pages/PacienteEditarPage.tsx` — virar página de abas.

---

## Task 1: Helper de download compartilhado + refactor de relatórios

**Files:**
- Create: `frontend/src/api/download.ts`
- Create: `frontend/src/api/download.test.ts`
- Modify: `frontend/src/api/relatorios.ts`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/api/download.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadAutenticado, apiUrl } from './download';

describe('download helper', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('apiUrl resolve path relativo contra a origem (não lança)', () => {
    const url = apiUrl('/relatorios/export/agenda-dia/xlsx', { data: '2026-05-23' });
    const parsed = new URL(url);
    expect(parsed.origin).toBe(window.location.origin);
    expect(parsed.pathname).toBe('/api/relatorios/export/agenda-dia/xlsx');
    expect(parsed.searchParams.get('data')).toBe('2026-05-23');
  });

  it('apiUrl omite params vazios', () => {
    const url = apiUrl('/x', { a: '1', b: undefined });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('a')).toBe('1');
    expect(parsed.searchParams.has('b')).toBe(false);
  });

  it('downloadAutenticado faz fetch com Bearer e dispara download', async () => {
    await downloadAutenticado(apiUrl('/documentos/abc/pdf', {}), 'tok', 'doc.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm --workspace frontend test -- --run src/api/download.test.ts`
Expected: FAIL (módulo `./download` não existe).

- [ ] **Step 3: Implementar o helper**

`frontend/src/api/download.ts`:

```ts
/**
 * Download autenticado de arquivos servidos pela API.
 *
 * URLs são montadas same-origin com prefixo /api, espelhando o baseURL do
 * axios client. new URL(relativo, origin) resolve sem lançar "Invalid URL"
 * quando a base é relativa — em prod o nginx serve /api, em dev o Vite faz proxy.
 */
export function apiUrl(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function downloadAutenticado(
  url: string,
  token: string,
  filename: string,
): Promise<void> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    })
    .catch((err) => {
      console.error('Falha no download:', err);
      window.alert('Falha ao gerar/baixar arquivo. Verifique suas permissoes.');
    });
}
```

- [ ] **Step 4: Refatorar `relatorios.ts` para usar o helper**

Em `frontend/src/api/relatorios.ts`, remover `buildUrl` e `fetchAndDownload` locais e importar do helper. Substituir o bloco de exports por:

```ts
import { apiUrl, downloadAutenticado } from './download';

export function exportXlsx(
  tipo: 'agenda-dia' | 'agendamentos-status' | 'pacientes' | 'origem',
  params: Record<string, string | undefined>,
  token: string,
): void {
  downloadAutenticado(
    apiUrl(`/relatorios/export/${tipo}/xlsx`, params),
    token,
    `relatorio-${tipo}.xlsx`,
  );
}

export function exportPdf(
  tipo: 'agenda-dia' | 'agendamentos-status' | 'pacientes' | 'origem',
  params: Record<string, string | undefined>,
  token: string,
): void {
  downloadAutenticado(
    apiUrl(`/relatorios/export/${tipo}/pdf`, params),
    token,
    `relatorio-${tipo}.pdf`,
  );
}
```

- [ ] **Step 5: Rodar testes de download + relatorios**

Run: `npm --workspace frontend test -- --run src/api/download.test.ts src/api/relatorios.test.ts`
Expected: PASS (ambos).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/download.ts frontend/src/api/download.test.ts frontend/src/api/relatorios.ts
git commit -m "refactor(frontend): helper de download /api compartilhado"
```

---

## Task 2: `listAgendamentos` aceita `pacienteId`

**Files:**
- Modify: `frontend/src/api/agenda.ts:21-32`

- [ ] **Step 1: Adicionar `pacienteId` ao tipo de params**

Em `frontend/src/api/agenda.ts`, na função `listAgendamentos`, alterar a assinatura de params para incluir `pacienteId?: string`:

```ts
export async function listAgendamentos(params: {
  inicio?: string;
  fim?: string;
  profissionalId?: string;
  pacienteId?: string;
  status?: AgendamentoStatus;
}): Promise<AgendamentoListItem[]> {
  const { data } = await api.get<Env<AgendamentoListItem[]>>('/agendamentos', {
    params,
  });
  return data.data;
}
```

(Backend já aceita `pacienteId` em `QueryAgendamentosDto`.)

- [ ] **Step 2: Verificar tipos (tsc via build do teste)**

Run: `npm --workspace frontend run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/agenda.ts
git commit -m "feat(frontend): listAgendamentos aceita filtro pacienteId"
```

---

## Task 3: Tipos de domínio (prontuário + documento)

**Files:**
- Create: `frontend/src/types/prontuario.ts`
- Create: `frontend/src/types/documento.ts`

- [ ] **Step 1: Criar `frontend/src/types/prontuario.ts`**

```ts
export interface Evolucao {
  id: string;
  prontuarioId: string;
  agendamentoId: string;
  autorUsuarioId: string;
  autorEhMedico: boolean;
  queixaPrincipal: string | null;
  subjetivo: string;
  objetivo: string;
  avaliacao: string;
  plano: string;
  versao: number;
  replacesId: string | null;
  createdAt: string;
}

export interface Prontuario {
  id: string;
  pacienteId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProntuarioResult {
  prontuario: Prontuario | null;
  evolucoes: Evolucao[];
}

export interface EvolucaoPayload {
  agendamentoId: string;
  queixaPrincipal?: string;
  subjetivo: string;
  objetivo: string;
  avaliacao: string;
  plano: string;
}

export type RetificarPayload = Omit<EvolucaoPayload, 'agendamentoId'>;
```

- [ ] **Step 2: Criar `frontend/src/types/documento.ts`**

```ts
export type TipoDocumento =
  | 'RECEITA'
  | 'ATESTADO'
  | 'PEDIDO_EXAME'
  | 'ORIENTACOES';

export interface Medicamento {
  nome: string;
  posologia: string;
}

export type ConteudoDocumento =
  | { medicamentos: Medicamento[] } // RECEITA
  | { diasAfastamento: number; cid?: string; motivo?: string } // ATESTADO
  | { exames: string[] } // PEDIDO_EXAME
  | { texto: string }; // ORIENTACOES

export interface DocumentoMedico {
  id: string;
  tipo: TipoDocumento;
  conteudo: Record<string, unknown>;
  pacienteId: string;
  autorUsuarioId: string;
  autorEhMedico: boolean;
  agendamentoId: string | null;
  createdAt: string;
}

export interface DocumentoPayload {
  tipo: TipoDocumento;
  conteudo: Record<string, unknown>;
  agendamentoId?: string;
}

export const LABEL_TIPO: Record<TipoDocumento, string> = {
  RECEITA: 'Receita',
  ATESTADO: 'Atestado',
  PEDIDO_EXAME: 'Pedido de exame',
  ORIENTACOES: 'Orientações',
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/prontuario.ts frontend/src/types/documento.ts
git commit -m "feat(frontend): tipos de prontuario e documento"
```

---

## Task 4: API de prontuário

**Files:**
- Create: `frontend/src/api/prontuario.ts`
- Create: `frontend/src/api/prontuario.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/api/prontuario.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './client';
import {
  getProntuario,
  criarEvolucao,
  retificarEvolucao,
} from './prontuario';

afterEach(() => vi.restoreAllMocks());

describe('api/prontuario', () => {
  it('getProntuario faz GET no endpoint do paciente e retorna data.data', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: { prontuario: null, evolucoes: [] }, error: null },
    } as never);
    const r = await getProntuario('pac-1');
    expect(spy).toHaveBeenCalledWith('/pacientes/pac-1/prontuario');
    expect(r.evolucoes).toEqual([]);
  });

  it('criarEvolucao faz POST com payload', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { id: 'evo-1' }, error: null },
    } as never);
    await criarEvolucao('pac-1', {
      agendamentoId: 'ag-1',
      subjetivo: 's',
      objetivo: 'o',
      avaliacao: 'a',
      plano: 'p',
    });
    expect(spy).toHaveBeenCalledWith(
      '/pacientes/pac-1/prontuario/evolucoes',
      expect.objectContaining({ agendamentoId: 'ag-1' }),
    );
  });

  it('retificarEvolucao faz POST no endpoint de retificar', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { id: 'evo-2' }, error: null },
    } as never);
    await retificarEvolucao('evo-1', {
      subjetivo: 's', objetivo: 'o', avaliacao: 'a', plano: 'p',
    });
    expect(spy).toHaveBeenCalledWith(
      '/evolucoes/evo-1/retificar',
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace frontend test -- --run src/api/prontuario.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `frontend/src/api/prontuario.ts`**

```ts
import { api } from './client';
import type {
  ProntuarioResult,
  Evolucao,
  EvolucaoPayload,
  RetificarPayload,
} from '../types/prontuario';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details?: unknown };
}

export async function getProntuario(
  pacienteId: string,
): Promise<ProntuarioResult> {
  const { data } = await api.get<Envelope<ProntuarioResult>>(
    `/pacientes/${pacienteId}/prontuario`,
  );
  return data.data;
}

export async function getEvolucao(id: string): Promise<Evolucao> {
  const { data } = await api.get<Envelope<Evolucao>>(`/evolucoes/${id}`);
  return data.data;
}

export async function criarEvolucao(
  pacienteId: string,
  payload: EvolucaoPayload,
): Promise<Evolucao> {
  const { data } = await api.post<Envelope<Evolucao>>(
    `/pacientes/${pacienteId}/prontuario/evolucoes`,
    payload,
  );
  return data.data;
}

export async function retificarEvolucao(
  id: string,
  payload: RetificarPayload,
): Promise<Evolucao> {
  const { data } = await api.post<Envelope<Evolucao>>(
    `/evolucoes/${id}/retificar`,
    payload,
  );
  return data.data;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/api/prontuario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/prontuario.ts frontend/src/api/prontuario.test.ts
git commit -m "feat(frontend): api de prontuario"
```

---

## Task 5: API de documentos

**Files:**
- Create: `frontend/src/api/documentos.ts`
- Create: `frontend/src/api/documentos.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/api/documentos.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { api } from './client';
import { listarDocumentos, criarDocumento, baixarDocumentoPdf } from './documentos';

afterEach(() => vi.restoreAllMocks());

describe('api/documentos', () => {
  it('listarDocumentos faz GET no endpoint do paciente', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: [], error: null },
    } as never);
    await listarDocumentos('pac-1');
    expect(spy).toHaveBeenCalledWith('/pacientes/pac-1/documentos');
  });

  it('criarDocumento faz POST com tipo e conteudo', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { id: 'doc-1' }, error: null },
    } as never);
    await criarDocumento('pac-1', {
      tipo: 'ORIENTACOES',
      conteudo: { texto: 'repouso' },
    });
    expect(spy).toHaveBeenCalledWith(
      '/pacientes/pac-1/documentos',
      expect.objectContaining({ tipo: 'ORIENTACOES' }),
    );
  });

  describe('baixarDocumentoPdf', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, blob: () => Promise.resolve(new Blob(['x'])),
      }));
      URL.createObjectURL = vi.fn(() => 'blob:mock');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });
    afterEach(() => vi.unstubAllGlobals());

    it('baixa PDF same-origin /api com Bearer', async () => {
      await baixarDocumentoPdf('doc-1', 'RECEITA', 'tok');
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const [url, opts] = fetchMock.mock.calls[0];
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/api/documentos/doc-1/pdf');
      expect((opts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace frontend test -- --run src/api/documentos.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `frontend/src/api/documentos.ts`**

```ts
import { api } from './client';
import { apiUrl, downloadAutenticado } from './download';
import type {
  DocumentoMedico,
  DocumentoPayload,
  TipoDocumento,
} from '../types/documento';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details?: unknown };
}

export async function listarDocumentos(
  pacienteId: string,
): Promise<DocumentoMedico[]> {
  const { data } = await api.get<Envelope<DocumentoMedico[]>>(
    `/pacientes/${pacienteId}/documentos`,
  );
  return data.data;
}

export async function criarDocumento(
  pacienteId: string,
  payload: DocumentoPayload,
): Promise<DocumentoMedico> {
  const { data } = await api.post<Envelope<DocumentoMedico>>(
    `/pacientes/${pacienteId}/documentos`,
    payload,
  );
  return data.data;
}

export function baixarDocumentoPdf(
  id: string,
  tipo: TipoDocumento,
  token: string,
): Promise<void> {
  return downloadAutenticado(
    apiUrl(`/documentos/${id}/pdf`, {}),
    token,
    `${tipo.toLowerCase()}-${id}.pdf`,
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/api/documentos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/documentos.ts frontend/src/api/documentos.test.ts
git commit -m "feat(frontend): api de documentos + download pdf"
```

---

## Task 6: Página do paciente com abas + extração da aba Dados

**Files:**
- Create: `frontend/src/components/PacienteDadosTab.tsx`
- Modify: `frontend/src/pages/PacienteEditarPage.tsx`
- Create: `frontend/src/pages/PacienteEditarPage.test.tsx`

- [ ] **Step 1: Extrair a aba Dados para `PacienteDadosTab.tsx`**

`frontend/src/components/PacienteDadosTab.tsx` (move a lógica de edição atual de `PacienteEditarPage`, sem mudar comportamento):

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPaciente, updatePaciente } from '../api/pacientes';
import PacienteForm from './PacienteForm';
import type { PacienteFormData } from '../types/paciente';

export default function PacienteDadosTab({ pacienteId }: { pacienteId: string }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['paciente', pacienteId],
    queryFn: () => getPaciente(pacienteId),
    enabled: !!pacienteId,
  });

  async function handleSubmit(form: PacienteFormData) {
    if (!data) return;
    setLoading(true);
    try {
      await updatePaciente(data.id, { ...form, updatedAt: data.updatedAt });
      await refetch();
      navigate('/pacientes');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) return <p>Carregando…</p>;
  if (isError) return <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>;
  if (!data) return null;

  return (
    <>
      <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>
        Última atualização: {new Date(data.updatedAt).toLocaleString('pt-BR')}
      </p>
      <PacienteForm
        initial={{
          nomeCompleto: data.nomeCompleto,
          cpf: data.cpf,
          dataNascimento: data.dataNascimento,
          sexo: data.sexo,
          telefoneWhatsapp: data.telefoneWhatsapp,
          telefoneSecundario: data.telefoneSecundario ?? undefined,
          email: data.email ?? undefined,
          responsavelNome: data.responsavelNome ?? undefined,
          responsavelCpf: data.responsavelCpf ?? undefined,
          observacoes: data.observacoes ?? undefined,
        }}
        loading={loading}
        submitLabel="Salvar alterações"
        onSubmit={handleSubmit}
      />
    </>
  );
}
```

- [ ] **Step 2: Reescrever `PacienteEditarPage.tsx` com abas**

```tsx
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PacienteDadosTab from '../components/PacienteDadosTab';
import ProntuarioTab from '../components/ProntuarioTab';
import DocumentosTab from '../components/DocumentosTab';
import { useAuthStore } from '../store/auth';

type Aba = 'dados' | 'prontuario' | 'documentos';

export default function PacienteEditarPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const perfil = useAuthStore((s) => s.user)?.perfil;
  const podeClinico = perfil !== 'RECEPCAO' && perfil !== undefined;

  const abaParam = (searchParams.get('aba') as Aba) ?? 'dados';
  const aba: Aba = !podeClinico && abaParam !== 'dados' ? 'dados' : abaParam;

  const abas: { key: Aba; label: string }[] = [
    { key: 'dados', label: 'Dados' },
    ...(podeClinico
      ? ([
          { key: 'prontuario', label: 'Prontuário' },
          { key: 'documentos', label: 'Documentos' },
        ] as { key: Aba; label: string }[])
      : []),
  ];

  if (!id) return null;

  return (
    <Layout>
      <div style={{ marginBottom: 16 }}>
        <Link to="/pacientes" style={{ color: '#0f766e', textDecoration: 'none', fontSize: 14 }}>
          ← Pacientes
        </Link>
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 8, color: '#0f172a' }}>Paciente</h1>

      <div style={tabsStyle}>
        {abas.map((t) => (
          <button
            key={t.key}
            onClick={() => setSearchParams({ aba: t.key })}
            style={{ ...tabStyle, ...(aba === t.key ? activeTabStyle : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'dados' && <PacienteDadosTab pacienteId={id} />}
      {aba === 'prontuario' && podeClinico && <ProntuarioTab pacienteId={id} />}
      {aba === 'documentos' && podeClinico && <DocumentosTab pacienteId={id} />}
    </Layout>
  );
}

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 16,
  borderBottom: '2px solid #e2e8f0',
  paddingBottom: 2,
};
const tabStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 14,
  color: '#64748b',
  borderRadius: '6px 6px 0 0',
};
const activeTabStyle: React.CSSProperties = {
  background: '#eff6ff',
  color: '#1d4ed8',
  fontWeight: 700,
};
```

**Nota:** As tasks 7 e 10 criam `ProntuarioTab` e `DocumentosTab`. Para esta task compilar antes delas, crie stubs mínimos agora (serão substituídos):
- `frontend/src/components/ProntuarioTab.tsx`: `export default function ProntuarioTab(_: { pacienteId: string }) { return <div>Prontuário</div>; }`
- `frontend/src/components/DocumentosTab.tsx`: `export default function DocumentosTab(_: { pacienteId: string }) { return <div>Documentos</div>; }`

- [ ] **Step 3: Escrever o teste de RBAC das abas**

`frontend/src/pages/PacienteEditarPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PacienteEditarPage from './PacienteEditarPage';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as pacientesApi from '../api/pacientes';

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok',
    refreshToken: 'r',
    user: { id: 'u1', email: 'e@x', nomeCompleto: 'U', perfil },
  });
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/pacientes/:id" element={<PacienteEditarPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PacienteEditarPage — abas RBAC', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pacientesApi, 'getPaciente').mockImplementation(() => new Promise(() => {}));
  });

  it('MEDICO vê abas Prontuário e Documentos', () => {
    setUser('MEDICO');
    renderAt('/pacientes/pac-1');
    expect(screen.getByRole('button', { name: 'Prontuário' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument();
  });

  it('RECEPCAO não vê abas clínicas', () => {
    setUser('RECEPCAO');
    renderAt('/pacientes/pac-1');
    expect(screen.queryByRole('button', { name: 'Prontuário' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Documentos' })).not.toBeInTheDocument();
  });

  it('RECEPCAO forçando ?aba=prontuario cai em Dados', () => {
    setUser('RECEPCAO');
    renderAt('/pacientes/pac-1?aba=prontuario');
    expect(screen.queryByText('Prontuário')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/pages/PacienteEditarPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PacienteDadosTab.tsx frontend/src/components/ProntuarioTab.tsx frontend/src/components/DocumentosTab.tsx frontend/src/pages/PacienteEditarPage.tsx frontend/src/pages/PacienteEditarPage.test.tsx
git commit -m "feat(frontend): ficha do paciente com abas + RBAC"
```

---

## Task 7: Aba Prontuário — listagem

**Files:**
- Modify: `frontend/src/components/ProntuarioTab.tsx` (substitui o stub)
- Create: `frontend/src/components/ProntuarioTab.test.tsx`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/components/ProntuarioTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProntuarioTab from './ProntuarioTab';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as prontuarioApi from '../api/prontuario';

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok', refreshToken: 'r',
    user: { id: 'u1', email: 'e@x', nomeCompleto: 'U', perfil },
  });
}
function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProntuarioTab pacienteId="pac-1" />
    </QueryClientProvider>,
  );
}
const evo = {
  id: 'evo-1', prontuarioId: 'pr-1', agendamentoId: 'ag-1', autorUsuarioId: 'u1',
  autorEhMedico: true, queixaPrincipal: 'dor', subjetivo: 'S', objetivo: 'O',
  avaliacao: 'A', plano: 'P', versao: 1, replacesId: null, createdAt: '2026-05-23T12:00:00.000Z',
};

describe('ProntuarioTab — listagem', () => {
  beforeEach(() => { vi.restoreAllMocks(); setUser('MEDICO'); });

  it('empty state', async () => {
    vi.spyOn(prontuarioApi, 'getProntuario').mockResolvedValue({ prontuario: null, evolucoes: [] });
    renderTab();
    await screen.findByText(/nenhuma evolução/i);
  });

  it('renderiza evolução com SOAP e botão Nova evolução para médico', async () => {
    vi.spyOn(prontuarioApi, 'getProntuario').mockResolvedValue({
      prontuario: { id: 'pr-1', pacienteId: 'pac-1', createdAt: '', updatedAt: '' },
      evolucoes: [evo],
    });
    renderTab();
    await screen.findByText('S');
    expect(screen.getByText(/avaliação/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nova evolução/i })).toBeInTheDocument();
  });

  it('ADMIN não vê botão Nova evolução', async () => {
    setUser('ADMIN');
    vi.spyOn(prontuarioApi, 'getProntuario').mockResolvedValue({ prontuario: null, evolucoes: [] });
    renderTab();
    await screen.findByText(/nenhuma evolução/i);
    expect(screen.queryByRole('button', { name: /nova evolução/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace frontend test -- --run src/components/ProntuarioTab.test.tsx`
Expected: FAIL (stub não tem conteúdo esperado).

- [ ] **Step 3: Implementar `ProntuarioTab.tsx`**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProntuario } from '../api/prontuario';
import { useAuthStore } from '../store/auth';
import type { Evolucao } from '../types/prontuario';
import EvolucaoFormModal from './EvolucaoFormModal';
import RetificarEvolucaoModal from './RetificarEvolucaoModal';

export default function ProntuarioTab({ pacienteId }: { pacienteId: string }) {
  const user = useAuthStore((s) => s.user);
  const podeEscrever = user?.perfil === 'MEDICO' || user?.perfil === 'PROFISSIONAL_NAO_MEDICO';
  const [novoOpen, setNovoOpen] = useState(false);
  const [retificar, setRetificar] = useState<Evolucao | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['prontuario', pacienteId],
    queryFn: () => getProntuario(pacienteId),
  });

  if (isLoading) return <p>Carregando…</p>;
  if (isError) return <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>;

  const evolucoes = data?.evolucoes ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {podeEscrever && (
          <button onClick={() => setNovoOpen(true)} style={primaryBtn}>
            + Nova evolução
          </button>
        )}
      </div>

      {evolucoes.length === 0 && (
        <p style={{ color: '#64748b', fontSize: 13 }}>Nenhuma evolução registrada.</p>
      )}

      {evolucoes.map((e) => (
        <div key={e.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{new Date(e.createdAt).toLocaleString('pt-BR')}</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {e.versao > 1 ? `retificada (v${e.versao})` : `v${e.versao}`}
            </span>
          </div>
          {e.queixaPrincipal && <Campo label="Queixa principal" valor={e.queixaPrincipal} />}
          <Campo label="Subjetivo" valor={e.subjetivo} />
          <Campo label="Objetivo" valor={e.objetivo} />
          <Campo label="Avaliação" valor={e.avaliacao} />
          <Campo label="Plano" valor={e.plano} />
          {podeEscrever && e.autorUsuarioId === user?.id && (
            <button onClick={() => setRetificar(e)} style={linkBtn}>
              Retificar
            </button>
          )}
        </div>
      ))}

      <EvolucaoFormModal
        open={novoOpen}
        pacienteId={pacienteId}
        onClose={() => setNovoOpen(false)}
        onSaved={() => { setNovoOpen(false); refetch(); }}
      />
      <RetificarEvolucaoModal
        evolucao={retificar}
        onClose={() => setRetificar(null)}
        onSaved={() => { setRetificar(null); refetch(); }}
      />
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{valor}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 12, background: '#fff',
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  marginTop: 8, padding: 0, border: 'none', background: 'none', color: '#1d4ed8',
  fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
};
```

**Nota:** Esta task importa `EvolucaoFormModal` e `RetificarEvolucaoModal` (tasks 8 e 9). Crie stubs mínimos agora para compilar:
- `EvolucaoFormModal.tsx`: `export default function EvolucaoFormModal(_: { open: boolean; pacienteId: string; onClose: () => void; onSaved: () => void }) { return null; }`
- `RetificarEvolucaoModal.tsx`: `export default function RetificarEvolucaoModal(_: { evolucao: import('../types/prontuario').Evolucao | null; onClose: () => void; onSaved: () => void }) { return null; }`

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/components/ProntuarioTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProntuarioTab.tsx frontend/src/components/ProntuarioTab.test.tsx frontend/src/components/EvolucaoFormModal.tsx frontend/src/components/RetificarEvolucaoModal.tsx
git commit -m "feat(frontend): aba prontuario com listagem de evolucoes"
```

---

## Task 8: Modal de criar evolução

**Files:**
- Modify: `frontend/src/components/EvolucaoFormModal.tsx` (substitui stub)
- Create: `frontend/src/components/EvolucaoFormModal.test.tsx`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/components/EvolucaoFormModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EvolucaoFormModal from './EvolucaoFormModal';
import * as agendaApi from '../api/agenda';
import * as prontuarioApi from '../api/prontuario';

function renderModal(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EvolucaoFormModal open pacienteId="pac-1" onClose={vi.fn()} onSaved={onSaved} />
    </QueryClientProvider>,
  );
}
const ag = {
  id: 'ag-1', dataHoraInicio: '2026-05-23T12:00:00.000Z',
  paciente: { id: 'pac-1', nomeCompleto: 'P' },
  profissional: { id: 'pr-1', nomeCompleto: 'Dr', especialidade: null },
  tipo: 'CONSULTA', status: 'ATENDIDO', origem: 'RECEPCAO', dataHoraFim: '', encaixe: false,
};

describe('EvolucaoFormModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([ag] as never);
  });

  it('envia evolução com agendamento e campos SOAP', async () => {
    const criar = vi.spyOn(prontuarioApi, 'criarEvolucao').mockResolvedValue({ id: 'evo-1' } as never);
    const onSaved = vi.fn();
    renderModal(onSaved);

    await screen.findByRole('option', { name: /Dr/ });
    fireEvent.change(screen.getByLabelText(/agendamento/i), { target: { value: 'ag-1' } });
    fireEvent.change(screen.getByLabelText(/subjetivo/i), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText(/objetivo/i), { target: { value: 'O' } });
    fireEvent.change(screen.getByLabelText(/avaliação/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/plano/i), { target: { value: 'P' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(criar).toHaveBeenCalledWith('pac-1', expect.objectContaining({
      agendamentoId: 'ag-1', subjetivo: 'S', objetivo: 'O', avaliacao: 'A', plano: 'P',
    })));
    expect(onSaved).toHaveBeenCalled();
  });

  it('bloqueia submit sem agendamento selecionado', async () => {
    const criar = vi.spyOn(prontuarioApi, 'criarEvolucao').mockResolvedValue({ id: 'x' } as never);
    renderModal();
    await screen.findByRole('option', { name: /Dr/ });
    fireEvent.change(screen.getByLabelText(/subjetivo/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(screen.getByText(/selecione um agendamento/i)).toBeInTheDocument());
    expect(criar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace frontend test -- --run src/components/EvolucaoFormModal.test.tsx`
Expected: FAIL (stub retorna null).

- [ ] **Step 3: Implementar `EvolucaoFormModal.tsx`**

```tsx
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgendamentos } from '../api/agenda';
import { criarEvolucao } from '../api/prontuario';
import { useModalA11y } from '../hooks/useModalA11y';

interface Props {
  open: boolean;
  pacienteId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function EvolucaoFormModal({ open, pacienteId, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  const [agendamentoId, setAgendamentoId] = useState('');
  const [queixaPrincipal, setQueixa] = useState('');
  const [subjetivo, setSubjetivo] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [avaliacao, setAvaliacao] = useState('');
  const [plano, setPlano] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { data: agendamentos } = useQuery({
    queryKey: ['agendamentos', 'paciente', pacienteId],
    queryFn: () => listAgendamentos({ pacienteId }),
    enabled: open,
  });

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!agendamentoId) { setErro('Selecione um agendamento.'); return; }
    if (!subjetivo || !objetivo || !avaliacao || !plano) {
      setErro('Preencha todos os campos SOAP.'); return;
    }
    setSalvando(true);
    try {
      await criarEvolucao(pacienteId, {
        agendamentoId,
        queixaPrincipal: queixaPrincipal || undefined,
        subjetivo, objetivo, avaliacao, plano,
      });
      onSaved();
    } catch {
      setErro('Falha ao salvar evolução.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={overlay}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Nova evolução" style={modal}>
        <h2 style={{ marginTop: 0 }}>Nova evolução</h2>
        <form onSubmit={handleSubmit}>
          <label style={lbl}>
            Agendamento
            <select value={agendamentoId} onChange={(e) => setAgendamentoId(e.target.value)} style={inp}>
              <option value="">Selecione…</option>
              {agendamentos?.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.dataHoraInicio).toLocaleString('pt-BR')} — {a.profissional.nomeCompleto}
                </option>
              ))}
            </select>
          </label>
          <Field label="Queixa principal" value={queixaPrincipal} onChange={setQueixa} />
          <Field label="Subjetivo" value={subjetivo} onChange={setSubjetivo} required />
          <Field label="Objetivo" value={objetivo} onChange={setObjetivo} required />
          <Field label="Avaliação" value={avaliacao} onChange={setAvaliacao} required />
          <Field label="Plano" value={plano} onChange={setPlano} required />
          {erro && <p style={{ color: '#991b1b', fontSize: 13 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={onClose} style={btnSec}>Cancelar</button>
            <button type="submit" disabled={salvando} style={btnPri}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <label style={lbl}>
      {label}{required ? ' *' : ''}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={inp} />
    </label>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 'min(560px, 92vw)',
  maxHeight: '90vh', overflowY: 'auto',
};
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#475569', marginBottom: 10,
};
const inp: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
};
const btnPri: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const btnSec: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid #cbd5e1', background: '#fff',
  borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
```

**Nota:** O `<textarea>` é associado ao label porque está aninhado dentro do `<label>` — `getByLabelText` funciona. O select de agendamento usa label "Agendamento".

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/components/EvolucaoFormModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EvolucaoFormModal.tsx frontend/src/components/EvolucaoFormModal.test.tsx
git commit -m "feat(frontend): modal de criar evolucao"
```

---

## Task 9: Modal de retificar evolução

**Files:**
- Modify: `frontend/src/components/RetificarEvolucaoModal.tsx` (substitui stub)
- Create: `frontend/src/components/RetificarEvolucaoModal.test.tsx`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/components/RetificarEvolucaoModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RetificarEvolucaoModal from './RetificarEvolucaoModal';
import * as prontuarioApi from '../api/prontuario';
import type { Evolucao } from '../types/prontuario';

const evo: Evolucao = {
  id: 'evo-1', prontuarioId: 'pr-1', agendamentoId: 'ag-1', autorUsuarioId: 'u1',
  autorEhMedico: true, queixaPrincipal: 'dor', subjetivo: 'S', objetivo: 'O',
  avaliacao: 'A', plano: 'P', versao: 1, replacesId: null, createdAt: '2026-05-23T12:00:00.000Z',
};

describe('RetificarEvolucaoModal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('null quando sem evolução', () => {
    const { container } = render(
      <RetificarEvolucaoModal evolucao={null} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('pré-preenche e envia retificação', async () => {
    const ret = vi.spyOn(prontuarioApi, 'retificarEvolucao').mockResolvedValue({ id: 'evo-2' } as never);
    const onSaved = vi.fn();
    render(<RetificarEvolucaoModal evolucao={evo} onClose={vi.fn()} onSaved={onSaved} />);
    expect((screen.getByLabelText(/subjetivo/i) as HTMLTextAreaElement).value).toBe('S');
    fireEvent.change(screen.getByLabelText(/plano/i), { target: { value: 'P2' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(ret).toHaveBeenCalledWith('evo-1', expect.objectContaining({ plano: 'P2' })));
    expect(onSaved).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace frontend test -- --run src/components/RetificarEvolucaoModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `RetificarEvolucaoModal.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { retificarEvolucao } from '../api/prontuario';
import { useModalA11y } from '../hooks/useModalA11y';
import type { Evolucao } from '../types/prontuario';

interface Props {
  evolucao: Evolucao | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function RetificarEvolucaoModal({ evolucao, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(!!evolucao, onClose, dialogRef);

  const [queixaPrincipal, setQueixa] = useState('');
  const [subjetivo, setSubjetivo] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [avaliacao, setAvaliacao] = useState('');
  const [plano, setPlano] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (evolucao) {
      setQueixa(evolucao.queixaPrincipal ?? '');
      setSubjetivo(evolucao.subjetivo);
      setObjetivo(evolucao.objetivo);
      setAvaliacao(evolucao.avaliacao);
      setPlano(evolucao.plano);
      setErro('');
    }
  }, [evolucao]);

  if (!evolucao) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjetivo || !objetivo || !avaliacao || !plano) {
      setErro('Preencha todos os campos SOAP.'); return;
    }
    setSalvando(true);
    try {
      await retificarEvolucao(evolucao!.id, {
        queixaPrincipal: queixaPrincipal || undefined,
        subjetivo, objetivo, avaliacao, plano,
      });
      onSaved();
    } catch {
      setErro('Falha ao retificar. A evolução pode já ter sido retificada.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={overlay}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Retificar evolução" style={modal}>
        <h2 style={{ marginTop: 0 }}>Retificar evolução</h2>
        <form onSubmit={handleSubmit}>
          <Field label="Queixa principal" value={queixaPrincipal} onChange={setQueixa} />
          <Field label="Subjetivo" value={subjetivo} onChange={setSubjetivo} required />
          <Field label="Objetivo" value={objetivo} onChange={setObjetivo} required />
          <Field label="Avaliação" value={avaliacao} onChange={setAvaliacao} required />
          <Field label="Plano" value={plano} onChange={setPlano} required />
          {erro && <p style={{ color: '#991b1b', fontSize: 13 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={onClose} style={btnSec}>Cancelar</button>
            <button type="submit" disabled={salvando} style={btnPri}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <label style={lbl}>
      {label}{required ? ' *' : ''}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={inp} />
    </label>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 'min(560px, 92vw)',
  maxHeight: '90vh', overflowY: 'auto',
};
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#475569', marginBottom: 10,
};
const inp: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
};
const btnPri: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const btnSec: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid #cbd5e1', background: '#fff',
  borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/components/RetificarEvolucaoModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RetificarEvolucaoModal.tsx frontend/src/components/RetificarEvolucaoModal.test.tsx
git commit -m "feat(frontend): modal de retificar evolucao"
```

---

## Task 10: Aba Documentos — listagem + download

**Files:**
- Modify: `frontend/src/components/DocumentosTab.tsx` (substitui stub)
- Create: `frontend/src/components/DocumentosTab.test.tsx`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/components/DocumentosTab.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentosTab from './DocumentosTab';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as documentosApi from '../api/documentos';

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok', refreshToken: 'r',
    user: { id: 'u1', email: 'e@x', nomeCompleto: 'U', perfil },
  });
}
function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DocumentosTab pacienteId="pac-1" />
    </QueryClientProvider>,
  );
}
const doc = {
  id: 'doc-1', tipo: 'RECEITA' as const, conteudo: {}, pacienteId: 'pac-1',
  autorUsuarioId: 'u1', autorEhMedico: true, agendamentoId: null,
  createdAt: '2026-05-23T12:00:00.000Z',
};

describe('DocumentosTab', () => {
  beforeEach(() => { vi.restoreAllMocks(); setUser('MEDICO'); });

  it('lista documentos e baixa PDF', async () => {
    vi.spyOn(documentosApi, 'listarDocumentos').mockResolvedValue([doc] as never);
    const baixar = vi.spyOn(documentosApi, 'baixarDocumentoPdf').mockResolvedValue();
    renderTab();
    await screen.findByText('Receita');
    fireEvent.click(screen.getByRole('button', { name: /baixar pdf/i }));
    await waitFor(() => expect(baixar).toHaveBeenCalledWith('doc-1', 'RECEITA', 'tok'));
  });

  it('médico vê botão Novo documento; empty state sem itens', async () => {
    vi.spyOn(documentosApi, 'listarDocumentos').mockResolvedValue([] as never);
    renderTab();
    await screen.findByText(/nenhum documento/i);
    expect(screen.getByRole('button', { name: /novo documento/i })).toBeInTheDocument();
  });

  it('ADMIN não vê botão Novo documento', async () => {
    setUser('ADMIN');
    vi.spyOn(documentosApi, 'listarDocumentos').mockResolvedValue([] as never);
    renderTab();
    await screen.findByText(/nenhum documento/i);
    expect(screen.queryByRole('button', { name: /novo documento/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace frontend test -- --run src/components/DocumentosTab.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `DocumentosTab.tsx`**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarDocumentos, baixarDocumentoPdf } from '../api/documentos';
import { useAuthStore } from '../store/auth';
import { LABEL_TIPO } from '../types/documento';
import DocumentoFormModal from './DocumentoFormModal';

export default function DocumentosTab({ pacienteId }: { pacienteId: string }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token) ?? '';
  const podeEscrever = user?.perfil === 'MEDICO' || user?.perfil === 'PROFISSIONAL_NAO_MEDICO';
  const [novoOpen, setNovoOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['documentos', pacienteId],
    queryFn: () => listarDocumentos(pacienteId),
  });

  if (isLoading) return <p>Carregando…</p>;
  if (isError) return <p style={{ color: '#991b1b' }}>Erro: {(error as Error).message}</p>;

  const docs = data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {podeEscrever && (
          <button onClick={() => setNovoOpen(true)} style={primaryBtn}>+ Novo documento</button>
        )}
      </div>

      {docs.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>Nenhum documento emitido.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>Tipo</th><th style={th}>Emitido em</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={td}>{LABEL_TIPO[d.tipo]}</td>
                <td style={td}>{new Date(d.createdAt).toLocaleString('pt-BR')}</td>
                <td style={td}>
                  <button onClick={() => baixarDocumentoPdf(d.id, d.tipo, token)} style={linkBtn}>
                    Baixar PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <DocumentoFormModal
        open={novoOpen}
        pacienteId={pacienteId}
        onClose={() => setNovoOpen(false)}
        onSaved={() => { setNovoOpen(false); refetch(); }}
      />
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  padding: 0, border: 'none', background: 'none', color: '#1d4ed8',
  fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
};
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#475569' };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#0f172a' };
```

**Nota:** Importa `DocumentoFormModal` (task 11). Crie stub mínimo: `export default function DocumentoFormModal(_: { open: boolean; pacienteId: string; onClose: () => void; onSaved: () => void }) { return null; }`

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/components/DocumentosTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DocumentosTab.tsx frontend/src/components/DocumentosTab.test.tsx frontend/src/components/DocumentoFormModal.tsx
git commit -m "feat(frontend): aba documentos com listagem e download"
```

---

## Task 11: Modal de criar documento (form dinâmico por tipo)

**Files:**
- Modify: `frontend/src/components/DocumentoFormModal.tsx` (substitui stub)
- Create: `frontend/src/components/DocumentoFormModal.test.tsx`

- [ ] **Step 1: Escrever o teste falhando**

`frontend/src/components/DocumentoFormModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentoFormModal from './DocumentoFormModal';
import { useAuthStore, type AuthUser } from '../store/auth';
import * as agendaApi from '../api/agenda';
import * as documentosApi from '../api/documentos';

function setUser(perfil: AuthUser['perfil']) {
  useAuthStore.setState({
    token: 'tok', refreshToken: 'r',
    user: { id: 'u1', email: 'e@x', nomeCompleto: 'U', perfil },
  });
}
function renderModal(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DocumentoFormModal open pacienteId="pac-1" onClose={vi.fn()} onSaved={onSaved} />
    </QueryClientProvider>,
  );
}

describe('DocumentoFormModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setUser('MEDICO');
    vi.spyOn(agendaApi, 'listAgendamentos').mockResolvedValue([] as never);
  });

  it('médico vê tipo RECEITA; não-médico não vê RECEITA/ATESTADO', () => {
    renderModal();
    const select = screen.getByLabelText(/tipo/i) as HTMLSelectElement;
    const valores = Array.from(select.options).map((o) => o.value);
    expect(valores).toContain('RECEITA');
    expect(valores).toContain('ATESTADO');

    setUser('PROFISSIONAL_NAO_MEDICO');
    renderModal();
    const selects = screen.getAllByLabelText(/tipo/i) as HTMLSelectElement[];
    const ultimos = Array.from(selects[selects.length - 1].options).map((o) => o.value);
    expect(ultimos).not.toContain('RECEITA');
    expect(ultimos).not.toContain('ATESTADO');
    expect(ultimos).toContain('ORIENTACOES');
  });

  it('ORIENTACOES envia conteudo {texto}', async () => {
    const criar = vi.spyOn(documentosApi, 'criarDocumento').mockResolvedValue({ id: 'doc-1' } as never);
    const onSaved = vi.fn();
    renderModal(onSaved);
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'ORIENTACOES' } });
    fireEvent.change(screen.getByLabelText(/texto/i), { target: { value: 'repouso 48h' } });
    fireEvent.click(screen.getByRole('button', { name: /emitir/i }));
    await waitFor(() => expect(criar).toHaveBeenCalledWith('pac-1', expect.objectContaining({
      tipo: 'ORIENTACOES', conteudo: { texto: 'repouso 48h' },
    })));
    expect(onSaved).toHaveBeenCalled();
  });

  it('ATESTADO envia diasAfastamento numérico', async () => {
    const criar = vi.spyOn(documentosApi, 'criarDocumento').mockResolvedValue({ id: 'd' } as never);
    renderModal();
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'ATESTADO' } });
    fireEvent.change(screen.getByLabelText(/dias de afastamento/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /emitir/i }));
    await waitFor(() => expect(criar).toHaveBeenCalledWith('pac-1', expect.objectContaining({
      tipo: 'ATESTADO', conteudo: expect.objectContaining({ diasAfastamento: 3 }),
    })));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace frontend test -- --run src/components/DocumentoFormModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `DocumentoFormModal.tsx`**

```tsx
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAgendamentos } from '../api/agenda';
import { criarDocumento } from '../api/documentos';
import { useModalA11y } from '../hooks/useModalA11y';
import { useAuthStore } from '../store/auth';
import { LABEL_TIPO, type TipoDocumento, type Medicamento } from '../types/documento';

interface Props {
  open: boolean;
  pacienteId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function DocumentoFormModal({ open, pacienteId, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);
  const ehMedico = useAuthStore((s) => s.user)?.perfil === 'MEDICO';

  const tiposDisponiveis: TipoDocumento[] = ehMedico
    ? ['RECEITA', 'ATESTADO', 'PEDIDO_EXAME', 'ORIENTACOES']
    : ['PEDIDO_EXAME', 'ORIENTACOES'];

  const [tipo, setTipo] = useState<TipoDocumento>(tiposDisponiveis[0]);
  const [agendamentoId, setAgendamentoId] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // estados por tipo
  const [texto, setTexto] = useState('');
  const [diasAfastamento, setDias] = useState('');
  const [cid, setCid] = useState('');
  const [motivo, setMotivo] = useState('');
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([{ nome: '', posologia: '' }]);
  const [exames, setExames] = useState<string[]>(['']);

  const { data: agendamentos } = useQuery({
    queryKey: ['agendamentos', 'paciente', pacienteId],
    queryFn: () => listAgendamentos({ pacienteId }),
    enabled: open,
  });

  if (!open) return null;

  function montarConteudo(): Record<string, unknown> | null {
    if (tipo === 'ORIENTACOES') {
      if (!texto.trim()) return null;
      return { texto: texto.trim() };
    }
    if (tipo === 'ATESTADO') {
      const dias = Number(diasAfastamento);
      if (!Number.isInteger(dias) || dias < 1) return null;
      return { diasAfastamento: dias, ...(cid ? { cid } : {}), ...(motivo ? { motivo } : {}) };
    }
    if (tipo === 'RECEITA') {
      const meds = medicamentos.filter((m) => m.nome.trim() && m.posologia.trim());
      if (meds.length === 0) return null;
      return { medicamentos: meds };
    }
    // PEDIDO_EXAME
    const ex = exames.map((e) => e.trim()).filter(Boolean);
    if (ex.length === 0) return null;
    return { exames: ex };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const conteudo = montarConteudo();
    if (!conteudo) { setErro('Preencha os campos obrigatórios do documento.'); return; }
    setSalvando(true);
    try {
      await criarDocumento(pacienteId, {
        tipo, conteudo, agendamentoId: agendamentoId || undefined,
      });
      onSaved();
    } catch {
      setErro('Falha ao emitir documento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={overlay}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Novo documento" style={modal}>
        <h2 style={{ marginTop: 0 }}>Novo documento</h2>
        <form onSubmit={handleSubmit}>
          <label style={lbl}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} style={inp}>
              {tiposDisponiveis.map((t) => (
                <option key={t} value={t}>{LABEL_TIPO[t]}</option>
              ))}
            </select>
          </label>

          <label style={lbl}>
            Agendamento (opcional)
            <select value={agendamentoId} onChange={(e) => setAgendamentoId(e.target.value)} style={inp}>
              <option value="">Sem vínculo</option>
              {agendamentos?.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.dataHoraInicio).toLocaleString('pt-BR')} — {a.profissional.nomeCompleto}
                </option>
              ))}
            </select>
          </label>

          {tipo === 'ORIENTACOES' && (
            <label style={lbl}>
              Texto
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} style={inp} />
            </label>
          )}

          {tipo === 'ATESTADO' && (
            <>
              <label style={lbl}>
                Dias de afastamento
                <input type="number" min={1} value={diasAfastamento}
                  onChange={(e) => setDias(e.target.value)} style={inp} />
              </label>
              <label style={lbl}>
                CID (opcional)
                <input value={cid} onChange={(e) => setCid(e.target.value)} style={inp} />
              </label>
              <label style={lbl}>
                Motivo (opcional)
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} style={inp} />
              </label>
            </>
          )}

          {tipo === 'RECEITA' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Medicamentos</div>
              {medicamentos.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input aria-label={`medicamento ${i + 1} nome`} placeholder="Nome" value={m.nome}
                    onChange={(e) => setMedicamentos(upd(medicamentos, i, { ...m, nome: e.target.value }))}
                    style={{ ...inp, flex: 1 }} />
                  <input aria-label={`medicamento ${i + 1} posologia`} placeholder="Posologia" value={m.posologia}
                    onChange={(e) => setMedicamentos(upd(medicamentos, i, { ...m, posologia: e.target.value }))}
                    style={{ ...inp, flex: 1 }} />
                </div>
              ))}
              <button type="button" onClick={() => setMedicamentos([...medicamentos, { nome: '', posologia: '' }])} style={addBtn}>
                + Medicamento
              </button>
            </div>
          )}

          {tipo === 'PEDIDO_EXAME' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Exames</div>
              {exames.map((ex, i) => (
                <input key={i} aria-label={`exame ${i + 1}`} placeholder="Exame" value={ex}
                  onChange={(e) => setExames(upd(exames, i, e.target.value))}
                  style={{ ...inp, display: 'block', marginBottom: 6, width: '100%' }} />
              ))}
              <button type="button" onClick={() => setExames([...exames, ''])} style={addBtn}>
                + Exame
              </button>
            </div>
          )}

          {erro && <p style={{ color: '#991b1b', fontSize: 13 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={onClose} style={btnSec}>Cancelar</button>
            <button type="submit" disabled={salvando} style={btnPri}>Emitir</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function upd<T>(arr: T[], i: number, v: T): T[] {
  const copy = [...arr];
  copy[i] = v;
  return copy;
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 'min(560px, 92vw)',
  maxHeight: '90vh', overflowY: 'auto',
};
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#475569', marginBottom: 10,
};
const inp: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
};
const addBtn: React.CSSProperties = {
  padding: '4px 10px', border: '1px dashed #cbd5e1', background: '#fff',
  borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#1d4ed8',
};
const btnPri: React.CSSProperties = {
  padding: '8px 14px', border: 'none', background: '#1d4ed8', color: '#fff',
  borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const btnSec: React.CSSProperties = {
  padding: '8px 14px', border: '1px solid #cbd5e1', background: '#fff',
  borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace frontend test -- --run src/components/DocumentoFormModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DocumentoFormModal.tsx frontend/src/components/DocumentoFormModal.test.tsx
git commit -m "feat(frontend): modal de criar documento com form dinamico por tipo"
```

---

## Task 12: Verificação final (suite + lint + build)

**Files:** nenhum novo.

- [ ] **Step 1: Rodar a suite completa**

Run: `npm --workspace frontend test -- --run`
Expected: PASS (todos os arquivos, incluindo os ~7 novos).

- [ ] **Step 2: Lint**

Run: `npm --workspace frontend run lint`
Expected: 0 errors, 0 warnings (max-warnings 0).

- [ ] **Step 3: Build de produção (type-check + bundle)**

Run: `npm --workspace frontend run build`
Expected: build sem erros de tsc.

- [ ] **Step 4: Commit (se algo foi ajustado nos passos acima)**

```bash
git add -- frontend/src
git commit -m "test(frontend): verificacao final prontuario+documentos UI"
```

(Se nada mudou, pular o commit.)

---

## Notas de deploy (fora do escopo da implementação, para quem executar)

Após merge: redeploy do frontend no homolog conforme runbook — `git pull origin master` + `docker compose --env-file .env.homolog -f docker-compose.homolog.yml build frontend && up -d frontend`. Sem migration (mudança só frontend). Validar criação de evolução/documento e download de PDF na UI com hard-refresh (PWA cacheia).
```
