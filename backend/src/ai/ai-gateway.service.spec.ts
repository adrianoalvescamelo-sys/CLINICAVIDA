import { ConfigService } from '@nestjs/config';
import { AiGatewayService, AiIndisponivelError } from './ai-gateway.service';
import { AiProvider, AiResult } from './providers/ai-provider.interface';

function fakeProvider(nome: string, impl: () => Promise<AiResult>): AiProvider {
  return { nome, gerar: jest.fn(impl) };
}

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const base: Record<string, unknown> = {
    'ai.enabled': true,
    'ai.providerDefault': 'anthropic',
    'ai.maxTokens': 1024,
    'ai.timeoutMs': 60000,
    ...overrides,
  };
  return { get: (k: string) => base[k] } as unknown as ConfigService;
}

const ok = (nome: string): AiResult => ({
  conteudo: `resp-${nome}`,
  modelo: `${nome}-model`,
  tokensPrompt: 10,
  tokensResposta: 20,
});

describe('AiGatewayService', () => {
  it('usa provider default quando responde', async () => {
    const anthropic = fakeProvider('anthropic', async () => ok('anthropic'));
    const openai = fakeProvider('openai', async () => ok('openai'));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    const res = await svc.gerar({ system: 's', user: 'u' });
    expect(res.provider).toBe('anthropic');
    expect(res.conteudo).toBe('resp-anthropic');
  });

  it('faz retry 1x no default antes de fallback', async () => {
    let calls = 0;
    const anthropic = fakeProvider('anthropic', async () => {
      calls++;
      if (calls === 1) throw new Error('timeout');
      return ok('anthropic');
    });
    const openai = fakeProvider('openai', async () => ok('openai'));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    const res = await svc.gerar({ system: 's', user: 'u' });
    expect(calls).toBe(2);
    expect(res.provider).toBe('anthropic');
    expect(openai.gerar).not.toHaveBeenCalled();
  });

  it('faz fallback ao outro provider quando default falha sempre', async () => {
    const anthropic = fakeProvider('anthropic', async () => {
      throw new Error('down');
    });
    const openai = fakeProvider('openai', async () => ok('openai'));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    const res = await svc.gerar({ system: 's', user: 'u' });
    expect(res.provider).toBe('openai');
  });

  it('lança AiIndisponivelError quando todos falham', async () => {
    const anthropic = fakeProvider('anthropic', async () => {
      throw new Error('down');
    });
    const openai = fakeProvider('openai', async () => {
      throw new Error('down');
    });
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    await expect(svc.gerar({ system: 's', user: 'u' })).rejects.toBeInstanceOf(
      AiIndisponivelError,
    );
  });

  it('lança AiIndisponivelError quando resposta vem vazia', async () => {
    const anthropic = fakeProvider('anthropic', async () => ({
      conteudo: '   ',
      modelo: 'm',
      tokensPrompt: 1,
      tokensResposta: 0,
    }));
    const openai = fakeProvider('openai', async () => ({
      conteudo: '',
      modelo: 'm',
      tokensPrompt: 1,
      tokensResposta: 0,
    }));
    const svc = new AiGatewayService(config(), [anthropic, openai]);
    await expect(svc.gerar({ system: 's', user: 'u' })).rejects.toBeInstanceOf(
      AiIndisponivelError,
    );
  });

  it('lança AiIndisponivelError quando AI_ENABLED=false', async () => {
    const anthropic = fakeProvider('anthropic', async () => ok('anthropic'));
    const svc = new AiGatewayService(config({ 'ai.enabled': false }), [
      anthropic,
    ]);
    await expect(svc.gerar({ system: 's', user: 'u' })).rejects.toBeInstanceOf(
      AiIndisponivelError,
    );
    expect(anthropic.gerar).not.toHaveBeenCalled();
  });
});
