import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app';
import { canProtect, seal } from './lib/calendar-secret';
import { sanitizeConfig } from './lib/model';
import { DASHBOARD_STORAGE_KEY } from './lib/storage';
import { configToYaml } from './lib/yaml';

// Whether a page can encrypt is a browser's to say, and jsdom has nowhere to keep a key; the
// tests say it, and seal in a way they can read. The sealing itself is tested on its own.
vi.mock('./lib/calendar-secret', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/calendar-secret')>()),
  canProtect: vi.fn(),
  seal: vi.fn()
}));

const HOME = 'https://calendar.google.com/calendar/ical/sam%40example.com/private-aaa111/basic.ics';
const WORK =
  'https://calendar.google.com/calendar/ical/work%40example.com/private-bbb222/basic.ics';
const sealedOf = (address: string): string =>
  `enc1.${'S'.repeat(16)}.${btoa(address).replace(/[+/=]/g, 'x')}`;

const seed = (...widgets: unknown[]): void => {
  window.localStorage.setItem(
    DASHBOARD_STORAGE_KEY,
    configToYaml(sanitizeConfig({ name: 'Sam', widgets }))
  );
};

const agenda = (...urls: string[]) => ({
  type: 'agenda',
  calendars: urls.map((url, index) => ({ name: `Calendar ${index + 1}`, url }))
});

const stored = (): string => window.localStorage.getItem(DASHBOARD_STORAGE_KEY) ?? '';
const toasts = (): HTMLElement => document.querySelector<HTMLElement>('.toasts')!;

describe('Dashboard: sealing the calendar addresses already saved', () => {
  beforeEach(() => {
    vi.mocked(canProtect).mockReturnValue(true);
    vi.mocked(seal)
      .mockReset()
      .mockImplementation(async (address) => sealedOf(address));
  });

  it('seals an address saved as typed, keeps the rest of its calendar, and says so', async () => {
    seed(agenda(HOME));
    render(<App />);

    await waitFor(() => expect(stored()).toContain(sealedOf(HOME)));

    expect(stored()).not.toContain('calendar.google.com');
    expect(stored()).toContain('Calendar 1');
    expect(seal).toHaveBeenCalledExactlyOnceWith(HOME);
    expect(
      within(toasts()).getByText('Your calendar addresses are now stored encrypted.')
    ).toBeInTheDocument();
  });

  it('seals each address once, though two widgets hold it', async () => {
    seed(agenda(HOME, WORK), agenda(HOME));
    render(<App />);

    await waitFor(() => expect(stored()).not.toContain('calendar.google.com'));

    expect(seal).toHaveBeenCalledTimes(2);
    expect(stored().split(sealedOf(HOME))).toHaveLength(3);
    expect(stored()).toContain(sealedOf(WORK));
  });

  it('does nothing where the page cannot encrypt, leaving the address as it was typed', async () => {
    vi.mocked(canProtect).mockReturnValue(false);
    seed(agenda(HOME));
    render(<App />);
    await screen.findByRole('region', { name: 'Agenda' });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(seal).not.toHaveBeenCalled();
    expect(stored()).toContain(HOME);
    expect(toasts()).not.toHaveTextContent('encrypted');
  });

  it('does nothing for an address that is already sealed', async () => {
    seed(agenda(sealedOf(HOME)));
    render(<App />);
    await screen.findByRole('region', { name: 'Agenda' });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(seal).not.toHaveBeenCalled();
    expect(stored()).toContain(sealedOf(HOME));
  });

  it('does nothing for a board with no Agenda', async () => {
    seed({ type: 'clock' });
    render(<App />);
    await screen.findByRole('region', { name: 'World clock' });

    expect(seal).not.toHaveBeenCalled();
  });

  it('leaves an address as it was, and does not keep trying, when it cannot be sealed', async () => {
    vi.mocked(seal).mockRejectedValue(new Error('blocked'));
    seed(agenda(HOME));
    render(<App />);

    await waitFor(() => expect(seal).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(seal).toHaveBeenCalledTimes(1);
    expect(stored()).toContain(HOME);
    expect(toasts()).not.toHaveTextContent('encrypted');
  });

  it('seals the addresses that can be, and leaves the one that cannot', async () => {
    vi.mocked(seal).mockImplementation(async (address) => {
      if (address === WORK) {
        throw new Error('blocked');
      }

      return sealedOf(address);
    });
    seed(agenda(HOME, WORK));
    render(<App />);

    await waitFor(() => expect(stored()).toContain(sealedOf(HOME)));

    expect(stored()).toContain(WORK);
    expect(stored()).not.toContain(HOME);
  });
});
