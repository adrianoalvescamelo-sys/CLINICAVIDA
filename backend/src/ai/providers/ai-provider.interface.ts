export interface AiRequest {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface AiResult {
  conteudo: string;
  modelo: string;
  tokensPrompt: number | null;
  tokensResposta: number | null;
}

export interface AiProvider {
  readonly nome: string; // 'anthropic' | 'openai' | 'stub'
  gerar(req: AiRequest): Promise<AiResult>;
}

// Token de injeção (multi-provider)
export const AI_PROVIDERS = Symbol('AI_PROVIDERS');
