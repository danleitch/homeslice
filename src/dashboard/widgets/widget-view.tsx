import type { JSX } from 'react';
import type { HourFormat, Widget } from '../lib/model';
import { AgendaWidget } from './agenda-widget';
import { BenchmarkWidget } from './benchlm-widget';
import { FocusWidget } from './focus-widget';
import { GithubTrendingWidget } from './github-widget';
import { HackerNewsWidget } from './hackernews-widget';
import { MarketsWidget } from './markets-widget';
import { NewsWidget } from './news-widget';
import { NotesWidget } from './notes-widget';
import { CalendarWidget, ClockWidget } from './time-widgets';
import { PopularMoviesWidget, PopularTvWidget } from './tv-widget';
import { PullsWidget } from './pulls-widget';
import { WeatherWidget } from './weather-widget';

/**
 * Draws a widget's body from its settings. A `demo` one is an example: it keeps off the page's
 * own timer, which only the Focus widget has.
 */
export const WidgetView = ({
  widget,
  clock,
  newTab,
  demo = false,
  onChange
}: {
  widget: Widget;
  clock: HourFormat;
  newTab: boolean;
  demo?: boolean;
  /** Keeps a change a widget makes to itself, like a task ticked off. */
  onChange?: (widget: Widget) => void;
}): JSX.Element => {
  switch (widget.type) {
    case 'weather':
      return <WeatherWidget widget={widget} clock={clock} />;
    case 'markets':
      return <MarketsWidget widget={widget} />;
    case 'clock':
      return <ClockWidget widget={widget} clock={clock} />;
    case 'focus':
      return <FocusWidget widget={widget} demo={demo} />;
    case 'calendar':
      return <CalendarWidget widget={widget} />;
    case 'agenda':
      return <AgendaWidget widget={widget} clock={clock} newTab={newTab} />;
    case 'hackernews':
      return <HackerNewsWidget widget={widget} newTab={newTab} />;
    case 'github':
      return <GithubTrendingWidget widget={widget} newTab={newTab} />;
    case 'prs':
      return <PullsWidget widget={widget} newTab={newTab} />;
    case 'benchlm':
      return <BenchmarkWidget widget={widget} newTab={newTab} />;
    case 'tv':
      return <PopularTvWidget widget={widget} newTab={newTab} />;
    case 'movies':
      return <PopularMoviesWidget widget={widget} newTab={newTab} />;
    case 'notes':
      return <NotesWidget widget={widget} onChange={onChange} />;
    case 'news':
      return <NewsWidget widget={widget} newTab={newTab} />;
  }
};
