import type { JSX } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAwake } from './use-awake';

const Card = (): JSX.Element => {
  const { awake, wakers } = useAwake();

  return (
    <div>
      <section data-testid="card" data-awake={awake} {...wakers}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </section>
      <button type="button">Outside</button>
    </div>
  );
};

const card = (): HTMLElement => screen.getByTestId('card');
const isAwake = (): boolean => card().dataset.awake === 'true';

describe('useAwake', () => {
  it('starts asleep', () => {
    render(<Card />);

    expect(isAwake()).toBe(false);
  });

  it('wakes when the pointer arrives, and sleeps when it leaves', () => {
    render(<Card />);

    fireEvent.pointerEnter(card());
    expect(isAwake()).toBe(true);

    fireEvent.pointerLeave(card());
    expect(isAwake()).toBe(false);
  });

  it('wakes when focus arrives, from the keyboard', () => {
    render(<Card />);

    fireEvent.focus(screen.getByRole('button', { name: 'First' }));

    expect(isAwake()).toBe(true);
  });

  it('sleeps when focus leaves the card altogether', () => {
    render(<Card />);
    fireEvent.focus(screen.getByRole('button', { name: 'First' }));

    fireEvent.blur(screen.getByRole('button', { name: 'First' }), {
      relatedTarget: screen.getByRole('button', { name: 'Outside' })
    });

    expect(isAwake()).toBe(false);
  });

  it('stays awake while focus moves between controls inside the card', () => {
    render(<Card />);
    fireEvent.focus(screen.getByRole('button', { name: 'First' }));

    fireEvent.blur(screen.getByRole('button', { name: 'First' }), {
      relatedTarget: screen.getByRole('button', { name: 'Second' })
    });

    expect(isAwake()).toBe(true);
  });

  it('sleeps when focus goes nowhere, such as a click on the page’s background', () => {
    render(<Card />);
    fireEvent.focus(screen.getByRole('button', { name: 'First' }));

    fireEvent.blur(screen.getByRole('button', { name: 'First' }), { relatedTarget: null });

    expect(isAwake()).toBe(false);
  });
});
