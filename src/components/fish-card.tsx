import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { MAX_FISH_NAME, cleanFishName } from '../lib/fish-name';
import { joinedLabel } from '../lib/fish-growth';
import { closeLiveKoi } from '../lib/koi-live';
import { ACTIVITY_LABELS, sizeLine, type FishCard as FishCardData } from '../lib/koi-inspect';
import { RARITY_LABELS } from '../lib/koi-varieties';
import { CoinAmount } from './coin-icon';
import { KoiPortraitImage } from './koi-portrait-image';

type FishCardProps = {
  card: FishCardData;
  /** Where the fish was clicked, which the card opens beside. */
  anchor: { x: number; y: number };
  now?: Date;
  /** Whether the pond lets its fish be carried; a still, reduced-motion pond does not. */
  canDrag?: boolean;
  /** Gives the fish a new name; without it the name is only read. */
  onRename?: (name: string) => void;
  onClose: () => void;
};

/** How far the card sits off the point that was clicked, and off the viewport's edge, in pixels. */
const OFFSET_PX = 16;
const EDGE_PX = 12;

/** Opens the card beside the click, on whichever side has room, and never off-screen. */
const placeBeside = (
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } => {
  const right = anchor.x + OFFSET_PX;
  const left =
    right + size.width > viewport.width - EDGE_PX ? anchor.x - OFFSET_PX - size.width : right;
  const top = Math.min(anchor.y - size.height / 3, viewport.height - EDGE_PX - size.height);

  return {
    left: Math.max(EDGE_PX, Math.min(left, viewport.width - EDGE_PX - size.width)),
    top: Math.max(EDGE_PX, top)
  };
};

const kindLabel = (card: FishCardData): string => {
  switch (card.kind) {
    case 'goldfish':
      return 'Goldfish';
    case 'branch':
      return 'Branch koi';
    case 'resident':
      return 'Pond resident';
    default:
      return card.rarity ? RARITY_LABELS[card.rarity] : 'Koi';
  }
};

type NameProps = { name: string; onRename?: (name: string) => void };

/** A fish's name; where it can be renamed, clicking it turns it into a text box. */
const FishName = ({ name, onRename }: NameProps): JSX.Element => {
  const [draft, setDraft] = useState<string | null>(null);
  // Enter and the blur that follows it are one save, not two.
  const finished = useRef(false);

  if (!onRename) {
    return <>{name}</>;
  }

  if (draft === null) {
    return (
      <button
        type="button"
        className="fish-card-name"
        title="Click to rename"
        aria-label={`Rename ${name}`}
        onClick={() => {
          finished.current = false;
          setDraft(name);
        }}
      >
        {name}
        <span className="fish-card-name-edit" aria-hidden="true">
          ✎
        </span>
      </button>
    );
  }

  const finish = (save: boolean): void => {
    if (finished.current) {
      return;
    }

    finished.current = true;
    const cleaned = cleanFishName(draft);

    if (save && cleaned && cleaned !== name) {
      onRename(cleaned);
    }

    setDraft(null);
  };

  return (
    <input
      className="fish-card-name-input"
      aria-label={`New name for ${name}`}
      value={draft}
      maxLength={MAX_FISH_NAME}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          finish(true);
        } else if (event.key === 'Escape') {
          // Puts the edit away, not the card it is on.
          event.stopPropagation();
          finish(false);
        }
      }}
    />
  );
};

/** A fish's details, opened by clicking it in the pond. */
export const FishCard = ({
  card,
  anchor,
  now = new Date(),
  canDrag = true,
  onRename,
  onClose
}: FishCardProps): JSX.Element => {
  const ref = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const headingId = `fish-card-${card.key.replace(/[^a-z0-9]/gi, '-')}`;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Measured before paint, so the card never flashes somewhere it doesn't fit.
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setPlace(
      placeBeside(
        anchor,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [anchor, card.key]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // The swimming koi's WebGL context goes back when the card closes, as it does when the market closes.
  useEffect(() => closeLiveKoi, []);

  return (
    <aside
      ref={ref}
      className="fish-card"
      role="dialog"
      aria-labelledby={headingId}
      data-rarity={card.kind === 'goldfish' ? 'goldfish' : (card.rarity ?? undefined)}
      data-placed={place ? true : undefined}
      style={place ? { left: place.left, top: place.top } : undefined}
    >
      <div className="fish-card-header">
        <h2 id={headingId}>
          <FishName key={card.key} name={card.name} onRename={onRename} />
          {card.nameMeaning && <span className="koi-name-meaning"> · {card.nameMeaning}</span>}
        </h2>
        <button
          type="button"
          className="fish-card-close"
          onClick={onClose}
          aria-label={`Close ${card.name}'s card`}
        >
          ✕
        </button>
      </div>

      {card.genome && (
        // The fish swims for as long as its card is open, as a market koi does under the pointer.
        <KoiPortraitImage
          genome={card.genome}
          alt={`${card.name}, ${card.species}`}
          active
          hoverOnly={false}
        />
      )}

      <p className="koi-variety">
        {card.species}
        {card.kanji && (
          <span lang="ja" className="koi-kanji">
            {card.kanji}
          </span>
        )}
      </p>
      {(card.speciesMeaning || card.group) && (
        <p className="fish-card-meaning">
          {[card.speciesMeaning && `“${card.speciesMeaning}”`, card.group]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      <p className="fish-card-status">
        <span
          className="rarity-badge"
          data-rarity={card.kind === 'goldfish' ? 'goldfish' : (card.rarity ?? undefined)}
        >
          {kindLabel(card)}
        </span>
        <span className="fish-card-activity">{ACTIVITY_LABELS[card.activity]}</span>
      </p>

      {card.traits.length > 0 && (
        <ul className="koi-traits" aria-label="Traits">
          {card.traits.map((trait) => (
            <li key={trait.label} title={trait.blurb}>
              {trait.label}
            </li>
          ))}
        </ul>
      )}

      <ul className="fish-card-personality" aria-label="Personality">
        {card.personality.map((word) => (
          <li key={word}>{word}</li>
        ))}
      </ul>

      <p className="koi-blurb">{card.blurb}</p>

      <dl className="fish-card-facts">
        <div>
          <dt>Size</dt>
          <dd>{sizeLine(card)}</dd>
        </div>
        <div>
          <dt>{card.appraised ? 'Appraised at' : 'Worth'}</dt>
          <dd>
            <CoinAmount coins={card.worth} />
            {card.appraised && <span className="fish-card-note"> not for sale</span>}
            {card.perDay > 0 && (
              <span className="fish-card-note"> +{card.perDay.toLocaleString()} a day</span>
            )}
          </dd>
        </div>
        {card.paid !== null && (
          <div>
            <dt>Paid</dt>
            <dd>
              <CoinAmount coins={card.paid} />
            </dd>
          </div>
        )}
        {card.acquiredAt && (
          <div>
            <dt>Joined</dt>
            <dd>{joinedLabel(card.acquiredAt, now)}</dd>
          </div>
        )}
        {card.branch && (
          <div>
            <dt>Swims for</dt>
            <dd>
              <code>{card.branch}</code>
            </dd>
          </div>
        )}
      </dl>

      {canDrag && <p className="fish-card-hint">Drag a fish to move it around the pond.</p>}
    </aside>
  );
};
