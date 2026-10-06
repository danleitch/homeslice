import { Lock, Plus, X } from 'lucide-react';
import {
  BENCH_PRESETS,
  BENCH_SURFACES,
  SURFACE_LABELS,
  presetOf,
  type BenchPreset
} from '../lib/benchlm';
import { CALENDAR_SLOTS, type CalendarSource } from '../lib/agenda';
import { canProtect, isSealed } from '../lib/calendar-secret';
import { FOCUS_LIMITS } from '../lib/focus';
import { POPULAR_LANGUAGES, TRENDING_SINCE, languageSlug } from '../lib/github';
import { minSpanOf, type ClockZone, type MarketSymbol, type Widget } from '../lib/model';
import { isPlaceName } from '../lib/places';
import type { JSX } from 'react';
import { FIT_HEIGHT, heightChoices, heightOfChoice, widthChoices } from './layout-options';
import { PlaceInput } from './place-input';
import { Field, Segmented, Switch } from './ui';

const BENCH_PRESET_NAMES = Object.keys(BENCH_PRESETS) as BenchPreset[];

/** Dollars per million tokens; 0 is no limit. */
const MAX_PRICES = [0, 0.5, 1, 2, 5] as const;

/**
 * Where the fields are shown. The dialog has all of a widget's settings. The gallery lets a
 * widget be tried before it is added, so it leaves out what is private (a calendar's address,
 * a token: the examples run on sample data) and what the example can't show (its height).
 */
export type FieldsScope = 'dialog' | 'gallery';

