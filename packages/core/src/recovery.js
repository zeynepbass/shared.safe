import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// The recovery phrase: 12 BIP-39 words encoding a 16-byte secret (plus a checksum, so a typo is
// caught before anything is tried). The secret is what identityFromSecret derives everything
// from; the words are only a way to write it down.

export const RECOVERY_WORD_COUNT = 12;
export const RECOVERY_SECRET_BYTES = 16;

export function normalizePhrase(text) {
  return (text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

export function phraseFromSecret(secret) {
  return entropyToMnemonic(secret, wordlist).split(' ');
}

// Returns the secret, or null if the words are not a valid phrase.
export function secretFromPhrase(text) {
  const phrase = normalizePhrase(text);
  if (phrase.split(' ').length !== RECOVERY_WORD_COUNT) return null;
  if (!validateMnemonic(phrase, wordlist)) return null;
  return mnemonicToEntropy(phrase, wordlist);
}

export const isRecoveryWord = (word) => wordlist.includes(word);

// Picks `count` positions to ask for, in order, each with three choices: the right word and two
// other words from the same phrase, shuffled. `random` returns a float in [0, 1).
export function recoveryChallenge(words, { count = 3, random = Math.random } = {}) {
  const pick = (pool) => pool.splice(Math.floor(random() * pool.length), 1)[0];
  const positions = [...words.keys()];
  const asked = Array.from({ length: count }, () => pick(positions)).sort((a, b) => a - b);
  return asked.map((index) => {
    const others = [...new Set(words.filter((w) => w !== words[index]))];
    const choices = [words[index], pick(others), pick(others)];
    for (let i = choices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return { index, word: words[index], choices };
  });
}
