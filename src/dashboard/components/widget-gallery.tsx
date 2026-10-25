import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode
} from 'react';
import { Check, Plus, SlidersHorizontal } from 'lucide-react';
import { SampleReadings } from '../hooks/use-remote';
import { GALLERY_GROUPS, PACKS, type Pack } from '../lib/gallery';
import { watchesMain } from '../lib/main-build';
import { createSampleSource, sampleWidget } from '../lib/sample-data';
import {
  WIDGET_BLURBS,
  WIDGET_LABELS,
  WIDGET_TYPES,
  type HourFormat,
  type Widget,
  type WidgetType
} from '../lib/model';
import { draftProblem, forBoard, tidyWidget } from '../lib/widget-draft';
import { WidgetLight } from '../widgets/main-status';
import { WIDGET_ICONS } from '../widgets/widget-icons';
import { WidgetView } from '../widgets/widget-view';
import { Modal, Switch } from './ui';
import { WidgetFields } from './widget-fields';

/** What the gallery hands over when a widget is added. */
export type WidgetPick = {
  type: WidgetType;
  /**
   * The settings the example was given, when it was given any. Without them the widget starts as
   * a new one always does, and is set up afterwards.
   */
  settings?: Widget;
  /** The gallery stays open for more, so nothing is asked of the visitor beyond it. */
  stay: boolean;
};

/** What the gallery hands over when a starter pack is added. */
export type PackPick = {
  pack: Pack;
  stay: boolean;
};

/**
 * How much of the card an example fills. On the board a widget is a share of the page's width,
 * so here it is a share of the gallery's: a quarter of the board and under is a card's whole
 * width, and from half the board up it has the whole gallery to itself.
 */
const shareOf = (columns: number): number =>
  columns >= 6 ? columns / 12 : Math.min(1, columns / 4);

/**
 * Where an example lives. Its links go nowhere, so they are stripped of where: a click can't
 * carry somebody off the page, and they are not worth a stop on the way to the Add buttons.
 */
const Stage = ({ children }: { children: ReactNode }): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;

    if (!stage) {
      return undefined;
    }

    const strip = (): void => {
      for (const link of stage.querySelectorAll('a[href]')) {
        link.removeAttribute('href');
        link.removeAttribute('target');
      }
    };

    strip();
    // Widgets draw links as they load and as they are used, and some change where they point.
    const watcher = new MutationObserver(strip);
    watcher.observe(stage, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });

    return () => watcher.disconnect();
  }, []);

  return (
    <div ref={ref} className="gallery-stage">
      {children}
    </div>
  );
};

