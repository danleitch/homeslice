import { useEffect, useId, useRef, type JSX } from 'react';
import type { ReactNode } from 'react';
import {
  MAX_EMOJI_LENGTH,
  PARTICLE_CLICK_MODES,
  PARTICLE_DIRECTIONS,
  PARTICLE_EDGE_MODES,
  PARTICLE_HOVER_MODES,
  PARTICLE_PRESETS,
  PARTICLE_RANGES,
  PARTICLE_SHAPES,
  matchParticlePreset,
  type ParticleClickMode,
  type ParticleColourKey,
  type ParticleDirection,
  type ParticleEdgeMode,
  type ParticleFlagKey,
  type ParticleHoverMode,
  type ParticleNumberKey,
  type ParticleSettings,
  type ParticleShape
} from '../lib/particles';

const SHAPE_LABELS: Readonly<Record<ParticleShape, string>> = {
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  polygon: 'Polygon',
  star: 'Star',
  emoji: 'Emoji'
};

const HOVER_MODE_LABELS: Readonly<Record<ParticleHoverMode, string>> = {
  grab: 'Grab',
  bubble: 'Bubble',
  repulse: 'Repulse',
  attract: 'Attract',
  connect: 'Connect',
  slow: 'Slow'
};

const CLICK_MODE_LABELS: Readonly<Record<ParticleClickMode, string>> = {
  push: 'Push',
  remove: 'Remove',
  bubble: 'Bubble',
  repulse: 'Repulse',
  attract: 'Attract',
  pause: 'Pause'
};

const DIRECTION_LABELS: Readonly<Record<ParticleDirection, string>> = {
  none: 'Any',
  top: 'Up',
  'top-right': 'Up and right',
  right: 'Right',
  'bottom-right': 'Down and right',
  bottom: 'Down',
  'bottom-left': 'Down and left',
  left: 'Left',
  'top-left': 'Up and left'
};

const EDGE_LABELS: Readonly<Record<ParticleEdgeMode, string>> = {
  out: 'Wrap around',
  bounce: 'Bounce'
};

const CUSTOM_PRESET = 'custom';

type Setter = <K extends keyof ParticleSettings>(key: K, value: ParticleSettings[K]) => void;

type FieldProps = {
  settings: ParticleSettings;
  set: Setter;
};

type RangeFieldProps = FieldProps & { name: ParticleNumberKey; label: string };

const RangeField = ({ name, label, settings, set }: RangeFieldProps): JSX.Element => {
  const id = useId();
  const { min, max, step } = PARTICLE_RANGES[name];

  return (
    <div className="particle-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[name]}
        onChange={(event) => set(name, Number(event.target.value))}
      />
      <output htmlFor={id}>{settings[name]}</output>
    </div>
  );
};

type ColourFieldProps = FieldProps & { name: ParticleColourKey; label: string; disabled?: boolean };

const ColourField = ({ name, label, settings, set, disabled }: ColourFieldProps): JSX.Element => {
  const id = useId();

  return (
    <div className="particle-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="color"
        value={settings[name]}
        disabled={disabled}
        onChange={(event) => set(name, event.target.value)}
      />
      <output htmlFor={id}>{settings[name]}</output>
    </div>
  );
};

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  choices: readonly T[];
  labels: Readonly<Record<T, string>>;
  disabled?: boolean;
  onChange: (value: T) => void;
};

const SelectField = <T extends string>({
  label,
  value,
  choices,
  labels,
  disabled,
  onChange
}: SelectFieldProps<T>): JSX.Element => {
  const id = useId();

  return (
    <div className="particle-field particle-field-wide">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {labels[choice]}
          </option>
        ))}
      </select>
    </div>
  );
};

type ToggleFieldProps = FieldProps & { name: ParticleFlagKey; label: string; disabled?: boolean };

const ToggleField = ({ name, label, settings, set, disabled }: ToggleFieldProps): JSX.Element => (
  <label className="settings-toggle particle-toggle">
    <input
      type="checkbox"
      checked={settings[name]}
      disabled={disabled}
      onChange={(event) => set(name, event.target.checked)}
    />
    {label}
  </label>
);

type EmojiFieldProps = { value: string; onChange: (value: string) => void };

const EmojiField = ({ value, onChange }: EmojiFieldProps): JSX.Element => {
  const id = useId();

  return (
    <div className="particle-field particle-field-wide">
      <label htmlFor={id}>Emoji</label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder="🌸 🍃"
        title="Separate several with spaces; each particle picks one."
        onChange={(event) =>
          onChange(Array.from(event.target.value).slice(0, MAX_EMOJI_LENGTH).join(''))
        }
      />
    </div>
  );
};

type GroupProps = { title: string; children: ReactNode };

/** A folder of controls, open by default and collapsible like the particles.js demo's. */
const Group = ({ title, children }: GroupProps): JSX.Element => (
  <details className="particle-group" open>
    <summary>{title}</summary>
    <div className="particle-group-body">{children}</div>
  </details>
);

type ParticleSettingsPanelProps = {
  settings: ParticleSettings;
  onChange: (settings: ParticleSettings) => void;
  onClose: () => void;
};

/**
 * Tunes the particles background while it plays. It docks to the side rather
 * than dimming the page, so every change can be watched as it lands, and it
 * leaves the background clickable so click modes can be tried out.
 */
