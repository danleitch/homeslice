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
};

export type RankedModel = {
  rank: number;
  name: string;
  creator: string;
  score: number;
  /** The 90% range BenchLM gives the score, when it gives one. */
  low: number | null;
  high: number | null;
};

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

/** The models the widget shows: from one lab if it asks, as many as it asks. */
export const pickModels = (rankings: Rankings, creator: string, count: number): RankedModel[] => {
  const lab = creator.trim().toLowerCase();
  return rankings.models
    .filter((model) => !lab || model.creator.toLowerCase().includes(lab))
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