const GalleryCard = ({
  type,
  clock,
  onBoard,
  hidden,
  onPick
}: {
  type: WidgetType;
  clock: HourFormat;
  /** How many of this kind the page has already. */
  onBoard: number;
  /** Narrowed away, but kept, so what was tried in it is still there when it comes back. */
  hidden: boolean;
  onPick: (pick: Omit<WidgetPick, 'stay'>) => void;
}): JSX.Element => {
  const Icon = WIDGET_ICONS[type];
  const label = WIDGET_LABELS[type];
  const optionsId = useId();
  // The example is a widget of its own, which the options change, and which keeps what it is used for.
  const [draft, setDraft] = useState<Widget>(() => sampleWidget(type));
  // Whether the options have been used: only then is the widget added as set here.
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  // What is wrong is judged of what would be added: the example's own calendars and token, which
  // aren't the visitor's and are never kept, are not for the visitor to mend.
  const problem = touched ? draftProblem(forBoard(draft)) : '';

  const patch = (changes: Partial<Widget>): void => {
    setDraft((current) => ({ ...current, ...changes }) as Widget);
    setTouched(true);
  };

  return (
    <li
      className="gallery-card"
      hidden={hidden}
      data-wide={draft.width >= 6 ? '' : undefined}
      style={{ '--share': shareOf(draft.width) } as CSSProperties}
    >
      <Stage>
        <div
          className={`wdg glass wdg--${type} gallery-widget`}
          role="group"
          aria-label={`${label}, an example`}
        >
          {watchesMain(draft) && (
            // The corner of the widget that a board gives to its header.
            <div className="gallery-light">
              <WidgetLight widget={draft} newTab={false} />
            </div>
          )}
          <div className="wdg-body">
            <WidgetView
              widget={draft}
              clock={clock}
              newTab={false}
              demo
              // What is written in an example stays in it: it is used, not kept.
              onChange={setDraft}
            />
          </div>
        </div>
      </Stage>
      <div className="gallery-caption">
        <span className="gallery-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="gallery-text">
          <div className="gallery-title">
            <h3 className="gallery-name">{label}</h3>
            {onBoard > 0 && (
              <span className="gallery-onboard">
                <Check size={11} aria-hidden="true" />
                {onBoard === 1 ? 'On this page' : `${onBoard} on this page`}
              </span>
            )}
          </div>
          <p className="gallery-blurb">{WIDGET_BLURBS[type]}</p>
        </div>
        <button
          type="button"
          className="icon-btn gallery-customise"
          aria-label={`Customise ${label}`}
          title="Customise"
          aria-expanded={open}
          aria-controls={open ? optionsId : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-small gallery-add"
          aria-label={`Add ${label}`}
          disabled={Boolean(problem)}
          onClick={() =>
            onPick({ type, ...(touched ? { settings: forBoard(tidyWidget(draft)) } : {}) })
          }
        >
          <Plus size={14} aria-hidden="true" /> Add
        </button>
      </div>
      {open && (
        <form
          id={optionsId}
          className="gallery-options"
          aria-label={`${label} options`}
          noValidate
          onSubmit={(event) => event.preventDefault()}
        >
          <WidgetFields draft={draft} patch={patch} error={problem} scope="gallery" />
        </form>
      )}
    </li>
  );
};

const PackCard = ({ pack, onPick }: { pack: Pack; onPick: (pack: Pack) => void }): JSX.Element => (
  <li className="pack">
    <h4 className="pack-name">{pack.name}</h4>
    <p className="pack-blurb">{pack.blurb}</p>
    <ul className="pack-parts" aria-label={`In ${pack.name}`}>
      {pack.widgets.map((widget, index) => {
        const Icon = WIDGET_ICONS[widget.type];

        return (
          <li key={index}>
            <Icon size={13} aria-hidden="true" />
            {WIDGET_LABELS[widget.type]}
          </li>
        );
      })}
    </ul>
    <button
      type="button"
      className="btn btn-primary btn-small pack-add"
      aria-label={`Add the ${pack.name} pack`}
      onClick={() => onPick(pack)}
    >
      <Plus size={14} aria-hidden="true" />
      {pack.widgets.length === 1 ? 'Add' : `Add all ${pack.widgets.length}`}
    </button>
  </li>
);

/** What the gallery is narrowed to: everything, the packs alone, or one kind of widget. */
type Show = 'all' | 'packs' | string;

/**
 * Every widget, running on sample data, to scroll through and try before adding one: the same
 * widgets the board draws, so what is tried here is what is added. A few go together as starter
 * packs, and what is added is marked, so it can be left open to add several.
 */
export const WidgetPicker = ({
  types = WIDGET_TYPES,
  clock = '24h',
  onBoard = {},
  onPick,
  onPickPack,
  onClose
}: {
  /** The widgets whose extensions are turned on. */
  types?: readonly WidgetType[];
  /** The hours the visitor reads the board in; the examples keep to them. */
  clock?: HourFormat;
  /** How many widgets of each kind the page already has. */
  onBoard?: Partial<Record<WidgetType, number>>;
  onPick: (pick: WidgetPick) => void;
  onPickPack?: (pick: PackPick) => void;
  onClose: () => void;
}): JSX.Element => {
  // One moment for all the examples, and each reading worked out once.
  const source = useMemo(() => createSampleSource(), []);
  const [show, setShow] = useState<Show>('all');
  const [stay, setStay] = useState(false);
  // What was added last, said aloud, since nothing else changes when the gallery stays open.
  const [added, setAdded] = useState('');
  const available = useMemo(() => new Set(types), [types]);
  // A pack is offered only when every widget in it is turned on.
  const packs = onPickPack
    ? PACKS.filter((pack) => pack.widgets.every((widget) => available.has(widget.type)))
    : [];
  const groups = GALLERY_GROUPS.filter((group) => group.types.some((type) => available.has(type)));
  const narrowed = groups.find((group) => group.id === show);
  const showsCards = show !== 'packs';
  const showsPacks = (show === 'all' || show === 'packs') && packs.length > 0;
  const shown = (type: WidgetType): boolean => !narrowed || narrowed.types.includes(type);

  return (
    <Modal
      title="Add a widget"
      subtitle="Widgets sit above your groups. These run on sample data, so try them out."
      className="modal--gallery"
      onClose={onClose}
    >
      {types.length === 0 ? (
        <p className="field-hint">
          Every widget is turned off. Turn some back on in Extensions, in the side bar.
        </p>
      ) : (
        <SampleReadings.Provider value={source}>
          <div className="gallery-bar">
            <div className="gallery-chips" role="group" aria-label="Show">
              {[
                { id: 'all', label: 'All' },
                ...(packs.length > 0 ? [{ id: 'packs', label: 'Starter packs' }] : []),
                ...groups
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="gallery-chip"
                  aria-pressed={show === chip.id}
                  onClick={() => setShow(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <Switch label="Keep open after adding" checked={stay} onChange={setStay} />
          </div>
          <p className="visually-hidden" role="status">
            {added}
          </p>

          {showsPacks && (
            <section className="gallery-packs" aria-label="Starter packs">
              <h3 className="gallery-section">Starter packs</h3>
              <ul className="packs">
                {packs.map((pack) => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    onPick={(picked) => {
                      onPickPack?.({ pack: picked, stay });
                      setAdded(`Added ${picked.name}`);
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          {showsCards && (
            <>
              {showsPacks && <h3 className="gallery-section">Widgets</h3>}
              <ul className="gallery">
                {types.map((type) => (
                  <GalleryCard
                    key={type}
                    type={type}
                    clock={clock}
                    onBoard={onBoard[type] ?? 0}
                    hidden={!shown(type)}
                    onPick={(pick) => {
                      onPick({ ...pick, stay });
                      setAdded(`Added ${WIDGET_LABELS[type]}`);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </SampleReadings.Provider>
      )}
    </Modal>
  );
};
