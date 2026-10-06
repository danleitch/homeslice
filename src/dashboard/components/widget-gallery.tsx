import { useEffect, useMemo, useRef, type JSX, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { SampleReadings } from '../hooks/use-remote';
import { createSampleSource, sampleWidget } from '../lib/sample-data';
import {
  WIDGET_BLURBS,
  WIDGET_LABELS,
  WIDGET_TYPES,
  type HourFormat,
  type WidgetType
} from '../lib/model';
import { WIDGET_ICONS } from '../widgets/widget-icons';
import { WidgetView } from '../widgets/widget-view';
import { Modal } from './ui';

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
  onPick: (type: WidgetType) => void;
}): JSX.Element => {
  const Icon = WIDGET_ICONS[type];
  const widget = useMemo(() => sampleWidget(type), [type]);

  return (
    <li className="gallery-card">
      <Stage>
        <div
          className={`wdg glass wdg--${type} gallery-widget`}
          role="group"
          aria-label={`${WIDGET_LABELS[type]}, an example`}
        >
          <div className="wdg-body">
            <WidgetView widget={widget} clock={clock} newTab={false} demo />
          </div>
        </div>
      </Stage>
      <div className="gallery-caption">
        <span className="gallery-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="gallery-text">
          <h3 className="gallery-name">{WIDGET_LABELS[type]}</h3>
          <p className="gallery-blurb">{WIDGET_BLURBS[type]}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-small gallery-add"
          aria-label={`Add ${WIDGET_LABELS[type]}`}
          onClick={() => onPick(type)}
        >
          <Plus size={14} aria-hidden="true" /> Add
        </button>
      </div>
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
  onPick: (type: WidgetType) => void;
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
