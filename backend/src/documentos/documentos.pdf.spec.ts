import { gerarDocumentoPdf } from './documentos.pdf';
import { TipoDocumento } from '@prisma/client';

describe('gerarDocumentoPdf', () => {
  const base = { paciente: 'Fulano de Tal', autor: 'Dr. Beltrano' };

  it('ATESTADO gera Buffer PDF (%PDF) não-vazio', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.ATESTADO,
      ...base,
      conteudo: { diasAfastamento: 3, cid: 'J11', motivo: 'gripe' },
    });
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('RECEITA gera Buffer PDF', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.RECEITA,
      ...base,
      conteudo: { medicamentos: [{ nome: 'Dipirona', posologia: '1cp 8/8h' }] },
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('PEDIDO_EXAME gera Buffer PDF', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.PEDIDO_EXAME,
      ...base,
      conteudo: { exames: ['Hemograma', 'Glicemia'] },
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('ORIENTACOES gera Buffer PDF', async () => {
    const buf = await gerarDocumentoPdf({
      tipo: TipoDocumento.ORIENTACOES,
      ...base,
      conteudo: { texto: 'Repouso e hidratação.' },
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
