import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MAX_RECENT_BRANCHES, RECENT_STORAGE_KEY } from '../lib/storage';
import type { BranchSeparators, PersistedForm } from '../types';
import { useRecentBranches } from './use-recent-branches';

const form: PersistedForm = { branchType: 'feat', ticketNumber: 'BRF-1', description: 'Add auth' };
const separators: BranchSeparators = { typeSeparator: '/', ticketSeparator: '-' };
const snapshot = { form, separators };

const stored = (): unknown => JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? 'null');

describe('useRecentBranches', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty when nothing has been saved', () => {
    const { result } = renderHook(() => useRecentBranches());

    expect(result.current.recentBranches).toEqual([]);
  });

  it('starts with what was saved last time', () => {
    localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify([{ value: 'feat/old', createdAt: '2026-03-01T00:00:00.000Z' }])
    );

    const { result } = renderHook(() => useRecentBranches());

    expect(result.current.recentBranches).toEqual([
      { value: 'feat/old', createdAt: '2026-03-01T00:00:00.000Z' }
    ]);
  });

  it('adds a branch at the front, with when it was made and how', () => {
    const { result } = renderHook(() => useRecentBranches());

    act(() => result.current.addRecentBranch('feat/BRF-1-add-auth', snapshot));

    expect(result.current.recentBranches).toEqual([
      { value: 'feat/BRF-1-add-auth', createdAt: '2026-03-10T12:00:00.000Z', ...snapshot }
    ]);
  });

  it('puts the newest first', () => {
    const { result } = renderHook(() => useRecentBranches());

    act(() => result.current.addRecentBranch('feat/one', snapshot));
    vi.setSystemTime(new Date('2026-03-10T12:05:00.000Z'));
    act(() => result.current.addRecentBranch('feat/two', snapshot));

    expect(result.current.recentBranches.map((branch) => branch.value)).toEqual([
      'feat/two',
      'feat/one'
    ]);
  });

  it('brings a branch made again to the front rather than listing it twice', () => {
    const { result } = renderHook(() => useRecentBranches());

    act(() => result.current.addRecentBranch('feat/one', snapshot));
    vi.setSystemTime(new Date('2026-03-10T12:05:00.000Z'));
    act(() => result.current.addRecentBranch('feat/two', snapshot));
    vi.setSystemTime(new Date('2026-03-10T12:10:00.000Z'));
    act(() => result.current.addRecentBranch('feat/one', snapshot));

    expect(result.current.recentBranches.map((branch) => branch.value)).toEqual([
      'feat/one',
      'feat/two'
    ]);
    expect(result.current.recentBranches[0]!.createdAt).toBe('2026-03-10T12:10:00.000Z');
  });

  it('does not list an empty name', () => {
    const { result } = renderHook(() => useRecentBranches());

    act(() => result.current.addRecentBranch('', snapshot));

    expect(result.current.recentBranches).toEqual([]);
  });

  it('keeps only as many as the pond can swim, dropping the oldest', () => {
    const { result } = renderHook(() => useRecentBranches());

    for (let index = 0; index < MAX_RECENT_BRANCHES + 3; index += 1) {
      act(() => result.current.addRecentBranch(`feat/${index}`, snapshot));
    }

    const values = result.current.recentBranches.map((branch) => branch.value);

    expect(values).toHaveLength(MAX_RECENT_BRANCHES);
    expect(values[0]).toBe(`feat/${MAX_RECENT_BRANCHES + 2}`);
    expect(values).not.toContain('feat/0');
  });

  it('forgets a branch by when it was made', () => {
    const { result } = renderHook(() => useRecentBranches());

    act(() => result.current.addRecentBranch('feat/one', snapshot));
    vi.setSystemTime(new Date('2026-03-10T12:05:00.000Z'));
    act(() => result.current.addRecentBranch('feat/two', snapshot));
    act(() => result.current.removeRecentBranch('2026-03-10T12:00:00.000Z'));

    expect(result.current.recentBranches.map((branch) => branch.value)).toEqual(['feat/two']);
  });

  it('leaves the list alone when asked to forget one that is not there', () => {
    const { result } = renderHook(() => useRecentBranches());

    act(() => result.current.addRecentBranch('feat/one', snapshot));
    act(() => result.current.removeRecentBranch('1999-01-01T00:00:00.000Z'));

    expect(result.current.recentBranches).toHaveLength(1);
  });

  it('keeps what it holds in storage, as it changes, for the next visit', () => {
    const { result } = renderHook(() => useRecentBranches());

    act(() => result.current.addRecentBranch('feat/one', snapshot));

    expect(stored()).toEqual([
      { value: 'feat/one', createdAt: '2026-03-10T12:00:00.000Z', ...snapshot }
    ]);

    act(() => result.current.removeRecentBranch('2026-03-10T12:00:00.000Z'));

    expect(stored()).toEqual([]);
  });

  it('hands out the same functions on every render, so effects that use them do not rerun', () => {
    const { result, rerender } = renderHook(() => useRecentBranches());
    const { addRecentBranch, removeRecentBranch } = result.current;

    act(() => result.current.addRecentBranch('feat/one', snapshot));
    rerender();

    expect(result.current.addRecentBranch).toBe(addRecentBranch);
    expect(result.current.removeRecentBranch).toBe(removeRecentBranch);
  });
});
