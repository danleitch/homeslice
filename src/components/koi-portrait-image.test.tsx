import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { KoiGenome } from '../lib/koi-genome';
import { hideLiveKoi, showLiveKoi } from '../lib/koi-live';
import { koiPortrait } from '../lib/koi-portrait';
import { KoiPortraitImage } from './koi-portrait-image';

vi.mock('../lib/koi-portrait', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/koi-portrait')>()),
  koiPortrait: vi.fn()
}));

vi.mock('../lib/koi-live', () => ({ showLiveKoi: vi.fn(), hideLiveKoi: vi.fn() }));

const kohaku: KoiGenome = { variety: 'kohaku', modifiers: [], seed: 1 };
const showa: KoiGenome = { variety: 'showa', modifiers: [], seed: 2 };

/** An IntersectionObserver that sees only what a test tells it to. */
class FakeObserver {
  static all: FakeObserver[] = [];

  observed: Element[] = [];
  disconnected = false;

  constructor(
    private readonly callback: (entries: Partial<IntersectionObserverEntry>[]) => void,
    readonly options: IntersectionObserverInit | undefined
  ) {
    FakeObserver.all.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  see(...visible: boolean[]): void {
    this.callback(visible.map((isIntersecting) => ({ isIntersecting })));
  }
}

const portrait = vi.mocked(koiPortrait);

describe('KoiPortraitImage', () => {
  beforeEach(() => {
    FakeObserver.all = [];
    portrait.mockReset();
    portrait.mockResolvedValue('data:image/png;base64,KOI');
    vi.mocked(showLiveKoi).mockReset();
    vi.mocked(hideLiveKoi).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the portrait over the water once it is taken, and says the koi is there until then', async () => {
    const { container } = render(<KoiPortraitImage genome={kohaku} alt="A kohaku" />);
    const host = container.firstElementChild!;

    expect(host).toHaveAttribute('data-state', 'loading');
    expect(screen.getByText('A kohaku')).toHaveClass('visually-hidden');

    expect(await screen.findByRole('img', { name: 'A kohaku' })).toHaveAttribute(
      'src',
      'data:image/png;base64,KOI'
    );
    expect(host).toHaveAttribute('data-state', 'ready');
    expect(screen.getByRole('img')).toHaveAttribute('draggable', 'false');
  });

  it('keeps the water, and the words, when a portrait could not be taken', async () => {
    portrait.mockResolvedValue(null);
    const { container } = render(<KoiPortraitImage genome={kohaku} alt="A kohaku" />);

    await act(async () => undefined);

    expect(container.firstElementChild).toHaveAttribute('data-state', 'missing');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('A kohaku')).toBeInTheDocument();
  });

  it('takes a new portrait when the fish changes, not showing the old fish meanwhile', async () => {
    portrait.mockImplementation(async (genome) => `data:image/png;base64,${genome.variety}`);
    const { container, rerender } = render(<KoiPortraitImage genome={kohaku} alt="A fish" />);

    expect(await screen.findByRole('img')).toHaveAttribute('src', 'data:image/png;base64,kohaku');

    rerender(<KoiPortraitImage genome={showa} alt="A fish" />);

    expect(container.firstElementChild).toHaveAttribute('data-state', 'loading');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'data:image/png;base64,showa');
  });

  it('does not show a portrait that arrives after the card has gone', async () => {
    let arrive: (url: string) => void = () => undefined;
    portrait.mockReturnValue(new Promise<string>((resolve) => (arrive = resolve)));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<KoiPortraitImage genome={kohaku} alt="A kohaku" />);

    unmount();
    await act(async () => arrive('data:image/png;base64,LATE'));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  describe('when it is lazy', () => {
    beforeEach(() => {
      vi.stubGlobal('IntersectionObserver', FakeObserver);
    });

    it('takes no portrait until it is nearly on screen, watching a little ahead of the viewport', async () => {
      const { container } = render(<KoiPortraitImage genome={kohaku} alt="A kohaku" lazy />);

      expect(FakeObserver.all).toHaveLength(1);
      expect(FakeObserver.all[0]!.observed).toEqual([container.firstElementChild]);
      expect(FakeObserver.all[0]!.options).toEqual({ rootMargin: '240px' });

      await act(async () => FakeObserver.all[0]!.see(false));

      expect(portrait).not.toHaveBeenCalled();
      expect(FakeObserver.all[0]!.disconnected).toBe(false);
    });

    it('takes it as soon as it comes near, and stops watching', async () => {
      render(<KoiPortraitImage genome={kohaku} alt="A kohaku" lazy />);

      await act(async () => FakeObserver.all[0]!.see(false, true));

      expect(portrait).toHaveBeenCalledTimes(1);
      expect(portrait).toHaveBeenCalledWith(kohaku);
      expect(FakeObserver.all[0]!.disconnected).toBe(true);
      expect(await screen.findByRole('img')).toBeInTheDocument();
    });

    it('stops watching when it is taken away before it came near', () => {
      const { unmount } = render(<KoiPortraitImage genome={kohaku} alt="A kohaku" lazy />);

      unmount();

      expect(FakeObserver.all[0]!.disconnected).toBe(true);
      expect(portrait).not.toHaveBeenCalled();
    });

    it('does not watch at all where there is nothing to watch with, and just takes the portrait', async () => {
      vi.stubGlobal('IntersectionObserver', undefined);

      render(<KoiPortraitImage genome={kohaku} alt="A kohaku" lazy />);

      expect(await screen.findByRole('img')).toBeInTheDocument();
      expect(FakeObserver.all).toHaveLength(0);
    });
  });

  describe('while the koi is awake', () => {
    it('hands the patch of water to the live koi, which waits to be pointed at by default', () => {
      const { container, unmount } = render(<KoiPortraitImage genome={kohaku} alt="" active />);
      const host = container.firstElementChild!;

      expect(showLiveKoi).toHaveBeenCalledWith(kohaku, host, true);

      unmount();

      expect(hideLiveKoi).toHaveBeenCalledWith(host);
    });

    it('swims on touch screens too when it is not hover-only', () => {
      render(<KoiPortraitImage genome={kohaku} alt="" active hoverOnly={false} />);

      expect(showLiveKoi).toHaveBeenCalledWith(kohaku, expect.any(HTMLElement), false);
    });

    it('lets the live koi go again when it goes to sleep', () => {
      const { container, rerender } = render(<KoiPortraitImage genome={kohaku} alt="" active />);

      rerender(<KoiPortraitImage genome={kohaku} alt="" active={false} />);

      expect(hideLiveKoi).toHaveBeenCalledWith(container.firstElementChild);
      expect(showLiveKoi).toHaveBeenCalledTimes(1);
    });

    it('stays asleep when it is not asked to wake', () => {
      render(<KoiPortraitImage genome={kohaku} alt="" />);

      expect(showLiveKoi).not.toHaveBeenCalled();
    });
  });

  it('puts its own class beside the base one', () => {
    const { container } = render(<KoiPortraitImage genome={kohaku} alt="" className="big" />);

    expect(container.firstElementChild).toHaveClass('koi-photo', 'big');
  });
});
