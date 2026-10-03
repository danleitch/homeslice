/**
 * The strongest AI models right now, from BenchLM's data API. The key stays
 * on the server: the page asks this site's /api/benchlm relay, which adds it
 * and keeps each answer for half a week, so a free plan's thousand reads a
 * month go a long way.
 */
export type BenchSurface = 'overall' | 'coding' | 'agentic' | 'knowledge';

export const BENCH_SURFACES: readonly BenchSurface[] = [
  'overall',
  'coding',
  'agentic',
  'knowledge'
];

export const SURFACE_LABELS: Readonly<Record<BenchSurface, string>> = {
  overall: 'Overall',
  coding: 'Coding',
  agentic: 'Agents',
  knowledge: 'Knowledge'
};

export type BenchmarkWidget = {
  id: string;
  type: 'benchlm';
  width: number;
  surface: BenchSurface;
  /** Only models from this lab, e.g. "Anthropic"; empty for every lab. */
  creator: string;
  count: number;
  /** Only models at or under this many dollars per million tokens (see blendedPrice); 0 for any price. */
  maxPrice: number;
};

/** The two ways most people read the board; each fills in the settings it names. */
export const BENCH_PRESETS = {
  top: { label: 'Top of the charts', surface: 'overall', creator: '', count: 5, maxPrice: 0 },
  budget: { label: 'Budget coding', surface: 'coding', creator: '', count: 15, maxPrice: 1 }
} as const;

export type BenchPreset = keyof typeof BENCH_PRESETS;

/** The preset a widget's settings amount to, if any; the count is free to differ. */
export const presetOf = (widget: BenchmarkWidget): BenchPreset | 'custom' =>
  (Object.keys(BENCH_PRESETS) as BenchPreset[]).find((name) => {
    const preset = BENCH_PRESETS[name];
    return (
      widget.surface === preset.surface &&
      widget.creator.trim() === preset.creator &&
      widget.maxPrice === preset.maxPrice
    );
  }) ?? 'custom';

/** Dollars per million tokens, as BenchLM lists them. */
export type ModelPrice = { input: number; output: number };

/** Prices by priceKey, so the two lists can be matched whatever their punctuation. */
export type Prices = Readonly<Record<string, ModelPrice>>;

export type RankedModel = {
  rank: number;
  name: string;
  creator: string;
  score: number;
  /** The 90% range BenchLM gives the score, when it gives one. */
  low: number | null;
  high: number | null;
};

export type PricedModel = RankedModel & { price: ModelPrice | null };

/** "Claude Sonnet 5.5" and "claude-sonnet-5.5" are the same model. */
export const priceKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const priceOf = (prices: Prices, name: string): ModelPrice | null => {
  const key = priceKey(name);
  return Object.prototype.hasOwnProperty.call(prices, key) ? prices[key] : null;
};

/**
 * What a model costs per million tokens when three parts of input go with one
 * of output, which is about how chat and coding traffic runs. The cap is on
 * this, so a cheap input price can't hide an expensive output.
 */
export const blendedPrice = ({ input, output }: ModelPrice): number => (3 * input + output) / 4;

export type Rankings = {
  models: RankedModel[];
  /** The day BenchLM scored these, as YYYY-MM-DD. */
  asOf: string;
};

/** The relay fetches this many and the widget picks from them, so its settings never cost a read. */
export const RELAY_LIMIT = 50;

const RELAY = '/api/benchlm/rankings';

