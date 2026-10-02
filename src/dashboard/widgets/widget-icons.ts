import {
  CalendarDays,
  Clock,
  CloudSun,
  Newspaper,
  Star,
  TrendingUp,
  Trophy,
  Tv,
  type LucideIcon
} from 'lucide-react';
import type { WidgetType } from '../lib/model';

/** Each widget's symbol, in the picker and its settings. */
export const WIDGET_ICONS: Readonly<Record<WidgetType, LucideIcon>> = {
  weather: CloudSun,
  markets: TrendingUp,
  clock: Clock,
  calendar: CalendarDays,
  hackernews: Newspaper,
  github: Star,
  benchlm: Trophy,
  tv: Tv
};
