import { useState, type JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_PARTICLE_SETTINGS,
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

  it('closes on Escape and from its close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close particle settings' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
