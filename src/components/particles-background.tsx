import { memo, useEffect, useMemo, useState } from 'react';
import Particles, { ParticlesProvider } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Engine } from '@tsparticles/engine';
import { isOpenWater } from '../lib/koi-attention';
import { toParticlesOptions, type ParticleSettings } from '../lib/particles';

/** Declared once: the provider holds the first function it is given for the life of the page. */
const registerSlim = async (engine: Engine): Promise<void> => {
  await loadSlim(engine);
};

/**
 * Every change rebuilds the canvas and scatters the particles afresh, so a
 * slider being dragged is only applied once it pauses.
 */
const APPLY_DELAY_MS = 150;

const useSettled = <T,>(value: T, delayMs: number): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
};

/**
 * tsParticles listens for clicks on the whole window, so a click on the form
 * or a dialog would push, remove or repulse particles too. Stopping those
 * presses at the document keeps click modes to the open background, the same
 * way the koi only answer a touch on open water.
 */
const useClicksOnOpenBackgroundOnly = (): void => {
  useEffect(() => {
    const swallow = (event: PointerEvent): void => {
      if (!isOpenWater(event.target)) {
        event.stopPropagation();
      }
    };

    document.addEventListener('pointerdown', swallow);
    document.addEventListener('pointerup', swallow);

    return () => {
      document.removeEventListener('pointerdown', swallow);
      document.removeEventListener('pointerup', swallow);
    };
  }, []);
};

type ParticlesBackgroundProps = {
  settings: ParticleSettings;
};

const ParticlesBackgroundInner = ({ settings }: ParticlesBackgroundProps): JSX.Element => {
  const applied = useSettled(settings, APPLY_DELAY_MS);
  const options = useMemo(() => toParticlesOptions(applied), [applied]);

  useClicksOnOpenBackgroundOnly();

  // The wrapper reloads on any new props object, so it only gets a new
  // element when the options it draws have actually changed. The provider
  // draws nothing until the engine has loaded its shapes and interactions.
  const canvas = useMemo(() => <Particles id="tsparticles" options={options} />, [options]);

  return <ParticlesProvider init={registerSlim}>{canvas}</ParticlesProvider>;
};

export const ParticlesBackground = memo(ParticlesBackgroundInner);
