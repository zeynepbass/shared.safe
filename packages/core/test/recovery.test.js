import {
  isRecoveryWord,
  normalizePhrase,
  phraseFromSecret,
  recoveryChallenge,
  secretFromPhrase,
} from '../src/recovery.js';
import { sodium } from './sodium.js';

describe('recovery phrases', () => {
  it('are 12 words that give back the secret', () => {
    const secret = sodium.randombytes_buf(16);
    const words = phraseFromSecret(secret);
    expect(words).toHaveLength(12);
    expect(words.every(isRecoveryWord)).toBe(true);
    expect(secretFromPhrase(words.join(' '))).toEqual(secret);
  });

  it('forgive spacing and capitals but not a wrong word', () => {
    const secret = sodium.randombytes_buf(16);
    const words = phraseFromSecret(secret);
    expect(secretFromPhrase(`  ${words.join('   ').toUpperCase()}\n`)).toEqual(secret);
    expect(normalizePhrase(' A  b ')).toBe('a b');

    const swapped = [...words];
    const other = words.findIndex((w) => w !== words[0]);
    [swapped[0], swapped[other]] = [swapped[other], swapped[0]];
    const typo = [...words.slice(0, 11), 'notaword'];
    // The checksum catches most swaps; a swap can still be valid by chance, never equal though.
    expect(secretFromPhrase(swapped.join(' '))).not.toEqual(secret);
    expect(secretFromPhrase(typo.join(' '))).toBeNull();
    expect(secretFromPhrase(words.slice(0, 11).join(' '))).toBeNull();
    expect(secretFromPhrase('')).toBeNull();
  });

  it('ask for three positions in order, each with the right word among three', () => {
    const words = phraseFromSecret(sodium.randombytes_buf(16));
    for (let run = 0; run < 50; run += 1) {
      const challenge = recoveryChallenge(words);
      expect(challenge).toHaveLength(3);
      const positions = challenge.map((c) => c.index);
      expect(new Set(positions).size).toBe(3);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      for (const { index, word, choices } of challenge) {
        expect(word).toBe(words[index]);
        expect(choices).toHaveLength(3);
        expect(new Set(choices).size).toBe(3);
        expect(choices).toContain(word);
      }
    }
  });
});
