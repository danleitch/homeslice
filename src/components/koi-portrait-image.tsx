import { useEffect, useRef, useState, type JSX } from 'react';
import type { FishGenome } from '../lib/koi-genome';
import { hideLiveKoi, showLiveKoi } from '../lib/koi-live';
import { koiPortrait, portraitKey } from '../lib/koi-portrait';

type KoiPortraitImageProps = {
  genome: FishGenome;
  alt: string;
  /** While true, the photograph gives way to the koi itself, swimming. */
  active?: boolean;
  /**
   * Whether the koi wakes only while pointed at, as in the market. A portrait
   * that is awake for as long as it is shown swims on touch screens too.
   */
  hoverOnly?: boolean;
  /** Wait until the portrait is nearly on screen before taking it, as a long page should. */
  lazy?: boolean;
  className?: string;
};

type PortraitState = { key: string; url: string | null } | null;

/** How far ahead of the viewport a lazy portrait starts rendering. */
const LAZY_MARGIN = '240px';

/**
 * A koi's portrait on a patch of pond water.
 *
 * The water is CSS and the fish is a transparent image laid over it, so the
 * card reads as a window onto the pond while the portrait is still rendering.
 */
export const KoiPortraitImage = ({
  genome,
  alt,
  active = false,
  hoverOnly = true,
  lazy = false,
  className
}: KoiPortraitImageProps): JSX.Element => {
  const key = portraitKey(genome);
  const hostRef = useRef<HTMLDivElement>(null);
  const [portrait, setPortrait] = useState<PortraitState>(null);
  const [near, setNear] = useState(() => !lazy || typeof IntersectionObserver === 'undefined');
  // A state left over from a different fish is as good as no state at all.
  const current = portrait?.key === key ? portrait : null;
  const genomeRef = useRef(genome);
  genomeRef.current = genome;

  useEffect(() => {
    const host = hostRef.current;

    if (near || !host) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: LAZY_MARGIN }
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) {
      return;
    }

    let live = true;

    void koiPortrait(genomeRef.current).then((url) => {
      if (live) {
        setPortrait({ key, url });
      }
    });

    return () => {
      live = false;
    };
  }, [key, near]);

  useEffect(() => {
    const host = hostRef.current;

    if (!active || !host) {
      return;
    }

    showLiveKoi(genomeRef.current, host, hoverOnly);
    return () => hideLiveKoi(host);
  }, [active, hoverOnly, key]);

  const state = current === null ? 'loading' : current.url ? 'ready' : 'missing';

  return (
    <div
      ref={hostRef}
      className={['koi-photo', className].filter(Boolean).join(' ')}
      data-state={state}
    >
      {current?.url ? (
        <img src={current.url} alt={alt} draggable={false} />
      ) : (
        <span className="visually-hidden">{alt}</span>
      )}
    </div>
  );
};
