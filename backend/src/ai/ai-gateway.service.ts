import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDERS, AiProvider } from './providers/ai-provider.interface';

export class AiIndisponivelError extends Error {
  constructor(message = 'IA indisponível') {
    super(message);
    this.name = 'AiIndisponivelError';
  }
}

export interface GatewayRequest {
  system: string;
  user: string;
}

export interface GatewayResult {
  provider: string;
  modelo: string;
  conteudo: string;
  tokensPrompt: number | null;
  tokensResposta: number | null;
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(AI_PROVIDERS) private readonly providers: AiProvider[],
  ) {}

  /** Ordena providers: default primeiro, demais como fallback. */
  private ordenar(): AiProvider[] {
    const def = this.config.get<string>('ai.providerDefault');
    return [...this.providers].sort((a, b) => {
      if (a.nome === def) return -1;
      if (b.nome === def) return 1;
      return 0;
    });
  }

  async gerar(req: GatewayRequest): Promise<GatewayResult> {
    if (!this.config.get<boolean>('ai.enabled')) {
      throw new AiIndisponivelError('IA desabilitada (AI_ENABLED=false)');
    }
    const maxTokens = this.config.get<number>('ai.maxTokens') ?? 1024;
    const timeoutMs = this.config.get<number>('ai.timeoutMs') ?? 60000;
    const providers = this.ordenar();

    for (const provider of providers) {
      // retry 1x no mesmo provider antes de cair pro próximo
      for (let tentativa = 1; tentativa <= 2; tentativa++) {
        try {
          const res = await provider.gerar({
            system: req.system,
            user: req.user,
            maxTokens,
            timeoutMs,
          });
          if (!res.conteudo || res.conteudo.trim().length === 0) {
            throw new Error('resposta vazia');
          }
          return {
            provider: provider.nome,
            modelo: res.modelo,
            conteudo: res.conteudo,
            tokensPrompt: res.tokensPrompt,
            tokensResposta: res.tokensResposta,
          };
        } catch (err) {
          this.logger.warn(
            `provider=${provider.nome} tentativa=${tentativa} falhou: ${
              (err as Error).message
            }`,
          );
        }
      }
    }
    throw new AiIndisponivelError('Nenhum provider de IA respondeu');
  }
}
