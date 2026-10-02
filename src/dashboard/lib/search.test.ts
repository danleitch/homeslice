import { describe, expect, it } from 'vitest';
import { allGroups, sanitizeConfig } from './model';
import { searchBookmarks } from './search';

const groups = allGroups(
  sanitizeConfig({
    groups: [
      {
        name: 'Code',
        bookmarks: [
          { name: 'GitHub', url: 'https://github.com', description: 'Pull requests' },
          { name: 'Stack Overflow', url: 'https://stackoverflow.com' }
        ]
      },
      { name: 'Café', bookmarks: [{ name: 'Menu', url: 'https://cafe.example/menu' }] }
    ]
  })
);

const found = (query: string): string[] =>
  searchBookmarks(groups, query).map((hit) => hit.bookmark.name);

describe('searchBookmarks', () => {
  it('ranks a name that starts with the query above one that only contains it', () => {
    expect(found('git')).toEqual(['GitHub']);
    expect(found('over')).toEqual(['Stack Overflow']);
  });

  it('matches descriptions, addresses and group names', () => {
    expect(found('pull')).toEqual(['GitHub']);
    expect(found('stackoverflow.com')).toEqual(['Stack Overflow']);
    expect(found('cafe')).toEqual(['Menu']);
  });

  it('finds initials in order, like "so" for Stack Overflow', () => {
    expect(found('sof')).toContain('Stack Overflow');
  });

  it('finds nothing for an empty query', () => {
    expect(found('   ')).toEqual([]);
  });
});
