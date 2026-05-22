import PDFDocument from 'pdfkit';
import { TipoDocumento } from '@prisma/client';

export interface PdfInput {
  tipo: TipoDocumento;
  paciente: string;
  autor: string;
  conteudo: Record<string, unknown>;
}

const TITULO: Record<TipoDocumento, string> = {
  RECEITA: 'Receita Médica',
  ATESTADO: 'Atestado Médico',
  PEDIDO_EXAME: 'Pedido de Exame',
  ORIENTACOES: 'Orientações',
};

function fmtDate(d: Date): string {
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function gerarDocumentoPdf(input: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Clínica Vida Popular — Sinop/MT', { align: 'center' });
    doc.fontSize(13).text(TITULO[input.tipo], { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).font('Helvetica');
    doc.text(`Paciente: ${input.paciente}`);
    doc.text(`Profissional: ${input.autor}`);
    doc.text(`Data: ${fmtDate(new Date())}`);
    doc.moveDown();

    const c = input.conteudo;
    if (input.tipo === 'ATESTADO') {
      const dias = c.diasAfastamento;
      doc.text(`Atesto, para os devidos fins, afastamento de ${dias} dia(s).`);
      if (c.cid) doc.text(`CID: ${String(c.cid)}`);
      if (c.motivo) doc.text(`Motivo: ${String(c.motivo)}`);
    } else if (input.tipo === 'RECEITA') {
      doc.font('Helvetica-Bold').text('Prescrição:').font('Helvetica');
      const meds =
        (c.medicamentos as { nome: string; posologia: string }[]) ?? [];
      meds.forEach((m, i) =>
        doc.text(`${i + 1}. ${m.nome} — ${m.posologia}`, { lineGap: 2 }),
      );
    } else if (input.tipo === 'PEDIDO_EXAME') {
      doc.font('Helvetica-Bold').text('Exames solicitados:').font('Helvetica');
      const exames = (c.exames as string[]) ?? [];
      exames.forEach((e, i) => doc.text(`${i + 1}. ${e}`, { lineGap: 2 }));
    } else {
      doc.text(String(c.texto ?? ''));
    }

    doc.moveDown(4);
    doc.text('_______________________________', { align: 'center' });
    doc.text(input.autor, { align: 'center' });

    doc.end();
  });
}
