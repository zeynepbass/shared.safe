import { Automerge } from './automerge.js';

// Automerge 2.2's JS view of a document (`doc.foo`) can keep showing the local value after a
// concurrent remote write has won, so two devices would read different data. The WebAssembly
// state is always right, so every read in core goes through here instead of the view.

const OBJECT_TYPES = new Set(['map', 'list', 'text', 'table']);

function objectAt(backend, path) {
  let obj = '_root';
  for (const key of path) {
    const entry = backend.getWithType(obj, key);
    if (!entry || !OBJECT_TYPES.has(entry[0])) return null;
    obj = entry[1];
  }
  return obj;
}

// Plain value at `path` (e.g. ['expenses', id]); undefined when missing.
export function readAt(doc, path = []) {
  const backend = Automerge.getBackend(doc);
  if (path.length === 0) return backend.materialize('_root');
  const parent = objectAt(backend, path.slice(0, -1));
  if (parent === null) return undefined;
  const entry = backend.getWithType(parent, path[path.length - 1]);
  if (!entry) return undefined;
  const [type, value] = entry;
  return OBJECT_TYPES.has(type) ? backend.materialize(value) : value;
}

// Every concurrent value of `key` under `path`, winner first; a single entry when there is no
// conflict. Order is by operation id, so it is the same on every device.
export function readAllAt(doc, path, key) {
  const backend = Automerge.getBackend(doc);
  const parent = objectAt(backend, path);
  if (parent === null) return [];
  const winner = backend.getWithType(parent, key);
  const all = backend
    .getAll(parent, key)
    .map(([type, value]) =>
      OBJECT_TYPES.has(type)
        ? { id: value, value: backend.materialize(value) }
        : { id: null, value },
    );
  if (winner && OBJECT_TYPES.has(winner[0])) {
    all.sort((a, b) => (a.id === winner[1] ? -1 : b.id === winner[1] ? 1 : 0));
  }
  return all.map((entry) => entry.value);
}
