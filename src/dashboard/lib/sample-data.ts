/**
 * Sample readings for the widget gallery, which shows the real widgets without a network. They
 * answer to a `useRemote` key, are shaped exactly like what the services give, and are worked out
 * from the moment asked, so "Now", "4h" and today's circle are always right. Nothing here is a
 * real price, story, score or appointment: the names are made up.
 */
import type { AgendaData, AgendaEvent, CalendarSource } from './agenda';
import type { Prices, Rankings } from './benchlm';
import type { Trending } from './github';
import type { Story } from './hackernews';
import type { Quote } from './markets';
import { createWidget, type Widget, type WidgetType } from './model';
import { createRandom, hashString } from '../../lib/seeded-random';
import { isTokenAddress, priceDigits } from './tokens';
import type { PullsData } from './pulls';
import type { Title } from './tmdb';
import type { WeatherReport } from './weather';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The key's own words: "github:daily:all:6" is ["github", "daily", "all", "6"]. */
const partsOf = (key: string): string[] => key.split(':');

/* -------------------------------------------------------------------------- */
/* Weather                                                                    */
/* -------------------------------------------------------------------------- */

const weather = (now: Date): WeatherReport => {
  const hour = now.getHours();
  // A mild day that peaks mid-afternoon, with showers coming in the evening.
  const temperatures = Array.from({ length: 12 }, (_unused, index) =>
    Math.round(17 + 6 * Math.sin(((index * 2 + 1 - 9) / 24) * 2 * Math.PI))
  );
  const low = Math.min(...temperatures);
  const high = Math.max(...temperatures);
  const currentColumn = Math.floor(hour / 2);
  const day = (offset: number): string => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  };

  // Sunrise and sunset in the place's own time, as the service gives them: Johannesburg is UTC+2.
  const at = (hour: number, minute: number): number =>
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), hour - 2, minute);

  return {
    sun: { rise: at(6, 12), set: at(19, 48) },
    uv: 7,
    air: 38,
    place: {
      name: 'Cape Town',
      area: 'Western Cape',
      country: 'South Africa',
      latitude: -33.9258,
      longitude: 18.4232,
      timezone: 'Africa/Johannesburg'
    },
    temperature: temperatures[currentColumn],
    apparent: temperatures[currentColumn] - 1,
    code: 2,
    isDay: hour >= 7 && hour < 19,
    wind: 14,
    humidity: 62,
    high,
    low,
    currentColumn,
    columns: temperatures.map((temperature, index) => ({
      hour: index * 2,
      temperature,
      scale: (temperature - low) / (high - low),
      rain: index >= 10,
      daylight: index * 2 + 1 >= 7 && index * 2 <= 19
    })),
    days: [
      { date: day(1), code: 1, high: high + 1, low: low },
      { date: day(2), code: 63, high: high - 3, low: low - 1 },
      { date: day(3), code: 3, high: high - 2, low: low - 2 },
      { date: day(4), code: 2, high: high, low: low - 1 },
      { date: day(5), code: 0, high: high + 2, low: low }
    ]
  };
};

/* -------------------------------------------------------------------------- */
/* Markets                                                                    */
/* -------------------------------------------------------------------------- */

/** A month of closes ending at `last`, drifting and wobbling in a way that is always the same. */
const closes = (last: number, drift: number, wobble: number, phase: number): number[] =>
  Array.from({ length: 22 }, (_unused, index) => {
    const behind = 21 - index;
    const trend = 1 - (drift * behind) / 21;
    const noise = Math.sin(index * 1.7 + phase) * wobble + Math.sin(index * 0.6 + phase) * wobble;
    return Number((last * (trend + noise)).toFixed(2));
  });

const quote = (
  symbol: string,
  name: string,
  price: number,
  change: number,
  drift: number,
  wobble: number,
  phase: number
): Quote => ({
  symbol,
  name,
  price,
  change,
  currency: 'USD',
  precision: 2,
  closes: closes(price, drift, wobble, phase)
});

