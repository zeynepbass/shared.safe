// What must never leave the device inside a crash report: invite links (they carry a group's
// keys) and anything that looks like a key, a token or an id. Group data itself does not reach
// reports: breadcrumbs of taps and console output are dropped before they are recorded (see
// index.js).

const INVITE = /ortakkasa:\/\/join\S*/gi;
// Keys, tokens and ids travel as base64url or UUIDs; nothing else in the app is this long
// without a space.
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

// A copy of `value` with every string in it scrubbed.
export function scrub(value) {
  return scrubValue(value, 0);
}

// Scrubs the parts of an event that carry text from the app. The rest (stack frames, debug ids,
// trace ids) is what the report is matched to its source with and is left alone.
export function scrubEvent(event) {
  const scrubbed = { ...event };
  if (typeof event.message === 'string') scrubbed.message = scrubText(event.message);
  if (typeof event.transaction === 'string') scrubbed.transaction = scrubText(event.transaction);
  if (event.exception?.values) {
    scrubbed.exception = {
      ...event.exception,
      values: event.exception.values.map((exception) =>
        typeof exception.value === 'string'
          ? { ...exception, value: scrubText(exception.value) }
          : exception,
      ),
    };
  }
  for (const field of ['breadcrumbs', 'extra', 'request']) {
    if (event[field]) scrubbed[field] = scrub(event[field]);
  }
  if (event.spans) {
    scrubbed.spans = event.spans.map((span) => ({
      ...span,
      description:
        typeof span.description === 'string' ? scrubText(span.description) : span.description,
    }));
  }
  return scrubbed;
}
