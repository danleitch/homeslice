import { useEffect, useMemo, useRef, useState, type RefObject, type JSX } from 'react';
import { createPondStage, pondFor, type KoiEntry, type PondStage } from '../lib/koi3d';
import type { OwnedGoldfish, OwnedKoi } from '../lib/koi-account';
import { distance, insidePond, isOpenWater, type PondPoint } from '../lib/koi-attention';
import { cleanFishName } from '../lib/fish-name';
import { fishCardFor, type FishCard as FishCardData } from '../lib/koi-inspect';
import { nameMeaning } from '../lib/koi-market';
import type { FishNames } from '../lib/storage';
import { buildKoiRoster, type KoiDescriptor } from '../lib/koi-roster';
import { createWater } from '../lib/koi-water';
import { attachLilyDragging } from '../lib/lily-drag';
import type { LilyPlacements } from '../lib/pond-decor';
import { createPondScenery, type PondScenery } from '../lib/pond-scenery';
import type { RecentBranch } from '../types';
import { FishCard } from './fish-card';
import { KoiBackground } from './koi-background';

type Koi3dBackgroundProps = {
  recentBranches: readonly RecentBranch[];
  /** The floor on how many koi swim; branches fill in before residents do, up to MAX_KOI. */
  baseFishCount?: number;
  /** Koi bought at the market; when there are any, they are the whole pond. */
  ownedKoi?: readonly OwnedKoi[];
  /** Goldfish bought at the market, who swim with whichever koi are there. */
  ownedGoldfish?: readonly OwnedGoldfish[];
  /** The panel, which the koi lean away from so they stay in view around it. */
  avoidRef?: RefObject<HTMLElement | null>;
  /** Where the visitor has floated the lilies to. */
  lilyPlacements?: LilyPlacements;
  /** A lily has been dragged somewhere new. */
  onLilyPlacementsChange?: (placements: LilyPlacements) => void;
  /** Names the visitor has given branch koi and residents, by pond key. */
  fishNames?: FishNames;
  /** The visitor renamed a fish, by its pond key; the name is already tidied. */
  onRenameFish?: (key: string, name: string) => void;
};

/** Every lily where the pond put it; one array, so a default prop doesn't relay the pond each render. */
const NO_PLACEMENTS: LilyPlacements = [];

/** Retina is honoured up to a point for the water; the koi renderer sets its own. */
const MAX_PIXEL_RATIO = 2;

/** Frames run to settle the pond before a reduced-motion pond is drawn once. */
const SETTLE_STEPS = 120;
const SETTLE_STEP_S = 1 / 30;

/** How far a handful of pellets spreads, as a fraction of a koi's length. */
const HANDFUL_SPREAD = 0.4;

/** How far a press on a fish has to move before it is a drag rather than a click, in pixels. */
const DRAG_START_PX = 6;

/** Classes on the root while the pointer is over a fish, and while one is being carried. */
const OVER_FISH_CLASS = 'koi-over-fish';
const CARRYING_CLASS = 'koi-carrying';

/** A fish's card, and where it was clicked. */
type OpenCard = { card: FishCardData; anchor: PondPoint };

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Sizes a 2D canvas to the viewport at a pixel ratio, returning its context ready to draw in CSS pixels. */
const sizeCanvas = (
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  ratio: number
): CanvasRenderingContext2D | null => {
  const context = canvas?.getContext('2d') ?? null;

  if (!canvas || !context) {
    return null;
  }

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  // Resizing a canvas resets its transform, so the scale is reapplied here.
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  return context;
};

