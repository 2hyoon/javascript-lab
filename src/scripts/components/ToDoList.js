const STORAGE_KEY = 'javascript-lab:todo';

// localStorage throws rather than returning null when it is unavailable —
// Safari's private mode and a blocked-cookies setting both do it — so every
// access is wrapped. A demo that cannot persist should still run.
function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything already in storage was written by an older version of this
    // file or by hand, so each field is checked rather than trusted.
    return parsed
      .filter((task) => task && typeof task.text === 'string')
      .map((task) => ({
        id: Number(task.id),
        text: task.text,
        completed: task.completed === true,
      }))
      .filter((task) => Number.isFinite(task.id));
  } catch {
    return [];
  }
}

function writeStored(tasks) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Quota or a disabled store. The in-memory list is still correct, so the
    // page keeps working and only the reload survives nothing.
  }
}

// The checkbox and the delete button carry no text of their own, so without
// this every row announces the same two names and a screen reader user cannot
// tell which task they are about to remove. The task's own text input needs
// no such treatment: its value is what gets announced.
function labelRow(row, text) {
  row
    .querySelector('.todo-list-toggle')
    .setAttribute('aria-label', `Mark "${text}" as complete`);
  row
    .querySelector('.todo-list-delete')
    .setAttribute('aria-label', `Delete "${text}"`);
}

function createRow(task) {
  const row = document.createElement('li');
  row.dataset.id = String(task.id);
  row.dataset.completed = task.completed ? 'true' : 'false';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'todo-list-toggle';
  toggle.checked = task.completed;

  // Kept as an always-editable input rather than a label with an edit mode:
  // it is the smaller amount of state, and the value is what a screen reader
  // reads out for the row anyway.
  const text = document.createElement('input');
  text.type = 'text';
  text.className = 'todo-list-input';
  text.value = task.text;
  text.setAttribute('aria-label', 'Task');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'todo-list-delete';
  remove.textContent = 'Delete';

  row.append(toggle, text, remove);
  labelRow(row, task.text);
  return row;
}

export function initToDoList(root = document) {
  const controller = new AbortController();
  const { signal } = controller;

  root.querySelectorAll('.todo').forEach((section) => {
    const sectionEl = section;
    if (sectionEl.dataset.enhanced === 'true') return;

    const form = sectionEl.querySelector('.todo-form');
    const input = sectionEl.querySelector('.todo-input');
    const activeList = sectionEl.querySelector('.todo-list-active');
    const doneList = sectionEl.querySelector('.todo-list-done');
    const activeEmpty = sectionEl.querySelector('.todo-empty-active');
    const doneEmpty = sectionEl.querySelector('.todo-empty-done');
    const status = sectionEl.querySelector('.todo-status');
    const count = sectionEl.querySelector('.todo-count');

    if (!form || !input || !activeList || !doneList) return;

    sectionEl.dataset.enhanced = 'true';

    let tasks = readStored();
    let nextId =
      tasks.reduce((highest, task) => Math.max(highest, task.id), 0) + 1;

    const announce = (message) => {
      if (status) status.textContent = message;
    };

    // Only the counters and the empty-state messages are recomputed wholesale.
    // The rows are not: each one holds a focusable, editable input, so
    // rebuilding the list on every change would drop the caret — and, mid
    // composition, the half-typed characters with it. Row changes are applied
    // to the node that is already there.
    const syncSummary = () => {
      const remaining = tasks.filter((task) => !task.completed).length;
      const done = tasks.length - remaining;

      // The count and the empty message share a slot and are never both
      // worth showing: a count is only news while something is outstanding,
      // which is exactly when the empty message is hidden. They are sized to
      // match in the stylesheet so the swap moves nothing below them.
      if (count) {
        count.textContent =
          remaining === 1 ? '1 item left' : `${remaining} items left`;
        count.hidden = remaining === 0;
      }
      // Both messages are derived from the task list rather than from the
      // rows on screen. No test can tell the two apart — rows are added and
      // removed in step with the array, so the DOM cannot drift from it —
      // and swapping this back to `activeList.children.length` survives
      // mutation testing. It is a consistency choice, not a bug fix: the
      // array is the source everything else already reads, and a second one
      // that happens to agree today is how they start disagreeing later.
      if (activeEmpty) activeEmpty.hidden = remaining > 0;
      if (doneEmpty) doneEmpty.hidden = done > 0;
    };

    const persist = () => {
      writeStored(tasks);
      syncSummary();
    };

    const findTask = (id) => tasks.find((task) => task.id === id);
    const rowId = (row) => Number(row.dataset.id);

    tasks.forEach((task) => {
      (task.completed ? doneList : activeList).append(createRow(task));
    });
    syncSummary();

    form.addEventListener(
      'submit',
      (event) => {
        // A form gives the two ways of adding a task — the button and Enter —
        // one handler and therefore one guard. It also settles the IME case
        // for free: the Enter that commits a Korean composition is consumed by
        // the input method, so it never reaches submit and cannot add a
        // half-composed task the way a keydown listener would.
        event.preventDefault();

        const text = input.value.trim();
        if (!text) return;

        const task = { id: nextId, text, completed: false };
        nextId += 1;
        tasks.push(task);
        activeList.prepend(createRow(task));

        input.value = '';
        input.focus();
        persist();
        announce(`Added "${text}".`);
      },
      { signal }
    );

    sectionEl.addEventListener(
      'change',
      (event) => {
        const row = event.target.closest('.todo-list li');
        if (!row || !sectionEl.contains(row)) return;

        const task = findTask(rowId(row));
        if (!task) return;

        if (event.target.matches('.todo-list-toggle')) {
          task.completed = event.target.checked;
          row.dataset.completed = task.completed ? 'true' : 'false';
          // Moving the existing node rather than rebuilding it keeps the
          // checkbox state and any unsaved edit in the text input intact.
          (task.completed ? doneList : activeList).prepend(row);
          persist();
          announce(
            task.completed
              ? `Completed "${task.text}".`
              : `Moved "${task.text}" back to the list.`
          );
          return;
        }

        if (event.target.matches('.todo-list-input')) {
          const text = event.target.value.trim();
          if (!text) {
            // An emptied field is a mistake rather than a delete instruction,
            // so the stored text wins and the input is put back.
            event.target.value = task.text;
            return;
          }
          task.text = text;
          labelRow(row, text);
          persist();
          announce(`Renamed to "${text}".`);
        }
      },
      { signal }
    );

    sectionEl.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest('.todo-list-delete');
        if (!button || !sectionEl.contains(button)) return;

        const row = button.closest('.todo-list li');
        if (!row) return;

        const task = findTask(rowId(row));

        // Removing the row destroys the element that has focus, which drops
        // the reader onto <body> and makes them tab from the top of the
        // document to carry on. Somewhere sensible is picked first.
        const nextTarget =
          row.nextElementSibling?.querySelector('.todo-list-delete') ??
          row.previousElementSibling?.querySelector('.todo-list-delete') ??
          input;

        tasks = tasks.filter((candidate) => candidate.id !== rowId(row));
        row.remove();
        nextTarget.focus();

        persist();
        if (task) announce(`Deleted "${task.text}".`);
      },
      { signal }
    );
  });

  return () => controller.abort();
}
