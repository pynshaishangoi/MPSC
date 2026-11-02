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
if (newBatch.questions.length !== 8 || newBatch.questionIdRange !== '6241-6248') fail('1 November practice batch count or ID range is incorrect');
for (const question of newBatch.questions) {
  if (!question.e || question.e.length < 120 || !question.source || !question.verificationStatus) fail('new question ' + question.id + ' needs a substantial explanation and source/verification label');
}
const ldaBatch = jsonFile('question-batches/2026-11-01-lda-pyq.json');
const expectedNewPaperNos = [26,29,30,...Array.from({length:17},(_,i)=>i+51)];
if (ldaBatch.questions.length !== 20 || JSON.stringify(ldaBatch.questions.map(q=>q.paperNo)) !== JSON.stringify(expectedNewPaperNos)) fail('LDA PYQ batch count or printed question numbers are incorrect');
for (const question of ldaBatch.questions) {
  if (question.paperId !== 'lda-secretariat-may-2025-series-i' || question.paperVerified !== true || question.paperComplete !== false || question.paperTotal !== 150 || question.sourceURL !== 'https://mpsc.meghalaya.gov.in/finalanswerkey/lda%20may%2025.pdf') fail('LDA PYQ ' + question.paperNo + ' is missing verified paper metadata or must remain incomplete');
  if (!question.e || question.e.length < 120 || !question.source || !question.verificationStatus) fail('LDA PYQ ' + question.paperNo + ' needs an explanation and verification label');
}
const ldaBatch2 = jsonFile('question-batches/2026-11-02-lda-pyq.json');
const expectedPaperNos2 = Array.from({length:24},(_,i)=>i+68);
if (ldaBatch2.questions.length !== 24 || JSON.stringify(ldaBatch2.questions.map(q=>q.paperNo)) !== JSON.stringify(expectedPaperNos2)) fail('2 November LDA PYQ batch count or printed question numbers are incorrect');
for (const question of ldaBatch2.questions) {
  if (question.paperId !== 'lda-secretariat-may-2025-series-i' || question.paperVerified !== true || question.paperComplete !== false || question.paperTotal !== 150 || question.sourceURL !== 'https://mpsc.meghalaya.gov.in/finalanswerkey/lda%20may%2025.pdf') fail('LDA PYQ ' + question.paperNo + ' is missing verified paper metadata or must remain incomplete');
  if (!question.e || question.e.length < 120 || !question.source || !question.verificationStatus) fail('LDA PYQ ' + question.paperNo + ' needs an explanation and verification label');
}
const caBatch2 = jsonFile('question-batches/2026-11-02.json');
if (caBatch2.questions.length !== 3 || caBatch2.questionIdRange !== '6249-6251') fail('2 November current-affairs practice batch count or ID range is incorrect');
for (const question of caBatch2.questions) {
  if (!question.e || question.e.length < 120 || !question.source || !question.verificationStatus || question.difficulty === 'PYQ') fail('current-affairs practice question ' + question.id + ' needs an explanation, source label and non-PYQ status');
}
const officialKey = {"1":"D","2":"B","3":"D","4":"A","5":"D","6":"B","7":"A","8":"D","9":"B","10":"C","11":"B","12":"C","13":"B","14":"D","15":"C","16":"D","17":"C","18":"A","19":"B","20":"C","21":"B","22":"D","23":"A","24":"B","25":"C","26":"C","27":"D","28":"D","29":"B","30":"D","31":"C","32":"D","33":"A","34":"B","35":"C","36":"A","37":"D","38":"A","39":"B","40":"C","41":"C","42":"B","43":"D","44":"C","45":"A","46":"A","47":"C","48":"A","49":"B","50":"D","51":"B","52":"B","53":"A","54":"A","55":"C","56":"A","57":"B","58":"A","59":"A","60":"C","61":"C","62":"A","63":"C","64":"D","65":"C","66":"B","67":"D","68":"C","69":"D","70":"D","71":"D","72":"B","73":"C","74":"C","75":"B","76":"D","77":"B","78":"C","79":"C","80":"D","81":"B","82":"B","83":"C","84":"C","85":"A","86":"C","87":"B","88":"B","89":"C","90":"C","91":"A"};
const paperQuestions = active.filter(q => q.paperId === 'lda-secretariat-may-2025-series-i');
if (paperQuestions.length !== 91 || new Set(paperQuestions.map(q=>q.paperNo)).size !== 91) fail('LDA Secretariat Series I must have 91 unique transcribed question numbers');
for (let number = 1; number <= 91; number++) {
  const question = paperQuestions.find(q=>q.paperNo===number);
  if (!question || !question.paperVerified || question.paperComplete !== false || question.paperTotal !== 150) fail('LDA Series I printed question ' + number + ' is missing or incorrectly marked');
  if ('ABCD'[question.a] !== officialKey[number]) fail('LDA Series I answer for printed question ' + number + ' does not match the official final key');
}
if (!paperQuestions.find(q=>q.paperNo===27).o[3].includes('why IS she sketching')) fail('Q27 source/key anomaly must remain visible');
if (!paperQuestions.find(q=>q.paperNo===30).verificationStatus.includes('unusual reporting verb')) fail('Q30 official-key anomaly must remain flagged');
if (active.length !== 787 || active.filter(q=>q.difficulty==='PYQ').length !== 111) fail('active question or PYQ-tagged totals do not match the audited counts');
const feed = jsonFile('current-affairs/2026-11-02.json');
if (feed.items.length !== 3 || new Set(feed.items.map(item => item.id)).size !== feed.items.length) fail('2 November current-affairs feed must contain three uniquely identified items');
for (const item of feed.items) {
  if (!item.sourceURL || !item.sourceURL.startsWith('https://') || !item.publishedDate || item.publishedDate > feed.date || !item.verificationStatus) fail('current-affairs item ' + item.id + ' has incomplete date/source metadata');
}
if (!sw.includes('./current-affairs/2026-11-01.json')) fail('service worker does not precache the 1 November current-affairs feed');
if (!sw.includes('./current-affairs/2026-11-02.json')) fail('service worker does not precache the 2 November current-affairs feed');
if (!sw.includes('./question-batches/2026-11-01-lda-pyq.json')) fail('service worker does not precache the LDA PYQ batch');
if (!sw.includes('./question-batches/2026-11-02-lda-pyq.json') || !sw.includes('./question-batches/2026-11-02.json')) fail('service worker does not precache the 2 November question batches');
for (const file of ['manifest.json', ...walkJson('question-batches'), ...walkJson('current-affairs'), ...walkJson('audit'), ...walkJson('data')]) jsonFile(file);

