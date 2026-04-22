import { clean, shorten } from '../utils/helpers.js';
import { extractLinks } from './fileService.js';

const stopWords = new Set('the and for are with this that from your have has into onto over under about when where what which while been being than then they them their there here because each other using used use via per not but can could should would may might was were will shall do does did done if else also a an in on at by of to as is it or we you he she i our us'.split(' '));

const dedupe = arr => [...new Set(arr)];
const sentenceSplit = text => text.split(/(?<=[.!?])\s+|\n+/).map(s => clean(s)).filter(Boolean);
const wordTokenize = text => (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []);
const normalizeText = raw => clean(String(raw || '').replace(/\r/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n'));

function extractWordFrequency(words){
  const freq = new Map();
  words.forEach(w => {
    if(w.length < 3 || stopWords.has(w)) return;
    freq.set(w, (freq.get(w) || 0) + 1);
  });
  return freq;
}

function pickKeyConcepts(freq){
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, 12)
    .map(([word, count]) => ({ term:word, frequency:count }));
}

function extractDefinitions(sentences){
  const defs = [];
  const patterns = [
    /^(?:definition:\s*)?([A-Z][\w\s-]{1,70}?)\s+is\s+(.{8,220})$/i,
    /^([A-Z][\w\s-]{1,70}?)\s+refers to\s+(.{8,220})$/i,
    /^([A-Z][\w\s-]{1,70}?)\s+means\s+(.{8,220})$/i
  ];
  sentences.forEach(s => {
    const normalized = s.replace(/[.]+$/,'').trim();
    for(const p of patterns){
      const m = normalized.match(p);
      if(!m) continue;
      defs.push({ concept:clean(m[1]), definition:shorten(clean(m[2]), 180) });
      break;
    }
  });
  return defs;
}

function detectEntities(text){
  const dates = dedupe((text.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4})\b/gi) || [])).slice(0, 8);
  const emails = dedupe((text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [])).slice(0, 8);
  const names = dedupe((text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) || [])).slice(0, 10);
  return { dates, emails, names };
}

function summarize(sentences, freq){
  if(!sentences.length) return '';
  const maxFreq = Math.max(...freq.values(), 1);
  const scored = sentences.map((s, idx) => {
    const words = wordTokenize(s);
    const freqScore = words.reduce((sum, w) => sum + ((freq.get(w) || 0) / maxFreq), 0) / Math.max(words.length, 1);
    const posScore = 1 - (idx / Math.max(1, sentences.length - 1)) * 0.35;
    return { s, idx, score:freqScore + posScore };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, sentences.length))
    .sort((a, b) => a.idx - b.idx)
    .map(x => x.s)
    .join(' ');
}

function cardFromDefinition(definitions, cards, seen){
  definitions.forEach(def => {
    const front = `What is ${def.concept}?`;
    const back = shorten(def.definition, 160);
    const key = `${front.toLowerCase()}|${back.toLowerCase()}`;
    if(seen.has(key) || back.length < 8) return;
    seen.add(key);
    cards.push({ front, back });
  });
}

function cardFromConceptSentences(sentences, keyConcepts, cards, seen){
  keyConcepts.slice(0, 8).forEach(concept => {
    const hit = sentences.find(s => new RegExp(`\\b${concept.term}\\b`, 'i').test(s) && s.length >= 20 && s.length <= 180);
    if(!hit) return;
    const front = `Explain ${concept.term}.`;
    const back = shorten(hit, 160);
    const key = `${front.toLowerCase()}|${back.toLowerCase()}`;
    if(seen.has(key)) return;
    seen.add(key);
    cards.push({ front, back });
  });
}

function fallbackCards(sentences, cards, seen){
  for(const s of sentences){
    if(s.length < 24 || s.length > 170) continue;
    const words = wordTokenize(s).filter(w => w.length > 3 && !stopWords.has(w));
    if(!words.length) continue;
    const front = `What should you know about ${words[0]}?`;
    const back = shorten(s, 150);
    const key = `${front.toLowerCase()}|${back.toLowerCase()}`;
    if(seen.has(key)) continue;
    seen.add(key);
    cards.push({ front, back });
    if(cards.length >= 24) break;
  }
}

export function generateStudyCards(rawText){
  const normalizedText = normalizeText(rawText);
  const paragraphs = dedupe(normalizedText.split('\n').map(clean).filter(Boolean));
  const text = paragraphs.join('\n');
  const sentences = sentenceSplit(text);
  const words = wordTokenize(text);
  const freq = extractWordFrequency(words);
  const keyConcepts = pickKeyConcepts(freq);
  const definitions = extractDefinitions(sentences);
  const summary = shorten(summarize(sentences, freq) || text, 280);
  const entities = detectEntities(text);
  const links = extractLinks(text);

  const cards = [];
  const seen = new Set();
  cardFromDefinition(definitions, cards, seen);
  cardFromConceptSentences(sentences, keyConcepts, cards, seen);
  if(cards.length < 6) fallbackCards(sentences, cards, seen);

  const references = [
    ...links.map(l => `Reference link found: ${l}`),
    ...entities.dates.map(d => `Date detected: ${d}`),
    ...entities.emails.map(e => `Email detected: ${e}`),
    ...entities.names.slice(0, 6).map(n => `Name detected: ${n}`)
  ];

  return {
    summary: summary || 'Summary unavailable. Review extracted text and edit cards as needed.',
    keyConcepts: keyConcepts.map(k => k.term),
    cards: cards.length ? cards.slice(0, 60) : [{ front:'What is the main idea of this file?', back:'Edit this card manually after reviewing extracted text.' }],
    references,
    fallbackText: text.slice(0, 5000)
  };
}
