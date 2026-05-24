import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiRequest, AiResult } from './ai-provider.interface';

export class AnthropicProvider implements AiProvider {
  readonly nome = 'anthropic';
  private readonly client: Anthropic;
  private readonly modelo: string;

  constructor(config: ConfigService) {
    this.client = new Anthropic({
      apiKey: config.get<string>('ai.anthropicApiKey') ?? '',
    });
    this.modelo = config.get<string>('ai.anthropicModel') ?? 'claude-opus-4-7';
  }

  async gerar(req: AiRequest): Promise<AiResult> {
    const resp = await this.client.messages.create(
      {
        model: this.modelo,
        max_tokens: req.maxTokens,
        // prompt caching no system para reduzir custo em chamadas repetidas
        system: [
          {
            type: 'text',
            text: req.system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: req.user }],
      },
      { timeout: req.timeoutMs },
    );
    const conteudo = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return {
      conteudo,
      modelo: resp.model,
      tokensPrompt: resp.usage?.input_tokens ?? null,
      tokensResposta: resp.usage?.output_tokens ?? null,
    };
  }
}
