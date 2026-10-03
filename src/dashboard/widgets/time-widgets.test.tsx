import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarWidget as CalendarConfig, ClockWidget as ClockConfig } from '../lib/model';
import { CalendarWidget, ClockWidget } from './time-widgets';

// Sunday 15 March 2026, 14:05 UTC: New York is on daylight time, Tokyo is up late.
const NOW = new Date('2026-03-15T14:05:00Z');

const clock = (...zones: [string, string?][]): ClockConfig => ({
  id: 'clock',
  type: 'clock',
  width: 4,
  zones: zones.map(([zone, label]) => ({ zone, label: label ?? '' }))
});

const calendar = (weekStart: 0 | 1): CalendarConfig => ({
  id: 'calendar',
  type: 'calendar',
  width: 3,
  weekStart
});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ClockWidget', () => {
  const rowOf = (name: string): HTMLElement => screen.getByText(name).closest('li')!;

  it('asks for a time zone when there are none', () => {
    render(<ClockWidget widget={clock()} clock="24h" />);

    expect(screen.getByText('Add a time zone in this widget’s settings.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows each zone’s time in the chosen clock', () => {
    const { rerender } = render(
      <ClockWidget widget={clock(['Asia/Tokyo', 'Tokyo'])} clock="24h" />
    );
    expect(rowOf('Tokyo')).toHaveTextContent('23:05');

    rerender(<ClockWidget widget={clock(['Asia/Tokyo', 'Tokyo'])} clock="12h" />);
    expect(rowOf('Tokyo')).toHaveTextContent(/11:05\s?PM/i);
  });

  it('names a zone by its city when it has no label of its own', () => {
    render(
      <ClockWidget
        widget={clock(['America/New_York'], ['Pacific/Port_Moresby', 'Office'])}
        clock="24h"
      />
    );

    expect(screen.getByText('New York')).toBeInTheDocument();
    expect(screen.getByText('Office')).toBeInTheDocument();
  });

  it('says how far ahead or behind each zone is', () => {
    render(
      <ClockWidget
        widget={clock(
          ['UTC', 'Home'],
          ['Asia/Tokyo', 'Tokyo'],
          ['America/New_York', 'New York'],
          ['Asia/Kolkata', 'Delhi']
        )}
        clock="24h"
      />
    );

    expect(rowOf('Home')).toHaveTextContent('Same time');
    expect(rowOf('Tokyo')).toHaveTextContent('+9h');
    expect(rowOf('New York')).toHaveTextContent('−4h');
    expect(rowOf('Delhi')).toHaveTextContent('+5.5h');
  });

  it('names the weekday it is there, which can differ from here', () => {
    render(
      <ClockWidget widget={clock(['UTC', 'Home'], ['Pacific/Auckland', 'Auckland'])} clock="24h" />
    );

    expect(rowOf('Home')).toHaveTextContent('Sun');
    expect(rowOf('Auckland')).toHaveTextContent('Mon');
  });

  it('marks the zones where it is daytime', () => {
    const { container } = render(
      <ClockWidget
        widget={clock(['America/New_York', 'New York'], ['Asia/Tokyo', 'Tokyo'])}
        clock="24h"
      />
    );
    const dotOf = (name: string): Element => rowOf(name).querySelector('.clk-dot')!;

    expect(dotOf('New York')).toHaveClass('clk-dot--day');
    expect(dotOf('Tokyo')).not.toHaveClass('clk-dot--day');
    expect(container.querySelectorAll('.clk-dot[aria-hidden="true"]')).toHaveLength(2);
  });

  it('shows dashes, and no offset, for a zone that does not exist', () => {
    render(<ClockWidget widget={clock(['Not/A_Zone', 'Nowhere'])} clock="24h" />);

    expect(rowOf('Nowhere')).toHaveTextContent('--:--');
    expect(rowOf('Nowhere').querySelector('.clk-offset')).toHaveTextContent(/^\s*·\s*$/);
  });

  it('moves on as each minute turns over', () => {
    render(<ClockWidget widget={clock(['UTC', 'Home'])} clock="24h" />);
    expect(rowOf('Home')).toHaveTextContent('14:05');

    // The tick lands just after the minute turns, so give it a little over a minute.
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(rowOf('Home')).toHaveTextContent('14:06');
  });
});

describe('CalendarWidget', () => {
  const dayCells = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('.cal-day')].map((cell) => cell.textContent ?? '');

  it('names the month and year', () => {
    render(<CalendarWidget widget={calendar(1)} />);

    expect(screen.getByText('March')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'This month' })).toBeInTheDocument();
  });

  it('lays out every day of the month', () => {
    const { container } = render(<CalendarWidget widget={calendar(0)} />);
    const days = dayCells(container).filter(Boolean);

    expect(days).toHaveLength(31);
    expect(days[0]).toBe('1');
    expect(days[30]).toBe('31');
  });

  it('starts the week on the day asked for', () => {
    const sunday = render(<CalendarWidget widget={calendar(0)} />);
    // 1 March 2026 is a Sunday: no blanks before it when weeks start on Sunday...
    expect(dayCells(sunday.container)[0]).toBe('1');
    expect([...sunday.container.querySelectorAll('.cal-weekday')][0]).toHaveTextContent('S');
    sunday.unmount();

    const monday = render(<CalendarWidget widget={calendar(1)} />);
    // ...and six blanks before it when they start on Monday.
    expect(dayCells(monday.container).slice(0, 7)).toEqual(['', '', '', '', '', '', '1']);
    expect([...monday.container.querySelectorAll('.cal-weekday')][0]).toHaveTextContent('M');
  });

  it('shows seven weekday headings', () => {
    const { container } = render(<CalendarWidget widget={calendar(1)} />);

    expect([...container.querySelectorAll('.cal-weekday')].map((day) => day.textContent)).toEqual([
      'M',
      'T',
      'W',
      'T',
      'F',
      'S',
      'S'
    ]);
  });

  it('marks today, and only today', () => {
    const { container } = render(<CalendarWidget widget={calendar(1)} />);
    const today = container.querySelectorAll('.cal-day--today');

    expect(today).toHaveLength(1);
    expect(today[0]).toHaveTextContent('15');
    expect(today[0]).toHaveAttribute('aria-current', 'date');
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('turns to the next month when the date rolls over', () => {
    vi.setSystemTime(new Date('2026-03-31T23:59:30Z'));
    render(<CalendarWidget widget={calendar(1)} />);
    expect(screen.getByText('March')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('April')).toBeInTheDocument();
  });
});