/** A few well-known symbols, each with a price and a trend of its own. */
const KNOWN: Readonly<Record<string, readonly [string, number, number, number, number, number]>> = {
  SPY: ['S&P 500', 612.4, 0.62, 0.035, 0.004, 0.4],
  NVDA: ['Chipmaker', 148.2, 2.31, 0.09, 0.01, 2.1],
  AAPL: ['Apple', 231.8, 0.18, 0.015, 0.006, 1.3],
  'BTC-USD': ['Bitcoin', 94210, -1.24, -0.04, 0.012, 4.2],
  'ETH-USD': ['Ethereum', 3380.5, 1.87, 0.06, 0.014, 3.3],
  'SOL-USD': ['Solana', 187.6, 3.4, 0.11, 0.018, 5.1]
};

/** A made-up reading for a symbol the gallery knows nothing of: always the same for the same text. */
const invented = (symbol: string, name: string): Quote => {
  const random = createRandom(hashString(symbol));
  const price = Number((20 + random() * 480).toFixed(2));

  return quote(
    symbol,
    name || symbol,
    price,
    Number(((random() - 0.45) * 5).toFixed(2)),
    (random() - 0.3) * 0.12,
    0.004 + random() * 0.012,
    random() * 6
  );
};

/**
 * A token typed by its contract address, which no exchange lists: tiny prices, and a pool that
 * is thin enough for the widget to say so.
 */
const sampleToken = (address: string, name: string): Quote => {
  const random = createRandom(hashString(address));
  const price = 0.00001 + random() * 0.0001;

  return {
    symbol: address.replace(/^0x/, '').slice(0, 4).toUpperCase(),
    name: name || 'Sample token',
    price,
    change: Number(((random() - 0.4) * 40).toFixed(2)),
    currency: 'USD',
    precision: priceDigits(price),
    closes: closes(price, (random() - 0.3) * 0.5, 0.03 + random() * 0.04, random() * 6),
    url: 'https://dexscreener.com/',
    liquidity: Math.round(20_000 + random() * 180_000)
  };
};

/** The symbols asked for in "markets:AAPL=Apple,BTC-USD=", with the names that were given. */
const symbolsOf = (key: string): { symbol: string; name: string }[] =>
  key
    .slice(key.indexOf(':') + 1)
    .split(',')
    .filter(Boolean)
    .map((piece) => {
      const [symbol = '', ...rest] = piece.split('=');
      return { symbol, name: rest.join('=') };
    });

const markets = (key: string): Quote[] =>
  symbolsOf(key).map(({ symbol, name }) => {
    if (isTokenAddress(symbol)) {
      return sampleToken(symbol, name);
    }

    const known = KNOWN[symbol];
    return known
      ? quote(symbol, name || known[0], known[1], known[2], known[3], known[4], known[5])
      : invented(symbol, name);
  });

/* -------------------------------------------------------------------------- */
/* Hacker News                                                                */
/* -------------------------------------------------------------------------- */

const STORIES: readonly (readonly [string, string, number, number, number])[] = [
  ['Show HN: A tiny database that fits in a single file', 'tinydb.example', 412, 138, 34],
  ['The case for boring technology, ten years on', 'boring.example', 389, 201, 71],
  ['How we cut our build times by 80%', 'engineering.example', 301, 96, 118],
  ['A field guide to the quieter corners of CSS', 'cssfield.example', 276, 64, 155],
  ['Why the best dashboards do less', 'dashboards.example', 241, 87, 190],
  ['Ask HN: What are you building this weekend?', 'news.example', 198, 322, 205],
  ['Rust for people who write TypeScript', 'rustforts.example', 187, 71, 260],
  ['Notes on running a one-person SaaS', 'solo.example', 166, 59, 310],
  ['The slow death of the personal website', 'indieweb.example', 152, 112, 355],
  ['Parsing a gigabyte of JSON per second', 'simdjson.example', 143, 40, 410],
  ['A history of the keyboard shortcut', 'shortcuts.example', 131, 48, 480],
  ['Show HN: I built a local-first notes app', 'localfirst.example', 120, 55, 540],
  ['Postgres is enough', 'pgenough.example', 118, 163, 610],
  ['Designing for the second visit', 'ux.example', 104, 29, 700],
  ['What a decade of side projects taught me', 'sideprojects.example', 96, 37, 800]
];