export const Koi3dBackground = ({
  recentBranches,
  baseFishCount,
  ownedKoi,
  ownedGoldfish,
  avoidRef,
  lilyPlacements = NO_PLACEMENTS,
  onLilyPlacementsChange,
  fishNames,
  onRenameFish
}: Koi3dBackgroundProps): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waterRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<PondStage | null>(null);
  const sceneryRef = useRef<PondScenery | null>(null);
  // Paints the water and surface again without moving the koi; a still pond needs it after a lily moves.
  const repaintRef = useRef<(() => void) | null>(null);
  // A reduced-motion pond is drawn once and left; a roster change redraws it.
  const redrawRef = useRef<(() => void) | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState<OpenCard | null>(null);
  const [reducedMotion] = useState(prefersReducedMotion);

  // The same roster the 2D pond swims, so who is in the water and what colour
  // they wear is decided in one place whichever renderer draws them.
  const roster = useMemo<KoiDescriptor[]>(
    () => buildKoiRoster(recentBranches, baseFishCount, ownedKoi, ownedGoldfish),
    [recentBranches, baseFishCount, ownedKoi, ownedGoldfish]
  );
  const entries = useMemo<KoiEntry[]>(
    () =>
      roster.map((descriptor) => ({
        key: descriptor.key,
        seed: descriptor.seed,
        accent: descriptor.palette.marking,
        genome: descriptor.genome,
        lengthCm: descriptor.lengthCm
      })),
    [roster]
  );

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  // Read when a fish is clicked, so the card is written from the pond as it is then.
  const cardFromRef = useRef<(key: string) => FishCardData | null>(() => null);
  cardFromRef.current = (key) => {
    const descriptor = roster.find((candidate) => candidate.key === key);
    const reading = stageRef.current?.inspect(key);

    return descriptor && reading
      ? fishCardFor(
          descriptor,
          { koi: ownedKoi ?? [], goldfish: ownedGoldfish ?? [], names: fishNames },
          reading
        )
      : null;
  };
  const avoidElementRef = useRef(avoidRef);
  avoidElementRef.current = avoidRef;
  const lilyPlacementsRef = useRef(lilyPlacements);
  lilyPlacementsRef.current = lilyPlacements;
  const onLilyPlacementsChangeRef = useRef(onLilyPlacementsChange);
  onLilyPlacementsChangeRef.current = onLilyPlacementsChange;

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    // The koi render transparent — upstream they composite over the host's
    // water — so the pond is painted on 2D canvases either side of them: the
    // water and its bed underneath, the surface and its lilies on top.
    const water = createWater();
    const scenery = createPondScenery();
    const { surface } = scenery;
    scenery.placeLilies(lilyPlacementsRef.current);
    let waterCtx: CanvasRenderingContext2D | null = null;
    let surfaceCtx: CanvasRenderingContext2D | null = null;
    let fishLength = 0;

    let stage: PondStage;

    try {
      stage = createPondStage(canvas, reducedMotion, {
        onRipple: (x, y, strength) => surface.ripple(x, y, strength),
        readFood: () => surface.food(),
        onEat: (id) => surface.eat(id)
      });
    } catch {
      // No WebGL, or the context was refused; the 2D pond takes over.
      setUnavailable(true);
      return;
    }

    stageRef.current = stage;
    sceneryRef.current = scenery;

    const measureIsland = (): void => {
      const element = avoidElementRef.current?.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      stage.setIsland({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    };

    const resize = (): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      stage.setSize(width, height);

      fishLength = pondFor(width, height, reducedMotion).fishLength;
      waterCtx = sizeCanvas(waterRef.current, width, height, ratio);
      surfaceCtx = sizeCanvas(surfaceRef.current, width, height, ratio);
      water.resize(width, height);
      scenery.layout(width, height, ratio, fishLength);
      water.setBed(scenery.bed);
      measureIsland();
    };

    const paint = (elapsedS: number): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (waterCtx) {
        water.draw(waterCtx, width, height, elapsedS);
      }

      if (surfaceCtx) {
        surfaceCtx.clearRect(0, 0, width, height);
        scenery.drawSurface(surfaceCtx, elapsedS);
      }
    };

    resize();
    measureIsland();
    stage.setRoster(entriesRef.current);

    const dragging = attachLilyDragging(scenery, {
      onMove: () => repaintRef.current?.(),
      onDrop: (placements) => onLilyPlacementsChangeRef.current?.(placements)
    });

    const pointOf = (event: { clientX: number; clientY: number }): PondPoint => ({
      x: event.clientX,
      y: event.clientY
    });
    const root = document.documentElement;

    // The lilies float over the koi, so a press on a pad is the pad's to move.
    const fishAt = (point: PondPoint): string | null =>
      scenery.lilyAt(point.x, point.y) === null ? stage.pick(point) : null;

    /** A press on a fish, which becomes a click or a carry depending on whether it moves. */
    let press: { pointer: number; key: string; from: PondPoint; carrying: boolean } | null = null;
    /** Whether the click that ends this press was on a fish, and so is not a touch on the water. */
    let pressedFish = false;

    const openCard = (key: string, anchor: PondPoint): void => {
      const card = cardFromRef.current(key);
      setOpen(card ? { card, anchor } : null);
    };

    const handlePointerDown = (event: PointerEvent): void => {
      pressedFish = false;

      if (event.button !== 0 || !isOpenWater(event.target)) {
        return;
      }

      const key = fishAt(pointOf(event));

      if (key === null) {
        return;
      }

      pressedFish = true;
      press = { pointer: event.pointerId, key, from: pointOf(event), carrying: false };
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (press && event.pointerId === press.pointer) {
        // The button came up somewhere this page never heard about, off the
        // window or behind another one; the fish is set down where it is.
        if (event.buttons === 0) {
          endPress(event, true);
          return;
        }

        const point = pointOf(event);

        // A still pond has no one to carry a fish off; it can only be looked at.
        if (!press.carrying && !reducedMotion && distance(point, press.from) > DRAG_START_PX) {
          press.carrying = stage.grab(press.key, press.from);

          if (press.carrying) {
            setOpen(null);
            root.classList.add(CARRYING_CLASS);
          }
        }

        if (press.carrying) {
          stage.carry(point);
        }

        return;
      }

      // Only a mouse hovers; a finger is either on the glass or it isn't.
      if (event.pointerType === 'mouse') {
        root.classList.toggle(
          OVER_FISH_CLASS,
          isOpenWater(event.target) && fishAt(pointOf(event)) !== null
        );
      }
    };

    const endPress = (event: PointerEvent, cancelled: boolean): void => {
      if (!press || event.pointerId !== press.pointer) {
        return;
      }

      if (press.carrying) {
        stage.release();
        root.classList.remove(CARRYING_CLASS);
      } else if (!cancelled) {
        openCard(press.key, pointOf(event));
      }

      press = null;
    };

    const handlePointerUp = (event: PointerEvent): void => endPress(event, false);
    const handlePointerCancel = (event: PointerEvent): void => endPress(event, true);

    // A mouse pressed on a fish is picking it up, not starting a text selection
    // that would sweep across the form as the fish is carried over it.
    const handleMouseDown = (event: MouseEvent): void => {
      if (pressedFish) {
        event.preventDefault();
      }
    };

    // A finger on a fish is picking it up, not scrolling the page; this has to
    // be said on touchstart, and only a listener that isn't passive may say it.
    const handleTouchStart = (event: TouchEvent): void => {
      const touch = event.touches[0];

      if (
        event.touches.length === 1 &&
        touch &&
        isOpenWater(event.target) &&
        fishAt(pointOf(touch)) !== null
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });

    const removePointerListeners = (): void => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('touchstart', handleTouchStart);
      root.classList.remove(OVER_FISH_CLASS, CARRYING_CLASS);
    };

    // The panel grows and shrinks with the recent list, so its rect is watched
    // rather than read per frame, which would force a layout every tick.
    const panel = avoidElementRef.current?.current;
    const observer =
      panel && typeof ResizeObserver === 'function' ? new ResizeObserver(measureIsland) : null;
    observer?.observe(panel!);

    if (reducedMotion) {
      // One settled pond, drawn once: no loop, no repaints, no battery, and
      // nothing to tempt the koi out of stillness.
      const settle = (): void => {
        for (let index = 0; index < SETTLE_STEPS; index += 1) {
          stage.draw(SETTLE_STEP_S);
        }

        paint(SETTLE_STEPS * SETTLE_STEP_S);
      };

      settle();
      redrawRef.current = settle;
      repaintRef.current = () => paint(SETTLE_STEPS * SETTLE_STEP_S);
      window.addEventListener('resize', resize);

      // Nothing but the card to open on a click; a still pond sends out no rings.
      const handleStillClick = (event: MouseEvent): void => {
        if (!pressedFish && isOpenWater(event.target)) {
          setOpen(null);
        }
      };

      window.addEventListener('click', handleStillClick);

      return () => {
        redrawRef.current = null;
        repaintRef.current = null;
        sceneryRef.current = null;
        dragging.detach();
        window.removeEventListener('resize', resize);
        window.removeEventListener('click', handleStillClick);
        removePointerListeners();
        observer?.disconnect();
        stage.dispose();
        stageRef.current = null;
      };
    }

    // A touch on open water: a ring where it landed, and the koi come to see.
    // A click that picked up or looked at a fish was the fish's, not the water's.
    const handleClick = (event: MouseEvent): void => {
      // Putting a lily down is not a touch on the water either.
      if (
        event.button !== 0 ||
        !isOpenWater(event.target) ||
        dragging.claimsClick() ||
        pressedFish
      ) {
        return;
      }

      // Touching the water elsewhere puts a fish's card away.
      setOpen(null);
      surface.ripple(event.clientX, event.clientY, 1);
      stage.attend({ x: event.clientX, y: event.clientY });
    };

    // A right click on open water scatters a handful of food instead of a menu.
    const handleContextMenu = (event: MouseEvent): void => {
      if (!isOpenWater(event.target)) {
        return;
      }

      event.preventDefault();
      const spot = insidePond(
        { x: event.clientX, y: event.clientY },
        { width: window.innerWidth, height: window.innerHeight },
        fishLength * 0.5
      );
      surface.scatter(spot.x, spot.y, fishLength * HANDFUL_SPREAD);
    };

    let frame = 0;
    let last = performance.now();
    let elapsedS = 0;

    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      // A frame this long means the tab was away; the koi hold their place
      // rather than teleporting across the pond.
      const dt = Math.min((now - last) / 1000, 0.05);
      elapsedS += dt;
      last = now;
      stage.draw(dt);
      surface.step(dt);
      paint(elapsedS);
    };

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
    window.addEventListener('resize', resize);
    window.addEventListener('click', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibility);
      removePointerListeners();
      observer?.disconnect();
      dragging.detach();
      sceneryRef.current = null;
      stage.dispose();
      stageRef.current = null;
    };
    // The motion preference is read once, on the first render, so this runs once too.
  }, [reducedMotion]);

  // A reset, or a placement saved elsewhere, puts the lilies where they now belong.
  useEffect(() => {
    sceneryRef.current?.placeLilies(lilyPlacements);
    repaintRef.current?.();
  }, [lilyPlacements]);

  // Branches coming and going must not restart the loop or move the other koi.
  useEffect(() => {
    stageRef.current?.setRoster(entries);
    redrawRef.current?.();
    // A fish that has left the pond takes its card with it.
    setOpen((current) =>
      current && entries.some((entry) => entry.key === current.card.key) ? current : null
    );
  }, [entries]);

  // The card shows the new name at once; the pond's state catches up behind it.
  const renameOpenFish = (raw: string): void => {
    const name = cleanFishName(raw);

    if (!name || !open) {
      return;
    }

    onRenameFish?.(open.card.key, name);
    setOpen({ ...open, card: { ...open.card, name, nameMeaning: nameMeaning(name) } });
  };

  if (unavailable) {
    return (
      <KoiBackground
        recentBranches={recentBranches}
        baseFishCount={baseFishCount}
        ownedKoi={ownedKoi}
        ownedGoldfish={ownedGoldfish}
        avoidRef={avoidRef}
        lilyPlacements={lilyPlacements}
        onLilyPlacementsChange={onLilyPlacementsChange}
      />
    );
  }

  return (
    <>
      <canvas ref={waterRef} className="koi-pond koi-water" aria-hidden="true" />
      <canvas ref={canvasRef} className="koi-pond" aria-hidden="true" />
      <canvas ref={surfaceRef} className="koi-pond koi-surface" aria-hidden="true" />
      {open && (
        <FishCard
          card={open.card}
          anchor={open.anchor}
          canDrag={!reducedMotion}
          onRename={onRenameFish && renameOpenFish}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
};
