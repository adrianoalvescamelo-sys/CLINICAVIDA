import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const PAGINATION_DEFAULT_LIMIT = 50;
export const PAGINATION_MAX_LIMIT = 200;

/**
 * Base DTO para paginação por cursor (id UUID).
 * Outros DTOs podem estender via Pick/Mixin ou repetir os campos.
 */
export class CursorPaginationDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  limit?: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Aplica limit clamp e devolve {items, nextCursor}.
 * Caller deve buscar com `take: resolveTake(limit)` (limit+1) para que
 * este helper detecte se há próxima página.
 */
export function resolveLimit(limit?: number): number {
  if (!limit || limit < 1) return PAGINATION_DEFAULT_LIMIT;
  return Math.min(limit, PAGINATION_MAX_LIMIT);
}

export function resolveTake(limit?: number): number {
  return resolveLimit(limit) + 1;
}

export function paginateCursor<T extends { id: string }>(
  rows: T[],
  limit?: number,
): CursorPage<T> {
  const max = resolveLimit(limit);
  if (rows.length <= max) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, max);
  return { items, nextCursor: items[items.length - 1].id };
}
