// What must never leave the device inside a crash report: invite links (they carry a group's
// keys) and anything that looks like a key or token. Group data itself does not reach reports:
// breadcrumbs of taps and console output are dropped before they are recorded (see index.js).

const INVITE = /ortakkasa:\/\/join\S*/gi;
// Keys, tokens and relay ids travel as base64url; nothing else in the app is this long without
// a space.
const SECRET = /[A-Za-z0-9_-]{32,}/g;
const REDACTED = '[redacted]';

export function scrubText(text) {
  return text.replace(INVITE, 'ortakkasa://join').replace(SECRET, REDACTED);
}

function scrubValue(value, depth) {
  if (typeof value === 'string') return scrubText(value);
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, scrubValue(item, depth + 1)]),
  );
}

// A copy of an event (or breadcrumb) with every string in it scrubbed.
export function scrub(value) {
  return scrubValue(value, 0);
}