const stories = (key: string, now: Date): Story[] => {
  const count = Number(partsOf(key)[1]) || 6;

  return STORIES.slice(0, count).map(([title, host, score, comments, minutesAgo], index) => ({
    id: 1_000 + index,
    title,
    url: `https://${host}/`,
    host,
    score,
    comments,
    time: Math.round((now.getTime() - minutesAgo * MINUTE) / 1000),
    by: 'sample'
  }));
};

/* -------------------------------------------------------------------------- */
/* GitHub Trending                                                            */
/* -------------------------------------------------------------------------- */

const REPOS: readonly (readonly [string, string, string, string, number, number, number])[] = [
  [
    'tidepool / tidepool',
    'A tiny reactive UI toolkit with no build step',
    'TypeScript',
    '#3178c6',
    18_420,
    910,
    1_240
  ],
  [
    'quillfeather / quill',
    'Local-first notes that sync over plain files',
    'Rust',
    '#dea584',
    12_960,
    604,
    980
  ],
  [
    'northwind-labs / lantern',
    'Run small language models in the browser',
    'Python',
    '#3572A5',
    9_870,
    733,
    760
  ],
  ['hollowtree / kiln', 'A fast static site generator', 'Go', '#00ADD8', 7_340, 388, 612],
  [
    'paperkite / ledger',
    'Plain-text accounting with a friendly face',
    'Zig',
    '#ec915c',
    5_210,
    201,
    455
  ],
  [
    'marrow-dev / sprocket',
    'Declarative pipelines for scheduled jobs',
    'TypeScript',
    '#3178c6',
    4_780,
    296,
    402
  ],
  [
    'brightmoss / atlas',
    'Self-hosted maps without the tile server',
    'Go',
    '#00ADD8',
    3_960,
    154,
    331
  ],
  ['stonefruit / vial', 'A command palette for every app', 'Swift', '#F05138', 3_410, 122, 287],
  [
    'cedarlane / harbor',
    'Containers for people who dislike YAML',
    'Rust',
    '#dea584',
    2_980,
    140,
    244
  ],
  [
    'plumline / ember',
    'Tiny state machines for tiny teams',
    'JavaScript',
    '#f1e05a',
    2_450,
    98,
    210
  ],
  [
    'oakfield / compass',
    'A type-safe router for the edge',
    'TypeScript',
    '#3178c6',
    2_130,
    87,
    188
  ],
  ['saltmarsh / drift', 'Smooth scroll, done properly', 'JavaScript', '#f1e05a', 1_870, 66, 164],
  [
    'ironbark / cairn',
    'Reproducible dev environments in one file',
    'Nix',
    '#7e7eff',
    1_650,
    74,
    141
  ],
  ['wrenfield / pebble', 'The smallest possible job queue', 'Elixir', '#6e4a7e', 1_320, 51, 119],
  ['larkspur / canvasly', 'Draw diagrams by describing them', 'Dart', '#00B4AB', 1_140, 43, 97]
];

const trending = (key: string, now: Date): Trending => {
  const count = Number(partsOf(key)[3]) || 6;

  return {
    publishedAt: now.getTime(),
    repos: REPOS.slice(0, count).map(
      ([name, description, language, languageColor, stars, forks, gained]) => ({
        name,
        url: `https://github.com/${name.replace(' / ', '/')}`,
        description,
        language,
        languageColor,
        stars,
        forks,
        gained
      })
    )
  };
};

/* -------------------------------------------------------------------------- */
/* My PRs                                                                     */
/* -------------------------------------------------------------------------- */

