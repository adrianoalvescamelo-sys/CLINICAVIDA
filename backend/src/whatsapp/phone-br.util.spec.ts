/**
 * Unit tests — sufixoComparavelBR
 *
 * Match de telefones brasileiros tolerante ao 9º dígito (celulares com/sem o 9)
 * e ao DDI. Usa os últimos 8 dígitos (número do assinante), estável entre
 * variações como 5565981305380 (com 9) e 556581305380 (sem 9).
 */

import { sufixoComparavelBR } from './phone-br.util';

describe('sufixoComparavelBR', () => {
  it('retorna os últimos 8 dígitos', () => {
    expect(sufixoComparavelBR('5565981305380')).toBe('81305380');
  });

  it('número com e sem o 9º dígito produzem o mesmo sufixo', () => {
    expect(sufixoComparavelBR('5565981305380')).toBe(
      sufixoComparavelBR('556581305380'),
    );
  });

  it('ignora caracteres não numéricos', () => {
    expect(sufixoComparavelBR('+55 (66) 99999-1111')).toBe('99991111');
  });

  it('número curto retorna apenas os dígitos disponíveis', () => {
    expect(sufixoComparavelBR('1234')).toBe('1234');
  });
});
