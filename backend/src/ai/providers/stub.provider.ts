import { AiProvider, AiRequest, AiResult } from './ai-provider.interface';

/** Provider determinístico para testes e ambiente sem API key. Não faz rede. */
export class StubProvider implements AiProvider {
  readonly nome = 'stub';

  async gerar(req: AiRequest): Promise<AiResult> {
    const conteudo = `[SUGESTÃO IA - STUB]\n${req.user.slice(0, 500)}`;
    return {
      conteudo,
      modelo: 'stub-1',
      tokensPrompt: Math.ceil((req.system.length + req.user.length) / 4),
      tokensResposta: Math.ceil(conteudo.length / 4),
    };
  }
}
