import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Group } from '../lib/model';
import { BookmarkDialog } from './bookmark-dialog';
import { GroupDialog } from './group-dialog';

const group = (id: string, name: string): Group => ({
  id,
  name,
  icon: '',
  width: 4,
  style: 'cards',
  collapsed: false,
  bookmarks: []
});

const groups = [group('g1', 'Media'), group('g2', 'Work')];

describe('BookmarkDialog', () => {
  const open = (props: Partial<Parameters<typeof BookmarkDialog>[0]> = {}) => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <BookmarkDialog
        mode="add"
        initial={{}}
        groups={groups}
        onSave={onSave}
        onClose={onClose}
        {...props}
      />
    );

    return { user, onSave, onClose };
  };

  it('asks for an address when there is none, and does not save', async () => {
    const { user, onSave } = open();

    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));

    expect(screen.getByText('Paste or type an address.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('says so when what was typed is not a web address, and forgets it once typing resumes', async () => {
    const { user, onSave } = open();

    await user.type(screen.getByLabelText(/^Address/), 'not an address');
    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));

    expect(screen.getByText('That doesn’t look like a web address.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Address/), '!');

    expect(screen.queryByText('That doesn’t look like a web address.')).not.toBeInTheDocument();
  });

  it('names the bookmark after the address until it is given a name', async () => {
    const { user } = open();

    await user.type(screen.getByLabelText(/^Address/), 'https://github.com/vitest-dev/vitest');

    expect(screen.getByLabelText(/^Name/)).toHaveValue('GitHub');

    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(screen.getByLabelText(/^Name/), 'Tests');
    await user.type(screen.getByLabelText(/^Address/), '/issues');

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Tests');
  });

  it('saves into the group chosen, keeping what was typed, tidied', async () => {
    const { user, onSave } = open();

    await user.type(screen.getByLabelText(/^Address/), 'example.com/docs');
    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(screen.getByLabelText(/^Name/), '  Docs  ');
    await user.selectOptions(screen.getByLabelText('Group'), 'Work');
    await user.type(screen.getByLabelText(/^Description/), '  The manual ');
    await user.type(screen.getByLabelText(/^Icon/), ' si-github ');
    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));

    expect(onSave).toHaveBeenCalledWith(
      {
        url: 'https://example.com/docs',
        name: 'Docs',
        description: 'The manual',
        icon: 'si-github'
      },
      { groupId: 'g2' }
    );
  });

  it('starts in the first group when it was not told which, or told one that is gone', () => {
    open({ initial: { groupId: 'vanished' } });

    expect(screen.getByLabelText('Group')).toHaveDisplayValue('Media');
  });

  it('starts in the group it was told to', () => {
    open({ initial: { groupId: 'g2' } });

    expect(screen.getByLabelText('Group')).toHaveDisplayValue('Work');
  });

  it('can make a new group for the bookmark, which must be named', async () => {
    const { user, onSave } = open();

    await user.type(screen.getByLabelText(/^Address/), 'https://example.com');
    await user.selectOptions(screen.getByLabelText('Group'), 'New group…');
    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));

    expect(screen.getByText('Give the new group a name.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('New group name'), '  Reading ');

    expect(screen.queryByText('Give the new group a name.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/' }), {
      newGroup: 'Reading'
    });
  });

  it('offers a new group called Bookmarks when there are no groups to put it in', async () => {
    const { user, onSave } = open({ groups: [] });

    expect(screen.getByLabelText('Group')).toHaveDisplayValue('New group…');
    expect(screen.getByLabelText('New group name')).toHaveValue('Bookmarks');

    await user.type(screen.getByLabelText(/^Address/), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Add bookmark' }));

    expect(onSave.mock.calls[0]![1]).toEqual({ newGroup: 'Bookmarks' });
  });

  it('tidies the address into a full one when the field is left', async () => {
    const { user } = open();

    await user.type(screen.getByLabelText(/^Address/), 'example.com');
    await user.click(screen.getByLabelText(/^Name/));

    expect(screen.getByLabelText(/^Address/)).toHaveValue('https://example.com/');
  });

  it('previews the bookmark as it will look', async () => {
    const { user } = open();
    const preview = screen.getByRole('list', { name: 'Preview' });

    expect(preview).toHaveTextContent('New bookmark');

    await user.type(screen.getByLabelText(/^Address/), 'https://example.com');
    await user.type(screen.getByLabelText(/^Description/), 'A fine site');

    expect(preview).toHaveTextContent('Example');
    expect(preview).toHaveTextContent('A fine site');
  });

  it('edits what is there, and deletes it on request', async () => {
    const onDelete = vi.fn();
    const { user, onSave } = open({
      mode: 'edit',
      initial: {
        url: 'https://jellyfin.lan',
        name: 'Jellyfin',
        description: 'Films',
        icon: 'mdi-movie',
        groupId: 'g1'
      },
      onDelete
    });

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Jellyfin');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(
      { url: 'https://jellyfin.lan/', name: 'Jellyfin', description: 'Films', icon: 'mdi-movie' },
      { groupId: 'g1' }
    );
  });

  it('offers no deleting for a bookmark that does not exist yet', () => {
    open();

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('closes without saving', async () => {
    const { user, onSave, onClose } = open();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('GroupDialog', () => {
  const open = (props: Partial<Parameters<typeof GroupDialog>[0]> = {}) => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<GroupDialog mode="add" onSave={onSave} onClose={onClose} {...props} />);

    return { user, onSave, onClose };
  };

  it('asks for a name when there is none, and forgets the complaint once typing resumes', async () => {
    const { user, onSave } = open();

    await user.click(screen.getByRole('button', { name: 'Create group' }));

    expect(screen.getByText('Give the group a name.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Name/), 'Media');

    expect(screen.queryByText('Give the group a name.')).not.toBeInTheDocument();
  });

  it('does not take a name that is only spaces', async () => {
    const { user, onSave } = open();

    await user.type(screen.getByLabelText(/^Name/), '   ');
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('starts as cards, a third wide', () => {
    open();

    expect(screen.getByRole('radio', { name: /Cards/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: '⅓' })).toBeChecked();
  });

  it('saves what was typed, tidied, in the layout and width chosen', async () => {
    const { user, onSave } = open();

    await user.type(screen.getByLabelText(/^Name/), '  Media  ');
    await user.type(screen.getByLabelText(/^Icon/), ' 🎬 ');
    await user.click(screen.getByRole('radio', { name: /Tiles/ }));
    await user.click(screen.getByRole('radio', { name: '½' }));
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    expect(onSave).toHaveBeenCalledWith({ name: 'Media', icon: '🎬', style: 'tiles', width: 6 });
  });

  it('shows a width the presets lack, as it is, so it is not lost when saved', async () => {
    const { user, onSave } = open({ mode: 'edit', initial: { name: 'Odd', width: 5 } });

    expect(screen.getByRole('radio', { name: '5/12' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ width: 5 }));
  });

  it('opens a group to edit with what it has', () => {
    open({
      mode: 'edit',
      initial: { name: 'Work', icon: 'mdi-briefcase', style: 'list', width: 12 }
    });

    expect(screen.getByRole('dialog', { name: 'Group settings' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Work');
    expect(screen.getByLabelText(/^Icon/)).toHaveValue('mdi-briefcase');
    expect(screen.getByRole('radio', { name: /List/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Full' })).toBeChecked();
  });

  it('closes without saving', async () => {
    const { user, onSave, onClose } = open();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
