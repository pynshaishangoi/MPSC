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

const qMatch = script.match(/const Q=(\[[\s\S]*?\]);(?:document\.getElementById\(["']qCount["']\)\.textContent=Q\.length;)?const high=/);
if (!qMatch) fail('could not locate embedded question array');
let embedded;
try { embedded = JSON.parse(qMatch[1]); }
catch (error) { fail('embedded question array is not valid JSON: ' + error.message); }

const sw = fs.readFileSync('sw.js', 'utf8');
const cacheVersion = (sw.match(/const CACHE="([^"]+)"/) || [])[1];
if (!cacheVersion || !/^mpsc-smart-study-v5-\d+-\d{8}$/.test(cacheVersion)) fail('service-worker cache version is missing or malformed');
const qCountMarkup = html.match(/id=["']qCount["'][^>]*>([^<]*)</);
if (!qCountMarkup || /^\d+$/.test(qCountMarkup[1].trim())) fail('dashboard question count must not be hardcoded');
if (!/qCount[^;]*Q\.length/.test(script)) fail('dashboard count must be derived from Q.length');
if (/fetch\(['"]\.\/question-batches\//.test(script)) fail('runtime question visibility must not depend on fetching question-batch archives');

const batchFiles = walkJson('question-batches').map(file => path.basename(file)).sort();
const active = [...embedded];
const idSet = new Set();
const embeddedById = new Map();
for (const question of embedded) {
  const id = String(question.id);
  if (idSet.has(id)) fail('duplicate embedded question ID ' + id);
  idSet.add(id);
  embeddedById.set(id, question);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const archiveIdSet = new Set();
let archiveCount = 0;
for (const name of batchFiles) {
  const file = path.join('question-batches', name);
  if (!sw.includes('./question-batches/' + name)) fail('service worker does not precache archive ' + name);
  const batch = jsonFile(file);
  if (!Array.isArray(batch.questions) || batch.questionCount !== batch.questions.length) fail(name + ' questionCount does not match its records');
  if (batch.subjects && Object.values(batch.subjects).reduce((sum, value) => sum + value, 0) !== batch.questions.length) fail(name + ' subject totals do not match its records');
  for (const question of batch.questions) {
    const id = String(question.id);
    if (archiveIdSet.has(id)) fail('duplicate ID across question-batch archives: ' + id);
    archiveIdSet.add(id);
    const live = embeddedById.get(id);
    if (!live) fail('archive question ' + id + ' is missing from canonical embedded Q');
    if (JSON.stringify(stable(live)) !== JSON.stringify(stable(question))) fail('archive record does not exactly match embedded Q for ID ' + id);
  }
  archiveCount += batch.questions.length;
}
if (embedded.length !== 973) fail('canonical embedded Q must contain 973 questions');
if (batchFiles.length !== 17 || archiveIdSet.size !== 381 || archiveCount !== 381) fail('all 17 question-batch archives must contain 381 unique mirrored records');
for (const question of active) {
  if (!question.q || !Array.isArray(question.o) || question.o.length !== 4) fail('question ' + question.id + ' must have a prompt and exactly four options');
  if (!Number.isInteger(question.a) || question.a < 0 || question.a >= question.o.length) fail('question ' + question.id + ' has an invalid answer index');
  if (!question.e) fail('question ' + question.id + ' is missing its inline explanation');
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
if (!sw.includes('./question-batches/2026-11-03-gktoday-gs.json')) fail('service worker does not precache GKToday-inspired GS archive');
const expansionBatch = jsonFile('question-batches/2026-11-14-subject-expansion.json');
if (expansionBatch.questions.length !== 12 || expansionBatch.questionIdRange !== '7201-7212' || Object.values(expansionBatch.subjects).reduce((sum,value)=>sum+value,0)!==12) fail('14 November subject expansion batch count, ID range or subject totals are incorrect');
for (const question of expansionBatch.questions) if (!question.e || question.e.length < 120 || !question.sourceURL || !question.verificationStatus || question.difficulty === 'PYQ') fail('14 November practice question needs a substantial explanation, source and non-PYQ label');
if (!sw.includes('./question-batches/2026-11-14-subject-expansion.json')) fail('service worker does not precache 14 November subject expansion archive');
const currentBatch = jsonFile('question-batches/2026-11-04-current-affairs.json');
if (currentBatch.questions.length !== 6 || currentBatch.questions.map(q=>q.id).join(',') !== '7137,7138,7139,7140,7141,7142') fail('4 November current-affairs batch count or ID range is incorrect');
for (const question of currentBatch.questions) if (!question.e || question.e.length < 100 || !question.sourceURL || !question.verificationStatus || question.difficulty === 'PYQ') fail('current-affairs practice question ' + question.id + ' needs explanation, source and non-PYQ label');
if (!sw.includes('./question-batches/2026-11-04-current-affairs.json')) fail('service worker does not precache 4 November current-affairs archive');
if (!script.includes('x.sourceURL||x.sourceUrl')) fail('question source links are not rendered in explanations');

const taxBatch = jsonFile('question-batches/2026-11-15-inspector-tax-technical.json');
if (taxBatch.questions.length !== 15 || taxBatch.questionIdRange !== '7213-7227' || taxBatch.subjects['GST / Inspector of Taxes'] !== 15) fail('15 November Inspector of Taxes batch count, ID range or subject total is incorrect');
for (const question of taxBatch.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 2 || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || !question.sourceURL || !question.sourceURL.startsWith('https://') || !question.verificationStatus || question.difficulty === 'PYQ') fail('Inspector of Taxes practice question ' + question.id + ' needs a distinct topic, exam tags, teaching explanation, official source and non-PYQ verification label');
  if (!question.sourceURL.startsWith('https://www.indiacode.nic.in/') && !question.sourceURL.startsWith('https://upload.indiacode.nic.in/') && !question.sourceURL.startsWith('https://cbic-gst.gov.in/')) fail('Inspector of Taxes practice question ' + question.id + ' must use an official statutory source');
}

const expansionBatch16 = jsonFile('question-batches/2026-11-16-original-practice.json');
if (expansionBatch16.questions.length !== 33 || expansionBatch16.questionIdRange !== '7228-7260' || Object.values(expansionBatch16.subjects).reduce((sum,value)=>sum+value,0)!==33) fail('16 November original-practice batch count, ID range or subject totals are incorrect');
for (const question of expansionBatch16.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 2 || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || !question.sourceURL || !question.sourceURL.startsWith('https://') || !question.verificationStatus || !question.verificationStatus.includes('2026-11-16') || question.difficulty === 'PYQ') fail('16 November practice question ' + question.id + ' needs a distinct topic, exam tags, teaching explanation, source and Original Practice label');
}
if (!sw.includes('./question-batches/2026-11-16-original-practice.json')) fail('service worker does not precache 16 November original-practice archive');
const expansionBatch18 = jsonFile('question-batches/2026-11-18-original-practice.json');
if (expansionBatch18.questions.length !== 42 || expansionBatch18.questionIdRange !== '9001-9050' || Object.values(expansionBatch18.subjects).reduce((sum,value)=>sum+value,0)!==42) fail('18 November original-practice batch count, ID range or subject totals are incorrect');
for (const question of expansionBatch18.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 2 || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || !question.sourceURL || !question.sourceURL.startsWith('https://') || !question.sourceVerifiedDate || question.sourceVerifiedDate !== '2026-11-18' || !question.verificationStatus || !question.verificationStatus.includes('2026-11-18') || question.difficulty === 'PYQ' || question.answerIndex !== question.a) fail('18 November question ' + question.id + ' needs topic/exam tags, explanation, source, date and Original Practice label');
}
if (!sw.includes('./question-batches/2026-11-18-original-practice.json')) fail('service worker does not precache 18 November original-practice archive');
const dedupIndex18 = jsonFile('audit/dedup-index-2026-11-18.json');
if (dedupIndex18.schemaVersion !== 3 || dedupIndex18.canonical.questionCount !== 923 || dedupIndex18.canonical.activeFingerprints.length !== 923 || dedupIndex18.officialPyq.questionCount !== 2433 || !dedupIndex18.officialPyq.fingerprints || dedupIndex18.archive.fileCount !== 16 || dedupIndex18.archive.questionCount !== 331) fail('18 November compact dedup index totals are incorrect');
if (new Set(dedupIndex18.canonical.activeFingerprints.map(record=>record.i)).size !== 923 || dedupIndex18.canonical.activeFingerprints.some(record=>!record.s || !record.o || !record.k)) fail('18 November active dedup index has duplicate IDs or missing fingerprints');
const dedupAudit18 = jsonFile('audit/dedup-audit-2026-11-18.json');
if (dedupAudit18.target !== 50 || dedupAudit18.draftedCandidates !== 50 || dedupAudit18.validatedUniqueQuestions !== 42 || dedupAudit18.collisions.candidateExactStemCollisions !== 0 || dedupAudit18.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit18.rejectedCandidates.length !== 8) fail('18 November candidate/dedup audit totals are incorrect');
const rampTracker = jsonFile('audit/campaign-tracker.json');
if (rampTracker.currentDailyTarget !== 50 || rampTracker.previousRun?.validatedQuestions !== 42 || rampTracker.latestRun?.target !== 50 || rampTracker.latestRun?.validatedQuestions !== 50 || ![0,50].includes(rampTracker.latestRun?.mergedQuestions) || !['pending_merge','merged'].includes(rampTracker.latestRun?.status) || ![50,70].includes(rampTracker.nextDailyTarget) || rampTracker.latestRun?.targetGatePassed !== true) fail('19 November ramp tracker is inconsistent with the 50-question run or its merge gate');


const expansionBatch19 = jsonFile('question-batches/2026-11-19-original-practice.json');
if (expansionBatch19.questions.length !== 50 || expansionBatch19.questionIdRange !== '9051-9100' || expansionBatch19.candidateCount !== 62 || expansionBatch19.rejectedCandidates !== 12 || Object.values(expansionBatch19.subjects).reduce((sum,value)=>sum+value,0)!==50) fail('19 November original-practice batch count, ID range, candidate or subject totals are incorrect');
for (const question of expansionBatch19.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 2 || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || question.sourceType !== 'Original Practice' || !question.sourceURL || !question.sourceURL.startsWith('https://') || question.sourceVerifiedDate !== '2026-11-19' || !question.verificationStatus || !question.verificationStatus.includes('2026-11-19') || question.difficulty === 'PYQ' || question.answerIndex !== question.a || question.o.length !== 4) fail('19 November question ' + question.id + ' needs topic/exam tags, four options, answer, teaching explanation, source and Original Practice label');
}
if (!sw.includes('./question-batches/2026-11-19-original-practice.json')) fail('service worker does not precache 19 November original-practice archive');
if (!html.includes('mpsc-build') || !html.includes('2026-11-19-original-practice-50')) fail('19 November canonical build marker is missing');
const dedupIndex19 = jsonFile('audit/dedup-index-2026-11-19.json');
if (dedupIndex19.schemaVersion !== 4 || dedupIndex19.canonical.questionCount !== 973 || dedupIndex19.canonical.activeFingerprints.length !== 973 || dedupIndex19.officialPyq.questionCount !== 2433 || dedupIndex19.archive.fileCount !== 17 || dedupIndex19.archive.questionCount !== 381) fail('19 November compact dedup index totals are incorrect');
if (new Set(dedupIndex19.canonical.activeFingerprints.map(record=>record.i)).size !== 973 || dedupIndex19.canonical.activeFingerprints.some(record=>!record.s || !record.o || !record.k)) fail('19 November active dedup index has duplicate IDs or missing fingerprints');
const dedupAudit19 = jsonFile('audit/dedup-audit-2026-11-19.json');
if (dedupAudit19.target !== 50 || dedupAudit19.draftedCandidates !== 62 || dedupAudit19.validatedUniqueQuestions !== 50 || dedupAudit19.rejectedCandidates.length !== 12 || dedupAudit19.collisions.candidateExactStemCollisions !== 0 || dedupAudit19.collisions.candidateOptionSetCollisions !== 0 || dedupAudit19.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit19.collisions.withinBatchNearPairs !== 0 || ![0,50].includes(dedupAudit19.mergedQuestions) || !['pending','merged'].includes(dedupAudit19.mergeStatus)) fail('19 November candidate/dedup audit totals are incorrect');

const dedupIndex16 = jsonFile('audit/dedup-index-2026-11-16.json');
if (dedupIndex16.schemaVersion !== 2 || dedupIndex16.questionCount !== 881 || dedupIndex16.records.length !== 881 || dedupIndex16.candidateBatchQuestionCount !== 33) fail('16 November deduplication index totals are incorrect');
if (new Set(dedupIndex16.records.map(record=>record.id)).size !== 881 || dedupIndex16.records.some(record=>!record.stemHash || !record.optionsHash || !record.conceptFingerprint)) fail('16 November deduplication index has duplicate IDs or missing fingerprints');

const dedupAudit16 = jsonFile('audit/dedup-audit-2026-11-16.json');
if (dedupAudit16.currentMain.activeQuestions !== 881 || dedupAudit16.currentMain.uniqueIDs !== 881 || dedupAudit16.change.merged !== 33 || dedupAudit16.fullBankChecks.candidateExactStemCollisions !== 0 || dedupAudit16.fullBankChecks.candidateNearPairsAtTokenJaccard082 !== 0) fail('16 November full-bank duplicate audit or merge totals are incorrect');
if (dedupAudit16.validation.githubActions.conclusion !== 'success' || dedupAudit16.validation.deployment !== 'not independently verified') fail('16 November audit validation/deployment status is inconsistent');


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
if (active.length !== 973 || active.filter(q=>q.difficulty==='PYQ').length !== 111) fail('active question or PYQ-tagged totals do not match the audited counts');
if (batchFiles.length !== 17) fail('expected exactly 17 archived question batches');
const expectedSubjectCounts = {"Aptitude":32,"Arithmetic":167,"Art & Culture":1,"Books & Authors":1,"Computer":28,"Current Affairs":47,"Economy":56,"English":154,"Environment":38,"General Science":11,"Geography":56,"GST / Inspector of Taxes":43,"History":57,"International Organisations":1,"Meghalaya GK":69,"Officer Technical":17,"Polity":93,"Reasoning":44,"Science":55,"Static GK":3};
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
if (!sw.includes('./question-batches/2026-11-03-polity.json') || !sw.includes('./explanations/polity.json') || !sw.includes('./explanations/general-studies.json') || !sw.includes('./explanations/gst.json') || !sw.includes('./explanations/current-affairs.json') || !sw.includes('./explanations/english.json') || !sw.includes('./explanations/arithmetic.json') || !sw.includes('./explanations/meghalaya-gk.json')) fail('service worker does not precache all detailed explanation libraries');
const detailUrlsMatch = script.match(/const detailUrls=\[([\s\S]*?)\];/);
if (!detailUrlsMatch) fail('could not locate optional detailed explanation URL list');
const detailUrls = [...detailUrlsMatch[1].matchAll(/'([^']+\.json)'/g)].map(match=>match[1]);
const requiredDetailUrls = ['./explanations/history.json','./explanations/polity.json','./explanations/general-studies.json','./explanations/gst.json','./explanations/current-affairs.json','./explanations/english.json','./explanations/arithmetic.json','./explanations/meghalaya-gk.json'];
if (requiredDetailUrls.some(url=>!detailUrls.includes(url)) || !script.includes('Promise.allSettled(detailUrls.map') || !script.includes('Q.length.toLocaleString()') || !script.includes('Question bank ready:')) fail('optional explanation libraries must load independently without blocking the embedded question bank');
for (const file of ['manifest.json', ...walkJson('question-batches'), ...walkJson('current-affairs'), ...walkJson('audit'), ...walkJson('data'), ...walkJson('explanations')]) jsonFile(file);
const historyLibrary = jsonFile('explanations/history.json');
const polityLibrary = jsonFile('explanations/polity.json');
const historyIds = active.filter(q => /^History/.test(q.cat)).map(q => String(q.id));
const polityIds = active.filter(q => /^Polity/.test(q.cat)).map(q => String(q.id));
const activeIdSet = new Set(active.map(q => String(q.id)));
for (const [name, library] of [['History', historyLibrary], ['Polity', polityLibrary]]) {
  for (const id of Object.keys(library.explanations || {})) if (!activeIdSet.has(id)) fail(name + ' explanation library contains inactive question ID ' + id);
}
if (historyIds.some(id => !active.some(q => String(q.id) === id && q.e)) || polityIds.some(id => !active.some(q => String(q.id) === id && q.e))) fail('History and Polity questions must retain inline explanations; optional libraries do not block question visibility');
const gsLibrary = jsonFile('explanations/general-studies.json');
const gstLibrary = jsonFile('explanations/gst.json');
const caLibrary = jsonFile('explanations/current-affairs.json');
const englishLibrary = jsonFile('explanations/english.json');
const arithmeticLibrary = jsonFile('explanations/arithmetic.json');
const meghalayaLibrary = jsonFile('explanations/meghalaya-gk.json');
const gsIds = ['7103','7104','7107','7108','7109','7110','7111','7112','7113','7114','7115','7116'];
const gstIds = ['3008','5038','5039','5085','5086','6128','6129','6156','6157','6196','6197','6228','6229','6230','6244'];
const caIds = ['7137','7138','7139','7140','7141','7142'];
const englishIds = ['21','22','23','24','25','26','27','28','29','30','136','137','138','139','140','141','142','143','144','145'];
const arithmeticIds = ['3004','4001','4002','4003','4005','4020','5021','5022','5023','5024','5025'];
const meghalayaIds = ['11','12','14','15','17','18','127','128','183','186','188','189','195','3003','4006','4008','4010','5004','5089','5090'];
for (const [name,library,ids] of [['General Studies',gsLibrary,gsIds],['GST',gstLibrary,gstIds],['Current Affairs',caLibrary,caIds],['English',englishLibrary,englishIds],['Arithmetic',arithmeticLibrary,arithmeticIds],['Meghalaya GK',meghalayaLibrary,meghalayaIds]]) {
  if (Object.keys(library.explanations || {}).length !== ids.length || ids.some(id => !library.explanations[id])) fail(name + ' explanation library does not cover its audited question IDs');
}
const allStructured = new Set([...Object.keys(historyLibrary.explanations),...Object.keys(polityLibrary.explanations),...Object.keys(gsLibrary.explanations),...Object.keys(gstLibrary.explanations),...Object.keys(caLibrary.explanations),...Object.keys(englishLibrary.explanations),...Object.keys(arithmeticLibrary.explanations),...Object.keys(meghalayaLibrary.explanations)]);
if (allStructured.size !== 219) fail('structured explanation total must be 219 unique active IDs');
if (arithmeticLibrary.questionCount !== 11 || arithmeticIds.some(id=>!active.some(q=>String(q.id)===id&&q.cat==='Arithmetic'))) fail('Arithmetic library must cover the 11 selected active Arithmetic IDs');
for (const id of arithmeticIds) { const d=arithmeticLibrary.explanations[id]; if (!d.formula || !d.steps || !d.check || !d.commonMistakes || !Array.isArray(d.references) || !d.references.length || d.references.some(r=>!r.label || !r.url || !r.url.startsWith('https://'))) fail('Arithmetic explanation '+id+' is missing a formula, worked steps, check, common-mistake note or valid HTTPS reference'); }
if (englishLibrary.questionCount !== 20 || englishIds.some(id=>!active.some(q=>String(q.id)===id&&/^English/.test(q.cat)))) fail('English explanation library must cover the 20 selected active English question IDs');
if (meghalayaLibrary.questionCount !== 20 || meghalayaIds.some(id=>!active.some(q=>String(q.id)===id&&q.cat==='Meghalaya GK'))) fail('Meghalaya GK library must cover its 20 selected active Meghalaya GK IDs');
for (const id of meghalayaIds) { const d=meghalayaLibrary.explanations[id]; if (!d.title || !d.overview || !d.context || !d.what || !d.why || !d.significance || !d.exam || !Array.isArray(d.references) || !d.references.length || d.references.some(r=>!r.label || !r.url || !r.url.startsWith('https://'))) fail('Meghalaya GK explanation '+id+' is missing teaching fields or valid HTTPS references'); }
const coverageAudit = jsonFile('audit/explanation-coverage-2026-11-06.json');
if (coverageAudit.date !== '2026-11-06' || coverageAudit.summary.arithmetic !== 11 || coverageAudit.summary.meghalayaGK !== 20 || coverageAudit.explanationLibraries.length !== 8 || coverageAudit.summary.activeUniqueQuestionRecords !== 821 || coverageAudit.summary.structuredExplanationQuestionIds !== 209 || coverageAudit.summary.structuredDetailedExplanationIds !== 209 || coverageAudit.summary.remainingWithoutStructuredLibrary !== 612 || coverageAudit.summary.structuredCoveragePercent !== 25.5) fail('explanation coverage audit totals do not match');
const coverageRows = Object.fromEntries(coverageAudit.subjects.map(row=>[row.subject,row]));
for (const row of coverageAudit.subjects) {
  if (!Number.isInteger(row.activeQuestionCount) || !Number.isInteger(row.detailedExplanationCount) || row.remainingCount !== row.activeQuestionCount-row.detailedExplanationCount || row.detailedQuestionIds.length !== row.detailedExplanationCount || row.remainingQuestionIds.length !== row.remainingCount) fail('historical explanation coverage row is internally inconsistent for ' + row.subject);
}
const examAudit = jsonFile('audit/exam-blueprint-2026-11-06.json');
if (examAudit.date !== '2026-11-06' || examAudit.explanationCoverageAudit !== 'audit/explanation-coverage-2026-11-06.json' || examAudit.examTracks.length !== 3 || examAudit.questionBankSnapshot.activeUniqueQuestionRecords !== 821 || examAudit.regionalMeghalayaGK.structuredExplanationQuestionCount !== 20 || examAudit.regionalMeghalayaGK.remainingQuestionCount !== 38) fail('exam blueprint audit is incomplete');

const notesMatch = script.match(/const STUDY_NOTES=\[([\s\S]*?)\];\s*function renderStudyNotes/);
if (!notesMatch) fail('could not locate Study Notes library');
const noteSource = notesMatch[1];
const subjectCount = (noteSource.match(/\{id:'/g) || []).length;
const chapterCount = (noteSource.match(/\['[^']+',\[/g) || []).length;
if (subjectCount !== 14 || chapterCount !== 37) fail('Study Notes expected 14 subjects / 37 chapters, found ' + subjectCount + ' / ' + chapterCount);
if (!noteSource.includes('Agriculture, millets & local livelihoods') || !noteSource.includes('Scrutiny and evidence-led return review') || !noteSource.includes('State finance & Union tax devolution') || !noteSource.includes('Finance Commission, tax devolution & grants') || !noteSource.includes('Cryosphere & climate overshoot')) fail('new Study Notes chapters are missing');
if (!script.includes("const key='mpscV4'")) fail('local progress storage key changed unexpectedly');
if (!script.includes('mpscTopicPracticeSelectionV1') || !script.includes('function subjectTopicMatches') || !script.includes('ACTIVE_SUBJECT_PRACTICE')) fail('topic-specific practice selection is missing');
if (!script.includes("details.subject-folder[open]") || !script.includes('data-subject-id=') || !script.includes('openFolders.has(x.id)')) fail('subject folders must stay expanded when topic/revision selection refreshes the library');
if (!html.includes('dashboard-shortcuts') || !html.includes('Subject Library') || !html.includes('Daily Practice') || !script.includes("savedTheme?savedTheme==='dark':true")) fail('premium dashboard shortcuts or dark-first theme are missing');
const subjectLibraryMatch = script.match(/const SUBJECT_LIBRARY=(\[[\s\S]*?\]);\s*const STUDY_NOTES=/);
if (!subjectLibraryMatch) fail('could not locate subject-topic library for filter tests');
const subjectLibrary = vm.runInNewContext('(' + subjectLibraryMatch[1] + ')');
const categoryOwners = new Map();
for (const subject of subjectLibrary) {
  if (!Array.isArray(subject.categories) || !subject.categories.length) fail('subject ' + subject.id + ' must declare mapped question categories');
  for (const category of subject.categories) {
    if (categoryOwners.has(category)) fail('question category ' + category + ' is assigned to multiple subject folders');
    categoryOwners.set(category, subject.id);
  }
}
for (const question of active) {
  const category = String(question.cat || '').replace(/\s*•\s*PYQ$/, '');
  if (!categoryOwners.has(category)) fail('active question category ' + category + ' is not assigned to a subject folder');
}
const matcherStart = script.indexOf('function subjectTopicMatches(');
const matcherEnd = script.indexOf('function renderSubjectLibrary', matcherStart);
if (matcherStart < 0 || matcherEnd < 0) fail('could not locate topic matcher for filter tests');
const topicMatcher = vm.runInNewContext('(' + script.slice(matcherStart, matcherEnd) + ')');
for (const subject of subjectLibrary) {
  if (!Array.isArray(subject.topics) || !subject.topics.length) fail('subject ' + subject.id + ' has no topic list');
  for (let i = 0; i < subject.topics.length; i++) for (const question of active) {
    if (typeof topicMatcher(question, subject, i) !== 'boolean') fail('invalid topic match result for ' + subject.id + ' / ' + subject.topics[i]);
  }
}
const historyTopics = subjectLibrary.find(x => x.id === 'indian-history');
const ancientIds = active.filter(q => q.cat === 'History' && topicMatcher(q, historyTopics, 0)).map(q => String(q.id));
const modernIds = active.filter(q => q.cat === 'History' && topicMatcher(q, historyTopics, 3)).map(q => String(q.id));
if (!ancientIds.length || !modernIds.length || ancientIds.some(id => modernIds.includes(id))) fail('Ancient and Modern History filters must return distinct, non-overlapping question sets');

if (!script.includes('paperComplete===true') || !script.includes('paperTotal')) fail('exact-paper completeness safeguard is missing');

const pyqCatalogue = jsonFile('pyq-papers/index.json');
if (pyqCatalogue.schemaVersion !== 1 || !Array.isArray(pyqCatalogue.papers)) fail('exact PYQ catalogue schema is invalid');
if (!sw.includes('./pyq-papers/index.json')) fail('service worker does not precache the exact PYQ catalogue');
if (!script.includes('function startExactPyq()') || !script.includes('function submitExactPyq()') || !script.includes('loadExactPyqCatalogue()')) fail('separate interactive exact-PYQ runner is missing');
if (!script.includes("x.difficulty!=='PYQ'")) fail('predicted mock pool must exclude all PYQ-tagged records');
if (html.includes('PYQ + practice (fill test size)') || html.includes('PYQ practice only')) fail('mock-test UI still offers mixed or PYQ-only question sources');
if (!html.includes('Predicted Mock — original practice questions only')) fail('mock-test UI must identify the separate predicted-practice mode');


console.log('Validation passed.');
console.log('Embedded questions: ' + embedded.length);
console.log('Archived batches: ' + batchFiles.length + ' files / ' + archiveCount + ' mirrored questions (not runtime-loaded)');
console.log('Active unique question records: ' + active.length);
console.log('PYQ-tagged active records: ' + active.filter(q => q.difficulty === 'PYQ').length + ' (not complete papers)');
console.log('LDA Secretariat Series I: ' + paperQuestions.length + '/150 transcribed and key-checked; 59 remain');
console.log('Study Notes: ' + subjectCount + ' subjects, ' + chapterCount + ' chapters');
console.log('Structured explanations: ' + allStructured.size + ' unique IDs across History, Polity, English, Arithmetic, Meghalaya GK, General Studies, GST and Current Affairs');
const latestFeed = jsonFile('current-affairs/2026-11-03.json');
if (latestFeed.items.length !== 6 || latestFeed.items.some(item=>!item.sourceURL || !item.publishedDate || !item.verificationStatus)) fail('3 November current-affairs feed is incomplete');
console.log('Current affairs: ' + latestFeed.items.length + ' dated, source-linked stories in the 3 November feed');
console.log('Service-worker cache: ' + cacheVersion);
console.log('Local progress key and exact-paper guard preserved.');
