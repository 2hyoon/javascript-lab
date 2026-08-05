import { debounce } from './RateLimit';

// Datamuse's suggestion endpoint: no key, CORS open, and built for exactly
// this — it answers a prefix with the words people actually reach for.
const API_URL = 'https://api.datamuse.com/sug';
const MAX_RESULTS = 8;

// Long enough that ordinary typing produces one request instead of one per
// letter, short enough that stopping to think does not feel like waiting.
const DEBOUNCE_MS = 250;

// How many lines of instrumentation to keep. Old ones are dropped rather than
// left to grow without bound on a page nobody reloads.
const LOG_LIMIT = 12;

/* ------------------------------------------------------------------------ *
 * Two different problems, two different answers
 *
 * Double submit is "the same request went out twice", and the answer is to
 * stop the second one — Form.js disables the form while it is posting, and
 * Scroll.js keeps a `loading` flag so a second page cannot be asked for while
 * the first is open.
 *
 * That answer is wrong here. Typing another letter *should* start another
 * request; refusing to send it is refusing to autocomplete. The problem is
 * not that the requests overlap, it is that they can come back in the wrong
 * order and an answer to "aut" can land on top of the answer to "autono".
 * So the requests go out freely, and the stale *results* are what get thrown
 * away.
 *
 * Two mechanisms do that, and they are not redundant:
 *
 *   abort()      cuts the network off. It is what stops a request nobody is
 *                waiting for from finishing, and it is the only one of the two
 *                that saves any bandwidth or server work.
 *
 *   request ids  catch what abort() structurally cannot. Once the body has
 *                fully arrived and res.json() has resolved, aborting is a
 *                no-op — the promise is already settled and its continuation
 *                is queued to run. That continuation would render an answer to
 *                a query the user has moved on from. Comparing the id it was
 *                issued against the newest one is what drops it.
 *
 * The gap between them is invisible on a fast connection, which is what the
 * "hold each response back" toggle exists to widen. Turning "discard stale
 * responses" off disables both, and the list starts flickering between answers
 * to words already finished — the bug, on demand.
 * ------------------------------------------------------------------------ */

// Marks the part of the suggestion the query matched, without handing any of
// it to the HTML parser — the API's words end up here, and `innerHTML` with a
// highlight wrapped around them is the shape that XSS arrives in.
function optionContent(word, query) {
  const content = document.createDocumentFragment();
  const at = word.toLowerCase().indexOf(query.toLowerCase());

  // The suggestions do not have to contain the query at all: a fuzzy endpoint
  // can answer "autonomy" to "autnmy". Nothing to mark, so nothing is marked.
  if (at === -1) {
    content.append(word);
    return content;
  }

  const matched = document.createElement('mark');
  matched.textContent = word.slice(at, at + query.length);
  content.append(word.slice(0, at), matched, word.slice(at + query.length));
  return content;
}

