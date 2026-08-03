const API_URL = 'https://jsonplaceholder.typicode.com/posts';
const PAGE_SIZE = 5;

const observerOptions = {
  root: null,
  // Reaching for the next page 200px early means the request is usually in
  // flight before the reader arrives at the end of what they have.
  rootMargin: '200px',
  threshold: 0.5,
};

// KEPT FOR COMPARISON — not a switch to flip back, and not dead code waiting
// to be revived. This is the version this component shipped with, left here
// because the difference between it and the one below is the whole point.
//
// `insertAdjacentHTML` hands the string to the HTML parser, so a `<` inside
// post.title is markup, not text. The source is a third-party API response,
// which makes this a DOM XSS sink even though nothing exploits it today.
// A `<script>` inserted this way does *not* run — which is exactly why the
// obvious payload makes the code look safe — but `<img src=x onerror=…>` and
// `<svg onload=…>` do.
//
// function renderPosts(list, posts) {
//   posts.forEach((post) => {
//     const li = document.createElement('li');
//     li.insertAdjacentHTML(
//       'afterbegin',
//       `<div class="post-container"><img src="https://picsum.photos/seed/${Math.random() * 1000}/600/400"></div>
//         <div><h2>${post.title}</h2><p>${post.body}</p></div>`
//     );
//     list.append(li);
//   });
// }

// Building the nodes directly keeps the API response away from the parser:
// textContent cannot produce an element, so there is nothing to escape and
// nothing to get wrong later. The image is decorative — the post text says
// everything it says — so it takes an empty alt rather than a description.
function renderPosts(list, posts) {
  posts.forEach((post) => {
    const li = document.createElement('li');

    const figure = document.createElement('div');
    figure.className = 'post-container';

    // Seeding from the post id instead of Math.random() * 1000 buys three
    // things: no float in the URL, no collisions (that range gave 100 posts a
    // 99.4% chance of at least one repeated image), and a stable picture per
    // post, so a reload does not reshuffle the feed.
    // Lazy is right here and wrong in the carousel: a post further down the
    // feed arrives by scrolling and may never be reached, which is exactly
    // the case the attribute was made for.
    const img = document.createElement('img');
    img.src = `https://picsum.photos/seed/${post.id}/600/400`;
    img.alt = '';
    // setAttribute rather than img.loading, which jsdom does not reflect onto
    // the attribute — the test would then assert a property no browser reads.
    img.setAttribute('loading', 'lazy');
    figure.append(img);

    const title = document.createElement('h2');
    title.textContent = post.title;

    const body = document.createElement('p');
    body.textContent = post.body;

    const text = document.createElement('div');
    text.append(title, body);

    li.append(figure, text);
    list.append(li);
  });
}

// Enhances every feed inside `root`, which is what makes markup added after
// load workable — call it again with the new subtree. Feeds already carrying
// data-enhanced are skipped, so a second call cannot double-bind. Returns a
// function that aborts any request still in flight and disconnects every
// observer this call started.
export function initScroll(root = document) {
  const controller = new AbortController();
  const { signal } = controller;
  const observers = [];

  root.querySelectorAll('.scroll-feed').forEach((feed) => {
    const feedEl = feed;
    if (feedEl.dataset.enhanced === 'true') return;

    const list = feedEl.querySelector('.post-list');
    const status = feedEl.querySelector('.scroll-status');
    const moreButton = feedEl.querySelector('.scroll-more');
    if (!list || !status || !moreButton) return;

    feedEl.dataset.enhanced = 'true';

    let page = 1;
    let loading = false;
    let finished = false;
    let observer;

    // aria-busy is the part a screen reader acts on — it marks the list as
    // mid-update so its contents are not announced half-written.
    //
    // The button is marked aria-disabled rather than disabled, because a
    // disabled element cannot hold focus: pressing Enter would drop the
    // reader onto the body and leave them tabbing from the top of the page
    // to get back. It still reads as unavailable, and the guard in loadPosts
    // already ignores the press it no longer blocks.
    function setLoading(busy) {
      list.setAttribute('aria-busy', busy ? 'true' : 'false');
      moreButton.setAttribute('aria-disabled', busy ? 'true' : 'false');
    }

    async function loadPosts() {
      // Without this guard two overlapping calls both read the same `page` —
      // the increment only happens once the response is in — and the same five
      // posts get appended twice.
      if (loading || finished) return;
      loading = true;
      setLoading(true);
      status.textContent = 'Loading more posts…';

      try {
        const url = `${API_URL}?_page=${page}&_limit=${PAGE_SIZE}`;
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`Request failed with ${res.status}`);
        const posts = await res.json();

        if (posts.length === 0) {
          finished = true;
          observer.disconnect();
          moreButton.hidden = true;
          status.textContent = 'No more posts.';
          return;
        }

        renderPosts(list, posts);
        page += 1;
        // The posts themselves are the announcement here, so the region goes
        // quiet. Only the two endings a reader cannot discover by scrolling
        // further — nothing left, or nothing arrived — keep their wording.
        status.textContent = '';
      } catch (error) {
        // The cleanup function aborts in-flight requests, so this rejection is
        // the component being torn down, not a failure worth reporting.
        if (error.name === 'AbortError') return;
        status.textContent = 'Could not load more posts.';
        return;
      } finally {
        loading = false;
        setLoading(false);
      }

      // The observer only fires when the intersection *changes*, so if the
      // posts just appended did not push the button back off screen no second
      // event is coming and the feed stalls with its trigger still in view.
      // Re-observing re-delivers the *current* state rather than a change,
      // which either restarts the loop or reports the button as gone. The
      // error path returns before this on purpose: a failure that retried
      // itself here would spin. Pressing the button is the retry instead.
      observer.unobserve(moreButton);
      observer.observe(moreButton);
    }

    feedEl.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest('.scroll-more');
        if (!button || !feedEl.contains(button)) return;
        loadPosts();
      },
      { signal }
    );

    observer = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1].isIntersecting) loadPosts();
    }, observerOptions);

    observer.observe(moreButton);
    observers.push(observer);
  });

  return () => {
    controller.abort();
    observers.forEach((observer) => observer.disconnect());
  };
}
