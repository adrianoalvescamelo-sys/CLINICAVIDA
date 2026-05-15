import { describe, expect, it } from 'vitest';
import { clinicDayKey, formatClinicTime } from './clinic-date';

describe('clinic-date', () => {
  it('gera a chave do dia em UTC ISO', () => {
    expect(clinicDayKey(new Date('2026-05-14T12:34:56.000Z'))).toBe(
      '2026-05-14',
    );
  });

  it('formata hora para pt-BR', () => {
    expect(formatClinicTime('2026-05-14T12:34:56.000Z')).toBe('08:34');
  });
});
