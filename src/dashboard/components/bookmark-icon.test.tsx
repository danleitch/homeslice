import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberIcon } from '../lib/icons';
import { BookmarkIcon } from './bookmark-icon';

const art = (container: HTMLElement): HTMLElement => container.querySelector('.bm-icon-art')!;
const images = (container: HTMLElement): HTMLImageElement[] => [
  ...container.querySelectorAll<HTMLImageElement>('img.bm-img')
];
const monogram = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('.bm-monogram');

/** Pretends the browser decoded an image at a given size. */
const loaded = (image: HTMLImageElement, naturalWidth: number): void => {
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: naturalWidth });
  fireEvent.load(image);
};

// The app remembers which favicon source worked for each host, for the life of the page, so
// every test gets a host of its own to keep one test's memory out of the next.
let sites = 0;
const freshHost = (): string => `site-${(sites += 1)}.test`;

describe('BookmarkIcon', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('is decoration: the card’s text says what the bookmark is', () => {
    const { container } = render(<BookmarkIcon icon="" url="https://example.com" name="Example" />);

    expect(art(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('takes the class it is given', () => {
    const { container } = render(<BookmarkIcon icon="🚀" url="" name="Launch" className="big" />);

    expect(art(container)).toHaveClass('bm-icon-art', 'big');
  });

  describe('an emoji', () => {
    it('is shown as itself', () => {
      const { container } = render(
        <BookmarkIcon icon="🚀" url="https://example.com" name="Launch" />
      );

      expect(container.querySelector('.bm-emoji')).toHaveTextContent('🚀');
      expect(images(container)).toHaveLength(0);
    });
  });

  describe('no icon, and no site to ask', () => {
    it('stands in a monogram', () => {
      const { container } = render(<BookmarkIcon icon="" url="" name="Stack Overflow" />);

      expect(monogram(container)).toHaveTextContent('SO');
      expect(images(container)).toHaveLength(0);
    });

    it('gives each monogram a colour of its own', () => {
      const { container } = render(<BookmarkIcon icon="" url="" name="Stack Overflow" />);

      expect(monogram(container)!.style.getPropertyValue('--hue')).toMatch(/^\d+$/);
    });

    it('uses the first letter of a single word', () => {
      const { container } = render(<BookmarkIcon icon="" url="" name="npm" />);

      expect(monogram(container)).toHaveTextContent('N');
    });
  });

  describe('a site’s own icon', () => {
    let host: string;
    const open = (): ReturnType<typeof render> =>
      render(<BookmarkIcon icon="" url={`https://${host}/page`} name="Example Site" />);

    beforeEach(() => {
      host = freshHost();
    });

    it('shows a monogram while the icon loads, and asks Google for it first', () => {
      const { container } = open();

      expect(monogram(container)).toHaveTextContent('ES');
      expect(images(container)).toHaveLength(1);
      expect(images(container)[0]!.src).toContain('google.com/s2/favicons');
    });

    it('does not draw the picture until it has loaded', () => {
      const { container } = open();

      expect(images(container)[0]).not.toHaveAttribute('data-loaded');
    });

    it('shows the picture in place of the monogram once it has loaded', () => {
      const { container } = open();

      loaded(images(container)[0]!, 64);

      expect(images(container)[0]).toHaveAttribute('data-loaded', 'true');
      expect(monogram(container)).toBeNull();
    });

    it('loads lazily, without a referrer, and cannot be dragged off', () => {
      const { container } = open();
      const image = images(container)[0]!;

      expect(image).toHaveAttribute('loading', 'lazy');
      expect(image).toHaveAttribute('decoding', 'async');
      expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(image).toHaveAttribute('draggable', 'false');
      expect(image).toHaveAttribute('alt', '');
    });

    it('tries the next source when Google only has its tiny globe', () => {
      const { container } = open();

      loaded(images(container)[0]!, 16);

      expect(images(container)).toHaveLength(1);
      expect(images(container)[0]!.src).toContain('icons.duckduckgo.com');
      expect(monogram(container)).not.toBeNull();
    });

    it('keeps an icon that is just big enough', () => {
      const { container } = open();

      loaded(images(container)[0]!, 17);

      expect(images(container)[0]).toHaveAttribute('data-loaded', 'true');
    });

    it('does not insist on a size from a source that sets no minimum', () => {
      const { container } = open();
      loaded(images(container)[0]!, 16);

      loaded(images(container)[0]!, 16);

      expect(images(container)[0]).toHaveAttribute('data-loaded', 'true');
    });

    it('walks every source, ending with the site’s own, when each fails', () => {
      const { container } = open();
      const tried: string[] = [];

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const [image] = images(container);

        if (!image) {
          break;
        }

        tried.push(image.src);
        fireEvent.error(image);
      }

      expect(tried).toEqual([
        expect.stringContaining('google.com/s2/favicons'),
        expect.stringContaining('icons.duckduckgo.com'),
        `https://${host}/favicon.ico`,
        `https://${host}/apple-touch-icon.png`
      ]);
    });

    it('settles for the monogram when every source fails', () => {
      const { container } = open();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        fireEvent.error(images(container)[0]!);
      }

      expect(images(container)).toHaveLength(0);
      expect(monogram(container)).toHaveTextContent('ES');
    });

    it('goes straight to the source that worked last time', () => {
      rememberIcon(`@${host}`, 2);

      const { container } = open();

      expect(images(container)[0]!.src).toBe(`https://${host}/favicon.ico`);
    });

    it('remembers the source that worked', () => {
      vi.useFakeTimers();
      const { container } = open();
      fireEvent.error(images(container)[0]!);

      loaded(images(container)[0]!, 32);
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(JSON.parse(window.localStorage.getItem('dashboard-icon-hits')!)).toMatchObject({
        [`@${host}`]: 1
      });
      vi.useRealTimers();
    });

    it('starts over for a different site', () => {
      const { container, rerender } = open();
      loaded(images(container)[0]!, 64);

      rerender(<BookmarkIcon icon="" url="https://other.org" name="Other" />);

      expect(images(container)[0]!.src).toContain('other.org');
      expect(images(container)[0]).not.toHaveAttribute('data-loaded');
    });

    it('shows only the monogram for an address that is not on the web', () => {
      const { container } = render(
        <BookmarkIcon icon="" url="mailto:me@example.com" name="Mail me" />
      );

      expect(images(container)).toHaveLength(0);
      expect(monogram(container)).toHaveTextContent('MM');
    });
  });

  describe('a chosen image', () => {
    it('tries the chosen address first, then falls back to the site’s own icon', () => {
      const { container } = render(
        <BookmarkIcon
          icon="https://cdn.example.com/logo.png"
          url="https://example.com"
          name="Example"
        />
      );

      expect(images(container)[0]!.src).toBe('https://cdn.example.com/logo.png');

      fireEvent.error(images(container)[0]!);

      expect(images(container)[0]!.src).toContain('google.com/s2/favicons');
    });

    it('draws a named dashboard icon', () => {
      const { container } = render(<BookmarkIcon icon="plex.png" url="" name="Plex" />);

      expect(images(container)[0]!.src).toContain('dashboard-icons/png/plex.png');
    });
  });

  describe('a mask icon', () => {
    let probes: { onerror?: () => void; src: string }[];

    beforeEach(() => {
      probes = [];
      vi.stubGlobal(
        'Image',
        class {
          onerror?: () => void;
          _src = '';

          get src(): string {
            return this._src;
          }

          set src(value: string) {
            this._src = value;
            probes.push(this);
          }
        }
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const mask = (container: HTMLElement): HTMLElement | null =>
      container.querySelector<HTMLElement>('.bm-mask');

    it('is drawn as a mask, so it takes the card’s ink', () => {
      const { container } = render(<BookmarkIcon icon="si-github" url="" name="GitHub" />);

      expect(mask(container)!.style.maskImage).toContain('simple-icons');
      expect(mask(container)!.style.maskImage).toContain('github.svg');
      expect(mask(container)!.style.background).toBe('');
    });

    it('takes a chosen colour', () => {
      const { container } = render(<BookmarkIcon icon="mdi-home-#ff8800" url="" name="Home" />);

      expect(mask(container)!.style.maskImage).toContain('@mdi/svg');
      expect(mask(container)!.style.background).toBe('rgb(255, 136, 0)');
    });

    it('checks that the icon exists by trying to load it', () => {
      render(<BookmarkIcon icon="si-github" url="" name="GitHub" />);

      expect(probes).toHaveLength(1);
      expect(probes[0]!.src).toContain('github.svg');
    });

    it('falls back to the site’s own icon when the mask cannot be found', () => {
      const { container } = render(
        <BookmarkIcon icon="si-nonesuch" url={`https://${freshHost()}`} name="Example" />
      );
      expect(mask(container)).not.toBeNull();

      act(() => probes[0]!.onerror!());

      expect(mask(container)).toBeNull();
      expect(images(container)[0]!.src).toContain('google.com/s2/favicons');
    });

    it('ends in a monogram when the mask is missing and the site has no icon', () => {
      const { container } = render(<BookmarkIcon icon="si-nonesuch" url="" name="Nothing" />);

      act(() => probes[0]!.onerror!());

      expect(mask(container)).toBeNull();
      expect(monogram(container)).toHaveTextContent('N');
    });

    it('ignores a failure that arrives after the icon has gone', () => {
      const { unmount } = render(<BookmarkIcon icon="si-github" url="" name="GitHub" />);
      unmount();

      expect(() => probes[0]!.onerror!()).not.toThrow();
    });
  });
});
