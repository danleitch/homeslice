import { useState } from 'react';
import { MAX_BASE_FISH, MIN_BASE_FISH } from '../lib/koi';
import { BACKGROUND_STYLES, type DreamsMode } from '../lib/storage';
import type { BackgroundStyle } from '../types';

const BACKGROUND_LABELS: Readonly<Record<BackgroundStyle, string>> = {
  koi: 'Koi pond',
  dreams: 'Dreams',
  particles: 'Particles',
  wallpaper: 'Wallpaper',
  plain: 'Plain'
};

const BACKGROUND_BLURBS: Readonly<Record<BackgroundStyle, string>> = {
  koi: 'A living pond under the glass',
  dreams: 'A calm valley, by day or night',
  particles: 'A field of drifting points',
  wallpaper: 'Any image you like',
  plain: 'A quiet gradient'
};

/** One option per fish count the pond can be floored at. */
const BASE_FISH_OPTIONS: readonly number[] = Array.from(
  { length: MAX_BASE_FISH - MIN_BASE_FISH + 1 },
  (_unused, index) => MIN_BASE_FISH + index
);

type BackgroundSettingsProps = {
  background: BackgroundStyle;
  onBackgroundChange: (background: BackgroundStyle) => void;
  /** How many koi swim at minimum; more join as branches are saved, up to the pond's cap. */
  baseFishCount: number;
  onBaseFishCountChange: (count: number) => void;
  /** Whether any lily has been dragged away from where the pond put it. */
  liliesMoved?: boolean;
  onResetLilies?: () => void;
  /** How many market koi the visitor owns; while there are any, they are the whole pond. */
  marketKoiCount?: number;
  onOpenMarket?: () => void;
  onOpenParticles?: () => void;
  wallpaper: string;
  onWallpaperChange: (url: string) => void;
  dreamsMode?: DreamsMode;
  onDreamsModeChange?: (mode: DreamsMode) => void;
};

const DREAMS_MODE_LABELS: Readonly<Record<DreamsMode, string>> = {
  auto: 'Match system',
  day: 'Day',
  night: 'Night'
};

/** The backdrop behind the dashboard, and what each one can be tuned with. */
export const BackgroundSettings = ({
  background,
  onBackgroundChange,
  baseFishCount,
  onBaseFishCountChange,
  liliesMoved = false,
  onResetLilies,
  marketKoiCount = 0,
  onOpenMarket,
  onOpenParticles,
  wallpaper,
  onWallpaperChange,
  dreamsMode = 'auto',
  onDreamsModeChange
}: BackgroundSettingsProps): JSX.Element => {
  const [draft, setDraft] = useState(wallpaper);

  return (
    <fieldset className="settings-fieldset background-settings">
      <legend>Background</legend>
      <div className="background-options">
        {BACKGROUND_STYLES.map((style) => (
          <label key={style} className={`background-option background-option--${style}`}>
            <input
              type="radio"
              name="background"
              aria-label={BACKGROUND_LABELS[style]}
              value={style}
              checked={background === style}
              onChange={() => onBackgroundChange(style)}
            />
            <span className="background-swatch" aria-hidden="true" />
            <span className="background-name">{BACKGROUND_LABELS[style]}</span>
            <span className="background-blurb">{BACKGROUND_BLURBS[style]}</span>
          </label>
        ))}
      </div>

      {background === 'koi' && (
        <>
          <p className="settings-hint">
            The koi pond swims one fish per recent branch, each in its own colour, or the koi you
            buy at the market. Click the water between the cards and they come to look; right-click
            to feed them; drag a lily pad to move it.
          </p>
          <label className="settings-select">
            Fish always in the pond
            <select
              value={baseFishCount}
              disabled={marketKoiCount > 0}
              onChange={(event) => onBaseFishCountChange(Number(event.target.value))}
            >
              {BASE_FISH_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-hint">
            {marketKoiCount === 1
              ? 'Your market koi has the pond to itself, so branch koi and residents are resting until you release it.'
              : marketKoiCount > 1
                ? `Your ${marketKoiCount} market koi fill the pond, so branch koi and residents are resting until you release them.`
                : `The pond never drops below this many. Recent branches fill in past it, up to ${MAX_BASE_FISH} at once.`}
          </p>
          <div className="settings-buttons">
            {onResetLilies && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!liliesMoved}
                onClick={onResetLilies}
              >
                Reset lily positions
              </button>
            )}
            {onOpenMarket && (
              <button type="button" className="btn btn-secondary" onClick={onOpenMarket}>
                Open the koi market
              </button>
            )}
          </div>
        </>
      )}

      {background === 'dreams' && onDreamsModeChange && (
        <label className="settings-select">
          Time of day
          <select
            value={dreamsMode}
            onChange={(event) => onDreamsModeChange(event.target.value as DreamsMode)}
          >
            {(Object.keys(DREAMS_MODE_LABELS) as DreamsMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {DREAMS_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      )}

      {background === 'particles' && onOpenParticles && (
        <button type="button" className="btn btn-secondary" onClick={onOpenParticles}>
          Customise the particles
        </button>
      )}

      {background === 'wallpaper' && (
        <form
          className="wallpaper-row"
          onSubmit={(event) => {
            event.preventDefault();
            onWallpaperChange(draft.trim());
          }}
        >
          <label className="settings-select">
            Image address
            <input
              type="url"
              value={draft}
              placeholder="https://images.unsplash.com/…"
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => onWallpaperChange(draft.trim())}
            />
          </label>
          <p className="settings-hint">
            A wide, dark-ish image works best behind the glass. Without one, a soft gradient shows
            instead.
          </p>
        </form>
      )}
    </fieldset>
  );
};
