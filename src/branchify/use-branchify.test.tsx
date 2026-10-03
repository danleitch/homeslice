import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RecentBranch } from '../types';
import { useBranchify } from './use-branchify';

const legacy = (value: string): RecentBranch => ({ value, createdAt: '2026-01-01T00:00:00.000Z' });

const setup = () =>
  renderHook(() => useBranchify({ addRecentBranch: vi.fn(), rewardForBranch: vi.fn() }));

describe('loading a recent branch', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('refuses a legacy name it cannot take apart, and leaves the form as it was', () => {
    const { result } = setup();
    const before = result.current.form;

    let loaded = true;
    act(() => {
      loaded = result.current.loadRecent(legacy('weird-name'));
    });

    expect(result.current.canLoadRecent(legacy('weird-name'))).toBe(false);
    expect(loaded).toBe(false);
    expect(result.current.form).toEqual(before);
  });

  it('takes a legacy name apart into the form, when it can', () => {
    const { result } = setup();

    let loaded = false;
    act(() => {
      loaded = result.current.loadRecent(legacy('fix/BRF-7-restore-me'));
    });

    expect(result.current.canLoadRecent(legacy('fix/BRF-7-restore-me'))).toBe(true);
    expect(loaded).toBe(true);
    expect(result.current.form).toEqual({
      branchType: 'fix',
      ticketNumber: 'BRF-7',
      description: 'restore me'
    });
  });

  it('loads a snapshot as it was saved, separators and all', () => {
    const { result } = setup();
    const item: RecentBranch = {
      ...legacy('anything'),
      form: { branchType: 'chore', ticketNumber: 'X-1', description: 'Tidy' },
      separators: { typeSeparator: '_', ticketSeparator: '.' }
    };

    act(() => {
      result.current.loadRecent(item);
    });

    expect(result.current.form).toEqual(item.form);
    expect(result.current.settings).toMatchObject(item.separators!);
  });
});
