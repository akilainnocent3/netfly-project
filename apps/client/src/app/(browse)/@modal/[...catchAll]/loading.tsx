// The modal slot needs its own (empty) loading boundary: without one, a navigation that clears
// the slot waits for the server, and the page's loading.tsx can't show straight away.
export default function NoModalLoading() {
  return null;
}
