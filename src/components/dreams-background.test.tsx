import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DREAMS_MODES } from '../lib/storage';
import { DreamsBackground } from './dreams-background';

const scene = (mode: 'auto' | 'day' | 'night' = 'auto'): HTMLElement =>
  render(<DreamsBackground mode={mode} />).container.firstElementChild as HTMLElement;

const paths = (root: HTMLElement, className: string): string =>
  root.querySelector(`.${className}`)!.getAttribute('d')!;

describe('DreamsBackground', () => {
  it('is decoration, hidden from anything that reads the page aloud', () => {
    expect(scene()).toHaveAttribute('aria-hidden', 'true');
    expect(scene().querySelector('svg')).toHaveAttribute('focusable', 'false');
  });

  it.each(DREAMS_MODES)('says which time of day it is drawn for: %s', (mode) => {
    expect(scene(mode)).toHaveAttribute('data-mode', mode);
  });

  it('is drawn as scalable vector art that fills the screen from the bottom', () => {
    const svg = scene().querySelector('svg')!;

    expect(svg).toHaveAttribute('viewBox', '0 0 1600 900');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMax slice');
  });

  it('paints sky, sun, clouds, birds, lake and every layer of land', () => {
    const root = scene();

    for (const part of [
      '.dreams-sun',
      '.dreams-clouds',
      '.dreams-birds',
      '.dreams-reflection',
      '.dreams-island',
      '.dreams-mist',
      '.dreams-far',
      '.dreams-mid',
      '.dreams-near',
      '.dreams-near-2',
      '.dreams-meadow',
      '.dreams-shade'
    ]) {
      expect(root.querySelector(part), part).not.toBeNull();
    }
  });

  it('defines the gradients and the soft blur the scene refers to', () => {
    const root = scene();

    for (const id of ['dreams-sky', 'dreams-lake', 'dreams-glow', 'dreams-soft']) {
      expect(root.querySelector(`#${id}`), id).not.toBeNull();
    }

    for (const reference of ['url(#dreams-sky)', 'url(#dreams-lake)', 'url(#dreams-glow)']) {
      expect(root.innerHTML).toContain(reference);
    }
  });

  it('flaps three birds', () => {
    expect(scene().querySelectorAll('.dreams-bird')).toHaveLength(3);
  });

  it('scatters seventy twinkling stars, each out of step with the others', () => {
    const stars = scene().querySelectorAll<SVGCircleElement>('.dreams-stars circle');

    expect(stars).toHaveLength(70);
    expect(new Set([...stars].map((star) => star.style.animationDelay)).size).toBeGreaterThan(50);
  });

  it('keeps the stars in the sky, above the lake', () => {
    for (const star of scene().querySelectorAll<SVGCircleElement>('.dreams-stars circle')) {
      expect(Number(star.getAttribute('cy'))).toBeLessThan(380);
      expect(Number(star.getAttribute('cx'))).toBeLessThan(1600);
    }
  });

  it('puts twenty-two glints of light on the water', () => {
    const glints = scene().querySelectorAll<SVGRectElement>('.dreams-glints rect');

    expect(glints).toHaveLength(22);

    for (const glint of glints) {
      expect(Number(glint.getAttribute('y'))).toBeGreaterThan(640);
    }
  });

  it('is the same scene on every visit, however many times it is drawn', () => {
    const first = scene().innerHTML;

    expect(scene().innerHTML).toBe(first);
  });

  it('is the same scene by day and by night; only its colours change', () => {
    const day = scene('day');
    const night = scene('night');

    for (const layer of ['dreams-far', 'dreams-far-trees', 'dreams-mid', 'dreams-near']) {
      expect(paths(day, layer)).toBe(paths(night, layer));
    }
  });

  it('draws each layer of land as a closed shape reaching the bottom of the picture', () => {
    const root = scene();

    for (const layer of [
      'dreams-far',
      'dreams-mid',
      'dreams-near',
      'dreams-near-2',
      'dreams-meadow'
    ]) {
      const d = paths(root, layer);
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      expect(d).toContain(' 900 ');
    }
  });

  it('plants trees in patches along the ridges, not none and not everywhere', () => {
    const root = scene();

    for (const trees of ['dreams-far-trees', 'dreams-mid-trees', 'dreams-near-trees']) {
      const d = root.querySelector(`.${trees}`)!.getAttribute('d')!;
      const count = (d.match(/M/g) ?? []).length;

      expect(count, trees).toBeGreaterThan(5);
    }
  });

  it('draws each pine with a tip, three tiers of boughs and a trunk', () => {
    const [firstPine] = paths(scene(), 'dreams-far-trees').split(/(?=M)/);

    // A tip, then fourteen more points: three tiers of boughs and the trunk, down one side and up the other.
    expect((firstPine!.match(/M/g) ?? []).length).toBe(1);
    expect((firstPine!.match(/L/g) ?? []).length).toBe(14);
    expect(firstPine!.trim().endsWith('Z')).toBe(true);
  });

  it('puts the island on the water, and its trees on the island', () => {
    const root = scene();

    expect(paths(root, 'dreams-island')).toContain('M');
    expect(root.querySelectorAll('.dreams-island')).toHaveLength(2);
  });

  it('can be redrawn for another time of day without rebuilding the scene', () => {
    const { container, rerender } = render(<DreamsBackground mode="day" />);
    const before = container.querySelector('.dreams-far')!.getAttribute('d');

    rerender(<DreamsBackground mode="night" />);

    expect(container.firstElementChild).toHaveAttribute('data-mode', 'night');
    expect(container.querySelector('.dreams-far')!.getAttribute('d')).toBe(before);
  });
});
