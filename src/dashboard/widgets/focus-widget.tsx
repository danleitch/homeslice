import { useEffect, useRef, useState, type JSX } from 'react';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import {
  ABANDONED_MS,
  chime,
  clock,
  dayOf,
  finish,
  isDue,
  isRunning,
  lengthsOf,
  pause,
  prepareChime,
  readFocus,
  remaining,
  reset,
  restoreTitle,
  showInTitle,
  skip,
  spoken,
  start,
  watchFocus,
  writeFocus,
  type FocusState,
  type FocusWidget as FocusWidgetConfig
} from '../lib/focus';
import '../focus.css';

/** The ring's circumference: a circle of radius 52 in a 120-wide box. */
const RING = 2 * Math.PI * 52;

/** Most dots shown for the day's finished stretches; the rest are counted in words. */
const MAX_DOTS = 8;

const NAMES = { focus: 'Focus', rest: 'Break' } as const;

/** What the gallery's Focus widget starts from: a good morning's work behind it. */
const sampleState = (): FocusState => ({
  phase: 'focus',
  endsAt: null,
  left: null,
  done: 3,
  day: dayOf(new Date())
});

/**
 * @param demo Runs on a timer of its own, in memory: the gallery's example works when it is
 * clicked, without touching the timer the page keeps, its title or its chime.
 */
export const FocusWidget = ({
  widget,
  demo = false
}: {
  widget: FocusWidgetConfig;
  demo?: boolean;
}): JSX.Element => {
  const { focus, rest } = widget;
  const sound = widget.sound && !demo;
  const lengths = lengthsOf({ focus, rest });
  const [state, setState] = useState<FocusState>(() =>
    demo ? sampleState() : readFocus(new Date())
  );
  // The demo's timer as it is now, for the ticker, which must not wait on a render to see it.
  const sample = useRef(state);
  const [now, setNow] = useState(() => Date.now());
  const running = isRunning(state);

  const read = (at: number): FocusState => (demo ? sample.current : readFocus(new Date(at)));
  const write = (next: FocusState): void => {
    if (demo) {
      sample.current = next;
      setState(next);
    } else {
      writeFocus(next);
    }
  };

  // Hear of changes made by another Focus widget, or in another tab.
  useEffect(() => (demo ? undefined : watchFocus(() => setState(readFocus(new Date())))), [demo]);

  // While it runs, look a few times a second, and end the stretch when its moment comes.
  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const tick = (): void => {
      const current = Date.now();
      setNow(current);

      // Read afresh: another widget or tab may have ended it already.
      const saved = read(current);

      if (!isDue(saved, current)) {
        return;
      }

      if (current - (saved.endsAt ?? current) > ABANDONED_MS) {
        // Left behind long ago (a tab that slept, a laptop that was shut): nothing to celebrate.
        write({ ...saved, endsAt: null, left: null });
        return;
      }

      write(finish(saved));

      if (sound) {
        chime();
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
    // `read` and `write` only choose between this widget's timer and the page's, by `demo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, sound, demo]);

  const left = remaining(state, now, lengths);

  // The countdown goes in the tab's title while it runs, so it shows from another tab.
  useEffect(() => {
    if (demo) {
      return;
    }

    if (running) {
      showInTitle(`${clock(left)} · ${NAMES[state.phase]}`);
    } else {
      restoreTitle();
    }
  }, [demo, running, left, state.phase]);

  useEffect(() => (demo ? undefined : restoreTitle), [demo]);

  const act = (change: (current: FocusState, at: number) => FocusState): void => {
    const at = Date.now();
    write(change(read(at), at));
  };

  const total = lengths[state.phase];
  const progress = Math.min(1, Math.max(0, 1 - left / total));
  const dots = Math.min(state.done, MAX_DOTS);

  return (
    <div className="focus" data-phase={state.phase} data-running={running ? '' : undefined}>
      <div className="focus-dial">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="focus-track" cx="60" cy="60" r="52" />
          <circle
            className="focus-ring"
            cx="60"
            cy="60"
            r="52"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - progress)}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="focus-readout">
          <span className="focus-phase">{NAMES[state.phase]}</span>
          <span className="focus-time" role="timer" aria-label={spoken(left)}>
            {clock(left)}
          </span>
        </div>
      </div>

      <div className="focus-controls">
        <button
          type="button"
          className="focus-main"
          onClick={() => {
            if (running) {
              act((current, at) => pause(current, at));
            } else {
              // Browsers only let a page make sound after a click, so the chime is readied here.
              if (!demo) {
                prepareChime();
              }

              act((current, at) => start(current, at, lengths));
            }
          }}
        >
          {running ? (
            <>
              <Pause size={15} aria-hidden="true" /> Pause
            </>
          ) : (
            <>
              <Play size={15} aria-hidden="true" /> {state.left === null ? 'Start' : 'Resume'}
            </>
          )}
        </button>
        <button
          type="button"
          className="focus-icon"
          aria-label="Reset"
          title="Reset"
          onClick={() => act((current) => reset(current))}
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="focus-icon"
          aria-label={state.phase === 'focus' ? 'Skip to the break' : 'Skip the break'}
          title={state.phase === 'focus' ? 'Skip to the break' : 'Skip the break'}
          onClick={() => act((current) => skip(current))}
        >
          <SkipForward size={15} aria-hidden="true" />
        </button>
      </div>

      <p className="focus-done">
        {state.done > 0 && (
          <span className="focus-dots" aria-hidden="true">
            {Array.from({ length: dots }, (_unused, index) => (
              <span key={index} />
            ))}
          </span>
        )}
        {state.done === 0
          ? 'No focus sessions yet today'
          : `${state.done} focus session${state.done === 1 ? '' : 's'} today`}
      </p>
    </div>
  );
};