const pulls = (now: Date): PullsData => {
  const ago = (minutes: number): number => Math.round((now.getTime() - minutes * MINUTE) / 1000);
  const url = (repo: string, number: number): string => `https://github.com/${repo}/pull/${number}`;

  return {
    login: 'sam',
    reviewTotal: 4,
    review: [
      {
        number: 482,
        title: 'Cache the search index between visits',
        url: url('acme/web', 482),
        repo: 'acme/web',
        author: 'priya',
        draft: false,
        updated: ago(25),
        checks: 'passing',
        review: 'required'
      },
      {
        number: 77,
        title: 'Add a dark theme to the settings page',
        url: url('acme/design', 77),
        repo: 'acme/design',
        author: 'jonas',
        draft: false,
        updated: ago(190),
        checks: 'pending',
        review: 'required'
      },
      {
        number: 1203,
        title: 'Retry failed uploads with backoff',
        url: url('acme/api', 1203),
        repo: 'acme/api',
        author: 'mei',
        draft: false,
        updated: ago(60 * 26),
        checks: 'failing',
        review: 'required'
      }
    ],
    mineTotal: 3,
    mine: [
      {
        number: 489,
        title: 'Show the weather for the week ahead',
        url: url('acme/web', 489),
        repo: 'acme/web',
        author: 'sam',
        draft: false,
        updated: ago(12),
        checks: 'passing',
        review: 'approved'
      },
      {
        number: 491,
        title: 'Rework the onboarding checklist',
        url: url('acme/web', 491),
        repo: 'acme/web',
        author: 'sam',
        draft: false,
        updated: ago(240),
        checks: 'failing',
        review: 'changes'
      },
      {
        number: 495,
        title: 'Spike: offline mode',
        url: url('acme/web', 495),
        repo: 'acme/web',
        author: 'sam',
        draft: true,
        updated: ago(60 * 50),
        checks: 'none',
        review: 'none'
      }
    ]
  };
};

/* -------------------------------------------------------------------------- */
/* AI Leaderboard                                                             */
/* -------------------------------------------------------------------------- */

const MODELS: readonly (readonly [string, string, number])[] = [
  ['Aurora 4 Ultra', 'Northwind', 92.4],
  ['Meridian Pro', 'Halcyon', 90.8],
  ['Kestrel 3.5', 'Brightwater', 89.1],
  ['Orchid Max', 'Fernlight', 87.6],
  ['Solstice 2', 'Northwind', 86.9],
  ['Basalt Large', 'Stonefruit', 84.3],
  ['Tern 70B', 'Open Tern', 82.7],
  ['Lumen Flash', 'Halcyon', 80.2],
  ['Quartz Mini', 'Brightwater', 77.5],
  ['Pebble 8B', 'Open Tern', 72.1],
  ['Cinder Lite', 'Fernlight', 69.4],
  ['Reed Small', 'Stonefruit', 66.8],
  ['Marl 3B', 'Open Tern', 61.3],
  ['Wisp Nano', 'Halcyon', 57.9],
  ['Thimble 1B', 'Fernlight', 52.2]
];

