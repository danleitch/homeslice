import type { JSX } from 'react';
import type { HourFormat, Widget } from '../lib/model';
import { BenchmarkWidget } from './benchlm-widget';
import { GithubTrendingWidget } from './github-widget';
import { HackerNewsWidget } from './hackernews-widget';
import { MarketsWidget } from './markets-widget';
import { CalendarWidget, ClockWidget } from './time-widgets';
import { PopularTvWidget } from './tv-widget';
import { WeatherWidget } from './weather-widget';

/** Draws a widget's body from its settings. */
export const WidgetView = ({
  widget,
  clock,
  newTab
}: {
  widget: Widget;
  clock: HourFormat;
  newTab: boolean;
}): JSX.Element => {
  switch (widget.type) {
    case 'weather':
      return <WeatherWidget widget={widget} clock={clock} />;
    case 'markets':
      return <MarketsWidget widget={widget} />;
    case 'clock':
      return <ClockWidget widget={widget} clock={clock} />;
    case 'calendar':
      return <CalendarWidget widget={widget} />;
    case 'hackernews':
      return <HackerNewsWidget widget={widget} newTab={newTab} />;
    case 'github':
      return <GithubTrendingWidget widget={widget} newTab={newTab} />;
    case 'benchlm':
      return <BenchmarkWidget widget={widget} newTab={newTab} />;
    case 'tv':
      return <PopularTvWidget widget={widget} newTab={newTab} />;
  }
};
