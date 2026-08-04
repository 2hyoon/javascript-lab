import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initToDoList } from './ToDoList';

const STORAGE_KEY = 'javascript-lab:todo';

// `window.localStorage` is an empty plain object under this runner — no
// getItem, no setItem, not even an instance of `window.Storage`. jsdom is not
// the culprit: its `Storage` implementation is intact and `sessionStorage`
// works, so the localStorage slot alone has been replaced. Node 25 ships its
// own `localStorage` global (hence the `--localstorage-file` warning the
// runner prints), and `window === globalThis` here, so it wins.
//
// The component reaches for storage through a try/catch precisely because a
// store can be missing or refuse to answer, and under this runner that path
// is what runs by default. Testing the persistence contract means supplying
// a store that behaves, so the assertions are about the component rather
// than about the runner's globals.
class MemoryStorage {
  #entries = new Map();

  getItem(key) {
    return this.#entries.has(key) ? this.#entries.get(key) : null;
  }

  setItem(key, value) {
    this.#entries.set(key, String(value));
  }

  removeItem(key) {
    this.#entries.delete(key);
  }

  clear() {
    this.#entries.clear();
  }

  key(index) {
    return [...this.#entries.keys()][index] ?? null;
  }

  get length() {
    return this.#entries.size;
  }
}

function installStorage() {
  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

const markup = `
  <section class="todo">
    <h1>To Do List</h1>
    <form class="todo-form">
      <label class="visually-hidden" for="todo-input">New task</label>
      <input type="text" id="todo-input" class="todo-input" />
      <button type="submit" class="todo-add-btn">Add Task</button>
    </form>
    <div class="todo-panel">
      <h2>To do</h2>
      <p class="todo-count"></p>
      <p class="todo-empty todo-empty-active">Your list is empty.</p>
      <ul class="todo-list todo-list-active"></ul>
    </div>
    <div class="todo-panel">
      <h2>Completed</h2>
      <p class="todo-empty todo-empty-done">Nothing completed yet.</p>
      <ul class="todo-list todo-list-done"></ul>
    </div>
    <p class="todo-status" role="status" aria-live="polite"></p>
  </section>
`;

const q = (selector) => document.querySelector(selector);
const qa = (selector) => [...document.querySelectorAll(selector)];

const activeRows = () => qa('.todo-list-active li');
const doneRows = () => qa('.todo-list-done li');
const status = () => q('.todo-status').textContent;

function mount(html = markup) {
  document.body.innerHTML = html;
  return initToDoList();
}

// jsdom does not run a form's implicit submission, so the button click that a
// user makes is dispatched as the submit it would produce.
function addTask(text) {
  q('.todo-input').value = text;
  q('.todo-form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })
  );
}

function changeValue(element, value) {
  const el = element;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

let cleanup;

beforeEach(() => {
  installStorage();
  cleanup = undefined;
});

afterEach(() => {
  if (cleanup) cleanup();
  document.body.innerHTML = '';
});

describe('initToDoList — guards', () => {
  it('does nothing and still returns a cleanup when the markup is absent', () => {
    document.body.innerHTML = '<div>no todo here</div>';
    const returned = initToDoList();
    expect(typeof returned).toBe('function');
    expect(() => returned()).not.toThrow();
  });

  it('leaves the section alone when a required element is missing', () => {
    cleanup = mount(
      '<section class="todo"><form class="todo-form"></form></section>'
    );
    expect(q('.todo').dataset.enhanced).toBeUndefined();
  });

  it('marks the section enhanced so a second init cannot double-bind', () => {
    cleanup = mount();
    expect(q('.todo').dataset.enhanced).toBe('true');

    // Asserting on a task added *after* the second init does not work, and
    // the reason is worth keeping: both submit handlers would run, but the
    // first empties the field, so the second meets the empty-input guard and
    // returns. Double binding leaves no trace in the row count.
    //
    // Re-initialising over saved tasks does show it. The second init reads
    // storage and renders what it finds, so without the guard the list holds
    // each task twice.
    addTask('buy milk');
    const second = initToDoList();

    expect(activeRows()).toHaveLength(1);
    second();
  });
});

describe('adding', () => {
  beforeEach(() => {
    cleanup = mount();
  });

  it('adds a task, clears the field, and announces it', () => {
    addTask('buy milk');

    expect(activeRows()).toHaveLength(1);
    expect(q('.todo-list-input').value).toBe('buy milk');
    expect(q('.todo-input').value).toBe('');
    expect(status()).toBe('Added "buy milk".');
  });

  // In a browser an unprevented submit navigates and the page reloads, which
  // is the whole reason the handler calls preventDefault. jsdom runs no
  // default action for a dispatched submit, so the flag is the only place
  // that contract is observable here — asserting on anything else leaves the
  // call free to be deleted.
  it('prevents the browser from submitting the form', () => {
    q('.todo-input').value = 'buy milk';
    const event = new Event('submit', { bubbles: true, cancelable: true });
    q('.todo-form').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores an empty field', () => {
    addTask('');
    expect(activeRows()).toHaveLength(0);
  });

  // The old component guarded the Enter path and not the button path, so
  // clicking Add on an empty field produced a blank row. A form has one path.
  it('ignores a field holding only whitespace', () => {
    addTask('   ');
    expect(activeRows()).toHaveLength(0);
  });

  it('trims what it stores', () => {
    addTask('  padded  ');
    expect(q('.todo-list-input').value).toBe('padded');
  });

  it('gives the newest task the top of the list', () => {
    addTask('first');
    addTask('second');
    expect(
      qa('.todo-list-active .todo-list-input').map((el) => el.value)
    ).toEqual(['second', 'first']);
  });

  it('names the controls after the task they belong to', () => {
    addTask('buy milk');

    expect(q('.todo-list-toggle').getAttribute('aria-label')).toBe(
      'Mark "buy milk" as complete'
    );
    expect(q('.todo-list-delete').getAttribute('aria-label')).toBe(
      'Delete "buy milk"'
    );
  });
});

describe('completing', () => {
  beforeEach(() => {
    cleanup = mount();
    addTask('buy milk');
  });

  it('moves the row to the completed list and marks it', () => {
    const toggle = q('.todo-list-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(activeRows()).toHaveLength(0);
    expect(doneRows()).toHaveLength(1);
    expect(doneRows()[0].dataset.completed).toBe('true');
    expect(status()).toBe('Completed "buy milk".');
  });

  // The contract behind choosing to move the node instead of re-rendering the
  // list: an edit in progress survives the move. A rebuild would discard it.
  it('moves the same node, so an unsaved edit survives', () => {
    const before = activeRows()[0];
    const text = before.querySelector('.todo-list-input');
    text.value = 'half-typed edit';

    const toggle = q('.todo-list-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(doneRows()[0]).toBe(before);
    expect(doneRows()[0].querySelector('.todo-list-input').value).toBe(
      'half-typed edit'
    );
  });

  it('sends the task back when unchecked', () => {
    const toggle = q('.todo-list-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(activeRows()).toHaveLength(1);
    expect(doneRows()).toHaveLength(0);
    expect(activeRows()[0].dataset.completed).toBe('false');
  });
});

describe('deleting', () => {
  beforeEach(() => {
    cleanup = mount();
  });

  it('removes only the row whose button was pressed', () => {
    addTask('first');
    addTask('second');

    activeRows()[0].querySelector('.todo-list-delete').click();

    expect(
      qa('.todo-list-active .todo-list-input').map((el) => el.value)
    ).toEqual(['first']);
    expect(status()).toBe('Deleted "second".');
  });

  // The regression this replaces: removing the row destroyed the focused
  // button, so focus fell to <body> and the reader had to tab from the top of
  // the document to carry on. Same failure the infinite-scroll button had.
  it('moves focus to the next row instead of dropping it on the body', () => {
    addTask('first');
    addTask('second');

    const [top, bottom] = activeRows();
    top.querySelector('.todo-list-delete').focus();
    top.querySelector('.todo-list-delete').click();

    expect(document.activeElement).toBe(
      bottom.querySelector('.todo-list-delete')
    );
    expect(document.activeElement).not.toBe(document.body);
  });

  it('falls back to the previous row when the last one goes', () => {
    addTask('first');
    addTask('second');

    const [top, bottom] = activeRows();
    bottom.querySelector('.todo-list-delete').click();

    expect(document.activeElement).toBe(top.querySelector('.todo-list-delete'));
  });

  it('falls back to the input when the list empties', () => {
    addTask('only one');
    q('.todo-list-delete').click();

    expect(activeRows()).toHaveLength(0);
    expect(document.activeElement).toBe(q('.todo-input'));
  });

  it('ignores clicks that are not on a delete button', () => {
    addTask('buy milk');
    q('.todo-list-input').click();
    q('.todo-panel').click();

    expect(activeRows()).toHaveLength(1);
  });
});

describe('editing', () => {
  beforeEach(() => {
    cleanup = mount();
    addTask('buy milk');
  });

  it('stores the new text and relabels the row', () => {
    changeValue(q('.todo-list-input'), 'buy oat milk');

    expect(q('.todo-list-delete').getAttribute('aria-label')).toBe(
      'Delete "buy oat milk"'
    );
    expect(status()).toBe('Renamed to "buy oat milk".');
  });

  it('restores the previous text when the field is emptied', () => {
    changeValue(q('.todo-list-input'), '   ');
    expect(q('.todo-list-input').value).toBe('buy milk');
  });

  it('keeps the edit across a reload', () => {
    changeValue(q('.todo-list-input'), 'buy oat milk');
    cleanup();

    cleanup = mount();
    expect(q('.todo-list-input').value).toBe('buy oat milk');
  });
});

describe('delegation reaches rows created after init', () => {
  it('handles a row appended straight to the DOM', () => {
    cleanup = mount();
    addTask('buy milk');

    // The row the component rendered is removed and an identical one is put
    // back by hand. Per-element listeners would not survive this; a listener
    // on the section does.
    const original = activeRows()[0];
    const clone = original.cloneNode(true);
    original.remove();
    q('.todo-list-active').append(clone);

    clone.querySelector('.todo-list-delete').click();
    expect(activeRows()).toHaveLength(0);
  });
});

describe('summary and empty states', () => {
  beforeEach(() => {
    cleanup = mount();
  });

  it('starts with both empty messages showing and no count', () => {
    expect(q('.todo-empty-active').hidden).toBe(false);
    expect(q('.todo-empty-done').hidden).toBe(false);
    expect(q('.todo-count').hidden).toBe(true);
  });

  it('hides the active message once something is on the list', () => {
    addTask('buy milk');
    expect(q('.todo-empty-active').hidden).toBe(true);
    expect(q('.todo-empty-done').hidden).toBe(false);
  });

  // "0 items left" and "Your list is empty." say the same thing, and the
  // count is only news while something is outstanding — the exact condition
  // that hides the message. They swap rather than stack.
  it('never shows the count and the empty message at once', () => {
    const bothVisible = () =>
      !q('.todo-count').hidden && !q('.todo-empty-active').hidden;

    expect(bothVisible()).toBe(false);

    addTask('buy milk');
    expect(q('.todo-count').hidden).toBe(false);
    expect(bothVisible()).toBe(false);

    q('.todo-list-delete').click();
    expect(q('.todo-count').hidden).toBe(true);
    expect(q('.todo-empty-active').hidden).toBe(false);
    expect(bothVisible()).toBe(false);
  });

  // Completing the last outstanding task empties the active list without
  // emptying the store, which is the case where a count taken from the rows
  // on screen and one taken from the task list could disagree.
  it('falls back to the empty message when the last task is completed', () => {
    addTask('buy milk');

    const toggle = q('.todo-list-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(q('.todo-count').hidden).toBe(true);
    expect(q('.todo-empty-active').hidden).toBe(false);
    expect(q('.todo-empty-done').hidden).toBe(true);
  });

  it('counts only what is outstanding', () => {
    addTask('first');
    addTask('second');
    expect(q('.todo-count').textContent).toBe('2 items left');

    const toggle = q('.todo-list-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(q('.todo-count').textContent).toBe('1 item left');
    expect(q('.todo-count').hidden).toBe(false);
    expect(q('.todo-empty-done').hidden).toBe(true);
  });
});

describe('persistence', () => {
  it('writes tasks to storage as it goes', () => {
    cleanup = mount();
    addTask('buy milk');

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual([
      { id: 1, text: 'buy milk', completed: false },
    ]);
  });

  it('restores both lists on the next init', () => {
    cleanup = mount();
    addTask('outstanding');
    addTask('finished');

    const toggle = activeRows()[0].querySelector('.todo-list-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    cleanup();

    cleanup = mount();
    expect(activeRows()).toHaveLength(1);
    expect(doneRows()).toHaveLength(1);
    expect(doneRows()[0].querySelector('.todo-list-toggle').checked).toBe(true);
    expect(q('.todo-count').textContent).toBe('1 item left');
  });

  it('does not reuse an id after a reload', () => {
    cleanup = mount();
    addTask('first');
    cleanup();

    cleanup = mount();
    addTask('second');

    const ids = activeRows().map((row) => row.dataset.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('starts empty when storage holds something unparseable', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ not json');
    cleanup = mount();
    expect(activeRows()).toHaveLength(0);
  });

  it('starts empty when storage holds the wrong shape', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"tasks":[]}');
    cleanup = mount();
    expect(activeRows()).toHaveLength(0);
  });

  it('drops entries that are missing their fields', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 1, text: 'keep me', completed: false },
        { id: 'x', text: 'bad id' },
        { id: 3 },
      ])
    );
    cleanup = mount();

    expect(activeRows()).toHaveLength(1);
    expect(q('.todo-list-input').value).toBe('keep me');
  });

  // Safari's private mode throws on setItem rather than failing quietly, and
  // a demo that cannot persist should still add tasks.
  it('keeps working when storage refuses to be written', () => {
    const setItem = vi
      .spyOn(MemoryStorage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

    cleanup = mount();
    expect(() => addTask('buy milk')).not.toThrow();
    expect(activeRows()).toHaveLength(1);

    setItem.mockRestore();
  });

  // The state this runner hands the component by default, and the state a
  // browser with storage switched off hands it: no store at all.
  it('keeps working when there is no store to reach', () => {
    Object.defineProperty(window, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    cleanup = mount();
    expect(() => addTask('buy milk')).not.toThrow();
    expect(activeRows()).toHaveLength(1);
  });
});

describe('cleanup', () => {
  it('stops responding once the returned cleanup runs', () => {
    cleanup = mount();
    addTask('before');
    cleanup();
    cleanup = undefined;

    addTask('after');
    expect(activeRows()).toHaveLength(1);

    q('.todo-list-delete').click();
    expect(activeRows()).toHaveLength(1);
  });
});