/** Each widget's own settings, as a draft that changes as they are edited. */
export const WidgetFields = ({
  draft,
  patch,
  error,
  scope = 'dialog'
}: {
  draft: Widget;
  patch: (changes: Partial<Widget>) => void;
  error: string;
  scope?: FieldsScope;
}): JSX.Element => (
  <>
    {draft.type === 'weather' && (
      <>
        <Field
          label="Place"
          hint="A city, or “City, Region, Country” to pick between places with one name."
          error={error}
        >
          <input
            type="text"
            value={draft.location}
            placeholder="Cape Town"
            data-autofocus=""
            onChange={(event) => patch({ location: event.target.value })}
          />
        </Field>
        <div className="field">
          <span className="field-label">Units</span>
          <Segmented
            label="Units"
            value={draft.units}
            options={[
              { value: 'metric', label: '°C, km/h' },
              { value: 'imperial', label: '°F, mph' }
            ]}
            onChange={(units) => patch({ units })}
          />
        </div>
        <Switch label="Sunrise and sunset" checked={draft.sun} onChange={(sun) => patch({ sun })} />
        <Switch
          label="UV index"
          hint="The highest it reaches today."
          checked={draft.uv}
          onChange={(uv) => patch({ uv })}
        />
        <Switch
          label="Air quality"
          hint="From Open-Meteo too: the US index, which is one more request."
          checked={draft.air}
          onChange={(air) => patch({ air })}
        />
      </>
    )}

    {draft.type === 'markets' && (
      <div className="field">
        <span className="field-label">Symbols</span>
        <ul className="rows-editor">
          {draft.symbols.map((item, index) => (
            <li key={index}>
              <input
                type="text"
                aria-label="Symbol"
                value={item.symbol}
                placeholder="AAPL"
                spellCheck={false}
                data-autofocus={index === 0 ? '' : undefined}
                onChange={(event) =>
                  patch({
                    symbols: draft.symbols.map((other, position) =>
                      position === index ? { ...other, symbol: event.target.value } : other
                    )
                  })
                }
              />
              <input
                type="text"
                aria-label="Name"
                value={item.name}
                placeholder="Name (optional)"
                onChange={(event) =>
                  patch({
                    symbols: draft.symbols.map((other, position) =>
                      position === index ? { ...other, name: event.target.value } : other
                    )
                  })
                }
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${item.symbol || 'symbol'}`}
                onClick={() =>
                  patch({
                    symbols: draft.symbols.filter((_other, position) => position !== index)
                  })
                }
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        {draft.symbols.length < 12 && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() =>
              patch({ symbols: [...draft.symbols, { symbol: '', name: '' } as MarketSymbol] })
            }
          >
            <Plus size={14} aria-hidden="true" /> Add symbol
          </button>
        )}
        <span className="field-hint">
          Yahoo Finance symbols: AAPL, ^GSPC for the S&amp;P 500, BTC-USD, EURUSD=X.
        </span>
      </div>
    )}

    {draft.type === 'clock' && (
      <div className="field">
        <span className="field-label">Time zones</span>
        <ul className="rows-editor">
          {draft.zones.map((zone, index) => (
            <li key={index}>
              <PlaceInput
                value={zone.zone}
                placeholder="Search a city or time zone"
                autoFocus={index === 0}
                onChange={(text) =>
                  patch({
                    zones: draft.zones.map((other, position) =>
                      position === index ? { ...other, zone: text } : other
                    )
                  })
                }
                onPick={(place) =>
                  patch({
                    zones: draft.zones.map((other, position) =>
                      position === index
                        ? {
                            zone: place.zone,
                            // A label somebody wrote is kept; a place's own name follows the pick.
                            label:
                              other.label.trim() && !isPlaceName(other.label)
                                ? other.label
                                : place.name
                          }
                        : other
                    )
                  })
                }
              />
              <input
                type="text"
                aria-label="Label"
                value={zone.label}
                placeholder="Label (optional)"
                onChange={(event) =>
                  patch({
                    zones: draft.zones.map((other, position) =>
                      position === index ? { ...other, label: event.target.value } : other
                    )
                  })
                }
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${zone.label || zone.zone || 'zone'}`}
                onClick={() =>
                  patch({ zones: draft.zones.filter((_other, position) => position !== index) })
                }
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
        {draft.zones.length < 8 && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => patch({ zones: [...draft.zones, { zone: '', label: '' } as ClockZone] })}
          >
            <Plus size={14} aria-hidden="true" /> Add time zone
          </button>
        )}
      </div>
    )}

    {draft.type === 'hackernews' && (
      <Field label={`Stories: ${draft.count}`}>
        <input
          type="range"
          min={3}
          max={15}
          value={draft.count}
          data-autofocus=""
          onChange={(event) => patch({ count: Number(event.target.value) })}
        />
      </Field>
    )}

    {draft.type === 'benchlm' && (
      <>
        <div className="field">
          <span className="field-label">Preset</span>
          <Segmented
            label="Preset"
            value={presetOf(draft)}
            options={BENCH_PRESET_NAMES.map((name) => ({
              value: name,
              label: BENCH_PRESETS[name].label
            }))}
            onChange={(name) => {
              const { surface, creator, count, maxPrice } = BENCH_PRESETS[name as BenchPreset];
              patch({ surface, creator, count, maxPrice });
            }}
          />
        </div>
        <div className="field">
          <span className="field-label">Ranking</span>
          <Segmented
            label="Ranking"
            value={draft.surface}
            options={BENCH_SURFACES.map((surface) => ({
              value: surface,
              label: SURFACE_LABELS[surface]
            }))}
            onChange={(surface) => patch({ surface })}
          />
        </div>
        <Field label="Only from" hint="A lab, like Anthropic or Google. Leave empty for all.">
          <input
            type="text"
            value={draft.creator}
            maxLength={40}
            placeholder="Every lab"
            data-autofocus=""
            onChange={(event) => patch({ creator: event.target.value })}
          />
        </Field>
        <Field label={`Models: ${draft.count}`}>
          <input
            type="range"
            min={3}
            max={15}
            value={draft.count}
            onChange={(event) => patch({ count: Number(event.target.value) })}
          />
        </Field>
        <div className="field">
          <span className="field-label">Max price</span>
          <Segmented
            label="Max price"
            value={String(draft.maxPrice)}
            options={MAX_PRICES.map((price) => ({
              value: String(price),
              label: price ? `$${Number.isInteger(price) ? price : price.toFixed(2)}` : 'Any'
            }))}
            onChange={(price) => patch({ maxPrice: Number(price) })}
          />
          <span className="field-hint">
            Per million tokens, counting three parts input to one part output. Models without a
            listed price are left out.
          </span>
        </div>
      </>
    )}

    {draft.type === 'focus' && (
      <>
        <Field label={`Focus: ${draft.focus} minutes`}>
          <input
            type="range"
            min={FOCUS_LIMITS.focus.min}
            max={FOCUS_LIMITS.focus.max}
            step={5}
            value={draft.focus}
            data-autofocus=""
            onChange={(event) => patch({ focus: Number(event.target.value) })}
          />
        </Field>
        <Field label={`Break: ${draft.rest} minutes`}>
          <input
            type="range"
            min={FOCUS_LIMITS.rest.min}
            max={FOCUS_LIMITS.rest.max}
            value={draft.rest}
            onChange={(event) => patch({ rest: Number(event.target.value) })}
          />
        </Field>
        <Switch
          label="Chime when time is up"
          hint="The timer is shared by every Focus widget and every open tab of this dashboard, and its countdown shows in the tab's title."
          checked={draft.sound}
          onChange={(sound) => patch({ sound })}
        />
      </>
    )}

    {draft.type === 'prs' && (
      <>
        {scope === 'dialog' && (
          <Field
            label="GitHub token"
            hint={
              <>
                Make a{' '}
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  read-only token
                </a>
                : read access to Pull requests, Commit statuses and Checks on the repositories you
                want. It is saved in this browser and in the YAML export, so keep both private.
              </>
            }
            error={error}
          >
            <input
              type="password"
              value={draft.token}
              maxLength={255}
              placeholder="github_pat_…"
              autoComplete="off"
              spellCheck={false}
              data-autofocus=""
              onChange={(event) => patch({ token: event.target.value })}
            />
          </Field>
        )}
        <div className="field">
          <span className="field-label">Show</span>
          <Segmented
            label="Show"
            value={draft.show}
            options={[
              { value: 'both', label: 'Both' },
              { value: 'review', label: 'To review' },
              { value: 'mine', label: 'Mine' }
            ]}
            onChange={(show) => patch({ show })}
          />
        </div>
        <Field label={`Pull requests: ${draft.count}`} hint="Per list.">
          <input
            type="range"
            min={3}
            max={10}
            value={draft.count}
            onChange={(event) => patch({ count: Number(event.target.value) })}
          />
        </Field>
      </>
    )}

    {(draft.type === 'tv' || draft.type === 'movies') && (
      <>
        <div className="field">
          <span className="field-label">Trending</span>
          <Segmented
            label="Trending"
            value={draft.window}
            options={[
              { value: 'day', label: 'Today' },
              { value: 'week', label: 'This week' }
            ]}
            onChange={(window) => patch({ window })}
          />
        </div>
        <Field label={`${draft.type === 'tv' ? 'Shows' : 'Films'}: ${draft.count}`}>
          <input
            type="range"
            min={3}
            max={12}
            value={draft.count}
            data-autofocus=""
            onChange={(event) => patch({ count: Number(event.target.value) })}
          />
        </Field>
      </>
    )}

    {draft.type === 'github' && (
      <>
        <Field label="Language" hint="Any language GitHub lists, or “all” for every one.">
          <input
            type="text"
            list="github-languages"
            value={draft.language}
            spellCheck={false}
            data-autofocus=""
            onChange={(event) => patch({ language: event.target.value })}
            onBlur={(event) => patch({ language: languageSlug(event.target.value) })}
          />
          <datalist id="github-languages">
            {POPULAR_LANGUAGES.map((language) => (
              <option key={language} value={language} />
            ))}
          </datalist>
        </Field>
        <div className="field">
          <span className="field-label">Trending</span>
          <Segmented
            label="Trending"
            value={draft.since}
            options={TRENDING_SINCE.map((since) => ({
              value: since,
              label: since === 'daily' ? 'Today' : since === 'weekly' ? 'This week' : 'This month'
            }))}
            onChange={(since) => patch({ since })}
          />
        </div>
        <Field label={`Repositories: ${draft.count}`}>
          <input
            type="range"
            min={3}
            max={15}
            value={draft.count}
            onChange={(event) => patch({ count: Number(event.target.value) })}
          />
        </Field>
      </>
    )}

    {draft.type === 'agenda' && (
      <>
        {scope === 'dialog' && (
          <div className="field">
            <span className="field-label">Calendars</span>
            <ul className="rows-editor rows-editor--calendars">
              {draft.calendars.map((calendar, index) => {
                const change = (changes: Partial<CalendarSource>): void =>
                  patch({
                    calendars: draft.calendars.map((other, position) =>
                      position === index ? { ...other, ...changes } : other
                    )
                  });

                return (
                  <li key={index}>
                    <input
                      type="text"
                      className="cal-name"
                      aria-label="Calendar name"
                      value={calendar.name}
                      maxLength={60}
                      placeholder="Name (optional)"
                      data-autofocus={index === 0 ? '' : undefined}
                      onChange={(event) => change({ name: event.target.value })}
                    />
                    {isSealed(calendar.url) ? (
                      // A saved address is never shown again, only replaced.
                      <div className="cal-address cal-saved">
                        <Lock size={13} aria-hidden="true" />
                        <span>
                          Address saved <small>It can’t be shown again.</small>
                        </span>
                        <button
                          type="button"
                          className="link-btn"
                          aria-label={`Replace the address of ${calendar.name || `calendar ${index + 1}`}`}
                          onClick={() => change({ url: '' })}
                        >
                          Replace
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="cal-address"
                        aria-label="Calendar address"
                        value={calendar.url}
                        placeholder="Secret address in iCal format"
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(event) => change({ url: event.target.value })}
                      />
                    )}
                    <input
                      type="text"
                      className="cal-note"
                      aria-label="Calendar description"
                      value={calendar.description}
                      maxLength={200}
                      placeholder="What it’s for (optional)"
                      onChange={(event) => change({ description: event.target.value })}
                    />
                    <button
                      type="button"
                      className="icon-btn cal-remove"
                      aria-label={`Remove ${calendar.name || `calendar ${index + 1}`}`}
                      onClick={() =>
                        patch({
                          calendars: draft.calendars.filter(
                            (_other, position) => position !== index
                          )
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {error && (
              <span className="field-error" role="alert">
                {error}
              </span>
            )}
            {draft.calendars.length < CALENDAR_SLOTS && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() =>
                  patch({
                    calendars: [...draft.calendars, { name: '', description: '', url: '' }]
                  })
                }
              >
                <Plus size={14} aria-hidden="true" /> Add calendar
              </button>
            )}
            <span className="field-hint">
              From Google Calendar: Settings, the calendar under “Settings for my calendars”, then
              Integrate calendar, and copy the Secret address in iCal format. Anyone with the
              address can read the calendar.{' '}
              {canProtect()
                ? 'It is encrypted before it is saved, with a key that stays in this browser, so it can’t be shown again here or read from the YAML export. Paste it again after importing the dashboard in another browser.'
                : 'This page can’t encrypt it (a browser only allows that on https or localhost), so it is saved as typed, in the YAML export too: keep both private.'}
            </span>
          </div>
        )}
        <Field label={`Events: ${draft.count}`}>
          <input
            type="range"
            min={3}
            max={12}
            value={draft.count}
            onChange={(event) => patch({ count: Number(event.target.value) })}
          />
        </Field>
        <div className="field">
          <span className="field-label">Show</span>
          <Segmented
            label="Show"
            value={draft.month ? 'month' : 'list'}
            options={[
              { value: 'month', label: 'Month and list' },
              { value: 'list', label: 'List only' }
            ]}
            onChange={(value) => patch({ month: value === 'month' })}
          />
        </div>
      </>
    )}

    {(draft.type === 'calendar' || (draft.type === 'agenda' && draft.month)) && (
      <div className="field">
        <span className="field-label">Weeks start on</span>
        <Segmented
          label="Weeks start on"
          value={String(draft.weekStart)}
          options={[
            { value: '1', label: 'Monday' },
            { value: '0', label: 'Sunday' }
          ]}
          onChange={(value) => patch({ weekStart: value === '0' ? 0 : 1 })}
        />
      </div>
    )}

    <div className="field">
      <span className="field-label">Width</span>
      <Segmented
        label="Width"
        value={String(draft.width)}
        options={widthChoices(draft.width, minSpanOf(draft.type))}
        onChange={(value) => patch({ width: Number(value) })}
      />
    </div>

    {scope === 'dialog' && (
      <div className="field">
        <span className="field-label">Height</span>
        <Segmented
          label="Height"
          value={draft.height === undefined ? FIT_HEIGHT : String(draft.height)}
          options={heightChoices(draft.height)}
          onChange={(value) => patch({ height: heightOfChoice(value) })}
        />
        <span className="field-hint">Fit is as tall as what the widget shows.</span>
      </div>
    )}
  </>
);
