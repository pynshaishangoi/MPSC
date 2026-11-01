'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fail(message) {
  console.error('VALIDATION FAILED: ' + message);
  process.exit(1);
}
function jsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(file + ' is not valid JSON: ' + error.message); }
}
function walkJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkJson(full) : (entry.name.endsWith('.json') ? [full] : []);
  });
}

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) fail('index.html has no inline application script');
const script = scriptMatch[1];
try { new vm.Script(script, { filename: 'index.html inline script' }); }
catch (error) { fail('inline JavaScript syntax: ' + error.message); }

const qMatch = script.match(/const Q=(\[[\s\S]*?\]);const high=/);
if (!qMatch) fail('could not locate embedded question array');
let embedded;
try { embedded = JSON.parse(qMatch[1]); }
catch (error) { fail('embedded question array is not valid JSON: ' + error.message); }

const loaderStart = script.indexOf('Promise.all([');
const loaderEnd = script.indexOf('].map(function(u)', loaderStart);
if (loaderStart < 0 || loaderEnd < 0) fail('could not locate additive question-batch loader');
const loaderText = script.slice(loaderStart, loaderEnd);
const batchFiles = [...loaderText.matchAll(/'\.\/question-batches\/([^']+\.json)'/g)].map(match => match[1]);
if (!batchFiles.length) fail('question-batch loader has no files');

const sw = fs.readFileSync('sw.js', 'utf8');
const cacheVersion = (sw.match(/const CACHE="([^"]+)"/) || [])[1];
if (!cacheVersion || !/^mpsc-smart-study-v5-\d+-\d{8}$/.test(cacheVersion)) fail('service-worker cache version is missing or malformed');

const active = [...embedded];
const idSet = new Set();
for (const question of embedded) {
  const id = String(question.id);
  if (idSet.has(id)) fail('duplicate embedded question ID ' + id);
  idSet.add(id);
}
for (const name of batchFiles) {
  const file = path.join('question-batches', name);
  if (!fs.existsSync(file)) fail('loader references missing file ' + file);
  if (!sw.includes('./question-batches/' + name)) fail('service worker does not precache ' + name);
  const batch = jsonFile(file);
  if (!Array.isArray(batch.questions) || batch.questionCount !== batch.questions.length) fail(name + ' questionCount does not match its records');
  if (batch.subjects && Object.values(batch.subjects).reduce((sum, value) => sum + value, 0) !== batch.questions.length) fail(name + ' subject totals do not match its records');
  for (const question of batch.questions) {
    const id = String(question.id);
    if (idSet.has(id)) fail('duplicate active question ID ' + id + ' in ' + name);
    idSet.add(id);
    active.push(question);
  }
}
for (const question of active) {
  if (!question.q || !Array.isArray(question.o) || question.o.length !== 4) fail('question ' + question.id + ' must have a prompt and exactly four options');
  if (!Number.isInteger(question.a) || question.a < 0 || question.a >= question.o.length) fail('question ' + question.id + ' has an invalid answer index');
}
const newBatch = jsonFile('question-batches/2026-11-01.json');
if (newBatch.questions.length !== 8 || newBatch.questionIdRange !== '6241-6248') fail('1 November batch count or ID range is incorrect');
for (const question of newBatch.questions) {
  if (!question.e || question.e.length < 120 || !question.source || !question.verificationStatus) fail('new question ' + question.id + ' needs a substantial explanation and source/verification label');
}
const feed = jsonFile('current-affairs/2026-11-01.json');
if (feed.items.length !== 3 || new Set(feed.items.map(item => item.id)).size !== feed.items.length) fail('1 November current-affairs feed must contain three uniquely identified items');
for (const item of feed.items) {
  if (!item.sourceURL || !item.sourceURL.startsWith('https://') || !item.publishedDate || item.publishedDate > feed.date || !item.verificationStatus) fail('current-affairs item ' + item.id + ' has incomplete date/source metadata');
}
if (!sw.includes('./current-affairs/2026-11-01.json')) fail('service worker does not precache the 1 November current-affairs feed');
for (const file of ['manifest.json', ...walkJson('question-batches'), ...walkJson('current-affairs'), ...walkJson('audit'), ...walkJson('data')]) jsonFile(file);

const notesMatch = script.match(/const STUDY_NOTES=\[([\s\S]*?)\];\s*function renderStudyNotes/);
if (!notesMatch) fail('could not locate Study Notes library');
const noteSource = notesMatch[1];
const subjectCount = (noteSource.match(/\{id:'/g) || []).length;
const chapterCount = (noteSource.match(/\['[^']+',\[/g) || []).length;
if (subjectCount !== 14 || chapterCount !== 34) fail('Study Notes expected 14 subjects / 34 chapters, found ' + subjectCount + ' / ' + chapterCount);
if (!noteSource.includes('Agriculture, millets & local livelihoods') || !noteSource.includes('Scrutiny and evidence-led return review')) fail('new Study Notes chapters are missing');
if (!script.includes("const key='mpscV4'")) fail('local progress storage key changed unexpectedly');
if (!script.includes('paperComplete===true') || !script.includes('paperTotal')) fail('exact-paper completeness safeguard is missing');

console.log('Validation passed.');
console.log('Embedded questions: ' + embedded.length);
console.log('Loaded batches: ' + batchFiles.length + ' (' + batchFiles.join(', ') + ')');
console.log('Active unique question records: ' + active.length);
console.log('PYQ-tagged embedded items: ' + embedded.filter(q => q.difficulty === 'PYQ').length + ' (not complete papers)');
console.log('Study Notes: ' + subjectCount + ' subjects, ' + chapterCount + ' chapters');
console.log('Current affairs: ' + feed.items.length + ' dated, source-linked stories');
console.log('Service-worker cache: ' + cacheVersion);
console.log('Local progress key and exact-paper guard preserved.');
