import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom doesn't implement scrolling and logs an error when it's called.
window.scrollTo = vi.fn();

// jsdom has no canvas either; the koi background already handles a null context.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

// tsParticles draws on an OffscreenCanvas, which jsdom lacks, so the real engine
// can't start here. A stand-in keeps what the app hands it where tests can read
// it: the options on the element, and the engine registration through loadSlim.
vi.mock('@tsparticles/react', async () => {
  const { createElement, Fragment, useEffect } = await import('react');

  return {
    default: ({ id, options }: { id?: string; options?: unknown }) =>
      createElement('div', {
        id,
        'data-testid': 'particles',
        'data-options': JSON.stringify(options)
      }),
    ParticlesProvider: ({
      init,
      children
    }: {
      init: (engine: unknown) => Promise<void>;
      children?: unknown;
    }) => {
      useEffect(() => {
        void init({ stub: 'engine' });
      }, [init]);

      return createElement(Fragment, null, children as never);
    }
  };
});

vi.mock('@tsparticles/slim', () => ({ loadSlim: vi.fn(async () => undefined) }));

// The dashboard's widgets fetch weather, prices and news. Tests stay offline
// unless they stub fetch with answers of their own.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Offline in tests.')))
  );
});

// Ensure a clean DOM and storage between tests.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});
