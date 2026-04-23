import { clean, shorten } from '../utils/helpers.js';
import { extractLinks } from './fileService.js';

const stopWords = new Set('the and for are with this that from your have has into onto over under about when where what which while been being than then they them their there here because each other using used use via per not but can could should would may might was were will shall do does did done if else also a an in on at by of to as is it or we you he she i our us'.split(' '));

const dedupe = arr => [...new Set(arr)];
const sentenceSplit = text => text.split(/(?<=[.!?])\s+|\n+/).map(s => clean(s)).filter(Boolean);
const paragraphSplit = text => text.split(/\n{2,}/).map(p => clean(p)).filter(Boolean);
const wordTokenize = text => (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []);
const normalizeText = raw => clean(String(raw || '')
  .replace(/\r/g, '\n')
  .replace(/[•●▪◦◆▶►]+/g, ' ')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n'));

let embeddingPipelinePromise = null;

function cosineSimilarity(v1, v2){
  if(!v1?.length || !v2?.length || v1.length !== v2.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for(let i = 0; i < v1.length; i++){
    dot += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

async function getEmbeddingPipeline(){
  if(typeof window === 'undefined' || !window.transformers?.pipeline) return null;
  if(!embeddingPipelinePromise){
    embeddingPipelinePromise = window.transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2').catch(() => null);
  }
  return embeddingPipelinePromise;
}

function avgPoolEmbedding(output){
  const data = output?.data;
  const dims = output?.dims || [];
  if(!data || !dims.length) return [];
  const hiddenSize = dims[dims.length - 1];
  const tokens = data.length / hiddenSize;
  if(!tokens || !hiddenSize) return [];
  const pooled = new Array(hiddenSize).fill(0);
  for(let t = 0; t < tokens; t++){
    const offset = t * hiddenSize;
    for(let h = 0; h < hiddenSize; h++) pooled[h] += data[offset + h];
  }
  for(let h = 0; h < hiddenSize; h++) pooled[h] /= tokens;
  return pooled;
}

async function embedTexts(texts){
  const pipe = await getEmbeddingPipeline();
  if(!pipe) return null;
  const vectors = [];
  for(const text of texts){
    const out = await pipe(text, { pooling:'mean', normalize:true });
    const vec = out?.data ? Array.from(out.data) : avgPoolEmbedding(out);
    vectors.push(vec?.length ? vec : avgPoolEmbedding(out));
  }
  return vectors.every(v => v?.length) ? vectors : null;
}

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
    .slice(0, 18)
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

function chunkByMeaning(paragraphs){
  const chunks = [];
  let current = [];
  paragraphs.forEach(paragraph => {
    if(paragraph.length > 420){
      if(current.length) chunks.push(current.join(' '));
      const sentences = sentenceSplit(paragraph);
      const grouped = [];
      let bucket = [];
      sentences.forEach(s => {
        bucket.push(s);
        if(bucket.join(' ').length > 260){
          grouped.push(bucket.join(' '));
          bucket = [];
        }
      });
      if(bucket.length) grouped.push(bucket.join(' '));
      chunks.push(...grouped);
      current = [];
      return;
    }
    current.push(paragraph);
    if(current.join(' ').length > 300){
      chunks.push(current.join(' '));
      current = [];
    }
  });
  if(current.length) chunks.push(current.join(' '));
  return dedupe(chunks.map(c => clean(c)).filter(c => c.length > 30));
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
  return { dates, organizations };
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

function cardsFromEntities(sentences, entities, cards, seen){
  entities.dates.slice(0, 8).forEach(date => {
    const hit = sentences.find(s => s.includes(date) && s.length <= 190) || `Review the key event described for ${date}.`;
    pushCard(cards, seen, `What happened in ${date}?`, hit);
  });
  entities.organizations.slice(0, 6).forEach(org => {
    const hit = sentences.find(s => s.includes(org) && s.length <= 190) || `${org} appears as an important organization in this material.`;
    pushCard(cards, seen, `What does ${org} do?`, hit);
  });
}

function cardsFromComplexSections(chunks, cards, seen){
  const denseChunks = chunks.filter(c => c.dense).sort((a, b) => b.complexityScore - a.complexityScore).slice(0, 6);
  denseChunks.forEach(chunk => {
    chunk.sentences.slice(0, 2).forEach((sentence, idx) => {
      if(sentence.length < 24 || sentence.length > 190) return;
      pushCard(cards, seen, idx === 0 ? 'What is this concept explaining?' : 'What is another key fact from this section?', sentence);
    });
  });
}

function fallbackCards(sentences, cards, seen){
  for(const s of sentences){
    if(s.length < 24 || s.length > 170) continue;
    const words = wordTokenize(s).filter(w => w.length > 3 && !stopWords.has(w));
    if(!words.length) continue;
    const front = `What is ${words[0]}?`;
    if(pushCard(cards, seen, front, s) && cards.length >= 24) break;
  }
}

function buildRuleBasedCards({ definitions, chunks, keyConcepts, sentences, entities, cards, seen }){
  cardFromDefinition(definitions, cards, seen);
  keyConcepts.slice(0, 10).forEach(concept => {
    const hitChunk = chunks.find(chunk => chunk.sentences.some(s => new RegExp(`\\b${concept.term}\\b`, 'i').test(s)));
    const sentence = hitChunk?.sentences.find(s => s.length >= 20 && s.length <= 180 && new RegExp(`\\b${concept.term}\\b`, 'i').test(s));
    if(!sentence) return;
    pushCard(cards, seen, `What is ${concept.term}?`, sentence);
  });
  cardsFromEntities(sentences, entities, cards, seen);
  cardsFromComplexSections(chunks, cards, seen);
  if(cards.length < 8) fallbackCards(sentences, cards, seen);
}

async function cardsFromTransformers({ concepts, sections, sentences, cards, seen }){
  if(!concepts.length || !sections.length || !sentences.length) return { used:false, added:0 };
  const conceptPrompts = concepts.slice(0, 12).map(c => `Concept: ${c.term}. Define it and explain what it does.`);
  const sentencePool = sentences.filter(s => s.length > 20 && s.length < 200).slice(0, 120);
  const corpus = dedupe([...sections.slice(0, 24), ...sentencePool]);
  const vectors = await embedTexts([...conceptPrompts, ...corpus]);
  if(!vectors) return { used:false, added:0 };

  let added = 0;
  conceptPrompts.forEach((prompt, idx) => {
    const conceptVec = vectors[idx];
    const ranked = corpus
      .map((text, cIdx) => ({ text, score:cosineSimilarity(conceptVec, vectors[conceptPrompts.length + cIdx]) }))
      .filter(item => item.score > 0.24)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    if(!ranked.length) return;
    const explanation = shorten(ranked.map(r => r.text).join(' '), 180);
    if(pushCard(cards, seen, `What is ${concepts[idx].term}?`, explanation)) added++;

    const relationHit = ranked.find(r => / is | means | refers to | consists of | used to /i.test(r.text));
    if(relationHit && pushCard(cards, seen, `What does ${concepts[idx].term} do?`, relationHit.text)) added++;
  });

  return { used:added > 0, added };
}

export async function generateStudyCards(rawText){
  const normalizedText = normalizeText(rawText);
  const paragraphs = dedupe(paragraphSplit(normalizedText));
  const text = paragraphs.join('\n\n');
  const sentences = sentenceSplit(text);
  const sections = chunkByMeaning(paragraphs);
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

  let transformerUsed = false;
  try {
    const semanticResult = await cardsFromTransformers({ concepts:keyConcepts, sections, sentences, cards, seen });
    transformerUsed = semanticResult.used;
  } catch (e) {
    transformerUsed = false;
  }

  if(cards.length < 12) buildRuleBasedCards({ definitions, chunks, keyConcepts, sentences, entities, cards, seen });

  const references = [
    ...links.map(l => `Reference link found: ${l}`),
    ...entities.dates.map(d => `Date detected: ${d}`),
    ...entities.organizations.map(o => `Organization detected: ${o}`),
    transformerUsed ? 'AI mode: Transformers.js semantic analysis enabled.' : 'AI mode: Rule-based fallback (Transformers.js unavailable).'
  ];

  return {
    summary: summary || 'Summary unavailable. Review extracted text and edit cards as needed.',
    keyConcepts: keyConcepts.map(k => k.term),
    cards: cards.length ? cards.slice(0, 60) : [{ front:'What is the main idea of this file?', back:'Edit this card manually after reviewing extracted text.' }],
    references,
    fallbackText: text.slice(0, 5000)
  };
}
