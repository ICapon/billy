/**
 * Price table in USD per million tokens. Values are estimates for budgeting and limits, not
 * invoices: update them when provider pricing changes. Because
 * (tokens x USD per million tokens) equals micro-USD, no unit conversion is needed.
 */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const PRICE_TABLE_VERSION = '2026-10-18';

const HAIKU: ModelPrice = { inputPerMTok: 1, outputPerMTok: 5 };
const SONNET: ModelPrice = { inputPerMTok: 3, outputPerMTok: 15 };
const OPUS: ModelPrice = { inputPerMTok: 5, outputPerMTok: 25 };

/** Exact model ids first; family fallbacks below keep new minor versions priced. */
const EXACT: Record<string, ModelPrice> = {
  'claude-haiku-5-5': HAIKU,
  'claude-sonnet-5-5': SONNET,
  'claude-opus-5-5': OPUS,
  'voyage-3.5-lite': { inputPerMTok: 0.02, outputPerMTok: 0 },
  'voyage-3.5': { inputPerMTok: 0.06, outputPerMTok: 0 },
};

export function priceFor(model: string): ModelPrice {
  const exact = EXACT[model];
  if (exact) return exact;
  const id = model.toLowerCase();
  if (id.includes('haiku')) return HAIKU;
  if (id.includes('sonnet')) return SONNET;
  if (id.includes('opus')) return OPUS;
  if (id.includes('voyage')) return EXACT['voyage-3.5-lite'];
  // Unknown model: assume the most expensive known price so limits err on the safe side.
  return OPUS;
}
