import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createWidget, type Widget } from '../lib/model';
import { WidgetFields } from './widget-fields';

const show = (widget: Widget, scope?: 'dialog' | 'gallery') =>
  render(<WidgetFields draft={widget} patch={vi.fn()} error="" scope={scope} />);

describe('WidgetFields', () => {
  describe('the weather’s switches', () => {
    it('show what the widget shows', () => {
      show({ ...createWidget('weather'), sun: true, uv: false, air: true } as Widget);

      expect(screen.getByRole('switch', { name: /Sunrise and sunset/ })).toBeChecked();
      expect(screen.getByRole('switch', { name: /UV index/ })).not.toBeChecked();
      expect(screen.getByRole('switch', { name: /Air quality/ })).toBeChecked();
    });

    it.each([
      ['Sunrise and sunset', { sun: false }],
      ['UV index', { uv: false }],
      ['Air quality', { air: false }]
    ])('turn %s off', async (name, change) => {
      const patch = vi.fn();
      render(<WidgetFields draft={createWidget('weather')} patch={patch} error="" />);

      await userEvent.click(screen.getByRole('switch', { name: new RegExp(name) }));

      expect(patch).toHaveBeenCalledExactlyOnceWith(change);
    });

    it('are there in the gallery too', () => {
      show(createWidget('weather'), 'gallery');

      expect(screen.getAllByRole('switch')).toHaveLength(3);
    });
  });

  describe('the News’ source', () => {
    it('offers every feed there is, with the one it has chosen', () => {
      show({ ...createWidget('news'), feed: 'ars' } as Widget);

      const select = screen.getByLabelText(/Source/) as HTMLSelectElement;

      expect(select).toHaveValue('ars');
      expect(select.options.length).toBeGreaterThan(8);
      expect([...select.options].map((option) => option.textContent)).toContain('NPR News');
    });

    it('changes the feed', async () => {
      const patch = vi.fn();
      render(<WidgetFields draft={createWidget('news')} patch={patch} error="" />);

      await userEvent.selectOptions(screen.getByLabelText(/Source/), 'npr');

      expect(patch).toHaveBeenCalledExactlyOnceWith({ feed: 'npr' });
    });

    it('has the number of headlines, from three to twelve', () => {
      show(createWidget('news'));

      const slider = screen.getByLabelText(/Headlines: 5/);

      expect(slider).toHaveAttribute('min', '3');
      expect(slider).toHaveAttribute('max', '12');
    });

    it('is there in the gallery too', () => {
      show(createWidget('news'), 'gallery');

      expect(screen.getByLabelText(/Source/)).toBeInTheDocument();
    });
  });

  describe('the Notes’ style', () => {
    it('offers a to-do list or a note, with the one it has chosen', () => {
      show({ ...createWidget('notes'), mode: 'text' } as Widget);

      expect(screen.getByRole('radio', { name: 'Note' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'To-do list' })).not.toBeChecked();
    });

    it('changes the style, and says that what is written is kept with the board', async () => {
      const patch = vi.fn();
      render(<WidgetFields draft={createWidget('notes')} patch={patch} error="" />);

      await userEvent.click(screen.getByRole('radio', { name: 'Note' }));

      expect(patch).toHaveBeenCalledExactlyOnceWith({ mode: 'text' });
      expect(screen.getByText(/kept with the board/)).toBeInTheDocument();
    });

    it('is there in the gallery too', () => {
      show(createWidget('notes'), 'gallery');

      expect(screen.getByRole('radiogroup', { name: 'Style' })).toBeInTheDocument();
    });
  });

  describe('in the dialog, which has every setting', () => {
    it('asks for My PRs’ token, and the repository whose main branch gets a light', () => {
      show(createWidget('prs'));

      expect(screen.getByLabelText(/GitHub token/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Watch main on/)).toBeInTheDocument();
    });

    it('lists the Agenda’s calendars', () => {
      show(createWidget('agenda'));

      expect(screen.getByRole('button', { name: /Add calendar/ })).toBeInTheDocument();
    });

    it('offers the height', () => {
      show(createWidget('hackernews'));

      expect(screen.getByRole('radiogroup', { name: 'Height' })).toBeInTheDocument();
    });
  });

  describe('in the gallery, where the examples run on sample data', () => {
    it('keeps My PRs’ token out, and the rest of its settings in', () => {
      show(createWidget('prs'), 'gallery');

      expect(screen.queryByLabelText(/GitHub token/)).toBeNull();
      expect(screen.queryByLabelText(/Watch main on/)).toBeNull();
      expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
      expect(screen.getByLabelText(/Pull requests/)).toBeInTheDocument();
    });

    it('keeps the Agenda’s calendars out, and the rest of its settings in', () => {
      show(createWidget('agenda'), 'gallery');

      expect(screen.queryByRole('button', { name: /Add calendar/ })).toBeNull();
      expect(screen.queryByText(/Secret address/)).toBeNull();
      expect(screen.getByLabelText(/Events/)).toBeInTheDocument();
      expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
    });

    it('has no height, which an example can’t show, but has the width', () => {
      show(createWidget('hackernews'), 'gallery');

      expect(screen.queryByRole('radiogroup', { name: 'Height' })).toBeNull();
      expect(screen.getByRole('radiogroup', { name: 'Width' })).toBeInTheDocument();
    });

    it('is the dialog’s fields for every other setting', () => {
      show(createWidget('weather'), 'gallery');

      expect(screen.getByLabelText(/^Place/)).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '°F, mph' })).toBeInTheDocument();
    });
  });
});
