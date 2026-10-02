import { scrub, scrubEvent, scrubText } from '../scrub';

const KEY = 'q83vEjRWeJ_rze8SNFZ4mKvN7wAJEjRWeJ_rze8SNFY';
const GROUP = '0b9b7c1e-6f0a-4f6e-9d57-3c1f2a9e8b11';
const INVITE = `ortakkasa://join?g=${GROUP}&k=${KEY}`;

describe('scrubText', () => {
  it('removes everything after the scheme of an invite link', () => {
    expect(scrubText(`Could not open ${INVITE} (offline)`)).toBe(
      'Could not open ortakkasa://join (offline)',
    );
  });

  it('removes keys, tokens and ids wherever they appear', () => {
    expect(scrubText(`token ${KEY} rejected`)).toBe('token [redacted] rejected');
    expect(scrubText(`group ${GROUP} not found`)).toBe('group [redacted] not found');
  });

  it('leaves ordinary messages alone', () => {
    const message = 'Shares (9999) do not add up to 10000';
    expect(scrubText(message)).toBe(message);
  });
});

describe('scrub', () => {
  it('reaches strings nested in objects and arrays', () => {
    expect(scrub({ data: { to: INVITE, tries: 2 }, list: [KEY, null] })).toEqual({
      data: { to: 'ortakkasa://join', tries: 2 },
      list: ['[redacted]', null],
    });
  });
});

describe('scrubEvent', () => {
  const event = {
    event_id: 'c0ffee00c0ffee00c0ffee00c0ffee00',
    message: `Invite ${INVITE}`,
    transaction: 'groups/[groupId]/index',
    exception: { values: [{ type: 'Error', value: `bad key ${KEY}`, stacktrace: { frames: [] } }] },
    breadcrumbs: [{ category: 'navigation', data: { to: `/join?k=${KEY}` } }],
    extra: { link: INVITE },
    spans: [{ span_id: 'a1b2c3d4e5f60718', description: `GET ${KEY}`, op: 'db.init' }],
    debug_meta: { images: [{ debug_id: GROUP, type: 'sourcemap' }] },
    contexts: { trace: { trace_id: 'c0ffee00c0ffee00c0ffee00c0ffee00' } },
  };
  const scrubbed = scrubEvent(event);

  it('scrubs the text an event carries', () => {
    expect(scrubbed.message).toBe('Invite ortakkasa://join');
    expect(scrubbed.exception.values[0].value).toBe('bad key [redacted]');
    expect(scrubbed.breadcrumbs[0].data.to).toBe('/join?k=[redacted]');
    expect(scrubbed.extra.link).toBe('ortakkasa://join');
    expect(scrubbed.spans[0].description).toBe('GET [redacted]');
    expect(JSON.stringify(scrubbed)).not.toContain(KEY);
  });

  it('keeps what a report is matched to its source and trace with', () => {
    expect(scrubbed.event_id).toBe(event.event_id);
    expect(scrubbed.transaction).toBe('groups/[groupId]/index');
    expect(scrubbed.debug_meta).toEqual(event.debug_meta);
    expect(scrubbed.contexts).toEqual(event.contexts);
    expect(scrubbed.spans[0].span_id).toBe('a1b2c3d4e5f60718');
    expect(scrubbed.exception.values[0].stacktrace).toEqual({ frames: [] });
  });

  it('does not change the event it was given', () => {
    expect(event.message).toBe(`Invite ${INVITE}`);
  });
});
