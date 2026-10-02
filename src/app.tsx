import { Suspense, lazy, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { BranchifySheet } from './branchify/branchify-sheet';
import { useBranchify } from './branchify/use-branchify';
import { BackgroundSettings } from './components/background-settings';
import { KoiMarketButton } from './components/koi-market-button';
import { ParticleSettingsPanel } from './components/particle-settings-panel';
import { ParticlesButton } from './components/particles-button';
import { Dashboard } from './dashboard/dashboard';
import { useKoiAccount, useMarketDay } from './hooks/use-koi-account';
import { useRecentBranches } from './hooks/use-recent-branches';
import { marketFishOf } from './lib/koi-inspect';
import {
  BACKGROUND_STORAGE_KEY,
  BASE_FISH_STORAGE_KEY,
  DREAMS_MODE_STORAGE_KEY,
  FISH_NAMES_STORAGE_KEY,
  LILY_PLACEMENTS_STORAGE_KEY,
  MAX_FISH_NAMES,
  PARTICLES_STORAGE_KEY,
  WALLPAPER_STORAGE_KEY,
  parseBackground,
  parseBaseFish,
  parseDreamsMode,
  parseFishNames,
  parseLilyPlacements,
  parseParticleSettings,
  parseWallpaper,
  readStorage,
  writeStorage,
  type DreamsMode,
  type FishNames
} from './lib/storage';
import type { ParticleSettings } from './lib/particles';
import type { LilyPlacements } from './lib/pond-decor';
import type { BackgroundStyle } from './types';

// Only visitors who pick the particles background pay to download tsparticles;
// the koi pond is the default and carries no library at all.
// three.js and the vendored koi are the heaviest thing the app can draw, so
// they arrive only for visitors who are actually looking at the pond.
const Koi3dBackground = lazy(() =>
  import('./components/koi3d-background').then((module) => ({
    default: module.Koi3dBackground
  }))
);

// The Dreams landscape is drawn in SVG; it arrives only for those who choose it.
const DreamsBackground = lazy(() =>
  import('./components/dreams-background').then((module) => ({
    default: module.DreamsBackground
  }))
);

const ParticlesBackground = lazy(() =>
  import('./components/particles-background').then((module) => ({
    default: module.ParticlesBackground
  }))
);

// The market photographs its koi with three.js, so it loads only when opened
// and shares the renderer chunk the pond has already paid for.
const KoiMarket = lazy(() =>
  import('./components/koi-market').then((module) => ({ default: module.KoiMarket }))
);

/** Branchify opens over the board at this address, so it can be bookmarked and Back closes it. */
const BRANCHIFY_HASH = '#branchify';

const useBranchifyRoute = (): [boolean, () => void, () => void] => {
  const [open, setOpen] = useState(() => window.location.hash === BRANCHIFY_HASH);

  useEffect(() => {
    const sync = (): void => setOpen(window.location.hash === BRANCHIFY_HASH);
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);

    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const show = useCallback((): void => {
    if (window.location.hash !== BRANCHIFY_HASH) {
      window.history.pushState(null, '', BRANCHIFY_HASH);
    }

    setOpen(true);
  }, []);

  const hide = useCallback((): void => {
    if (window.location.hash === BRANCHIFY_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    setOpen(false);
  }, []);

  return [open, show, hide];
};

type ShellProps = {
  /** An import wrote new state to storage; everything is read again from it. */
  onRestored: () => void;
};

const Shell = ({ onRestored }: ShellProps): JSX.Element => {
  const [background, setBackground] = useState<BackgroundStyle>(() =>
    parseBackground(readStorage(BACKGROUND_STORAGE_KEY))
  );
  const [wallpaper, setWallpaper] = useState(() =>
    parseWallpaper(readStorage(WALLPAPER_STORAGE_KEY))
  );
  const [dreamsMode, setDreamsMode] = useState<DreamsMode>(() =>
    parseDreamsMode(readStorage(DREAMS_MODE_STORAGE_KEY))
  );
  const [baseFishCount, setBaseFishCount] = useState<number>(() =>
    parseBaseFish(readStorage(BASE_FISH_STORAGE_KEY))
  );
  const [lilyPlacements, setLilyPlacements] = useState<LilyPlacements>(() =>
    parseLilyPlacements(readStorage(LILY_PLACEMENTS_STORAGE_KEY))
  );
  const [fishNames, setFishNames] = useState<FishNames>(() =>
    parseFishNames(readStorage(FISH_NAMES_STORAGE_KEY))
  );
  const [particleSettings, setParticleSettings] = useState<ParticleSettings>(() =>
    parseParticleSettings(readStorage(PARTICLES_STORAGE_KEY))
  );
  const [particlesOpen, setParticlesOpen] = useState(false);
  const { recentBranches, addRecentBranch, removeRecentBranch } = useRecentBranches();
  const market = useKoiAccount(recentBranches);
  const { rewardForBranch, markMarketSeen, rename } = market;
  const marketDay = useMarketDay();
  const [marketOpen, setMarketOpen] = useState(false);
  const branchify = useBranchify({ addRecentBranch, rewardForBranch });
  const [branchifyOpen, openBranchify, closeBranchify] = useBranchifyRoute();

  useEffect(() => {
    writeStorage(BACKGROUND_STORAGE_KEY, background);
  }, [background]);

  useEffect(() => {
    writeStorage(WALLPAPER_STORAGE_KEY, wallpaper);
  }, [wallpaper]);

  useEffect(() => {
    writeStorage(DREAMS_MODE_STORAGE_KEY, dreamsMode);
  }, [dreamsMode]);

  useEffect(() => {
    writeStorage(BASE_FISH_STORAGE_KEY, String(baseFishCount));
  }, [baseFishCount]);

  useEffect(() => {
    writeStorage(LILY_PLACEMENTS_STORAGE_KEY, JSON.stringify(lilyPlacements));
  }, [lilyPlacements]);

  useEffect(() => {
    writeStorage(FISH_NAMES_STORAGE_KEY, JSON.stringify(fishNames));
  }, [fishNames]);

  useEffect(() => {
    writeStorage(PARTICLES_STORAGE_KEY, JSON.stringify(particleSettings));
  }, [particleSettings]);

  // A fish from the market is renamed on the market's books, so the market and
  // the pond always agree; a branch koi or resident has no listing, so its name
  // is kept here, against its place in the pond.
  const renameFish = (key: string, name: string): void => {
    const bought = marketFishOf(key);

    if (bought) {
      rename(bought.species, bought.id, name);
      return;
    }

    setFishNames((current) => {
      // Re-added last, so the cap drops the names longest untouched.
      const others = Object.entries(current).filter(([other]) => other !== key);
      return Object.fromEntries([...others, [key, name]].slice(-MAX_FISH_NAMES));
    });
  };

  const openMarket = (): void => {
    setMarketOpen(true);
    markMarketSeen(marketDay);
  };

  const headerExtras = (
    <>
      {background === 'koi' && (
        <KoiMarketButton
          coins={market.account.coins}
          hasNewStock={market.account.seenDay !== marketDay}
          reward={market.lastReward}
          expanded={marketOpen}
          onClick={openMarket}
        />
      )}
      {background === 'particles' && (
        <ParticlesButton expanded={particlesOpen} onClick={() => setParticlesOpen(true)} />
      )}
    </>
  );

  // The market and particle controls open over the board, so Settings steps aside first.
  const appearance = (closeSettings: () => void): JSX.Element => (
    <BackgroundSettings
      background={background}
      onBackgroundChange={setBackground}
      baseFishCount={baseFishCount}
      onBaseFishCountChange={setBaseFishCount}
      liliesMoved={lilyPlacements.some(Boolean)}
      onResetLilies={() => setLilyPlacements([])}
      marketKoiCount={market.account.owned.length}
      onOpenMarket={() => {
        closeSettings();
        openMarket();
      }}
      onOpenParticles={() => {
        closeSettings();
        setParticlesOpen(true);
      }}
      wallpaper={wallpaper}
      onWallpaperChange={setWallpaper}
      dreamsMode={dreamsMode}
      onDreamsModeChange={setDreamsMode}
    />
  );

  return (
    <>
      {background === 'koi' && (
        <Suspense fallback={null}>
          <Koi3dBackground
            recentBranches={recentBranches}
            baseFishCount={baseFishCount}
            ownedKoi={market.account.owned}
            ownedGoldfish={market.account.goldfish}
            lilyPlacements={lilyPlacements}
            onLilyPlacementsChange={setLilyPlacements}
            fishNames={fishNames}
            onRenameFish={renameFish}
          />
        </Suspense>
      )}
      {background === 'dreams' && (
        <Suspense fallback={null}>
          <DreamsBackground mode={dreamsMode} />
        </Suspense>
      )}
      {background === 'particles' && (
        <Suspense fallback={null}>
          <ParticlesBackground settings={particleSettings} />
        </Suspense>
      )}
      {(background === 'plain' || background === 'wallpaper') && (
        <div
          className={`backdrop${background === 'wallpaper' && wallpaper ? ' backdrop--image' : ''}`}
          style={
            background === 'wallpaper' && wallpaper
              ? ({ '--wallpaper': `url("${wallpaper.replace(/"/g, '%22')}")` } as CSSProperties)
              : undefined
          }
          aria-hidden="true"
        />
      )}

      <main className="app-shell">
        <Dashboard
          headerExtras={headerExtras}
          appearance={appearance}
          onOpenBranchify={openBranchify}
          onRestored={onRestored}
        />

        {branchifyOpen && (
          <BranchifySheet
            branchify={branchify}
            recentBranches={recentBranches}
            onRemoveRecent={removeRecentBranch}
            onBranchUsed={rewardForBranch}
            onClose={closeBranchify}
          />
        )}

        {marketOpen && background === 'koi' && (
          <Suspense fallback={null}>
            <KoiMarket
              account={market.account}
              day={marketDay}
              onBuy={market.buy}
              onBuyGoldfish={market.buyGoldfish}
              onRelease={market.release}
              onReleaseGoldfish={market.releaseGoldfish}
              onRestock={() => market.restock(marketDay)}
              onDismissWelcome={market.dismissMarketWelcome}
              onClose={() => setMarketOpen(false)}
            />
          </Suspense>
        )}

        {particlesOpen && background === 'particles' && (
          <ParticleSettingsPanel
            settings={particleSettings}
            onChange={setParticleSettings}
            onClose={() => setParticlesOpen(false)}
          />
        )}
      </main>
    </>
  );
};

/**
 * The personal dashboard, with Branchify as one of its tools and the koi pond,
 * particles or a wallpaper behind the glass.
 */
export const App = (): JSX.Element => {
  // Bumped after a full restore so every piece of state is read again from storage.
  const [epoch, setEpoch] = useState(0);
  return <Shell key={epoch} onRestored={() => setEpoch((current) => current + 1)} />;
};
