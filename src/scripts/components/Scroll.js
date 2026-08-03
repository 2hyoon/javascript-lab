const API_URL = 'https://jsonplaceholder.typicode.com/posts';
const PAGE_SIZE = 5;

const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.5,
};

function renderPosts(list, posts) {
  posts.forEach((post) => {
    const li = document.createElement('li');
    li.insertAdjacentHTML(
      'afterbegin',
      `<div class="post-container"><img src="https://picsum.photos/seed/${Math.random() * 1000}/600/400"></div>
        <div><h2>${post.title}</h2><p>${post.body}</p></div>`
    );
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
    const sentinel = feedEl.querySelector('.sentinel');
    if (!list || !sentinel) return;

    feedEl.dataset.enhanced = 'true';

    let page = 1;
    let loading = false;
    let finished = false;
    let observer;

    async function loadPosts() {
      // Without this guard two overlapping calls both read the same `page` —
      // the increment only happens once the response is in — and the same five
      // posts get appended twice.
      if (loading || finished) return;
      loading = true;

      try {
        const url = `${API_URL}?_page=${page}&_limit=${PAGE_SIZE}`;
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`Request failed with ${res.status}`);
        const posts = await res.json();

        if (posts.length === 0) {
          finished = true;
          observer.disconnect();
          sentinel.textContent = '더 이상 게시글 없음';
          return;
        }

        renderPosts(list, posts);
        page += 1;
      } catch (error) {
        // The cleanup function aborts in-flight requests, so this rejection is
        // the component being torn down, not a failure worth reporting.
        if (error.name === 'AbortError') return;
        sentinel.textContent = '게시글을 불러오지 못함';
        return;
      } finally {
        loading = false;
      }

      // The observer only fires when the intersection *changes*, so if the
      // posts just appended did not push the sentinel back off screen no
      // second event is coming and the feed stalls with its trigger still in
      // view. Re-observing re-delivers the *current* state rather than a
      // change, which either restarts the loop or reports the sentinel gone.
      // The error path returns before this on purpose: a failure that retried
      // itself here would spin.
      observer.unobserve(sentinel);
      observer.observe(sentinel);
    }

    observer = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1].isIntersecting) loadPosts();
    }, observerOptions);

    observer.observe(sentinel);
    observers.push(observer);
  });

  return () => {
    controller.abort();
    observers.forEach((observer) => observer.disconnect());
  };
}
