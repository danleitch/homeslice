import type { ComponentProps, JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_BASE_FISH, MIN_BASE_FISH } from '../lib/koi';
import { BackgroundSettings } from './background-settings';

const settings = (props: Partial<ComponentProps<typeof BackgroundSettings>> = {}): JSX.Element => (
  <BackgroundSettings
    background="koi"
    onBackgroundChange={() => undefined}
    baseFishCount={3}
    onBaseFishCountChange={() => undefined}
    wallpaper=""
    onWallpaperChange={() => undefined}
    {...props}
  />
);

describe('BackgroundSettings', () => {
  it('offers each background, with the current one chosen', () => {
    render(settings({ background: 'particles' }));

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Koi pond',
      'Dreams',
      'Particles',
      'Wallpaper',
      'Plain'
    ]);
    expect(screen.getByRole('radio', { name: 'Particles' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Koi pond' })).not.toBeChecked();
  });

  it('says what each background is', () => {
    render(settings());

    expect(screen.getByText('A living pond under the glass')).toBeInTheDocument();
    expect(screen.getByText('A quiet gradient')).toBeInTheDocument();
  });

  it('changes the background to the one chosen', async () => {
    const onBackgroundChange = vi.fn();
    render(settings({ onBackgroundChange }));

    await userEvent.click(screen.getByRole('radio', { name: 'Dreams' }));

    expect(onBackgroundChange).toHaveBeenCalledWith('dreams');
  });

  describe('the koi pond', () => {
    it('offers every number of fish the pond can be floored at', () => {
      render(settings());

      const counts = screen
        .getAllByRole('option')
        .map((option) => Number((option as HTMLOptionElement).value));

      expect(counts[0]).toBe(MIN_BASE_FISH);
      expect(counts[counts.length - 1]).toBe(MAX_BASE_FISH);
      expect(counts).toHaveLength(MAX_BASE_FISH - MIN_BASE_FISH + 1);
      expect(screen.getByLabelText('Fish always in the pond')).toHaveDisplayValue('3');
    });

    it('changes how many fish are always there', async () => {
      const onBaseFishCountChange = vi.fn();
      render(settings({ onBaseFishCountChange }));

      await userEvent.selectOptions(screen.getByLabelText('Fish always in the pond'), '5');

      expect(onBaseFishCountChange).toHaveBeenCalledWith(5);
    });

    it('explains the floor, and the cap', () => {
      render(settings());

      expect(screen.getByText(/never drops below this many/)).toHaveTextContent(
        `up to ${MAX_BASE_FISH} at once`
      );
      expect(screen.getByLabelText('Fish always in the pond')).toBeEnabled();
    });

    it('says one market koi has the pond to itself, and leaves the floor alone', () => {
      render(settings({ marketKoiCount: 1 }));

      expect(screen.getByText(/Your market koi has the pond to itself/)).toBeInTheDocument();
      expect(screen.getByLabelText('Fish always in the pond')).toBeDisabled();
    });

    it('says how many market koi fill the pond', () => {
      render(settings({ marketKoiCount: 4 }));

      expect(screen.getByText(/Your 4 market koi fill the pond/)).toBeInTheDocument();
      expect(screen.getByLabelText('Fish always in the pond')).toBeDisabled();
    });

    it('resets the lilies, but only once one has been moved', async () => {
      const onResetLilies = vi.fn();
      const { rerender } = render(settings({ onResetLilies }));

      expect(screen.getByRole('button', { name: 'Reset lily positions' })).toBeDisabled();

      rerender(settings({ onResetLilies, liliesMoved: true }));
      await userEvent.click(screen.getByRole('button', { name: 'Reset lily positions' }));

      expect(onResetLilies).toHaveBeenCalledTimes(1);
    });

    it('opens the market', async () => {
      const onOpenMarket = vi.fn();
      render(settings({ onOpenMarket }));

      await userEvent.click(screen.getByRole('button', { name: 'Open the koi market' }));

      expect(onOpenMarket).toHaveBeenCalledTimes(1);
    });

    it('offers neither button when it cannot do either', () => {
      render(settings());

      expect(
        screen.queryByRole('button', { name: 'Reset lily positions' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open the koi market' })).not.toBeInTheDocument();
    });
  });

  describe('dreams', () => {
    it('lets the time of day be chosen, as the system’s by default', async () => {
      const onDreamsModeChange = vi.fn();
      render(settings({ background: 'dreams', onDreamsModeChange }));

      const select = screen.getByLabelText('Time of day');

      expect(select).toHaveDisplayValue('Match system');
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Match system',
        'Day',
        'Night'
      ]);

      await userEvent.selectOptions(select, 'Night');

      expect(onDreamsModeChange).toHaveBeenCalledWith('night');
    });

    it('shows the mode it was given', () => {
      render(settings({ background: 'dreams', dreamsMode: 'day', onDreamsModeChange: vi.fn() }));

      expect(screen.getByLabelText('Time of day')).toHaveDisplayValue('Day');
    });

    it('has no time of day to offer when nothing can change it', () => {
      render(settings({ background: 'dreams' }));

      expect(screen.queryByLabelText('Time of day')).not.toBeInTheDocument();
    });
  });

  describe('particles', () => {
    it('opens the particle settings', async () => {
      const onOpenParticles = vi.fn();
      render(settings({ background: 'particles', onOpenParticles }));

      await userEvent.click(screen.getByRole('button', { name: 'Customise the particles' }));

      expect(onOpenParticles).toHaveBeenCalledTimes(1);
    });

    it('has nothing to open when it cannot', () => {
      render(settings({ background: 'particles' }));

      expect(screen.queryByRole('button', { name: 'Customise the particles' })).toBeNull();
    });
  });

  describe('a wallpaper', () => {
    it('shows the address it has', () => {
      render(settings({ background: 'wallpaper', wallpaper: 'https://example.com/a.jpg' }));

      expect(screen.getByLabelText('Image address')).toHaveValue('https://example.com/a.jpg');
    });

    it('takes the address when it is submitted, without spaces', async () => {
      const onWallpaperChange = vi.fn();
      render(settings({ background: 'wallpaper', onWallpaperChange }));

      await userEvent.type(
        screen.getByLabelText('Image address'),
        ' https://example.com/b.jpg {Enter}'
      );

      expect(onWallpaperChange).toHaveBeenCalledWith('https://example.com/b.jpg');
    });

    it('takes it when the field is left too, so nothing typed is lost', () => {
      const onWallpaperChange = vi.fn();
      render(settings({ background: 'wallpaper', onWallpaperChange }));

      const field = screen.getByLabelText('Image address');
      fireEvent.change(field, { target: { value: '  https://example.com/c.jpg ' } });
      fireEvent.blur(field);

      expect(onWallpaperChange).toHaveBeenCalledWith('https://example.com/c.jpg');
    });

    it('can be cleared, to fall back to the gradient', () => {
      const onWallpaperChange = vi.fn();
      render(
        settings({
          background: 'wallpaper',
          wallpaper: 'https://example.com/a.jpg',
          onWallpaperChange
        })
      );

      const field = screen.getByLabelText('Image address');
      fireEvent.change(field, { target: { value: '' } });
      fireEvent.blur(field);

      expect(onWallpaperChange).toHaveBeenCalledWith('');
    });
  });

  it('shows only what the chosen background can be tuned with', () => {
    render(
      settings({ background: 'plain', onOpenParticles: vi.fn(), onDreamsModeChange: vi.fn() })
    );

    expect(screen.queryByLabelText('Fish always in the pond')).toBeNull();
    expect(screen.queryByLabelText('Time of day')).toBeNull();
    expect(screen.queryByLabelText('Image address')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Customise the particles' })).toBeNull();
  });
});