type RawItem = {
  rank?: unknown;
  name?: unknown;
  creator?: unknown;
  score?: unknown;
  scoreInterval90Lower?: unknown;
  scoreInterval90Upper?: unknown;
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const readRankings = (body: unknown): Rankings => {
  const raw = (body ?? {}) as { items?: unknown; dataAsOf?: unknown };

  return {
    asOf: typeof raw.dataAsOf === 'string' ? raw.dataAsOf : '',
    models: (Array.isArray(raw.items) ? (raw.items as RawItem[]) : [])
      .filter((item) => item && typeof item.name === 'string' && finite(item.score) !== null)
      .map((item, index) => ({
        rank: finite(item.rank) ?? index + 1,
        name: item.name as string,
        creator: typeof item.creator === 'string' ? item.creator : '',
        score: finite(item.score)!,
        low: finite(item.scoreInterval90Lower),
        high: finite(item.scoreInterval90Upper)
      }))
  };
};

/**
 * The models the widget shows: from one lab if it asks, as many as it asks. With
 * a price limit, only models BenchLM lists a price for, at or under it.
 */
export const pickModels = (
  rankings: Rankings,
  creator: string,
  count: number,
  maxPrice = 0,
  prices: Prices = {}
): PricedModel[] => {
  const lab = creator.trim().toLowerCase();
  return rankings.models
    .filter((model) => !lab || model.creator.toLowerCase().includes(lab))
    .map((model) => ({ ...model, price: priceOf(prices, model.name) }))
    .filter((model) => !maxPrice || (model.price !== null && blendedPrice(model.price) <= maxPrice))
    .slice(0, count);
};

export const fetchRankings = async (
  surface: BenchSurface,
  signal: AbortSignal
): Promise<Rankings> => {
  const response = await fetch(`${RELAY}?surface=${surface}`, { signal });

  if (response.status === 401 || response.status === 403) {
    throw new Error('BenchLM isn’t set up on this server yet: it needs a BENCHLM_TOKEN.');
  }

  if (response.status === 429) {
    throw new Error('BenchLM’s monthly reads have run out; it will try again later.');
  }

  if (!(response.headers.get('content-type') ?? '').includes('json')) {
    // A static host answers with its index page: there is no relay to ask.
    throw new Error(
      'BenchLM goes through this dashboard’s server, which this host doesn’t provide.'
    );
  }

  if (!response.ok) {
    throw new Error('BenchLM didn’t answer.');
  }

  return readRankings(await response.json());
};

/**
 * Prices come from BenchLM's public list (CC BY-NC 4.0), which has no key: the
 * relay only caches it. The list is longer than one page, so the relay serves
 * it in pages of this many models.
 */
const PRICES_RELAY = '/api/benchlm/pricing';
const PRICE_PAGE = 200;
const PRICE_PAGES = 5;

type PriceRow = { name: string; input: number; output: number };

const readPriceRows = (body: unknown): PriceRow[] => {
  const models = (body as { models?: unknown } | null)?.models;

  return (Array.isArray(models) ? (models as Record<string, unknown>[]) : []).flatMap((item) => {
    const input = finite(item?.inputPrice);
    const output = finite(item?.outputPrice);
    return typeof item?.model === 'string' && input !== null && output !== null
      ? [{ name: item.model, input, output }]
      : [];
  });
};

const fetchPricePage = async (offset: number, signal: AbortSignal): Promise<PriceRow[]> => {
  const response = await fetch(`${PRICES_RELAY}?offset=${offset}`, { signal });

  if (!(response.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(
      'BenchLM’s prices go through this dashboard’s server, which this host doesn’t provide.'
    );
  }

  if (!response.ok) {
    throw new Error('BenchLM’s prices didn’t answer.');
  }

  return readPriceRows(await response.json());
};

/**
 * Every model BenchLM lists an API price for. A price of nothing on both sides
 * (open weights, mostly) is no price at all, so those aren't kept.
 */
export const fetchPrices = async (signal: AbortSignal): Promise<Prices> => {
  const first = await fetchPricePage(0, signal);
  // Later pages only add models, so one that fails costs those models, not the list.
  const later = await Promise.all(
    Array.from({ length: PRICE_PAGES - 1 }, (_, index) =>
      first.length === PRICE_PAGE
        ? fetchPricePage((index + 1) * PRICE_PAGE, signal).catch((error: unknown) => {
            if (signal.aborted) {
              throw error;
            }

            return [];
          })
        : []
    )
  );
  const prices: Record<string, ModelPrice> = {};
  const seen = new Set<string>();

  for (const row of [first, ...later].flat()) {
    const key = priceKey(row.name);

    if (!seen.has(key)) {
      seen.add(key);

      if (row.input > 0 || row.output > 0) {
        prices[key] = { input: row.input, output: row.output };
      }
    }
  }

  if (seen.size === 0) {
    throw new Error('BenchLM didn’t list any prices.');
  }

  return prices;
};
