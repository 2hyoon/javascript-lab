// Both covered components export an init, so a test renders a fixture and
// calls it. Nothing subscribes to DOMContentLoaded at import time any more,
// which is what the removed `mount` helper existed to work around.
export function resetDocument() {
  document.body.innerHTML = '';
}
