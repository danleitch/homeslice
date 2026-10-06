/**
 * Prices and a month of closes from Yahoo Finance's chart endpoint, as glance
 * reads them.
 *
 * Yahoo doesn't answer browsers on other sites, so the request goes through a
 * same-origin proxy at /api/markets: the dev server provides one, and so does
 * the nginx config in the Docker image. A plain static host without it shows
 * the widget's "needs the proxy" note instead of prices.
 */
import type { MarketSymbol } from './model';
import { fetchToken, isTokenAddress } from './tokens';

export const MARKETS_PROXY = '/api/markets';

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  /** Percent change on the previous close. */
  change: number;
  currency: string;
  /** Decimal places Yahoo suggests for this instrument. */
  precision: number;
  closes: number[];
  /** Where the instrument is shown, when that isn't Yahoo Finance: a token's pool. */
  url?: string;
  /** For a token, the dollars in the pool its price comes from. */
  liquidity?: number;
};

type ChartResponse = {
  chart?: {
    result?: {
      meta: {
        symbol: string;
        currency?: string;
        regularMarketPrice: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketChangePercent?: number;
        shortName?: string;
        longName?: string;
        priceHint?: number;
      };
      indicators: { quote: { close?: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
};

export class ProxyUnavailableError extends Error {
  constructor() {
    super('Market prices need the dashboard’s proxy, which this host doesn’t provide.');
    this.name = 'ProxyUnavailableError';
  }
}

const CHART_DAYS = 22;

/** Reads one instrument out of Yahoo's answer. Exposed for tests. */
export const parseQuote = (request: MarketSymbol, response: ChartResponse): Quote | null => {
  const result = response.chart?.result?.[0];

  if (!result) {
    return null;
  }

  const closes = (result.indicators.quote[0]?.close ?? [])
    .filter((value): value is number => typeof value === 'number' && value > 0)
    .slice(-CHART_DAYS);
  const { meta } = result;
  const previous = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose ?? 0);
  const change =
    typeof meta.regularMarketChangePercent === 'number'
      ? meta.regularMarketChangePercent
      : previous
        ? ((meta.regularMarketPrice - previous) / previous) * 100
        : 0;

  return {
    symbol: meta.symbol || request.symbol,
    name: request.name || meta.shortName || meta.longName || request.symbol,
    price: meta.regularMarketPrice,
    change,
    currency: meta.currency ?? '',
    precision: Math.min(Math.max(meta.priceHint ?? 2, 0), 6),
    closes
  };
};

export const fetchQuotes = async (
  symbols: readonly MarketSymbol[],
  signal: AbortSignal
): Promise<Quote[]> => {
  const answers = await Promise.all(
    symbols.map(async (request) => {
      // A token's contract address isn't a Yahoo symbol: it is read from where it trades. One that
      // can't be read is left out, as an unknown symbol is, rather than failing the others.
      if (isTokenAddress(request.symbol)) {
        return fetchToken(request, signal).catch((error: unknown) => {
          if (signal.aborted) {
            throw error;
          }

          return null;
        });
      }

      const response = await fetch(
        `${MARKETS_PROXY}/${encodeURIComponent(request.symbol)}?range=1mo&interval=1d`,
        { signal }
      );
      const type = response.headers.get('content-type') ?? '';

      // A static host answers with the app's own index.html, or a 404 page.
      if (!type.includes('json')) {
        throw new ProxyUnavailableError();
      }

      if (!response.ok && response.status !== 404) {
        return null;
      }

      return parseQuote(request, (await response.json()) as ChartResponse);
    })
  );

  const quotes = answers.filter((quote): quote is Quote => quote !== null);

  if (quotes.length === 0 && symbols.length > 0) {
    throw new Error('No prices came back for those symbols.');
  }

  return quotes;
};

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  GBp: 'p',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  ZAR: 'R',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF ',
  KRW: '₩',
  BRL: 'R$',
  HKD: 'HK$',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr '
};

export const formatPrice = (quote: Quote): string => {
  const digits = quote.price >= 1000 ? Math.min(quote.precision, 2) : quote.precision;
  const amount = quote.price.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const symbol = CURRENCY_SYMBOLS[quote.currency];

  return symbol ? `${symbol}${amount}` : `${amount}${quote.currency ? ` ${quote.currency}` : ''}`;
};

/** The closes as an SVG path in a width x height box, with the area under it closed off. */
export const sparkline = (
  values: readonly number[],
  width: number,
  height: number
): { line: string; area: string } => {
  if (values.length < 2) {
    return { line: '', area: '' };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map(
    (value, index) => [index * step, height - 2 - ((value - min) / range) * (height - 4)] as const
  );
  const line = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  return { line, area: `${line} L${width} ${height} L0 ${height} Z` };
};