const rankings = (now: Date): Rankings => ({
  asOf: [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-'),
  models: MODELS.map(([name, creator, score], index) => ({
    rank: index + 1,
    name,
    creator,
    score,
    low: Number((score - 1.4).toFixed(1)),
    high: Number((score + 1.4).toFixed(1))
  }))
});

const prices = (): Prices => ({});

/* -------------------------------------------------------------------------- */
/* Popular TV and Popular Movies                                              */
/* -------------------------------------------------------------------------- */

/** A poster drawn here, so the gallery asks the network for nothing. */
const poster = (from: string, to: string, letter: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="138" viewBox="0 0 92 138">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
      `</linearGradient></defs><rect width="92" height="138" fill="url(#g)"/>` +
      `<text x="46" y="84" font-family="Georgia,serif" font-size="46" font-weight="700" ` +
      `fill="#fff" fill-opacity=".85" text-anchor="middle">${letter}</text></svg>`
  )}`;

const SHOWS: readonly (readonly [string, string, number, number, string, string])[] = [
  ['Harbour Lights', '2025', 8.4, 3_120, '#2b5876', '#4e4376'],
  ['The Long Orbit', '2026', 8.1, 2_480, '#42275a', '#734b6d'],
  ['Saltwater', '2024', 7.9, 5_210, '#0f2027', '#2c5364'],
  ['Paper Cities', '2025', 8.7, 1_940, '#614385', '#516395'],
  ['Night Shift Diaries', '2026', 7.6, 880, '#232526', '#414345'],
  ['Wildflower Row', '2023', 8.2, 6_300, '#134e5e', '#71b280'],
  ['Cold Signal', '2025', 7.8, 2_050, '#1d2b64', '#f8cdda'],
  ['A Quiet Orchard', '2024', 8.0, 1_120, '#5a3f37', '#2c7744'],
  ['Meridian', '2026', 7.4, 640, '#355c7d', '#c06c84'],
  ['The Understudy', '2025', 8.3, 2_760, '#3a1c71', '#d76d77'],
  ['Low Tide', '2023', 7.7, 3_990, '#0575e6', '#021b79'],
  ['Copper & Rye', '2024', 8.5, 4_410, '#8e2de2', '#4a00e0']
];

const FILMS: readonly (readonly [string, string, number, number, string, string])[] = [
  ['Afterglow', '2026', 7.9, 4_120, '#ff512f', '#dd2476'],
  ['The Lantern Keepers', '2025', 8.2, 7_300, '#1f4037', '#99f2c8'],
  ['Midnight Ferry', '2026', 7.5, 1_980, '#0f0c29', '#302b63'],
  ['Small Hours', '2024', 8.0, 5_640, '#3d7eaa', '#ffe47a'],
  ['Glasshouse', '2025', 7.2, 2_210, '#56ab2f', '#a8e063'],
  ['Northbound', '2026', 8.5, 3_330, '#232526', '#4b79a1'],
  ['The Last Ferryman', '2023', 7.8, 8_900, '#603813', '#b29f94'],
  ['Understory', '2025', 7.6, 1_450, '#136a8a', '#267871'],
  ['Paper Moons', '2024', 8.1, 2_690, '#5f2c82', '#49a09d'],
  ['Cartographers', '2026', 7.3, 910, '#bc4e9c', '#f80759'],
  ['Slow Burn', '2025', 6.9, 1_760, '#c31432', '#240b36'],
  ['The Orchard House', '2024', 7.7, 3_020, '#2193b0', '#6dd5ed']
];

const titles = (key: string): Title[] => {
  const films = partsOf(key)[1] === 'movie';

  return (films ? FILMS : SHOWS).map(([name, year, rating, votes, from, to], index) => ({
    id: (films ? 2_000 : 3_000) + index,
    name,
    year,
    rating,
    votes,
    overview: '',
    poster: poster(from, to, name.replace(/^The /, '').charAt(0)),
    url: `https://www.themoviedb.org/${films ? 'movie' : 'tv'}/${index}`
  }));
};

/* -------------------------------------------------------------------------- */
/* Agenda                                                                     */
/* -------------------------------------------------------------------------- */

/** The two calendars the gallery's Agenda has, in the widget's own terms. */
export const SAMPLE_CALENDARS: CalendarSource[] = [
  { name: 'Personal', description: '', url: 'sample:personal' },
  { name: 'Work', description: '', url: 'sample:work' }
];

const agenda = (now: Date): AgendaData => {
  const at = (days: number, hours: number, minutes = 0): number =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hours, minutes).getTime();
  // Rounded down to five minutes, so "Now" has a believable start.
  const round = Math.floor(now.getTime() / (5 * MINUTE)) * 5 * MINUTE;
  let id = 0;
  const event = (
    calendar: number,
    title: string,
    start: number,
    length: number,
    extra: Partial<AgendaEvent> = {}
  ): AgendaEvent => {
    id += 1;
    return {
      id: `sample-${id}`,
      calendar,
      title,
      allDay: false,
      start,
      end: start + length,
      location: '',
      description: '',
      link: '',
      ...extra
    };
  };
  // An event for later today, or, when it would run into the night, for `otherwise`: a list that
  // shows an evening event as "→ Wed" is a puzzle in a gallery.
  const today = (start: number, length: number, otherwise: number): [number, number] =>
    start + length <= at(1, 0) ? [start, length] : [otherwise, length];
  const allDay = (calendar: number, title: string, days: number, span = 1): AgendaEvent =>
    event(calendar, title, at(days, 0), span * 24 * HOUR, { allDay: true });

  return {
    calendars: [
      { slot: 1, name: 'Personal', ok: true, locked: false },
      { slot: 2, name: 'Work', ok: true, locked: false }
    ],
    events: [
      // Around now, so the list has something under way, something next and something later.
      event(1, 'Design review', round - 20 * MINUTE, HOUR, {
        link: 'https://meet.example/design-review',
        description: 'Walk through the new widget gallery.'
      }),
      event(1, 'Planning', ...today(round + 70 * MINUTE, 45 * MINUTE, at(1, 11)), {
        location: 'Room 4'
      }),
      event(
        0,
        'Dinner with Ana',
        ...today(Math.max(round + 3 * HOUR, at(0, 19)), 2 * HOUR, at(1, 19)),
        {
          location: 'Harbour Kitchen'
        }
      ),

      event(1, 'Stand-up', at(1, 9, 30), 15 * MINUTE, {
        link: 'https://meet.example/standup'
      }),
      event(0, 'Dentist', at(1, 14), 45 * MINUTE, { location: 'Main Street Dental' }),
      event(1, 'Release train', at(2, 11), 90 * MINUTE),
      allDay(0, 'Mum’s birthday', 3),
      event(0, 'Climbing', at(4, 18), 90 * MINUTE),
      event(1, '1:1 with Priya', at(5, 15), 30 * MINUTE, { link: 'https://meet.example/one-one' }),
      allDay(1, 'Offsite', 8, 2),
      event(0, 'Book club', at(9, 19), 2 * HOUR),
      event(1, 'Quarterly review', at(12, 10), 2 * HOUR),
      event(0, 'Flight to Lisbon', at(16, 7, 45), 3 * HOUR),
      event(1, 'Demo day', at(20, 15), HOUR),

      event(1, 'Retro', at(-3, 16), HOUR),
      event(0, 'Pottery class', at(-6, 18), 2 * HOUR),
      event(1, 'Sprint planning', at(-9, 10), 90 * MINUTE),
      event(0, 'Birthday drinks', at(-12, 19), 3 * HOUR)
    ]
  };
};

