/**
 * Following a token that no exchange lists. The Markets widget reads Yahoo Finance, which only
 * knows listed instruments, so a row whose symbol is a token's contract address is read from
 * DexScreener instead: the price in dollars, the day's change, and how much money is in the pool
 * the price comes from. The trend is drawn from GeckoTerminal's daily candles, and from the
 * changes DexScreener reports when a new token hasn't any yet. Both answer browsers directly,
 * and neither needs a key.
 */
import type { Quote } from './markets';
import type { MarketSymbol } from './model';

const DEX_TOKENS = 'https://api.dexscreener.com/latest/dex/tokens/';
const GECKO_NETWORKS_URL = 'https://api.geckoterminal.com/api/v2/networks';

/** The longest a symbol may be kept: an address runs to 44 characters, a Yahoo symbol to 24. */
const MAX_ADDRESS = 64;
const MAX_YAHOO_SYMBOL = 24;

/**
 * Whether text is a token's contract address: a Solana mint (base58, 32 to 44 characters) or an
 * address on an Ethereum-style chain (0x and forty hex digits). A Yahoo symbol is never either:
 * base58 has no hyphens or carets, and no symbol runs to thirty-two characters.
 */
export const isTokenAddress = (text: string): boolean =>
  /^0x[0-9a-fA-F]{40}$/.test(text) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);

/**
 * A symbol as it is kept: Yahoo's are upper case, but a Solana address is case-sensitive, so an
 * address is kept exactly as it is.
 */
export const normalizeSymbol = (text: string): string => {
  const trimmed = text.trim().slice(0, MAX_ADDRESS);
  return isTokenAddress(trimmed) ? trimmed : trimmed.toUpperCase().slice(0, MAX_YAHOO_SYMBOL);
};

/** Decimal places that show four significant digits of a price under a dollar; two from there up. */
export const priceDigits = (price: number): number =>
  price >= 1 || !(price > 0) ? 2 : Math.min(12, -Math.floor(Math.log10(price)) + 3);

/** "$38.5K", "$1.2M": money in a few characters. */
export const compactUsd = (amount: number): string => {
  const [divisor, suffix] =
    amount >= 1e9 ? [1e9, 'B'] : amount >= 1e6 ? [1e6, 'M'] : amount >= 1e3 ? [1e3, 'K'] : [1, ''];
  const scaled = amount / divisor;
  return `$${scaled >= 100 || divisor === 1 ? Math.round(scaled) : scaled.toFixed(1)}${suffix}`;
};

/** A pool with less money than this is thin: a few trades move its price a long way. */
export const THIN_LIQUIDITY = 50_000;

type DexPair = {
  chainId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | number;
  priceChange?: { h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
};

type DexResponse = { pairs?: DexPair[] | null };

const finite = (value: unknown): number | null => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

/**
 * The pool to read the price from: of those that trade the token against something (not the
 * ones where it is the other side), the one with the most money in it, which is the one a price
 * can be trusted most.
 */
export const pickPair = (address: string, body: unknown): DexPair | null => {
  const pairs = (body as DexResponse | null)?.pairs;

  if (!Array.isArray(pairs)) {
    return null;
  }

  const wanted = address.toLowerCase();
  const usable = pairs.filter((pair) => {
    const price = finite(pair?.priceUsd);
    return pair?.baseToken?.address?.toLowerCase() === wanted && price !== null && price > 0;
  });

  return usable.reduce<DexPair | null>(
    (best, pair) =>
      !best || (finite(pair.liquidity?.usd) ?? 0) > (finite(best.liquidity?.usd) ?? 0)
        ? pair
        : best,
    null
  );
};

/** GeckoTerminal's names for the chains DexScreener calls by theirs. */
const GECKO_NETWORKS: Readonly<Record<string, string>> = {
  solana: 'solana',
  ethereum: 'eth',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  optimism: 'optimism'
};

/** The closing prices out of GeckoTerminal's candles, oldest first (it lists the newest first). */
export const readCloses = (body: unknown): number[] => {
  const list = (body as { data?: { attributes?: { ohlcv_list?: unknown } } } | null)?.data
    ?.attributes?.ohlcv_list;

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((candle) => (Array.isArray(candle) ? finite(candle[4]) : null))
    .filter((close): close is number => close !== null && close > 0)
    .reverse();
};

/**
 * A rough trend for a token with no candles yet, from the changes DexScreener reports over the
 * last day, six hours and hour: what the price must have been then, and what it is now.
 */
export const closesFromChanges = (price: number, change: DexPair['priceChange']): number[] => [
  ...[change?.h24, change?.h6, change?.h1]
    .map(finite)
    .filter((percent): percent is number => percent !== null && percent > -100)
    .map((percent) => price / (1 + percent / 100)),
  price
];

/** A pair and its trend, as the widget's own kind of quote. */
export const quoteOf = (request: MarketSymbol, pair: DexPair, closes: number[]): Quote => {
  const price = finite(pair.priceUsd)!;
  const liquidity = finite(pair.liquidity?.usd);

  return {
    symbol: pair.baseToken?.symbol || `${request.symbol.slice(0, 4)}…`,
    name: request.name || pair.baseToken?.name || '',
    price,
    change: finite(pair.priceChange?.h24) ?? 0,
    currency: 'USD',
    precision: priceDigits(price),
    closes: closes.length >= 2 ? closes : closesFromChanges(price, pair.priceChange),
    url:
      pair.url ||
      (pair.chainId && pair.pairAddress
        ? `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`
        : undefined),
    ...(liquidity !== null ? { liquidity } : {})
  };
};

/** The daily closes of a pool, or none: a token's trend is never worth losing its price over. */
const fetchCloses = async (pair: DexPair, signal: AbortSignal): Promise<number[]> => {
  const network = GECKO_NETWORKS[pair.chainId ?? ''];

  if (!network || !pair.pairAddress) {
    return [];
  }

  try {
    const response = await fetch(
      `${GECKO_NETWORKS_URL}/${network}/pools/${encodeURIComponent(pair.pairAddress)}/ohlcv/day?aggregate=1&limit=22&currency=usd`,
      { signal }
    );

    return response.ok ? readCloses(await response.json()) : [];
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    return [];
  }
};

/** A token's quote, or null when DexScreener has no pool that trades it. */
export const fetchToken = async (
  request: MarketSymbol,
  signal: AbortSignal
): Promise<Quote | null> => {
  const response = await fetch(`${DEX_TOKENS}${encodeURIComponent(request.symbol)}`, { signal });

  if (!response.ok) {
    return null;
  }

  const pair = pickPair(request.symbol, await response.json());

  return pair ? quoteOf(request, pair, await fetchCloses(pair, signal)) : null;
};
