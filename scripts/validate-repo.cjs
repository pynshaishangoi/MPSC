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
const polityBatch = jsonFile('question-batches/2026-11-03-polity.json');
if (polityBatch.questions.length !== 12 || polityBatch.questionIdRange !== '7001-7012' || polityBatch.subjects.Polity !== 12) fail('3 November Polity batch count or ID range is incorrect');
for (const question of polityBatch.questions) {
  if (!question.e || question.e.length < 120 || !question.source || !question.sourceURL || !question.verificationStatus || question.difficulty === 'PYQ') fail('Polity practice question ' + question.id + ' needs an explanation, source and non-PYQ label');
}
const gkBatch = jsonFile('question-batches/2026-11-03-gktoday-gs.json');
if (gkBatch.questions.length !== 16 || gkBatch.questionIdRange !== '7101-7116' || !gkBatch.subjects || Object.values(gkBatch.subjects).reduce((sum,value)=>sum+value,0)!==16) fail('GKToday-inspired GS batch count, ID range or subject totals are incorrect');
for (const question of gkBatch.questions) {
  if (!question.e || question.e.length < 120 || !question.source || !question.sourceURL || !question.sourceURL.startsWith('https://') || !question.verificationStatus || question.difficulty === 'PYQ') fail('GKToday-inspired question ' + question.id + ' needs a substantial explanation, source and non-PYQ verification label');
}
if (!script.includes("2026-11-03-gktoday-gs.json") || !sw.includes('./question-batches/2026-11-03-gktoday-gs.json')) fail('GKToday-inspired GS batch is not loaded and precached');
const currentBatch = jsonFile('question-batches/2026-11-04-current-affairs.json');
if (currentBatch.questions.length !== 6 || currentBatch.questions.map(q=>q.id).join(',') !== '7137,7138,7139,7140,7141,7142') fail('4 November current-affairs batch count or ID range is incorrect');
for (const question of currentBatch.questions) if (!question.e || question.e.length < 100 || !question.sourceURL || !question.verificationStatus || question.difficulty === 'PYQ') fail('current-affairs practice question ' + question.id + ' needs explanation, source and non-PYQ label');
if (!script.includes("2026-11-04-current-affairs.json") || !sw.includes('./question-batches/2026-11-04-current-affairs.json')) fail('4 November current-affairs batch is not loaded and precached');
if (!script.includes('x.sourceURL||x.sourceUrl')) fail('question source links are not rendered in explanations');
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
if (active.length !== 821 || active.filter(q=>q.difficulty==='PYQ').length !== 111) fail('active question or PYQ-tagged totals do not match the audited counts');
if (batchFiles.length !== 12) fail('expected exactly 12 loaded question batches');
const orphanBatchFiles = walkJson('question-batches').map(file => path.basename(file)).filter(name => !batchFiles.includes(name));
if (orphanBatchFiles.length) fail('orphaned question-batch files are not loaded: ' + orphanBatchFiles.join(', '));
const expectedSubjectCounts = {"Aptitude":32,"Arithmetic":160,"Art & Culture":1,"Books & Authors":1,"Computer":11,"Current Affairs":44,"Economy":46,"English":145,"Environment":27,"General Science":10,"Geography":43,"GST / Inspector of Taxes":15,"History":49,"International Organisations":1,"Meghalaya GK":58,"Officer Technical":17,"Polity":76,"Reasoning":35,"Science":47,"Static GK":3};
const actualSubjectCounts = {};
for (const question of active) {
  const subject = question.cat.replace(/ • PYQ$/, '');
  actualSubjectCounts[subject] = (actualSubjectCounts[subject] || 0) + 1;
}
const actualSubjectEntries = Object.entries(actualSubjectCounts).sort((a,b)=>a[0].localeCompare(b[0]));
const expectedSubjectEntries = Object.entries(expectedSubjectCounts).sort((a,b)=>a[0].localeCompare(b[0]));
if (JSON.stringify(actualSubjectEntries) !== JSON.stringify(expectedSubjectEntries)) fail('active subject counts do not match the audited blueprint');
const feed = jsonFile('current-affairs/2026-11-02.json');
if (feed.items.length !== 3 || new Set(feed.items.map(item => item.id)).size !== feed.items.length) fail('2 November current-affairs feed must contain three uniquely identified items');
for (const item of feed.items) {
  if (!item.sourceURL || !item.sourceURL.startsWith('https://') || !item.publishedDate || item.publishedDate > feed.date || !item.verificationStatus) fail('current-affairs item ' + item.id + ' has incomplete date/source metadata');
}
if (!sw.includes('./current-affairs/2026-11-01.json')) fail('service worker does not precache the 1 November current-affairs feed');
if (!sw.includes('./current-affairs/2026-11-02.json')) fail('service worker does not precache the 2 November current-affairs feed');
if (!sw.includes('./current-affairs/2026-11-03.json')) fail('service worker does not precache the 3 November current-affairs feed');
if (!sw.includes('./question-batches/2026-11-01-lda-pyq.json')) fail('service worker does not precache the LDA PYQ batch');
if (!sw.includes('./question-batches/2026-11-02-lda-pyq.json') || !sw.includes('./question-batches/2026-11-02.json')) fail('service worker does not precache the 2 November question batches');
if (!sw.includes('./question-batches/2026-11-03-polity.json') || !sw.includes('./explanations/polity.json') || !sw.includes('./explanations/general-studies.json') || !sw.includes('./explanations/gst.json') || !sw.includes('./explanations/current-affairs.json')) fail('service worker does not precache all detailed explanation libraries');
if (!script.includes("fetch('./explanations/polity.json')") || !script.includes("fetch('./explanations/general-studies.json')") || !script.includes("fetch('./explanations/gst.json')") || !script.includes("fetch('./explanations/current-affairs.json')") || !script.includes('const detailPacks=bs.splice(-5)')) fail('all detailed explanation libraries are not loaded');
for (const file of ['manifest.json', ...walkJson('question-batches'), ...walkJson('current-affairs'), ...walkJson('audit'), ...walkJson('data'), ...walkJson('explanations')]) jsonFile(file);
const historyLibrary = jsonFile('explanations/history.json');
const polityLibrary = jsonFile('explanations/polity.json');
const historyIds = active.filter(q => /^History/.test(q.cat)).map(q => String(q.id));
const polityIds = active.filter(q => /^Polity/.test(q.cat)).map(q => String(q.id));
if (Object.keys(historyLibrary.explanations || {}).length !== historyIds.length || historyIds.some(id => !historyLibrary.explanations[id])) fail('History explanations do not cover every active History question ID');
if (Object.keys(polityLibrary.explanations || {}).length !== polityIds.length || polityIds.some(id => !polityLibrary.explanations[id])) fail('Polity explanations do not cover every active Polity question ID');
const gsLibrary = jsonFile('explanations/general-studies.json');
const gstLibrary = jsonFile('explanations/gst.json');
const caLibrary = jsonFile('explanations/current-affairs.json');
const gsIds = ['7103','7104','7107','7108','7109','7110','7111','7112','7113','7114','7115','7116'];
const gstIds = ['3008','5038','5039','5085','5086','6128','6129','6156','6157','6196','6197','6228','6229','6230','6244'];
const caIds = ['7137','7138','7139','7140','7141','7142'];
for (const [name,library,ids] of [['General Studies',gsLibrary,gsIds],['GST',gstLibrary,gstIds],['Current Affairs',caLibrary,caIds]]) {
  if (Object.keys(library.explanations || {}).length !== ids.length || ids.some(id => !library.explanations[id])) fail(name + ' explanation library does not cover its audited question IDs');
}
const allStructured = new Set([...Object.keys(historyLibrary.explanations),...Object.keys(polityLibrary.explanations),...Object.keys(gsLibrary.explanations),...Object.keys(gstLibrary.explanations),...Object.keys(caLibrary.explanations)]);
if (allStructured.size !== 158) fail('structured explanation total must be 158 unique active IDs');
const coverageAudit = jsonFile('audit/explanation-coverage-2026-11-04.json');
if (coverageAudit.summary.activeUniqueQuestionRecords !== 821 || coverageAudit.summary.structuredExplanationQuestionIds !== 158 || coverageAudit.summary.structuredDetailedExplanationIds !== 158) fail('explanation coverage audit totals do not match');
const coverageRows = Object.fromEntries(coverageAudit.subjects.map(row=>[row.subject,row]));
for (const [subject,count] of expectedSubjectEntries) {
  const row = coverageRows[subject];
  if (!row || row.activeQuestionCount !== count || row.remainingCount !== count-row.detailedExplanationCount || row.detailedQuestionIds.length !== row.detailedExplanationCount || row.remainingQuestionIds.length !== row.remainingCount) fail('explanation coverage row is inconsistent for ' + subject);
}
const examAudit = jsonFile('audit/exam-blueprint-2026-11-04.json');
if (examAudit.date !== '2026-11-04' || examAudit.examTracks.length !== 3 || examAudit.questionBankSnapshot.activeUniqueQuestionRecords !== 821) fail('exam blueprint audit is incomplete');

