import { useId, useMemo, useState, type JSX } from 'react';
import { findPlaces, type Place } from '../lib/places';
import { utcOffsetLabel } from '../lib/time';

type PlaceInputProps = {
  /** The zone, or whatever is being typed to find one. */
  value: string;
  onChange: (text: string) => void;
  onPick: (place: Place) => void;
  placeholder?: string;
  /** Marks the field the dialog puts the cursor in first. */
  autoFocus?: boolean;
};

/**
 * A box that finds a time zone by the place you type: "boston" offers Boston, with the zone it
 * keeps time by, and an IANA name like Europe/Paris still works. Picking one hands it over; leaving
 * the text alone keeps whatever was typed.
 */
export const PlaceInput = ({
  value,
  onChange,
  onPick,
  placeholder,
  autoFocus
}: PlaceInputProps): JSX.Element => {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  // The list only opens once something has been typed, so a zone that is already chosen isn't
  // covered by suggestions the moment the cursor lands in it.
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(
    () => (focused && typed ? findPlaces(value) : []),
    [focused, typed, value]
  );
  const open = results.length > 0;
  const now = new Date();
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const pick = (place: Place): void => {
    onPick(place);
    setTyped(false);
    setActive(0);
  };

  return (
    <div className="place-input">
      <input
        type="text"
        role="combobox"
        aria-label="Time zone"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${current}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        data-autofocus={autoFocus ? '' : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setTyped(false);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setTyped(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (!open) {
            return;
          }

          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current + step + results.length) % results.length);
          } else if (event.key === 'Enter') {
            // Picks the suggestion instead of saving the dialog.
            event.preventDefault();
            pick(results[current]);
          } else if (event.key === 'Escape') {
            // Closes the list, not the dialog around it.
            event.stopPropagation();
            setTyped(false);
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          className="place-results"
          role="listbox"
          aria-label="Places"
          // Keeps the field focused while a place is clicked.
          onMouseDown={(event) => event.preventDefault()}
        >
          {results.map((place, index) => (
            <li
              key={`${place.zone}:${place.name}:${place.region}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              className={`place-result${index === current ? ' place-result--active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(place)}
            >
              <span className="place-name">
                {place.name}
                <span className="place-region">, {place.region}</span>
              </span>
              <span className="place-zone">
                {place.zone}
                {utcOffsetLabel(now, place.zone) && ` · ${utcOffsetLabel(now, place.zone)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