/* -------------------------------------------------------------------------- */
/* The widgets                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A widget of a type as the gallery shows it: the settings a new one starts with, and what the
 * few that need something from the visitor are given, so they show what they do rather than
 * ask for it. It is never saved; adding a widget makes a fresh one.
 */
export const sampleWidget = (type: WidgetType): Widget => {
  const widget = createWidget(type);

  switch (widget.type) {
    case 'weather':
      return { ...widget, location: 'Cape Town' };
    case 'markets':
      return {
        ...widget,
        symbols: [
          { symbol: 'SPY', name: 'S&P 500' },
          { symbol: 'NVDA', name: 'Chipmaker' },
          { symbol: 'BTC-USD', name: 'Bitcoin' },
          { symbol: 'AAPL', name: 'Apple' }
        ]
      };
    case 'agenda':
      return { ...widget, calendars: SAMPLE_CALENDARS };
    case 'prs':
      return { ...widget, token: 'sample' };
    case 'notes':
      return {
        ...widget,
        items: [
          { text: 'Reply to Priya about the design review', done: false },
          { text: 'Book the dentist', done: true },
          { text: 'Pick up the parcel', done: false },
          { text: 'Send the invoice', done: true },
          { text: 'Water the plants', done: false }
        ],
        text: 'Ideas for the weekend\n- a widget for the tides\n- try the new ramen place\n- finally fix the shelf'
      };
    default:
      return widget;
  }
};

/* -------------------------------------------------------------------------- */
/* The source                                                                 */
/* -------------------------------------------------------------------------- */

/** The sample reading for a `useRemote` key, or undefined for a key that isn't a widget's. */
export const sampleReading = (key: string, now: Date): unknown => {
  switch (partsOf(key)[0]) {
    case 'weather':
      return weather(now);
    case 'markets':
      return markets(key);
    case 'hackernews':
      return stories(key, now);
    case 'github':
      return trending(key, now);
    case 'pulls':
      return pulls(now);
    case 'benchlm':
      return key === 'benchlm:prices' ? prices() : rankings(now);
    case 'tmdb':
      return titles(key);
    case 'agenda':
      return agenda(now);
    default:
      return undefined;
  }
};

/**
 * A source of sample readings for `SampleReadings`, worked out at `now`. Each key is answered once,
 * with the same object every time, so a widget isn't handed a new reading on every render.
 */
export const createSampleSource = (now: Date = new Date()): ((key: string) => unknown) => {
  const readings = new Map<string, unknown>();

  return (key) => {
    if (!readings.has(key)) {
      readings.set(key, sampleReading(key, now));
    }

    return readings.get(key);
  };
};