const notesMatch = script.match(/const STUDY_NOTES=\[([\s\S]*?)\];\s*function renderStudyNotes/);
if (!notesMatch) fail('could not locate Study Notes library');
const noteSource = notesMatch[1];
const subjectCount = (noteSource.match(/\{id:'/g) || []).length;
const chapterCount = (noteSource.match(/\['[^']+',\[/g) || []).length;
if (subjectCount !== 14 || chapterCount !== 37) fail('Study Notes expected 14 subjects / 37 chapters, found ' + subjectCount + ' / ' + chapterCount);
if (!noteSource.includes('Agriculture, millets & local livelihoods') || !noteSource.includes('Scrutiny and evidence-led return review') || !noteSource.includes('State finance & Union tax devolution') || !noteSource.includes('Finance Commission, tax devolution & grants') || !noteSource.includes('Cryosphere & climate overshoot')) fail('new Study Notes chapters are missing');
if (!script.includes("const key='mpscV4'")) fail('local progress storage key changed unexpectedly');
if (!script.includes('mpscTopicPracticeSelectionV1') || !script.includes('function subjectTopicMatches') || !script.includes('ACTIVE_SUBJECT_PRACTICE')) fail('topic-specific practice selection is missing');
if (!script.includes('paperComplete===true') || !script.includes('paperTotal')) fail('exact-paper completeness safeguard is missing');

console.log('Validation passed.');
console.log('Embedded questions: ' + embedded.length);
console.log('Loaded batches: ' + batchFiles.length + ' (' + batchFiles.join(', ') + ')');
console.log('Active unique question records: ' + active.length);
console.log('PYQ-tagged active records: ' + active.filter(q => q.difficulty === 'PYQ').length + ' (not complete papers)');
console.log('LDA Secretariat Series I: ' + paperQuestions.length + '/150 transcribed and key-checked; 59 remain');
console.log('Study Notes: ' + subjectCount + ' subjects, ' + chapterCount + ' chapters');
console.log('Structured explanations: ' + allStructured.size + ' unique IDs across History, Polity, General Studies, GST and Current Affairs');
const latestFeed = jsonFile('current-affairs/2026-11-03.json');
if (latestFeed.items.length !== 6 || latestFeed.items.some(item=>!item.sourceURL || !item.publishedDate || !item.verificationStatus)) fail('3 November current-affairs feed is incomplete');
console.log('Current affairs: ' + latestFeed.items.length + ' dated, source-linked stories in the 3 November feed');
console.log('Service-worker cache: ' + cacheVersion);
console.log('Local progress key and exact-paper guard preserved.');
