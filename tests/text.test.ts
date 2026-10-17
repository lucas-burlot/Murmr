import { describe, expect, it } from 'vitest';
import { cleanupSystemPrompt, countWords, filterHallucination, sanitizeLlmOutput, vocabularyPrompt } from '../src/main/text';

describe('filterHallucination', () => {
  it.each(["Sous-titres réalisés par la communauté d'Amara.org", 'Merci d’avoir regardé !', ' Thank you for watching. '])(
    'drops the known Whisper hallucination %j',
    (text) => expect(filterHallucination(text)).toBe(''),
  );

  it('keeps real speech', () => {
    expect(filterHallucination(' Merci pour ton retour. ')).toBe('Merci pour ton retour.');
  });
});

describe('sanitizeLlmOutput', () => {
  it.each([
    ['Bonjour à tous.', 'Bonjour à tous.'],
    ['« Bonjour à tous. »', 'Bonjour à tous.'],
    ['"Hello."', 'Hello.'],
    ['<transcription>\nBonjour.\n</transcription>', 'Bonjour.'],
    ['<think>hmm</think>\nBonjour.', 'Bonjour.'],
  ])('%j -> %j', (raw, expected) => expect(sanitizeLlmOutput(raw)).toBe(expected));
});

describe('dictionary', () => {
  it('builds the Whisper vocabulary prompt from trimmed words', () => {
    expect(vocabularyPrompt([' Septeo ', '', 'Kubernetes'])).toBe('Septeo, Kubernetes');
  });

  it('adds spelling rules to the cleanup prompt only when words exist', () => {
    expect(cleanupSystemPrompt([])).not.toContain('Spell these terms');
    expect(cleanupSystemPrompt(['Septeo'])).toContain('Spell these terms exactly like this: Septeo');
  });
});

it('counts words', () => {
  expect(countWords('  un deux\ntrois  ')).toBe(3);
});
