function throttle(func, delay) {
  let timer = null;
  return function(...args) {
    if (!timer) {
      timer = setTimeout(() => {
        func.apply(this, args);
        timer = null;
      }, delay);
    }
  };
}

// 사용 예시
const throttledScroll = throttle(() => {
  console.log('스크롤 이벤트 처리 중...');
}, 1000);

window.addEventListener('scroll', throttledScroll);