// Enhances every .autocomplete inside `root`, which is what makes markup added
// after load workable — call it again with the new subtree. Returns a function
// that removes every listener this call registered.
export function initAutocomplete(root = document) {
  const controller = new AbortController();
  const { signal } = controller;

  root.querySelectorAll('.autocomplete').forEach((widget) => {
    const widgetEl = widget;
    if (widgetEl.dataset.enhanced === 'true') return;

    const input = widgetEl.querySelector('.autocomplete-input');
    const listbox = widgetEl.querySelector('.autocomplete-listbox');
    const status = widgetEl.querySelector('.autocomplete-status');
    // Checked before the flag is set, so a half-written widget is left alone
    // rather than marked as handled.
    if (!input || !listbox || !status) return;

    // Instrumentation, so the component has to work without any of it. Left
    // out of the check above on purpose: a missing checkbox is a demo with one
    // fewer knob, not a broken widget.
    const slowBox = widgetEl.querySelector('.autocomplete-slow');
    const discardBox = widgetEl.querySelector('.autocomplete-discard');
    const log = widgetEl.querySelector('.autocomplete-log');

    widgetEl.dataset.enhanced = 'true';

    // JS owns this, and the DOM is where it gets drawn. That is the opposite
    // of Accordion, which reads aria-expanded back off the button to decide
    // what a click means. Here the list is rebuilt from `results` on every
    // keystroke, so asking the DOM what it currently holds would be asking a
    // copy instead of the original.
    let results = [];
    let open = false;
    // -1 is "the query stands on its own", which is a real state and not just
    // an empty one: with nothing active, Enter submits what was typed rather
    // than picking a suggestion.
    let activeIndex = -1;

    // Monotonic, never reset. A response compares the id it was issued with
    // against this: equal means it is still the newest question anyone asked,
    // anything else means the user has moved on.
    let latestRequestId = 0;
    let inFlight = null;

    // One function owns both, because they are one fact stated twice: a
    // screen reader believes aria-expanded, a sighted user believes `hidden`,
    // and setting them apart is how those two end up disagreeing. Same reason
    // Tab.js has setSelectedState and Accordion.js has setExpandedState.
    function setOpen(isOpen) {
      open = isOpen;
      listbox.hidden = !isOpen;
      input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    // A full redraw, every time. The suggestions carry no state of their own —
    // no focus (it stays in the text field), no checkbox, no edit — so there
    // is nothing for a surgical update to preserve, and diffing eight <li>
    // would be more code doing the same job. ToDoList went the other way for
    // exactly the missing reason: its rows hold inputs the user is mid-way
    // through, and rebuilding a row throws away what they typed.
    function render(query) {
      const options = results.map((word, index) => {
        const option = document.createElement('li');
        // Hung off the input's id, which the <label for> already forces to be
        // unique on the page. A bare index would collide the moment a second
        // widget is enhanced, and aria-activedescendant would then point at
        // the wrong widget's option — a bug with no visible symptom.
        option.id = `${input.id}-option-${index}`;
        option.setAttribute('role', 'option');
        // aria-selected is deliberately not set here: setActive owns it, and
        // splitting ownership is how the highlight and the attribute drift.
        option.append(optionContent(word, query));
        return option;
      });

      listbox.replaceChildren(...options);
      // The old highlight belonged to a list that no longer exists.
      setActive(-1);
    }

    // Focus stays in the text field the whole time — a listbox that took it
    // would stop the user typing, which is the one thing an autocomplete
    // cannot afford. So the highlight is announced by pointing the input at an
    // option instead. Tab.js faces the same "walk a list with the arrows"
    // problem and answers it with roving tabindex, because there the list
    // *is* what you are operating; here it is a suggestion about something
    // else you are operating.
    function setActive(index) {
      const options = [...listbox.children];
      activeIndex = index;

      options.forEach((option, i) => {
        option.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });

      if (index === -1) {
        input.removeAttribute('aria-activedescendant');
        return;
      }

      input.setAttribute('aria-activedescendant', options[index].id);
      // `nearest` so a highlight that is already on screen does not scroll,
      // which is what makes holding the down arrow read as a smooth walk.
      options[index].scrollIntoView({ block: 'nearest' });
    }

    function select(word) {
      // Assigning to input.value fires no input event, so nothing here starts
      // another search — but a debounce booked by the keystroke *before* the
      // arrow keys is still waiting, and it would fire 250ms after the choice
      // was made and reopen a list over the answer. The wrapper's cancel()
      // exists for this line.
      queueSearch.cancel();
      discardInFlight();

      input.value = word;
      results = [];
      listbox.replaceChildren();
      setActive(-1);
      setOpen(false);
      status.textContent = `${word} selected.`;
    }

    // "Nothing typed" and "nothing found" both draw an empty list, so the
    // status line is the only thing that tells them apart.
    function announce(query) {
      if (!query) {
        status.textContent = '';
        return;
      }
      if (results.length === 0) {
        status.textContent = `No matches for “${query}”.`;
        return;
      }
      status.textContent =
        results.length === 1 ? '1 result.' : `${results.length} results.`;
    }

    // Both instruments default to the honest behaviour when their checkbox is
    // missing, so the component is correct on a page with no controls at all.
    const holdingResponses = () => Boolean(slowBox && slowBox.checked);
    const discardingStale = () => !discardBox || discardBox.checked;

    const sleep = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    // Both counters, and the two numbers each line ends up carrying, exist for
    // one reason: sent order and arrival order are the same thing right up
    // until they are not, and a log that shows only one of them cannot show
    // the overtaking at all. "sent 2nd, arrived 4th" is the race, written down.
    let sent = 0;
    let arrived = 0;

    // Returns the updater for the line it just wrote, so a request can report
    // its own outcome without anyone having to find the entry again.
    function logRequest(query) {
      if (!log) return () => {};

      sent += 1;
      const order = sent;
      const line = document.createElement('li');
      line.textContent = `#${order} “${query}” sent`;
      line.dataset.outcome = 'sent';
      log.prepend(line);
      while (log.children.length > LOG_LIMIT) log.lastElementChild.remove();

      return (outcome, note) => {
        line.dataset.outcome = outcome;

        // A cancelled request never arrived, so counting it would push every
        // later arrival's number one past the truth.
        if (outcome === 'cancelled') {
          line.textContent = `#${order} “${query}” ${note}`;
          return;
        }

        arrived += 1;
        line.textContent = `#${order} “${query}” ${note}, arrived ${arrived}`;
      };
    }

    // Everything that means "the answer to the question in flight no longer
    // matters": a new keystroke, a selection, a cleared field, teardown.
    // Bumping the id is the half that abort() cannot do — see the note at the
    // top of the file — and both are gated on the toggle so that turning it
    // off leaves the naive version behind.
    function discardInFlight() {
      if (!discardingStale()) return;
      latestRequestId += 1;
      if (inFlight) inFlight.abort();
      inFlight = null;
    }

    function show(query) {
      render(query);
      announce(query);
      setOpen(results.length > 0);
    }

    async function runSearch(query) {
      discardInFlight();

      const request = new AbortController();
      inFlight = request;
      const requestId = (latestRequestId += 1);
      const settle = logRequest(query);

      listbox.setAttribute('aria-busy', 'true');
      status.textContent = 'Searching…';

      try {
        const url = `${API_URL}?s=${encodeURIComponent(query)}&max=${MAX_RESULTS}`;
        const res = await fetch(url, { signal: request.signal });
        if (!res.ok) throw new Error(`Request failed with ${res.status}`);

        const suggestions = await res.json();

        // Held *after* the body has arrived, which is what makes this a
        // simulation of a slow network rather than of a slow abort: by now the
        // request is past the point where cancelling it could do anything.
        if (holdingResponses()) await sleep(Math.random() * 1500);

        if (discardingStale() && requestId !== latestRequestId) {
          settle('ignored', 'dropped as stale');
          return;
        }

        results = suggestions.map((suggestion) => suggestion.word);
        show(query);
        settle('shown', `${results.length} shown`);
      } catch (error) {
        // Teardown and overtaking are not failures, and telling the user their
        // network broke because they typed another letter would be a lie.
        if (error.name === 'AbortError') {
          settle('cancelled', 'cancelled');
          return;
        }
        if (discardingStale() && requestId !== latestRequestId) {
          settle('ignored', 'failed, dropped as stale');
          return;
        }

        settle('failed', 'failed');
        results = [];
        listbox.replaceChildren();
        setActive(-1);
        setOpen(false);
        status.textContent = 'Could not load suggestions.';
      } finally {
        // Only the newest request owns the busy flag; an overtaken one
        // clearing it would unset a state it does not own.
        if (requestId === latestRequestId) {
          listbox.setAttribute('aria-busy', 'false');
          inFlight = null;
        }
      }
    }

    const queueSearch = debounce(runSearch, DEBOUNCE_MS);

    function clearSuggestions() {
      queueSearch.cancel();
      discardInFlight();
      results = [];
      listbox.replaceChildren();
      setActive(-1);
      setOpen(false);
      status.textContent = '';
    }

    function handleInput() {
      const query = input.value.trim();
      if (!query) {
        clearSuggestions();
        return;
      }
      queueSearch(query);
    }

    input.addEventListener(
      'input',
      (event) => {
        // Mid-composition the field holds half-formed jamo, and searching for
        // ㅎ and then 하 spends two requests to learn nothing. ToDoList dodged
        // the same problem by submitting a <form> instead of watching keys.
        if (event.isComposing) return;
        handleInput();
      },
      { signal }
    );

    // Browsers disagree about whether the last input event of a composition
    // reports isComposing, so the end of one is handled explicitly. When both
    // fire, the debounce collapses them into the single request they describe.
    input.addEventListener('compositionend', handleInput, { signal });

    input.addEventListener(
      'keydown',
      (event) => {
        // Home and End are deliberately absent. Tab.js sends them to the
        // first and last tab, but this key lands in a text field, where the
        // caret has the stronger claim on them — and APG agrees.
        switch (event.key) {
          case 'ArrowDown':
            if (results.length === 0) return;
            if (!open) {
              setOpen(true);
              // Alt+Down means "show me the list", not "pick from it", so the
              // highlight is left alone. Plain Down does both.
              if (!event.altKey) setActive(0);
            } else if (!event.altKey) {
              setActive((activeIndex + 1) % results.length);
            }
            break;

          case 'ArrowUp':
            // Alt+Up is the documented way to close the popup without
            // choosing anything, which is why this one branch comes first.
            if (event.altKey) {
              if (open) setActive(-1);
              setOpen(false);
              break;
            }
            if (results.length === 0) return;
            if (!open) {
              setOpen(true);
              setActive(results.length - 1);
            } else if (activeIndex === -1) {
              // Modular arithmetic gets this one wrong: -1 is "nothing
              // highlighted", not "the option before the first", and stepping
              // back from it lands on index length-2. Up from nothing has to
              // mean the last option, the same as up from an unopened list.
              setActive(results.length - 1);
            } else {
              // Wrapping, like Tab.js: the list is short and reaching the last
              // item from the top is one keypress rather than eight.
              setActive((activeIndex - 1 + results.length) % results.length);
            }
            break;

          case 'Enter':
            // Nothing highlighted means the typed text is the answer, so the
            // key is left to whatever would normally handle it.
            if (!open || activeIndex === -1) return;
            select(results[activeIndex]);
            break;

          case 'Escape':
            // Two steps on purpose: the first undoes what the component did
            // to the screen, the second undoes what the user typed. Collapsing
            // them would make one keypress destroy a query the user may only
            // have wanted to stop being interrupted about.
            if (open) {
              setActive(-1);
              setOpen(false);
              break;
            }
            input.value = '';
            clearSuggestions();
            break;

          default:
            return;
        }

        // Only the keys handled above get this far, so Tab, typing and the
        // caret keys keep their normal behaviour.
        event.preventDefault();
      },
      { signal }
    );

    // The pointer has to be stopped from taking focus *before* it takes it:
    // mousedown fires first, and letting it through would blur the input,
    // fire focusout, close the popup, and delete the option out from under
    // the click that was about to land on it.
    listbox.addEventListener(
      'mousedown',
      (event) => {
        if (event.target.closest('[role="option"]')) event.preventDefault();
      },
      { signal }
    );

    listbox.addEventListener(
      'click',
      (event) => {
        const option = event.target.closest('[role="option"]');
        if (!option || !listbox.contains(option)) return;
        // Delegation on the listbox rather than a listener per option,
        // because the options are thrown away and rebuilt on every keystroke.
        select(results[[...listbox.children].indexOf(option)]);
      },
      { signal }
    );

    // focusout rather than blur: blur does not bubble, so the widget would
    // have to listen on every element that can hold focus inside it. The
    // relatedTarget check is what keeps the popup open while focus moves
    // *within* the widget, which is the whole reason to listen on the wrapper.
    widgetEl.addEventListener(
      'focusout',
      (event) => {
        if (widgetEl.contains(event.relatedTarget)) return;
        if (!open) return;
        setActive(-1);
        setOpen(false);
      },
      { signal }
    );

    // Hung off the same signal that removes the listeners, so the caller still
    // has one teardown to call. abort() on its own would leave a debounce
    // timer and an open request pointing at a widget that is gone — the exact
    // gap RateLimit.js pinned in its own cleanup before cancel() existed.
    signal.addEventListener('abort', () => {
      queueSearch.cancel();
      if (inFlight) inFlight.abort();
      inFlight = null;
    });
  });

  return () => controller.abort();
}
