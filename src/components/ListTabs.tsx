import type { GameList } from '../types';

interface ListTabsProps {
  lists: GameList[];
  activeListId: string;
  onSelect: (listId: string) => void;
  onCreate: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function ListTabs({ lists, activeListId, onSelect, onCreate, onRename, onDelete }: ListTabsProps) {
  return (
    <nav className="list-tabs" aria-label="Game lists">
      {lists.map((list) => (
        <button
          key={list.id}
          className={`list-tabs__tab${list.id === activeListId ? ' is-active' : ''}`}
          onClick={() => onSelect(list.id)}
        >
          {list.name}
          <span className="list-tabs__count">{list.games.length}</span>
        </button>
      ))}
      <button className="list-tabs__action" title="Create a new list" onClick={onCreate}>
        ＋ New list
      </button>
      <span className="list-tabs__spacer" />
      <button className="list-tabs__action" title="Rename the current list" onClick={onRename}>
        Rename
      </button>
      <button
        className="list-tabs__action list-tabs__action--danger"
        title="Delete the current list"
        onClick={onDelete}
        disabled={lists.length <= 1}
      >
        Delete list
      </button>
    </nav>
  );
}
