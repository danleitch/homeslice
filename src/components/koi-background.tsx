import { memo, useEffect, useMemo, useRef, type RefObject, type JSX } from 'react';
import { drawKoi } from '../lib/koi-draw';
import {
  nominalLength,
  reconcilePond,
  stepSwimmer,
  type PondBounds,
  type Swimmer
} from '../lib/koi-pond';
import type { OwnedGoldfish, OwnedKoi } from '../lib/koi-account';
import { buildKoiRoster } from '../lib/koi-roster';
import { createWater } from '../lib/koi-water';
import { attachLilyDragging } from '../lib/lily-drag';
import type { LilyPlacements } from '../lib/pond-decor';
import { createPondScenery, type PondScenery } from '../lib/pond-scenery';
import type { RecentBranch } from '../types';

type KoiBackgroundProps = {
  recentBranches: readonly RecentBranch[];
  /** The floor on how many koi swim; branches fill in before residents do, up to MAX_KOI. */
  baseFishCount?: number;
  /** Koi bought at the market; when there are any, they are the whole pond. */
  ownedKoi?: readonly OwnedKoi[];
  /** Goldfish bought at the market, who swim with whichever koi are there. */
  ownedGoldfish?: readonly OwnedGoldfish[];
  /** The panel, which the koi treat as an island so they stay in view around it. */
  avoidRef?: RefObject<HTMLElement | null>;
  /** Where the visitor has floated the lilies to. */
  lilyPlacements?: LilyPlacements;
  /** A lily has been dragged somewhere new. */
  onLilyPlacementsChange?: (placements: LilyPlacements) => void;
};

/** Every lily where the pond put it; one array, so a default prop doesn't relay the pond each render. */
const NO_PLACEMENTS: LilyPlacements = [];

/** Retina is honoured up to a point; past 2x the fish cost more than they gain. */
const MAX_PIXEL_RATIO = 2;

/** Settling steps run before a reduced-motion pond is drawn once and left alone. */
const SETTLE_STEPS = 90;
const SETTLE_STEP_S = 1 / 30;

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const KoiBackgroundInner = ({
  recentBranches,
  baseFishCount,
  ownedKoi,
  ownedGoldfish,
  avoidRef,
  lilyPlacements = NO_PLACEMENTS,
  onLilyPlacementsChange
}: KoiBackgroundProps): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swimmersRef = useRef<Swimmer[]>([]);
  const boundsRef = useRef<PondBounds>({ width: 0, height: 0 });
  const roster = useMemo(
    () => buildKoiRoster(recentBranches, baseFishCount, ownedKoi, ownedGoldfish),
    [recentBranches, baseFishCount, ownedKoi, ownedGoldfish]
  );
  const avoidElementRef = useRef(avoidRef);
  avoidElementRef.current = avoidRef;
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const sceneryRef = useRef<PondScenery | null>(null);
  // Paints the pond again as it stands; a still pond needs it after a lily moves.
  const repaintRef = useRef<(() => void) | null>(null);
  const lilyPlacementsRef = useRef(lilyPlacements);
  lilyPlacementsRef.current = lilyPlacements;
  const onLilyPlacementsChangeRef = useRef(onLilyPlacementsChange);
  onLilyPlacementsChangeRef.current = onLilyPlacementsChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    // jsdom has no canvas, and a blocked context is not worth crashing over.
    if (!canvas || !context) {
      return;
    }

    const water = createWater();
    // The same stones and lilies as the 3D pond, so the fallback is the same pond.
    const scenery = createPondScenery();
    scenery.placeLilies(lilyPlacementsRef.current);
    sceneryRef.current = scenery;

    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // Resizing a canvas resets its transform, so the scale is reapplied here.
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      boundsRef.current = { ...boundsRef.current, width, height };
      water.resize(width, height);
      scenery.layout(width, height, ratio, nominalLength(boundsRef.current));
      water.setBed(scenery.bed);
    };

    const measureIsland = (): void => {
      const element = avoidElementRef.current?.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      boundsRef.current = {
        ...boundsRef.current,
        island: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      };
    };

    const render = (elapsedS: number): void => {
      const { width, height } = boundsRef.current;
      water.draw(context, width, height, elapsedS);

      for (const swimmer of swimmersRef.current) {
        drawKoi(context, {
          joints: swimmer.spine.joints,
          girths: swimmer.girths,
          length: swimmer.length,
          wavePhase: swimmer.spine.wavePhase,
          palette: swimmer.palette,
          patches: swimmer.patches,
          depth: swimmer.depth
        });
      }

      // The lilies float over everything, fish included.
      scenery.drawSurface(context, elapsedS);
    };

    resize();
    measureIsland();
    swimmersRef.current = reconcilePond([], rosterRef.current, boundsRef.current);

    // The panel grows and shrinks with the recent list, so its rect is watched
    // rather than read once — and never read per frame, which would force a
    // layout on every animation tick.
    const panel = avoidElementRef.current?.current;
    const observer =
      panel && typeof ResizeObserver === 'function' ? new ResizeObserver(measureIsland) : null;
    observer?.observe(panel!);

    const handleResize = (): void => {
      resize();
      measureIsland();
    };

    const reducedMotion = prefersReducedMotion();
    let elapsedS = 0;

    const dragging = attachLilyDragging(scenery, {
      onMove: () => repaintRef.current?.(),
      onDrop: (placements) => onLilyPlacementsChangeRef.current?.(placements)
    });

    const step = (dt: number): void => {
      elapsedS += dt;
      swimmersRef.current = swimmersRef.current.map((swimmer) =>
        stepSwimmer(swimmer, dt, elapsedS, boundsRef.current, reducedMotion)
      );
    };

    if (reducedMotion) {
      // One settled pond, drawn once: no loop, no repaints, no battery.
      for (let index = 0; index < SETTLE_STEPS; index += 1) {
        step(SETTLE_STEP_S);
      }

      render(elapsedS);
      repaintRef.current = () => render(elapsedS);
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        observer?.disconnect();
        dragging.detach();
        repaintRef.current = null;
        sceneryRef.current = null;
      };
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      step((now - last) / 1000);
      last = now;
      render(elapsedS);
    };

    // A hidden tab gets no frames at all, and comes back without a time jump.
    const handleVisibility = (): void => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        return;
      }

      if (frame === 0) {
        last = performance.now();
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      observer?.disconnect();
      dragging.detach();
      sceneryRef.current = null;
    };
  }, []);

  // A reset, or a placement saved elsewhere, puts the lilies where they now belong.
  useEffect(() => {
    sceneryRef.current?.placeLilies(lilyPlacements);
    repaintRef.current?.();
  }, [lilyPlacements]);

  // Branches coming and going must not restart the loop or move the other koi.
  useEffect(() => {
    if (boundsRef.current.width > 0) {
      swimmersRef.current = reconcilePond(swimmersRef.current, roster, boundsRef.current);
    }
  }, [roster]);

  return <canvas ref={canvasRef} className="koi-pond koi-water" aria-hidden="true" />;
};

export const KoiBackground = memo(KoiBackgroundInner);