const notesMatch = script.match(/const STUDY_NOTES=\[([\s\S]*?)\];\s*function renderStudyNotes/);
if (!notesMatch) fail('could not locate Study Notes library');
const noteSource = notesMatch[1];
const subjectCount = (noteSource.match(/\{id:'/g) || []).length;
const chapterCount = (noteSource.match(/\['[^']+',\[/g) || []).length;
if (subjectCount !== 14 || chapterCount !== 37) fail('Study Notes expected 14 subjects / 37 chapters, found ' + subjectCount + ' / ' + chapterCount);
if (!noteSource.includes('Agriculture, millets & local livelihoods') || !noteSource.includes('Scrutiny and evidence-led return review') || !noteSource.includes('State finance & Union tax devolution') || !noteSource.includes('Finance Commission, tax devolution & grants') || !noteSource.includes('Cryosphere & climate overshoot')) fail('new Study Notes chapters are missing');
if (!script.includes("const key='mpscV4'")) fail('local progress storage key changed unexpectedly');
if (!script.includes('paperComplete===true') || !script.includes('paperTotal')) fail('exact-paper completeness safeguard is missing');

console.log('Validation passed.');
console.log('Embedded questions: ' + embedded.length);
console.log('Loaded batches: ' + batchFiles.length + ' (' + batchFiles.join(', ') + ')');
console.log('Active unique question records: ' + active.length);
console.log('PYQ-tagged active records: ' + active.filter(q => q.difficulty === 'PYQ').length + ' (not complete papers)');
console.log('LDA Secretariat Series I: ' + paperQuestions.length + '/150 transcribed and key-checked; 59 remain');
console.log('Study Notes: ' + subjectCount + ' subjects, ' + chapterCount + ' chapters');
console.log('Current affairs: ' + feed.items.length + ' dated, source-linked stories in the 2 November feed');
console.log('Service-worker cache: ' + cacheVersion);
console.log('Local progress key and exact-paper guard preserved.');
