import { act, render, screen } from '@testing-library/react';
import { loadSlim } from '@tsparticles/slim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARTICLE_SETTINGS, PARTICLE_PRESETS, toParticlesOptions } from '../lib/particles';
import { ParticlesBackground } from './particles-background';

const drawnOptions = (): unknown => JSON.parse(screen.getByTestId('particles').dataset.options!);

describe('ParticlesBackground', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(loadSlim).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the particles under the id tsParticles expects', () => {
    render(<ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />);

    expect(screen.getByTestId('particles')).toHaveAttribute('id', 'tsparticles');
  });

  it('hands tsParticles the options built from the settings', () => {
    render(<ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />);

    expect(drawnOptions()).toEqual(
      JSON.parse(JSON.stringify(toParticlesOptions(DEFAULT_PARTICLE_SETTINGS)))
    );
  });

  it('loads the slim bundle into the engine through the provider', () => {
    render(<ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />);

    expect(loadSlim).toHaveBeenCalledWith({ stub: 'engine' });
  });

  it('keeps the same engine registration across renders', () => {
    const { rerender } = render(<ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />);
    rerender(<ParticlesBackground settings={PARTICLE_PRESETS[1].settings} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(loadSlim).toHaveBeenCalledTimes(1);
  });

  it('waits for a slider to pause before redrawing', () => {
    const { rerender } = render(<ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />);
    const next = { ...DEFAULT_PARTICLE_SETTINGS, count: 120 };

    rerender(<ParticlesBackground settings={next} />);
    expect(drawnOptions()).toMatchObject({ particles: { number: { value: 300 } } });

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(drawnOptions()).toMatchObject({ particles: { number: { value: 300 } } });

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(drawnOptions()).toMatchObject({ particles: { number: { value: 120 } } });
  });

  it('paints with the chosen colour', () => {
    render(<ParticlesBackground settings={{ ...DEFAULT_PARTICLE_SETTINGS, color: '#ff8800' }} />);

    expect(drawnOptions()).toMatchObject({
      particles: { paint: { fill: { enable: true, color: { value: '#ff8800' } } } }
    });
  });

  describe('clicks', () => {
    const press = (target: Element): { reachedWindow: boolean } => {
      const seen = { reachedWindow: false };
      const listener = (): void => {
        seen.reachedWindow = true;
      };

      window.addEventListener('pointerdown', listener);
      target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      window.removeEventListener('pointerdown', listener);

      return seen;
    };

    it('lets a press on the open background through to tsParticles', () => {
      render(<ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />);

      expect(press(document.body).reachedWindow).toBe(true);
    });

    it('keeps a press on a button or dialog away from tsParticles', () => {
      render(
        <>
          <ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />
          <button type="button">Save</button>
          <div role="dialog" aria-label="Settings">
            <span>inside</span>
          </div>
        </>
      );

      expect(press(screen.getByRole('button', { name: 'Save' })).reachedWindow).toBe(false);
      expect(press(screen.getByText('inside')).reachedWindow).toBe(false);
    });

    it('stops guarding once the particles are gone', () => {
      const { unmount } = render(
        <>
          <ParticlesBackground settings={DEFAULT_PARTICLE_SETTINGS} />
          <button type="button">Save</button>
        </>
      );
      const button = screen.getByRole('button', { name: 'Save' });
      unmount();
      document.body.append(button);

      expect(press(button).reachedWindow).toBe(true);
    });
  });
});
