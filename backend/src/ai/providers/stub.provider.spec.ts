import { StubProvider } from './stub.provider';

describe('StubProvider', () => {
  const provider = new StubProvider();

  it('tem nome stub', () => {
    expect(provider.nome).toBe('stub');
  });

  it('retorna conteúdo determinístico contendo trecho do user', async () => {
    const res = await provider.gerar({
      system: 'sys',
      user: 'queixa: dor de cabeça',
      maxTokens: 1024,
      timeoutMs: 60000,
    });
    expect(res.conteudo).toContain('[SUGESTÃO IA - STUB]');
    expect(res.conteudo).toContain('dor de cabeça');
    expect(res.modelo).toBe('stub-1');
    expect(res.tokensPrompt).toBeGreaterThan(0);
    expect(res.tokensResposta).toBeGreaterThan(0);
  });
});
