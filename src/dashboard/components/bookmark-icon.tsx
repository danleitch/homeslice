import { memo, useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react';
import {
  faviconCandidates,
  monogramFor,
  rememberIcon,
  rememberedIcon,
  resolveIcon,
  type IconCandidate
} from '../lib/icons';
import { hostOf } from '../lib/urls';

type BookmarkIconProps = {
  icon: string;
  url: string;
  name: string;
  className?: string;
};

const Monogram = ({ name, url }: { name: string; url: string }): JSX.Element => {
  const { letters, hue } = monogramFor(name, url);

  return (
    <span className="bm-monogram" style={{ '--hue': hue } as CSSProperties} aria-hidden="true">
      {letters}
    </span>
  );
};

/**
 * Walks a list of image addresses until one loads, showing a monogram until
 * then and for good if none do. The index that worked is remembered, so the
 * next visit goes straight to it.
 */
const ImageChain = ({
  candidates,
  cacheKey,
  name,
  url
}: {
  candidates: IconCandidate[];
  cacheKey: string;
  name: string;
  url: string;
}): JSX.Element => {
  const [index, setIndex] = useState(() => Math.min(rememberedIcon(cacheKey), candidates.length));
  const [loaded, setLoaded] = useState(false);
  const candidate = candidates[index];

  const next = (): void => {
    setLoaded(false);
    setIndex((current) => current + 1);
  };

  return (
    <>
      {!loaded && <Monogram name={name} url={url} />}
      {candidate && (
        <img
          key={candidate.src}
          src={candidate.src}
          alt=""
          className="bm-img"
          data-loaded={loaded || undefined}
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            const image = event.currentTarget;

            if (candidate.minSize && image.naturalWidth < candidate.minSize) {
              next();
              return;
            }

            setLoaded(true);
            rememberIcon(cacheKey, index);
          }}
          onError={next}
        />
      )}
    </>
  );
};

/** A monochrome icon set drawn as a mask, so it takes the card's ink or a chosen colour. */
const MaskIcon = ({
  src,
  color,
  fallback
}: {
  src: string;
  color: string | null;
  fallback: JSX.Element;
}): JSX.Element => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const probe = new Image();
    probe.onerror = () => live && setFailed(true);
    probe.src = src;
    return () => {
      live = false;
    };
  }, [src]);

  if (failed) {
    return fallback;
  }

  return (
    <span
      className="bm-mask"
      style={{
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        background: color ?? undefined
      }}
    />
  );
};

const BookmarkIconInner = ({ icon, url, name, className }: BookmarkIconProps): JSX.Element => {
  const source = useMemo(() => resolveIcon(icon, url), [icon, url]);
  // Favicons belong to the host; a chosen icon to itself and the host it falls back to.
  const cacheKey = `${icon.trim()}@${hostOf(url) || url}`;
  const fallback = (
    <ImageChain
      key={`fallback:${cacheKey}`}
      candidates={faviconCandidates(url)}
      cacheKey={`@${hostOf(url) || url}`}
      name={name}
      url={url}
    />
  );

  return (
    <span className={`bm-icon-art${className ? ` ${className}` : ''}`} aria-hidden="true">
      {source.kind === 'images' && (
        <ImageChain
          key={cacheKey}
          candidates={source.candidates}
          cacheKey={cacheKey}
          name={name}
          url={url}
        />
      )}
      {source.kind === 'mask' && (
        <MaskIcon src={source.src} color={source.color} fallback={fallback} />
      )}
      {source.kind === 'emoji' && <span className="bm-emoji">{source.text}</span>}
      {source.kind === 'none' && <Monogram name={name} url={url} />}
    </span>
  );
};

export const BookmarkIcon = memo(BookmarkIconInner);