export const ParticleSettingsPanel = ({
  settings,
  onChange,
  onClose
}: ParticleSettingsPanelProps): JSX.Element => {
  const presetRef = useRef<HTMLSelectElement>(null);
  const presetId = useId();
  const preset = matchParticlePreset(settings);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    presetRef.current?.focus();

    return () => previouslyFocused?.focus();
  }, []);

  const set: Setter = (key, value) => onChange({ ...settings, [key]: value });
  const field = { settings, set };

  const hoverMode = settings.hover ? settings.hoverMode : null;
  const clickMode = settings.click ? settings.clickMode : null;
  const inUse = (mode: ParticleHoverMode | ParticleClickMode): boolean =>
    hoverMode === mode || clickMode === mode;

  return (
    <div
      className="particle-panel"
      role="dialog"
      aria-labelledby="particle-settings-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div className="settings-panel-header">
        <h2 id="particle-settings-title">Particles</h2>
        <button
          type="button"
          className="header-action"
          onClick={onClose}
          aria-label="Close particle settings"
        >
          ✕
        </button>
      </div>

      <div className="particle-field particle-field-wide">
        <label htmlFor={presetId}>Preset</label>
        <select
          id={presetId}
          ref={presetRef}
          value={preset?.id ?? CUSTOM_PRESET}
          onChange={(event) => {
            const chosen = PARTICLE_PRESETS.find((item) => item.id === event.target.value);

            if (chosen) {
              onChange(chosen.settings);
            }
          }}
        >
          {PARTICLE_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          {!preset && (
            <option value={CUSTOM_PRESET} disabled>
              Custom
            </option>
          )}
        </select>
      </div>
      <ColourField {...field} name="background" label="Background" />

      <Group title="Particles">
        <RangeField {...field} name="count" label="Count" />
        <ColourField {...field} name="color" label="Colour" disabled={settings.randomColor} />
        <ToggleField {...field} name="randomColor" label="Random colours" />
        <SelectField
          label="Shape"
          value={settings.shape}
          choices={PARTICLE_SHAPES}
          labels={SHAPE_LABELS}
          onChange={(shape) => set('shape', shape)}
        />
        {(settings.shape === 'polygon' || settings.shape === 'star') && (
          <RangeField
            {...field}
            name="sides"
            label={settings.shape === 'star' ? 'Points' : 'Sides'}
          />
        )}
        {settings.shape === 'emoji' && (
          <EmojiField value={settings.emoji} onChange={(emoji) => set('emoji', emoji)} />
        )}
        <RangeField {...field} name="size" label="Size" />
        <ToggleField {...field} name="randomSize" label="Random sizes" />
        <ToggleField {...field} name="pulse" label="Pulse" />
        <RangeField {...field} name="opacity" label="Opacity" />
        <ToggleField {...field} name="randomOpacity" label="Random opacity" />
        <ToggleField {...field} name="twinkle" label="Twinkle" />
      </Group>

      <Group title="Links">
        <ToggleField {...field} name="links" label="Link nearby particles" />
        <fieldset className="particle-subfields" disabled={!settings.links}>
          <RangeField {...field} name="linkDistance" label="Link distance" />
          <ColourField {...field} name="linkColor" label="Link colour" />
          <RangeField {...field} name="linkOpacity" label="Link opacity" />
          <RangeField {...field} name="linkWidth" label="Link width" />
        </fieldset>
      </Group>

      <Group title="Movement">
        <ToggleField {...field} name="move" label="Move" />
        <fieldset className="particle-subfields" disabled={!settings.move}>
          <RangeField {...field} name="speed" label="Speed" />
          <ToggleField {...field} name="randomSpeed" label="Random speeds" />
          <SelectField
            label="Direction"
            value={settings.direction}
            choices={PARTICLE_DIRECTIONS}
            labels={DIRECTION_LABELS}
            onChange={(direction) => set('direction', direction)}
          />
          <ToggleField
            {...field}
            name="straight"
            label="Keep to the direction"
            disabled={settings.direction === 'none'}
          />
          <SelectField
            label="At the edges"
            value={settings.edges}
            choices={PARTICLE_EDGE_MODES}
            labels={EDGE_LABELS}
            onChange={(edges) => set('edges', edges)}
          />
        </fieldset>
      </Group>

      <Group title="Interactivity">
        <ToggleField {...field} name="hover" label="React to the pointer" />
        <SelectField
          label="On hover"
          value={settings.hoverMode}
          choices={PARTICLE_HOVER_MODES}
          labels={HOVER_MODE_LABELS}
          disabled={!settings.hover}
          onChange={(mode) => set('hoverMode', mode)}
        />
        <ToggleField {...field} name="click" label="React to clicks" />
        <SelectField
          label="On click"
          value={settings.clickMode}
          choices={PARTICLE_CLICK_MODES}
          labels={CLICK_MODE_LABELS}
          disabled={!settings.click}
          onChange={(mode) => set('clickMode', mode)}
        />
        <p className="settings-hint">
          Clicks count on the open background, not on the form or this panel.
        </p>

        {inUse('grab') && (
          <>
            <RangeField {...field} name="grabDistance" label="Grab distance" />
            <RangeField {...field} name="grabOpacity" label="Grab line opacity" />
          </>
        )}
        {inUse('bubble') && (
          <>
            <RangeField {...field} name="bubbleDistance" label="Bubble distance" />
            <RangeField {...field} name="bubbleSize" label="Bubble size" />
            <RangeField {...field} name="bubbleDuration" label="Bubble duration" />
            <RangeField {...field} name="bubbleOpacity" label="Bubble opacity" />
          </>
        )}
        {inUse('repulse') && (
          <RangeField {...field} name="repulseDistance" label="Repulse distance" />
        )}
        {inUse('push') && <RangeField {...field} name="pushQuantity" label="Particles pushed" />}
        {inUse('remove') && (
          <RangeField {...field} name="removeQuantity" label="Particles removed" />
        )}
      </Group>
    </div>
  );
};
