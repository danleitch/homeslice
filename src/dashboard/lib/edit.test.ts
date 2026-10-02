import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  arrayMove,
  deleteGroup,
  mergeGroups,
  moveBookmark,
  updateGroup,
  updateWidget
} from './edit';
import { pageOf, sanitizeConfig, type PageConfig } from './model';

const board = (): PageConfig =>
  pageOf(
    sanitizeConfig({
      widgets: [{ type: 'weather', location: 'Oslo' }],
      groups: [
        {
          name: 'Code',
          bookmarks: [
            { name: 'GitHub', url: 'https://github.com' },
            { name: 'GitLab', url: 'https://gitlab.com' },
            { name: 'npm', url: 'https://npmjs.com' }
          ]
        },
        { name: 'Read', bookmarks: [{ name: 'HN', url: 'https://news.ycombinator.com' }] }
      ]
    }),
    0
  );

const names = (config: PageConfig): string[][] =>
  config.groups.map((group) => group.bookmarks.map((bookmark) => bookmark.name));

describe('board edits', () => {
  it('moves items within a list', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(arrayMove(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('reorders a bookmark inside its group', () => {
    const config = board();
    const github = config.groups[0].bookmarks[0];

    expect(
      names({ ...config, groups: moveBookmark(config.groups, github.id, config.groups[0].id, 2) })
    ).toEqual([['GitLab', 'npm', 'GitHub'], ['HN']]);
  });

  it('carries a bookmark across to another group, at the place it was dropped', () => {
    const config = board();
    const npm = config.groups[0].bookmarks[2];

    expect(
      names({ ...config, groups: moveBookmark(config.groups, npm.id, config.groups[1].id, 0) })
    ).toEqual([
      ['GitHub', 'GitLab'],
      ['npm', 'HN']
    ]);
  });

  it('adds a bookmark to a new group by name, and opens a collapsed one it is added to', () => {
    const config = board();
    const collapsed = updateGroup(config, config.groups[1].id, { collapsed: true });
    const intoExisting = addBookmark(
      collapsed,
      { groupId: config.groups[1].id },
      { name: 'Lobsters', url: 'https://lobste.rs', description: '', icon: '' }
    );

    expect(intoExisting.config.groups[1].collapsed).toBe(false);
    expect(names(intoExisting.config)[1]).toEqual(['HN', 'Lobsters']);

    const intoNew = addBookmark(
      config,
      { newGroup: 'Media' },
      { name: 'Plex', url: 'http://plex.lan', description: '', icon: '' }
    );

    expect(intoNew.config.groups[intoNew.config.groups.length - 1]).toMatchObject({
      name: 'Media'
    });
    expect(intoNew.groupId).toBe(intoNew.config.groups[intoNew.config.groups.length - 1].id);
  });

  it('keeps widths on the board when a group or widget is resized', () => {
    const config = board();

    expect(updateGroup(config, config.groups[0].id, { width: 99 }).groups[0].width).toBe(12);
    expect(updateWidget(config, config.widgets[0].id, { width: 1 }).widgets[0].width).toBe(3);
  });

  it('never lets a widget change its type through an update', () => {
    const config = board();
    const updated = updateWidget(config, config.widgets[0].id, { type: 'markets' } as never);

    expect(updated.widgets[0].type).toBe('weather');
  });

  it('merges imported groups by name, skipping links already there', () => {
    const config = board();
    const incoming = sanitizeConfig({
      groups: [
        {
          name: 'code',
          bookmarks: [
            { name: 'GitHub again', url: 'https://github.com' },
            { name: 'Bitbucket', url: 'https://bitbucket.org' }
          ]
        },
        { name: 'New', bookmarks: [{ name: 'X', url: 'https://x.example' }] }
      ]
    }).pages[0].groups;

    expect(names(mergeGroups(config, incoming))).toEqual([
      ['GitHub', 'GitLab', 'npm', 'Bitbucket'],
      ['HN'],
      ['X']
    ]);
  });

  it('deletes a group with its bookmarks', () => {
    const config = board();

    expect(names(deleteGroup(config, config.groups[0].id))).toEqual([['HN']]);
  });
});
