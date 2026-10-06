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
import { Plus, SlidersHorizontal } from 'lucide-react';
import { SampleReadings } from '../hooks/use-remote';
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
import { WIDGET_ICONS } from '../widgets/widget-icons';
import { WidgetView } from '../widgets/widget-view';
import { Modal } from './ui';
import { WidgetFields } from './widget-fields';

/** What the gallery hands over when a widget is added. */
export type WidgetPick = {
  type: WidgetType;
  /**
   * The settings the example was given, when it was given any. Without them the widget starts as
   * a new one always does, and is set up afterwards.
   */
  settings?: Widget;
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
  onPick
}: {
  type: WidgetType;
  clock: HourFormat;
  onPick: (pick: WidgetPick) => void;
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
      data-wide={draft.width >= 6 ? '' : undefined}
      style={{ '--share': shareOf(draft.width) } as CSSProperties}
    >
      <Stage>
        <div
          className={`wdg glass wdg--${type} gallery-widget`}
          role="group"
          aria-label={`${label}, an example`}
        >
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
          <h3 className="gallery-name">{label}</h3>
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

/**
 * Every widget, running on sample data, to scroll through and try before adding one: the same
 * widgets the board draws, so what is tried here is what is added.
 */
export const WidgetPicker = ({
  types = WIDGET_TYPES,
  clock = '24h',
  onPick,
  onClose
}: {
  /** The widgets whose extensions are turned on. */
  types?: readonly WidgetType[];
  /** The hours the visitor reads the board in; the examples keep to them. */
  clock?: HourFormat;
  onPick: (pick: WidgetPick) => void;
  onClose: () => void;
}): JSX.Element => {
  // One moment for all the examples, and each reading worked out once.
  const source = useMemo(() => createSampleSource(), []);

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
          <ul className="gallery">
            {types.map((type) => (
              <GalleryCard key={type} type={type} clock={clock} onPick={onPick} />
            ))}
          </ul>
        </SampleReadings.Provider>
      )}
    </Modal>
  );
};
