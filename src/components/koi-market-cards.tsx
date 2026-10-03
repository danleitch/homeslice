import { useState, type JSX } from 'react';
import { useAwake } from '../hooks/use-awake';
import { ageAtLength, formatCm, growthOf, joinedLabel, koiAgeClass } from '../lib/fish-growth';
import { goldfishOf } from '../lib/goldfish';
import type { GoldfishListing } from '../lib/goldfish-market';
import {
  REFUND_SHARE,
  pondWorth,
  type KoiAccount,
  type OwnedGoldfish,
  type OwnedKoi,
  type PurchaseOutcome
} from '../lib/koi-account';
import { MAX_GOLDFISH, MAX_KOI } from '../lib/koi';
import { koiRarity, koiTitle, varietyOf, type KoiGenome } from '../lib/koi-genome';
import { describeListing, nameMeaning, type KoiListing } from '../lib/koi-market';
import { MODIFIER_INFO, RARITY_LABELS } from '../lib/koi-varieties';
import { CoinAmount, CoinIcon } from './coin-icon';
import { KoiPortraitImage } from './koi-portrait-image';

type Blocker = Exclude<PurchaseOutcome, 'bought'> | null;

/** "a Comet", "an Orenji Ogon". */
const withArticle = (title: string): string => `${/^[aeiou]/i.test(title) ? 'an' : 'a'} ${title}`;

/** A koi's age class and size, the way a dealer's tag reads them: "Tosai · 21 cm". */
const koiTag = (lengthCm: number, adultCm: number): string =>
  `${koiAgeClass(ageAtLength('koi', lengthCm, adultCm)).name} · ${formatCm(lengthCm)}`;

const TraitChips = ({ genome }: { genome: KoiGenome }): JSX.Element | null =>
  genome.modifiers.length === 0 ? null : (
    <ul className="koi-traits" aria-label="Traits">
      {genome.modifiers.map((modifier) => (
        <li key={modifier} title={MODIFIER_INFO[modifier].blurb}>
          {MODIFIER_INFO[modifier].label}
        </li>
      ))}
    </ul>
  );

const buyLabel = (blocker: Blocker, shortBy: number, room: number): string => {
  switch (blocker) {
    case 'owned':
      return 'In your pond';
    case 'pond-full':
      return `Pond full (${room}/${room})`;
    case 'short':
      return `Need ${shortBy} more`;
    default:
      return 'Buy';
  }
};

type BuyButtonProps = {
  name: string;
  price: number;
  blocker: Blocker;
  coins: number;
  /** How many of this kind of fish the pond holds. */
  room: number;
  onBuy: () => void;
};

const BuyButton = ({ name, price, blocker, coins, room, onBuy }: BuyButtonProps): JSX.Element => (
  <button
    type="button"
    className={blocker === 'owned' ? 'btn btn-owned' : 'btn'}
    disabled={blocker !== null}
    onClick={onBuy}
    aria-label={blocker === null ? `Buy ${name} for ${price} coins` : undefined}
  >
    {blocker === null && <CoinIcon />}
    {buyLabel(blocker, price - coins, room)}
    {blocker === 'owned' && ' ✓'}
  </button>
);

type ListingCardProps = {
  listing: KoiListing;
  blocker: Blocker;
  coins: number;
  /** Just arrived in the tank, in place of a sold fish or with a restock. */
  fresh: boolean;
  onBuy: (listing: KoiListing) => void;
};

export const ListingCard = ({
  listing,
  blocker,
  coins,
  fresh,
  onBuy
}: ListingCardProps): JSX.Element => {
  const { genome } = listing;
  const variety = varietyOf(genome);
  const rarity = koiRarity(genome);
  const title = koiTitle(genome);
  const meaning = nameMeaning(listing.name);
  const headingId = `koi-${listing.id.replace(/[^a-z0-9]/gi, '-')}`;
  const { awake, wakers } = useAwake();

  return (
    <article
      className="koi-card"
      data-rarity={rarity}
      data-fresh={fresh || undefined}
      aria-labelledby={headingId}
      {...wakers}
    >
      <div className="koi-card-photo">
        <KoiPortraitImage genome={genome} alt={describeListing(listing)} active={awake} />
        <span className="koi-card-badges">
          <span className="rarity-badge" data-rarity={rarity}>
            {RARITY_LABELS[rarity]}
          </span>
          {fresh && <span className="new-badge">Just in</span>}
        </span>
        <span className="koi-size">{koiTag(listing.lengthCm, listing.adultCm)}</span>
      </div>

      <div className="koi-card-body">
        <div className="koi-card-heading">
          <h3 id={headingId}>
            {listing.name}
            {meaning && <span className="koi-name-meaning"> · {meaning}</span>}
          </h3>
          <CoinAmount coins={listing.price} className="koi-price" />
        </div>
        <p className="koi-variety">
          {title}{' '}
          <span lang="ja" className="koi-kanji">
            {variety.kanji}
          </span>
        </p>
        <TraitChips genome={genome} />
        <p className="koi-blurb">{variety.blurb}</p>
        <p className="koi-growth">Could grow to about {formatCm(listing.adultCm)}</p>

        <BuyButton
          name={listing.name}
          price={listing.price}
          blocker={blocker}
          coins={coins}
          room={MAX_KOI}
          onBuy={() => onBuy(listing)}
        />
      </div>
    </article>
  );
};

type GoldfishCardProps = {
  listing: GoldfishListing;
  blocker: Blocker;
  coins: number;
  /** Just come up to the glass, after the last of its breed was bought. */
  fresh: boolean;
  onBuy: (listing: GoldfishListing) => void;
};

