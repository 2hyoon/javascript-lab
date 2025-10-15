document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="scroll"]')) return;

  let page = 1;
  const limit = 5;
  // let loading = false;
  let observer;

  const list = document.getElementById('post-list');
  const sentinel = document.getElementById('sentinel');

  const options = {
    root: null, // 기본: 뷰포트 (지정 시 조상 요소)
    rootMargin: '0px', // 루트 주변 여백 (예: "10px 20px")
    threshold: 0.5, // 임계값: 50% 가시성 시 콜백 (배열로 여러 값 가능)
  };

  async function loadPosts() {
    // if(loading) return;
    // loading = true;

    const url = `https://jsonplaceholder.typicode.com/posts?_page=${page}&_limit=${limit}`;
    const res = await fetch(url);
    const posts = await res.json();

    // 데이터가 없으면 observer 해제
    if (posts.length === 0) {
      sentinel.textContent = '더 이상 게시글 없음';
      observer.unobserve(sentinel);
      return;
    }

    posts.forEach((post) => {
      const li = document.createElement('li');
      li.insertAdjacentHTML(
        'afterbegin',
        `<div class="post-container"><img src="https://picsum.photos/seed/${Math.random() * 1000}/600/400"></div>
        <div><h2>${post.title}</h2><p>${post.body}</p></div>`
      );
      list.append(li);
    });

    page += 1;
    // loading = false;
  }

  function callback(entries, observer) {
    // entries.forEach((entry) => {
    //   console.log(entry);
    //   if (entry.isIntersecting) {
    //     // 요소가 보일 때 처리 (예: 이미지 로드)
    //     console.log(`가시성 비율: ${entry.intersectionRatio}`);
    //   }
    // });

    if (entries[0].isIntersecting) {
      loadPosts();
    }

    // const [entry] = entries;
    // if (entry.isIntersecting && !loading) {
    //   loadPosts();
    // }
  }

  observer = new IntersectionObserver(callback, options);
  observer.observe(sentinel);
});
