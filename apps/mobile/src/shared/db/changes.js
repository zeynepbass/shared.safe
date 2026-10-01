const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyChange(tables) {
  const changed = new Set(tables);
  listeners.forEach((listener) => listener(changed));
}