export const GoldfishCard = ({
  listing,
  blocker,
  coins,
  fresh,
  onBuy
}: GoldfishCardProps): JSX.Element => {
  const breed = goldfishOf(listing.genome);
  const headingId = `goldfish-${listing.id.replace(/[^a-z0-9]/gi, '-')}`;
  const { awake, wakers } = useAwake();

  return (
    <article
      className="koi-card goldfish-card"
      data-fresh={fresh || undefined}
      aria-labelledby={headingId}
      {...wakers}
    >
      <div className="koi-card-photo">
        <KoiPortraitImage
          genome={listing.genome}
          alt={`${listing.name}, ${withArticle(breed.name)}`}
          active={awake}
        />
        {fresh && (
          <span className="koi-card-badges">
            <span className="new-badge">Just in</span>
          </span>
        )}
        <span className="koi-size">{formatCm(listing.lengthCm)}</span>
      </div>

      <div className="koi-card-body">
        <div className="koi-card-heading">
          <h3 id={headingId}>{listing.name}</h3>
          <CoinAmount coins={listing.price} className="koi-price" />
        </div>
        <p className="koi-variety">
          {breed.name}
          {breed.kanji && (
            <>
              {' '}
              <span lang="ja" className="koi-kanji">
                {breed.kanji}
              </span>
            </>
          )}
        </p>
        {breed.origin && <p className="goldfish-origin">{breed.origin}</p>}
        <p className="koi-blurb">{breed.blurb}</p>
        <p className="koi-growth">Could grow to about {formatCm(listing.adultCm)}</p>

        <BuyButton
          name={listing.name}
          price={listing.price}
          blocker={blocker}
          coins={coins}
          room={MAX_GOLDFISH}
          onBuy={() => onBuy(listing)}
        />
      </div>
    </article>
  );
};

type OwnedFishRowProps = (
  { species: 'koi'; fish: OwnedKoi } | { species: 'goldfish'; fish: OwnedGoldfish }
) & {
  now: Date;
  onRelease: () => void;
};

/** One fish in the visitor's pond: how far it has grown, what it is worth, and letting it go. */
export const OwnedFishRow = (props: OwnedFishRowProps): JSX.Element => {
  const { fish, now, onRelease } = props;
  const [confirming, setConfirming] = useState(false);
  const { awake, wakers } = useAwake();
  const growth = growthOf(props.species, fish, now);
  const refund = Math.floor(growth.value * REFUND_SHARE);
  const koi = props.species === 'koi' ? props.fish : null;
  const rarity = koi ? koiRarity(koi.genome) : null;
  const title =
    props.species === 'koi' ? koiTitle(props.fish.genome) : goldfishOf(props.fish.genome).name;
  const size = [
    title,
    ...(koi ? [koiAgeClass(growth.ageYears).name] : []),
    formatCm(growth.lengthCm)
  ].join(' · ');
  // Growth is only worth mentioning once it is a centimetre the tag would show.
  const grown = Math.round(growth.lengthCm) - Math.round(fish.lengthCm);
  const gain = growth.value - fish.price;

  return (
    <li className="owned-koi" data-rarity={rarity ?? 'goldfish'} {...wakers}>
      <KoiPortraitImage
        genome={fish.genome}
        alt={koi ? describeListing(koi) : `${fish.name}, ${withArticle(title)}`}
        active={awake}
      />
      <div className="owned-koi-info">
        <h3>{fish.name}</h3>
        <p className="koi-variety">
          {size}
          {grown > 0 && <span className="koi-grown"> +{grown} cm</span>}
        </p>
        <p className="owned-koi-meta">
          {rarity ? (
            <span className="rarity-badge" data-rarity={rarity}>
              {RARITY_LABELS[rarity]}
            </span>
          ) : (
            <span className="rarity-badge" data-rarity="goldfish">
              Goldfish
            </span>
          )}
          {joinedLabel(fish.acquiredAt, now)}
        </p>
        <p className="owned-koi-worth">
          Worth <CoinAmount coins={growth.value} />
          {gain > 0 && <span className="koi-gain">up {gain.toLocaleString()}</span>}
        </p>
      </div>

      {confirming ? (
        <div className="release-confirm" role="group" aria-label={`Release ${fish.name}?`}>
          <p>
            Release {fish.name} for good? You get <CoinAmount coins={refund} /> back, half what{' '}
            {fish.name} is worth now, but {fish.name}{' '}
            {koi ? "won't return to the market." : "won't come back."}
          </p>
          <div className="release-actions">
            <button type="button" className="btn btn-danger" onClick={onRelease}>
              Release
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirming(false)}
            >
              Keep
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setConfirming(true)}
          aria-label={`Release ${fish.name}`}
        >
          Release
        </button>
      )}
    </li>
  );
};

/** The whole pond's worth, and how fast it is climbing as the fish grow. */
export const PondSummary = ({ account, now }: { account: KoiAccount; now: Date }): JSX.Element => {
  const worth = pondWorth(account, now);
  const gain = worth.value - worth.paid;

  return (
    <section className="pond-summary" aria-labelledby="pond-value-title">
      <div className="pond-summary-value">
        <h3 id="pond-value-title">Pond value</h3>
        <CoinAmount coins={worth.value} className="pond-value-amount" />
      </div>
      <p className="pond-summary-growth">
        {gain > 0 ? `Up ${gain.toLocaleString()} on what you paid` : 'Just what you paid, so far'}
        {' · '}
        {worth.perDay > 0 ? `growing about ${worth.perDay.toLocaleString()} a day` : 'fully grown'}
      </p>
      <p className="pond-summary-count">
        {account.owned.length} of {MAX_KOI} koi · {account.goldfish.length} of {MAX_GOLDFISH}{' '}
        goldfish
      </p>
    </section>
  );
};
