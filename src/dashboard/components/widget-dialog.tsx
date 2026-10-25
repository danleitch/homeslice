import { useState, type FormEvent, type JSX } from 'react';
import { type AgendaWidget } from '../lib/agenda';
import { canProtect, isSealed, seal } from '../lib/calendar-secret';
import { WIDGET_LABELS, type Widget } from '../lib/model';
import { draftProblem, tidyWidget } from '../lib/widget-draft';
import { WIDGET_ICONS } from '../widgets/widget-icons';
import { WidgetFields } from './widget-fields';
import { Modal } from './ui';

type WidgetDialogProps = {
  widget: Widget;
  onSave: (widget: Widget) => void;
  onClose: () => void;
};

/** Each widget's own settings, written back as a whole widget. */
export const WidgetDialog = ({ widget, onSave, onClose }: WidgetDialogProps): JSX.Element => {
  const [draft, setDraft] = useState<Widget>(widget);
  const [error, setError] = useState('');
  // While a calendar's address is being sealed, which takes a moment.
  const [busy, setBusy] = useState(false);

  const patch = (changes: Partial<Widget>): void => {
    setDraft((current) => ({ ...current, ...changes }) as Widget);
    setError('');
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();

    const problem = draftProblem(draft);

    if (problem) {
      setError(problem);
      return;
    }

    const cleaned = tidyWidget(draft);

    // An address typed here is sealed before it is saved, where this page can: that takes a moment.
    if (
      cleaned.type === 'agenda' &&
      canProtect() &&
      cleaned.calendars.some((calendar) => !isSealed(calendar.url))
    ) {
      void protect(cleaned);
      return;
    }

    onSave(cleaned);
  };

  const protect = async (agenda: AgendaWidget): Promise<void> => {
    setBusy(true);

    try {
      const calendars = await Promise.all(
        agenda.calendars.map(async (calendar) =>
          isSealed(calendar.url) ? calendar : { ...calendar, url: await seal(calendar.url) }
        )
      );

      onSave({ ...agenda, calendars });
    } catch {
      // Saving the address as typed would be keeping it in the open after saying it is hidden.
      setError(
        'This browser wouldn’t let the address be encrypted (private browsing can do that), so nothing was saved. Try again in a normal window.'
      );
      setBusy(false);
    }
  };

  const Icon = WIDGET_ICONS[widget.type];

  return (
    <Modal
      title={
        <span className="title-with-icon">
          <Icon size={18} aria-hidden="true" />
          {WIDGET_LABELS[widget.type]}
        </span>
      }
      size={widget.type === 'agenda' ? 'md' : 'sm'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="widget-form" className="btn btn-primary" disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <form id="widget-form" className="form" onSubmit={submit} noValidate>
        <WidgetFields draft={draft} patch={patch} error={error} />
      </form>
    </Modal>
  );
};
