import { clean, shorten } from '../utils/helpers.js';
import { extractLinks } from './fileService.js';

const stopWords = new Set('the and for are with this that from your have has into onto over under about when where what which while been being than then they them their there here because each other using used use via per not but can could should would may might was were will shall do does did done if else also a an in on at by of to as is it or we you he she i our us'.split(' '));

const dedupe = arr => [...new Set(arr)];
const sentenceSplit = text => text.split(/(?<=[.!?])\s+|\n+/).map(s => clean(s)).filter(Boolean);
const paragraphSplit = text => text.split(/\n{2,}/).map(p => clean(p)).filter(Boolean);
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
    .slice(0, 15)
    .map(([word, count]) => ({ term:word, frequency:count }));
}

function buildConceptChunks(paragraphs){
  const chunks = [];
  paragraphs.forEach((paragraph, idx) => {
    const sentences = sentenceSplit(paragraph);
    if(!sentences.length) return;
    const avgSentenceLen = sentences.reduce((sum, s) => sum + wordTokenize(s).length, 0) / sentences.length;
    const complexityScore = avgSentenceLen + Math.max(0, sentences.length - 2) * 2;
    chunks.push({ id:idx, paragraph, sentences, complexityScore, dense:complexityScore >= 22 || paragraph.length > 260 });
  });
  return chunks;
}

function extractDefinitions(sentences){
  const defs = [];
  const patterns = [
    /^(?:definition:\s*)?([A-Z][\w\s-]{1,70}?)\s+is\s+(.{8,220})$/i,
    /^([A-Z][\w\s-]{1,70}?)\s+refers to\s+(.{8,220})$/i,
    /^([A-Z][\w\s-]{1,70}?)\s+means\s+(.{8,220})$/i,
    /^Definition:\s*([A-Z][\w\s-]{1,70}?)\s*[—:-]\s*(.{8,220})$/i
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
  const dates = dedupe((text.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}|\d{4})\b/gi) || [])).slice(0, 12);
  const organizations = dedupe((text.match(/\b(?:[A-Z][A-Za-z&.-]+(?:\s+[A-Z][A-Za-z&.-]+){0,3}\s(?:University|Institute|Corporation|Corp\.?|Inc\.?|Ltd\.?|Agency|Department|Committee|Council|Organization|Organisation|Company))\b/g) || [])).slice(0, 10);
  const names = dedupe((text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) || [])).filter(n => !organizations.some(org => org.includes(n))).slice(0, 14);
  return { dates, organizations, names };
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
    .slice(0, Math.min(4, sentences.length))
    .sort((a, b) => a.idx - b.idx)
    .map(x => x.s)
    .join(' ');
}

function pushCard(cards, seen, front, back){
  const trimmedFront = shorten(clean(front), 90);
  const trimmedBack = shorten(clean(back), 180);
  if(!trimmedFront || !trimmedBack || trimmedBack.length < 8) return false;
  const key = `${trimmedFront.toLowerCase()}|${trimmedBack.toLowerCase()}`;
  if(seen.has(key)) return false;
  seen.add(key);
  cards.push({ front:trimmedFront, back:trimmedBack });
  return true;
}

function cardFromDefinition(definitions, cards, seen){
  definitions.forEach(def => pushCard(cards, seen, `What is ${def.concept}?`, def.definition));
}

function cardFromConceptSentences(chunks, keyConcepts, cards, seen){
  keyConcepts.slice(0, 10).forEach(concept => {
    const hitChunk = chunks.find(chunk => chunk.sentences.some(s => new RegExp(`\\b${concept.term}\\b`, 'i').test(s)));
    if(!hitChunk) return;
    const sentence = hitChunk.sentences.find(s => s.length >= 20 && s.length <= 180 && new RegExp(`\\b${concept.term}\\b`, 'i').test(s));
    if(!sentence) return;
    pushCard(cards, seen, `What should you know about ${concept.term}?`, sentence);
  });
}

function cardsFromEntities(sentences, entities, cards, seen){
  entities.dates.slice(0, 8).forEach(date => {
    const hit = sentences.find(s => s.includes(date) && s.length <= 190) || `Review the key event described for ${date}.`;
    pushCard(cards, seen, `What happened in ${date}?`, hit);
  });
  entities.organizations.slice(0, 6).forEach(org => {
    const hit = sentences.find(s => s.includes(org) && s.length <= 190) || `${org} appears as an important organization in this material.`;
    pushCard(cards, seen, `Why is ${org} important?`, hit);
  });
  entities.names.slice(0, 8).forEach(name => {
    const hit = sentences.find(s => s.includes(name) && s.length <= 190) || `${name} is highlighted in this material.`;
    pushCard(cards, seen, `Who is ${name}?`, hit);
  });
}

function cardsFromComplexSections(chunks, cards, seen){
  const denseChunks = chunks.filter(c => c.dense).sort((a, b) => b.complexityScore - a.complexityScore).slice(0, 6);
  denseChunks.forEach(chunk => {
    chunk.sentences.slice(0, 2).forEach((sentence, idx) => {
      if(sentence.length < 24 || sentence.length > 190) return;
      pushCard(cards, seen, idx === 0 ? 'Break down this complex idea.' : 'What is another key detail from this section?', sentence);
    });
  });
}

function fallbackCards(sentences, cards, seen){
  for(const s of sentences){
    if(s.length < 24 || s.length > 170) continue;
    const words = wordTokenize(s).filter(w => w.length > 3 && !stopWords.has(w));
    if(!words.length) continue;
    const front = `What should you know about ${words[0]}?`;
    if(pushCard(cards, seen, front, s) && cards.length >= 24) break;
  }
}

export function generateStudyCards(rawText){
  const normalizedText = normalizeText(rawText);
  const paragraphs = dedupe(paragraphSplit(normalizedText));
  const text = paragraphs.join('\n\n');
  const sentences = sentenceSplit(text);
  const chunks = buildConceptChunks(paragraphs);
  const words = wordTokenize(text);
  const freq = extractWordFrequency(words);
  const keyConcepts = pickKeyConcepts(freq);
  const definitions = extractDefinitions(sentences);
  const summary = shorten(summarize(sentences, freq) || text, 320);
  const entities = detectEntities(text);
  const links = extractLinks(text);

  const cards = [];
  const seen = new Set();
  cardFromDefinition(definitions, cards, seen);
  cardFromConceptSentences(chunks, keyConcepts, cards, seen);
  cardsFromEntities(sentences, entities, cards, seen);
  cardsFromComplexSections(chunks, cards, seen);
  if(cards.length < 8) fallbackCards(sentences, cards, seen);

  const references = [
    ...links.map(l => `Reference link found: ${l}`),
    ...entities.dates.map(d => `Date detected: ${d}`),
    ...entities.organizations.map(o => `Organization detected: ${o}`),
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
