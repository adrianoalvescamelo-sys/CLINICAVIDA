/**
 * Sufixo comparável de telefone brasileiro.
 *
 * Celulares no Brasil têm 9 dígitos de assinante (com o "9" na frente), mas o
 * JID do WhatsApp/Evolution às vezes vem sem esse 9. Comparar pelos últimos 8
 * dígitos (número do assinante, sem o 9 e sem DDI/DDD) torna o match estável
 * entre variações como `5565981305380` (com 9) e `556581305380` (sem 9).
 */
export function sufixoComparavelBR(raw: string): string {
  return (raw ?? '').replace(/\D/g, '').slice(-8);
}
