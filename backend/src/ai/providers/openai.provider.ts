import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiRequest, AiResult } from './ai-provider.interface';

export class OpenAiProvider implements AiProvider {
  readonly nome = 'openai';
  private readonly client: OpenAI;
  private readonly modelo: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({
      apiKey: config.get<string>('ai.openaiApiKey') ?? '',
    });
    this.modelo = config.get<string>('ai.openaiModel') ?? 'gpt-4o';
  }

  async gerar(req: AiRequest): Promise<AiResult> {
    const resp = await this.client.chat.completions.create(
      {
        model: this.modelo,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      },
      { timeout: req.timeoutMs },
    );
    const conteudo = resp.choices[0]?.message?.content ?? '';
    return {
      conteudo,
      modelo: resp.model,
      tokensPrompt: resp.usage?.prompt_tokens ?? null,
      tokensResposta: resp.usage?.completion_tokens ?? null,
    };
  }
}
