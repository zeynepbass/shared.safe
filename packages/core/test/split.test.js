import { allocateProportionally, computeSplit, FULL_PERCENT } from '../src/split.js';

const members = (...ids) => ids.map((memberId) => ({ memberId }));
const sum = (shares) => shares.reduce((total, s) => total + s.amount, 0);

describe('allocateProportionally', () => {
  it('always distributes the exact total', () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(124000, [1, 1, 1])).toEqual([41334, 41333, 41333]);
  });

  it('gives leftover cents to the largest fractional parts first', () => {
    expect(allocateProportionally(1000, [1, 2])).toEqual([333, 667]);
  });

  it('never assigns cents to zero-weight entries', () => {
    expect(allocateProportionally(101, [0, 1, 1])).toEqual([0, 51, 50]);
  });

  it('returns zeros when there is nothing to allocate', () => {
    expect(allocateProportionally(0, [1, 1])).toEqual([0, 0]);
    expect(allocateProportionally(500, [0, 0])).toEqual([0, 0]);
  });
});

describe('computeSplit', () => {
  it('splits equally with the leftover kuruş assigned deterministically', () => {
    const result = computeSplit({
      total: 124000,
      type: 'equal',
      participants: members('a', 'b', 'c'),
    });
    expect(result.valid).toBe(true);
    expect(result.shares.map((s) => s.amount)).toEqual([41334, 41333, 41333]);
    expect(sum(result.shares)).toBe(124000);
  });

  it('skips participants that are not included', () => {
    const result = computeSplit({
      total: 1000,
      type: 'equal',
      participants: [{ memberId: 'a' }, { memberId: 'b', included: false }, { memberId: 'c' }],
    });
    expect(result.shares.map((s) => s.memberId)).toEqual(['a', 'c']);
    expect(result.shares.map((s) => s.amount)).toEqual([500, 500]);
  });

  it('reports the remaining amount for exact-amount splits', () => {
    const participants = [
      { memberId: 'a', weight: 15000 },
      { memberId: 'b', weight: 20000 },
      { memberId: 'c', weight: 13640 },
    ];
    const result = computeSplit({ total: 48640, type: 'amount', participants });
    expect(result.valid).toBe(true);
    expect(result.remaining).toBe(0);

    const short = computeSplit({ total: 50000, type: 'amount', participants });
    expect(short.valid).toBe(false);
    expect(short.remaining).toBe(1360);
  });

  it('splits by percent once the percentages add up to 100', () => {
    const result = computeSplit({
      total: 10001,
      type: 'percent',
      participants: [
        { memberId: 'a', weight: 5000 },
        { memberId: 'b', weight: 2500 },
        { memberId: 'c', weight: 2500 },
      ],
    });
    expect(result.valid).toBe(true);
    expect(sum(result.shares)).toBe(10001);
    expect(result.shares[0].amount).toBe(5001);
  });

  it('rejects percentages that do not add up to 100', () => {
    const result = computeSplit({
      total: 10000,
      type: 'percent',
      participants: [
        { memberId: 'a', weight: 5000 },
        { memberId: 'b', weight: 4000 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.remaining).toBe(FULL_PERCENT - 9000);
  });

  it('splits by shares proportionally', () => {
    const result = computeSplit({
      total: 90000,
      type: 'shares',
      participants: [
        { memberId: 'a', weight: 2 },
        { memberId: 'b', weight: 1 },
      ],
    });
    expect(result.shares.map((s) => s.amount)).toEqual([60000, 30000]);
  });

  it('is invalid when nobody is included', () => {
    const result = computeSplit({
      total: 1000,
      type: 'equal',
      participants: [{ memberId: 'a', included: false }],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('noParticipants');
  });
});
