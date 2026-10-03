import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KoiGuide } from './koi-guide';

// The guide's fish are pictures; their portraits are not what is being tested here.
vi.mock('./koi-portrait-image', () => ({ KoiPortraitImage: () => null }));

const SECTIONS = [
  ['Where koi come from', 'guide-origins'],
  ['Reading a name', 'guide-names'],
  ['The varieties', 'guide-varieties'],
  ['Traits', 'guide-traits'],
  ['Age and size', 'guide-growth'],
  ['Goldfish', 'guide-goldfish'],
  ['Real, and our flair', 'guide-flair']
] as const;

describe('KoiGuide', () => {
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('goes back to the market, from the top of the guide and from the foot of it', async () => {
    const onBack = vi.fn();
    render(<KoiGuide onBack={onBack} />);

    const backs = screen.getAllByRole('button', { name: '← Back to the market' });
    expect(backs).toHaveLength(2);

    for (const back of backs) {
      await userEvent.click(back);
    }

    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('has a section for everything its contents lists', () => {
    render(<KoiGuide onBack={vi.fn()} />);

    for (const [, id] of SECTIONS) {
      expect(document.getElementById(id), id).toHaveClass('guide-section');
    }
  });

  it.each(SECTIONS)('scrolls smoothly to “%s” from the contents', async (label, id) => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<KoiGuide onBack={vi.fn()} />);

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'In this guide' })).getByRole('button', {
        name: label
      })
    );

    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth' });
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById(id));
  });

  it('does nothing, rather than failing, where the browser cannot scroll to an element', async () => {
    render(<KoiGuide onBack={vi.fn()} />);

    await expect(
      userEvent.click(screen.getByRole('button', { name: 'The varieties' }))
    ).resolves.toBeUndefined();
  });
});
