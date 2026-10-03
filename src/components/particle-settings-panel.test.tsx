import { useState, type JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_PARTICLE_SETTINGS,
  MAX_EMOJI_LENGTH,
  PARTICLE_PRESETS,
  type ParticleSettings
} from '../lib/particles';
import { ParticleSettingsPanel } from './particle-settings-panel';

/** The panel with its settings held in state, as the app holds them. */
const Harness = ({
  initial = DEFAULT_PARTICLE_SETTINGS,
  onChange,
  onClose = () => undefined
}: {
  initial?: ParticleSettings;
  onChange?: (settings: ParticleSettings) => void;
  onClose?: () => void;
}): JSX.Element => {
  const [settings, setSettings] = useState(initial);

  return (
    <ParticleSettingsPanel
      settings={settings}
      onChange={(next) => {
        setSettings(next);
        onChange?.(next);
      }}
      onClose={onClose}
    />
  );
};

const preset = (id: string): ParticleSettings =>
  PARTICLE_PRESETS.find((item) => item.id === id)!.settings;

describe('ParticleSettingsPanel', () => {
  it('opens on the preset picker, showing the current preset', () => {
    render(<Harness />);

    const picker = screen.getByRole('combobox', { name: 'Preset' });

    expect(picker).toHaveFocus();
    expect(picker).toHaveDisplayValue('Branchify');
  });

  it('swaps in every setting from a chosen preset', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Preset' }), 'Snow');

    expect(onChange).toHaveBeenLastCalledWith(preset('snow'));
    expect(screen.getByRole('combobox', { name: 'Direction' })).toHaveDisplayValue('Down');
  });

  it('shows Custom once a setting has been tuned away from its preset', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Count' }), { target: { value: '120' } });

    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_PARTICLE_SETTINGS, count: 120 });
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveDisplayValue('Custom');
  });

  it('only offers tuning for the interaction modes in use', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('slider', { name: 'Repulse distance' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Grab distance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Particles pushed' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'On hover' }), 'Grab');
    await user.click(screen.getByRole('checkbox', { name: 'React to clicks' }));

    expect(screen.getByRole('slider', { name: 'Grab distance' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Particles pushed' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Repulse distance' })).not.toBeInTheDocument();
  });

  it('disables the link controls while links are off', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'Link nearby particles' }));

    expect(screen.getByRole('slider', { name: 'Link distance' })).toBeDisabled();
  });

  it('asks for sides on a polygon and emoji on an emoji shape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole('slider', { name: 'Sides' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Shape' }), 'Polygon');
    expect(screen.getByRole('slider', { name: 'Sides' })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Shape' }), 'Emoji');
    expect(screen.getByRole('textbox', { name: 'Emoji' })).toHaveValue('✨');
  });

  it('changes a colour from its picker, and shows what was picked', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Background'), { target: { value: '#102030' } });

    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_PARTICLE_SETTINGS,
      background: '#102030'
    });
    expect(screen.getByLabelText('Background')).toHaveValue('#102030');
  });

  it('keeps the emoji it is given to a sane few, counting each emoji once', async () => {
    const onChange = vi.fn();
    render(
      <Harness initial={{ ...DEFAULT_PARTICLE_SETTINGS, shape: 'emoji' }} onChange={onChange} />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Emoji' }), {
      target: { value: '🌸'.repeat(40) }
    });

    const kept = onChange.mock.lastCall![0].emoji as string;

    expect(Array.from(kept)).toHaveLength(MAX_EMOJI_LENGTH);
    expect(kept).toBe('🌸'.repeat(MAX_EMOJI_LENGTH));
  });

  it.each([
    ['Direction', 'Up and right', { direction: 'top-right' }],
    ['At the edges', 'Bounce', { edges: 'bounce' }],
    ['On click', 'Bubble', { clickMode: 'bubble' }]
  ] as const)('changes %s to %s', async (label, choice, change) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial = { ...DEFAULT_PARTICLE_SETTINGS, hover: true, click: true };
    render(<Harness initial={initial} onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: label }), choice);

    expect(onChange).toHaveBeenLastCalledWith({ ...initial, ...change });
  });

  it('closes on Escape and from its close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close particle settings' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
