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
try { new vm.Script(sw, { filename: 'sw.js' }); }
catch (error) { fail('service-worker JavaScript syntax: ' + error.message); }
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
if (embedded.length !== 592 + archiveCount) fail('canonical embedded Q must equal the 592 legacy questions plus every archived question-batch record');
if (batchFiles.length < 22 || archiveIdSet.size !== archiveCount || archiveCount !== 814) fail('question-batch archives must include the 20 audited batches and every archive ID must be unique');
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
const completedRun22 = rampTracker.completedRun22;
const run22Status = completedRun22?.status;
const merged22 = run22Status === 'merged';
const pending22 = run22Status === 'pending_merge';
const correctionStatus22 = completedRun22?.correctionStatus;
const correctionPending22 = correctionStatus22 === 'pending';
const correctionMerged22 = correctionStatus22 === 'merged';
const expectedNextTarget22 = correctionPending22 ? 90 : 110;
if (!merged22 || completedRun22?.date !== '2026-11-22' || completedRun22?.target !== 90 || completedRun22?.draftedCandidates !== 105 || completedRun22?.validatedQuestions !== 90 || completedRun22?.rejectedCandidates !== 15 || completedRun22?.mergedQuestions !== 90 || completedRun22?.activeUniqueQuestionsAfterMerge !== 1187 || completedRun22?.nextDailyTarget !== expectedNextTarget22 || completedRun22?.mainShaAtStartOfRun !== 'bebb1b5ce4cdf346861d009ca834c7a2d9036943' || rampTracker.currentDailyTarget !== 130) fail('22 November historical campaign tracker or current 24 November target is inconsistent');
const statutoryReview21 = rampTracker.previousRun?.sourceReview?.postRunLegalReview;
if (statutoryReview21?.sectionsReviewed?.join(',') !== '76,77,78,85,86,87,88,90,93' || statutoryReview21?.recentAmendmentCheck?.overlapWithNewQuestions !== false) fail('21 November GST statutory review is missing or incomplete');


const expansionBatch19 = jsonFile('question-batches/2026-11-19-original-practice.json');
if (expansionBatch19.questions.length !== 50 || expansionBatch19.questionIdRange !== '9051-9100' || expansionBatch19.candidateCount !== 62 || expansionBatch19.rejectedCandidates !== 12 || Object.values(expansionBatch19.subjects).reduce((sum,value)=>sum+value,0)!==50) fail('19 November original-practice batch count, ID range, candidate or subject totals are incorrect');
for (const question of expansionBatch19.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 2 || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || question.sourceType !== 'Original Practice' || !question.sourceURL || !question.sourceURL.startsWith('https://') || question.sourceVerifiedDate !== '2026-11-19' || !question.verificationStatus || !question.verificationStatus.includes('2026-11-19') || question.difficulty === 'PYQ' || question.answerIndex !== question.a || question.o.length !== 4) fail('19 November question ' + question.id + ' needs topic/exam tags, four options, answer, teaching explanation, source and Original Practice label');
}
if (!sw.includes('./question-batches/2026-11-19-original-practice.json')) fail('service worker does not precache 19 November original-practice archive');
if (!html.includes('mpsc-build') || !html.includes('2026-11-24-original-practice-118') || !html.includes('Q.length') || html.includes('fetch("./question-batches/') || html.includes("fetch('./question-batches/")) fail('24 November build marker, Q.length dashboard count or offline-first loader is incorrect');
const expansionBatch20 = jsonFile('question-batches/2026-11-20-original-practice.json');
if (expansionBatch20.questions.length !== 70 || expansionBatch20.questionIdRange !== '9101-9170' || expansionBatch20.candidateCount !== 81 || expansionBatch20.rejectedCandidates !== 11 || Object.values(expansionBatch20.subjects).reduce((sum,value)=>sum+value,0)!==70) fail('20 November original-practice batch count, ID range, candidate or subject totals are incorrect');
for (const question of expansionBatch20.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 2 || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || question.sourceType !== 'Original Practice' || !question.sourceURL || !question.sourceURL.startsWith('https://') || question.sourceVerifiedDate !== '2026-11-20' || !question.verificationStatus || !question.verificationStatus.includes('2026-11-20') || question.difficulty === 'PYQ' || question.answerIndex !== question.a || question.o.length !== 4 || new Set(question.o).size !== 4 || !Number.isInteger(question.a) || question.a < 0 || question.a > 3) fail('20 November question ' + question.id + ' needs topic/exam tags, four options, answer, teaching explanation, source and Original Practice label');
  if (question.cat === 'GST / Inspector of Taxes' && !question.sourceURL.startsWith('https://www.indiacode.nic.in/')) fail('20 November GST question ' + question.id + ' must use the official India Code statutory source');
}
const sourceCorrections20 = {
  9164: { name: 'NCERT Class XI Biology — Chapter 10: Cell Cycle and Cell Division', url: 'https://ncert.nic.in/textbook.php?kebo1=1-22' },
  9165: { name: 'NCERT Class XI Biology Exemplar Problems — Chapter 11: Transport in Plants', url: 'https://www.ncert.nic.in/pdf/publication/exemplarproblem/classXI/biology/keep411.pdf' },
  9166: { name: 'NCERT Science, Class X — Chapter 9: Light – Reflection and Refraction', url: 'https://ncert.nic.in/textbook/pdf/jesc109.pdf' },
  9167: { name: 'NCERT Biology, Class XII — Chapter 12: Ecosystem', url: 'https://ncert.nic.in/textbook.php?lebo1=10-16' }
};
for (const [id, expected] of Object.entries(sourceCorrections20)) {
  const archived = expansionBatch20.questions.find(question => String(question.id) === id);
  const embeddedQuestion = active.find(question => String(question.id) === id);
  for (const question of [archived, embeddedQuestion]) {
    if (!question || question.sourceName !== expected.name || question.sourceURL !== expected.url || !question.source.includes(expected.name)) fail('20 November question ' + id + ' has an incorrect NCERT source mapping');
  }
}
if (expansionBatch20.questions[69].id !== 9170 || !expansionBatch20.questions[69].sourceURL.includes('final-notification-mawtneng')) fail('20 November Meghalaya current-affairs question must cite the official Mawtneng BHS notification page');
if (!sw.includes('./question-batches/2026-11-20-original-practice.json')) fail('service worker does not precache 20 November original-practice archive');
if (!html.includes('mpsc-build') || !html.includes('2026-11-24-original-practice-118')) fail('20 November canonical build marker is missing');

const expansionBatch21 = jsonFile('question-batches/2026-11-21-original-practice.json');
if (expansionBatch21.questions.length !== 54 || expansionBatch21.questionIdRange !== '9171-9224' || expansionBatch21.candidateCount !== 60 || expansionBatch21.rejectedCandidateCount !== 6 || Object.values(expansionBatch21.subjects).reduce((sum,value)=>sum+value,0)!==54) fail('21 November original-practice batch count, ID range, candidate or subject totals are incorrect');
for (const question of expansionBatch21.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 2 || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || question.sourceType !== 'Original Practice' || !question.sourceURL || !question.sourceURL.startsWith('https://') || question.sourceVerifiedDate !== '2026-11-21' || !question.verificationStatus || !question.verificationStatus.includes('2026-11-21') || question.difficulty === 'PYQ' || question.answerIndex !== question.a || question.o.length !== 4 || new Set(question.o.map(x=>x.toLowerCase())).size !== 4 || !Number.isInteger(question.a) || question.a < 0 || question.a > 3) fail('21 November question ' + question.id + ' has incomplete source, answer, explanation or Original Practice metadata');
  if (question.cat === 'GST / Inspector of Taxes' && !question.sourceURL.startsWith('https://www.indiacode.nic.in/')) fail('21 November GST question ' + question.id + ' must use the official India Code statutory source');
}
if (!sw.includes('./question-batches/2026-11-21-original-practice.json')) fail('service worker does not precache 21 November original-practice archive');
const expansionBatch22 = jsonFile('question-batches/2026-11-22-original-practice.json');
const q9227=expansionBatch22.questions.find(q=>q.id===9227);
const q9230=expansionBatch22.questions.find(q=>q.id===9230);
const q9273=expansionBatch22.questions.find(q=>q.id===9273);
if (!q9227 || !q9227.q.includes('Mairang and Mawthadraishan') || !q9227.q.includes('Lok Sabha') || q9227.o[q9227.a] !== 'Shillong' || q9227.sourceURL !== 'https://easternwestkhasihills.meghalaya.gov.in/about-district/') fail('22 November Q9227 constituency-mapping correction is missing');
if (!q9230 || q9230.o[q9230.a] !== '12' || q9230.sourceURL !== 'https://www.meghalaya.gov.in/districts') fail('22 November Q9230 current 12-district correction is missing');
if (!q9273 || !q9273.q.includes('seismic discontinuity') || q9273.o[q9273.a] !== 'Mohorovičić discontinuity (Moho)' || q9273.sourceURL !== 'https://www.usgs.gov/glossary/earthquake-hazards-program') fail('22 November Q9273 Moho replacement is missing');
const q9235=expansionBatch22.questions.find(q=>q.id===9235);
if (!q9235 || !q9235.q.includes('Article 243ZC') || q9235.o[q9235.a] !== 'Scheduled Areas and tribal areas referred to in Article 244' || q9235.sourceURL !== 'https://www.legislative.gov.in/static/uploads/2025/07/359f70a69695affb9d72f8393102bd2e.pdf') fail('22 November Q9235 Article 243ZC replacement is missing');

if (expansionBatch22.questions.length !== 90 || expansionBatch22.questionIdRange !== '9225-9314' || expansionBatch22.candidateCount !== 105 || expansionBatch22.rejectedCandidateCount !== 15 || expansionBatch22.acceptedUniqueQuestionCount !== 90 || Object.values(expansionBatch22.subjects).reduce((sum,value)=>sum+value,0)!==90 || expansionBatch22.rejectedCandidates.length !== 15) fail('22 November original-practice batch count, ID range, candidate or subject totals are incorrect');
const optionNorm22 = value => value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
for (const question of expansionBatch22.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 3 || !['MPSC Inspector of Taxes','DSC East Khasi Hills LDA-cum-Typist','MPSC Secretariat LDA'].every(track=>question.examTags.includes(track)) || !question.e || question.e.length < 100 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || question.sourceType !== 'Original Practice' || !question.sourceName || !question.sourceURL || !question.sourceURL.startsWith('https://') || /\s/.test(question.sourceURL) || question.sourceVerifiedDate !== '2026-11-22' || !question.verificationStatus || !question.verificationStatus.includes('2026-11-22') || question.difficulty === 'PYQ' || question.answerIndex !== question.a || question.o.length !== 4 || new Set(question.o.map(optionNorm22)).size !== 4 || !Number.isInteger(question.a) || question.a < 0 || question.a > 3 || !question.tags.includes(question.cat) || !question.tags.includes(question.topic) || !question.tags.includes('Original Practice')) fail('22 November question ' + question.id + ' has incomplete schema, options, answer, explanation, source or exam tags');
}
if (expansionBatch22.deduplication?.exactStemCollisions !== 0 || expansionBatch22.deduplication?.optionSetCollisions !== 0 || expansionBatch22.deduplication?.nearSemanticCandidatesRejected !== 15 || expansionBatch22.deduplication?.existingBankNearDuplicateCandidatesRejected !== 1 || expansionBatch22.deduplication?.withinBatchNearDuplicatePairs !== 2 || expansionBatch22.deduplication?.finalBatchNearPairs !== 0 || expansionBatch22.deduplication?.unresolvedSemanticCollisions !== 0 || expansionBatch22.deduplication?.optionOnlyFingerprintMatchesReviewed !== 6 || expansionBatch22.deduplication?.existingBankNearDuplicateDetails?.length !== 1) fail('22 November batch collision audit is incomplete');
if (expansionBatch22.legalVerification?.asOf !== '2026-11-22' || expansionBatch22.legalVerification?.testedSections?.join(',') !== '16(4),17(5)(a),17(5)(c),17(5)(h),18(1)(a),56') fail('22 November GST legal verification is missing or incomplete');
if (!sw.includes('./question-batches/2026-11-22-original-practice.json')) fail('service worker does not precache 22 November original-practice archive');
if (!sw.includes('mpsc-smart-study-v5-60-20261124')) fail('service-worker cache version was not advanced for 22 November');
if (!html.includes('mpsc-build') || !html.includes('2026-11-24-original-practice-118') || !html.includes('Q.length') || /fetch\([^)]*question-batches/.test(html)) fail('22 November build marker, Q.length dashboard count or offline-first loader is incorrect');

const dedupIndex21 = jsonFile('audit/dedup-index-2026-11-21.json');
if (dedupIndex21.schemaVersion !== 6 || dedupIndex21.canonical.questionCount !== 1097 || dedupIndex21.canonical.activeFingerprints.length !== 1097 || dedupIndex21.officialPyq.fileCount !== 18 || dedupIndex21.officialPyq.questionCount !== 2433 || dedupIndex21.archive.fileCount !== 19 || dedupIndex21.archive.questionCount !== 505 || dedupIndex21.allPyqFiles.fileCount !== 19 || dedupIndex21.allPyqFiles.questionCount !== 2572) fail('21 November full-bank dedup index totals are incorrect');
if (dedupIndex21.mergeStatus !== 'merged' || dedupIndex21.mergedMainSha !== rampTracker.previousRun?.mergeCommitSha || dedupIndex21.postMergeAudit !== true || dedupIndex21.archive.mirrorParityVerified !== true || dedupIndex21.canonical.postMergeParityVerified !== true) fail('21 November dedup index is missing verified post-merge state');
if (new Set(dedupIndex21.canonical.activeFingerprints.map(record=>record.i)).size !== 1097 || dedupIndex21.canonical.activeFingerprints.some(record=>!record.s || !record.o || !record.k || !Array.isArray(record.w))) fail('21 November active dedup index has duplicate IDs or incomplete stem/option/concept/token fingerprints');
if (dedupIndex21.candidateScan.drafted !== 60 || dedupIndex21.candidateScan.accepted !== 54 || dedupIndex21.candidateScan.rejected !== 6 || dedupIndex21.candidateScan.exactStemCollisions !== 0 || dedupIndex21.candidateScan.optionSetCollisions !== 0 || dedupIndex21.candidateScan.nearSemanticRejected !== 5 || dedupIndex21.candidateScan.withinBatchNearPairsRejected !== 1 || dedupIndex21.candidateScan.finalBatchNearPairs !== 0 || dedupIndex21.candidateScan.unresolved !== 0) fail('21 November candidate collision audit is inconsistent');
const dedupAudit21 = jsonFile('audit/dedup-audit-2026-11-21.json');
if (dedupAudit21.target !== 90 || dedupAudit21.draftedCandidates !== 60 || dedupAudit21.validatedUniqueQuestions !== 54 || dedupAudit21.rejectedCandidates.length !== 6 || dedupAudit21.collisions.candidateExactStemCollisions !== 0 || dedupAudit21.collisions.candidateOptionSetCollisions !== 0 || dedupAudit21.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit21.collisions.withinBatchNearPairs !== 1 || dedupAudit21.collisions.finalBatchNearPairs !== 0 || dedupAudit21.mergedQuestions !== 54 || dedupAudit21.mergeStatus !== 'merged' || dedupAudit21.postMergeAudit !== true || dedupAudit21.activeUniqueQuestionsAfterMerge !== 1097 || dedupAudit21.postMergeCommitSha !== rampTracker.previousRun?.mergeCommitSha || dedupAudit21.validation.archiveParity !== true || dedupAudit21.validation.canonicalEmbeddedParity !== true || dedupAudit21.validation.repositoryTests !== 'passed') fail('21 November post-merge dedup audit totals are incorrect');
if (dedupAudit21.postMergeCrossCorpusReview?.newQuestionId !== 9221 || dedupAudit21.postMergeCrossCorpusReview?.optionOnlyFingerprintMatches !== 2 || dedupAudit21.postMergeCrossCorpusReview?.sourceImageVerified !== true || dedupAudit21.postMergeCrossCorpusReview?.unresolvedSemanticCollisions !== 0) fail('21 November post-merge generic-option cross-corpus review is missing or incomplete');
const pyqFingerprints21 = jsonFile('audit/dedup-pyq-fingerprints-2026-11-21.json');
if (pyqFingerprints21.count !== 2572 || pyqFingerprints21.files.length !== 19 || pyqFingerprints21.officialDistinctFileCount !== 18 || pyqFingerprints21.officialDistinctQuestionRecords !== 2433 || pyqFingerprints21.partialDuplicate.exactStemMatchesInFullPaper !== 139 || pyqFingerprints21.partialDuplicate.exactOptionMatchesInFullPaper !== 139 || pyqFingerprints21.fingerprints.length !== 82304) fail('21 November PYQ fingerprint file does not cover all 19 files and 2,572 records');
const dedupIndex22 = jsonFile('audit/dedup-index-2026-11-22.json');
if (dedupIndex22.schemaVersion !== 7 || dedupIndex22.date !== '2026-11-22' || dedupIndex22.baseMainSha !== rampTracker.completedRun22?.mainShaAtStartOfRun || dedupIndex22.canonical.questionCount !== 1187 || dedupIndex22.canonical.activeFingerprints.length !== 1187 || dedupIndex22.officialPyq.fileCount !== 18 || dedupIndex22.officialPyq.questionCount !== 2433 || dedupIndex22.archive.fileCount !== 20 || dedupIndex22.archive.questionCount !== 595 || dedupIndex22.allPyqFiles.fileCount !== 19 || dedupIndex22.allPyqFiles.questionCount !== 2572) fail('22 November full-bank dedup index totals are incorrect');
if (new Set(dedupIndex22.canonical.activeFingerprints.map(record=>record.i)).size !== 1187 || dedupIndex22.canonical.activeFingerprints.some(record=>!record.s || !record.o || !record.k || !Array.isArray(record.w))) fail('22 November active dedup index has duplicate IDs or incomplete fingerprints');
if (dedupIndex22.candidateScan.optionOnlyFingerprintMatchesReviewed?.length !== 6 || dedupIndex22.candidateScan.optionOnlyFingerprintMatchesReviewed.some(item=>item.reviewedAsNonDuplicate!==true)) fail('22 November option-only fingerprint hits were not fully reviewed');
if (dedupIndex22.candidateScan.drafted !== 105 || dedupIndex22.candidateScan.accepted !== 90 || dedupIndex22.candidateScan.rejected !== 15 || dedupIndex22.candidateScan.exactStemCollisions !== 0 || dedupIndex22.candidateScan.optionSetCollisions !== 0 || dedupIndex22.candidateScan.nearSemanticRejected !== 15 || dedupIndex22.candidateScan.existingBankNearDuplicateCandidatesRejected !== 1 || dedupIndex22.candidateScan.existingBankNearDuplicateDetails?.length !== 1 || dedupIndex22.candidateScan.rejectedCandidates?.length !== 15 || dedupIndex22.candidateScan.withinBatchNearPairsRejected !== 2 || dedupIndex22.candidateScan.finalBatchNearPairs !== 0 || dedupIndex22.candidateScan.unresolved !== 0 || dedupIndex22.candidateScan.optionOnlyFingerprintMatchesReviewed?.length !== 6 || dedupIndex22.candidateScan.comparisonCorpusRecords !== 3669 || dedupIndex22.candidateScan.comparisonCorpusRecordsAfterMerge !== 3759) fail('22 November candidate collision audit is inconsistent');
if (dedupIndex22.sourceInventory.activeQuestionsBeforeRun !== 1097 || dedupIndex22.sourceInventory.activeQuestionsInProposedBuild !== 1187 || dedupIndex22.sourceInventory.questionBatchArchivesBeforeRun !== 19 || dedupIndex22.sourceInventory.questionBatchArchiveRecordsBeforeRun !== 505 || dedupIndex22.sourceInventory.questionBatchArchivesInProposedBuild !== 20 || dedupIndex22.sourceInventory.questionBatchArchiveRecordsInProposedBuild !== 595 || dedupIndex22.sourceInventory.allPyqQuestionFiles !== 19 || dedupIndex22.sourceInventory.allPyqQuestionRecords !== 2572 || dedupIndex22.sourceInventory.unlistedQuestionBatchFiles !== 0 || dedupIndex22.sourceInventory.otherQuestionBankFilesOutsideCanonicalArchivesAndPyq !== 0) fail('22 November dedup source inventory is incomplete');
if (dedupIndex22.mergeStatus !== (merged22 ? 'merged' : 'pending_merge') || dedupIndex22.postMergeAudit !== merged22 || dedupIndex22.archive.mirrorParityVerified !== merged22 || dedupIndex22.canonical.postMergeParityVerified !== merged22 || dedupIndex22.mergedMainSha !== (merged22 ? rampTracker.completedRun22.mergeCommitSha : null) || dedupIndex22.correctionStatus !== correctionStatus22 || dedupIndex22.correctionValidation?.status !== 'passed') fail('22 November dedup index pending/merged/correction state is inconsistent');
const dedupAudit22 = jsonFile('audit/dedup-audit-2026-11-22.json');
if (dedupAudit22.target !== 90 || dedupAudit22.draftedCandidates !== 105 || dedupAudit22.validatedUniqueQuestions !== 90 || dedupAudit22.rejectedCandidates.length !== 15 || dedupAudit22.collisions.candidateExactStemCollisions !== 0 || dedupAudit22.collisions.candidateOptionSetCollisions !== 0 || dedupAudit22.collisions.nearSemanticCandidatesRejected !== 15 || dedupAudit22.collisions.existingBankNearDuplicateCandidatesRejected !== 1 || dedupAudit22.collisions.withinBatchNearPairs !== 2 || dedupAudit22.collisions.finalBatchNearPairs !== 0 || dedupAudit22.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit22.collisions.optionOnlyFingerprintMatchesReviewed !== 6 || dedupAudit22.collisions.existingBankNearDuplicateDetails?.length !== 1 || dedupAudit22.mergedQuestions !== (merged22 ? 90 : 0) || dedupAudit22.mergeStatus !== (merged22 ? 'merged' : 'pending_merge') || dedupAudit22.postMergeAudit !== merged22 || dedupAudit22.activeUniqueQuestionsAfterMerge !== (merged22 ? 1187 : 1097) || dedupAudit22.postMergeCommitSha !== (merged22 ? rampTracker.completedRun22.mergeCommitSha : null) || dedupAudit22.validation.archiveParity !== true || dedupAudit22.validation.canonicalEmbeddedParity !== true || dedupAudit22.validation.repositoryTests !== 'passed' || dedupAudit22.correctionStatus !== correctionStatus22 || dedupAudit22.correctionValidation?.status !== 'passed') fail('22 November post-merge dedup audit totals or correction state are incorrect');
const pyqFingerprints22 = jsonFile('audit/dedup-pyq-fingerprints-2026-11-22.json');
if (pyqFingerprints22.count !== 2572 || pyqFingerprints22.files.length !== 19 || pyqFingerprints22.officialDistinctFileCount !== 18 || pyqFingerprints22.officialDistinctQuestionRecords !== 2433 || pyqFingerprints22.partialDuplicate.exactStemMatchesInFullPaper !== 139 || pyqFingerprints22.partialDuplicate.exactOptionMatchesInFullPaper !== 139 || pyqFingerprints22.fingerprints.length !== 82304) fail('22 November PYQ fingerprint file does not cover all 19 files and 2,572 records');


const dedupIndex19 = jsonFile('audit/dedup-index-2026-11-19.json');
if (dedupIndex19.schemaVersion !== 4 || dedupIndex19.canonical.questionCount !== 973 || dedupIndex19.canonical.activeFingerprints.length !== 973 || dedupIndex19.officialPyq.questionCount !== 2433 || dedupIndex19.archive.fileCount !== 17 || dedupIndex19.archive.questionCount !== 381) fail('19 November compact dedup index totals are incorrect');
if (new Set(dedupIndex19.canonical.activeFingerprints.map(record=>record.i)).size !== 973 || dedupIndex19.canonical.activeFingerprints.some(record=>!record.s || !record.o || !record.k)) fail('19 November active dedup index has duplicate IDs or missing fingerprints');
if (dedupIndex19.mergeStatus !== 'merged' || dedupIndex19.mergedMainSha !== rampTracker.previousRunTwoBack?.mergeCommitSha || dedupIndex19.postMergeAudit !== true) fail('19 November dedup index does not record the historical 19 November merge SHA and post-merge audit');
const dedupAudit19 = jsonFile('audit/dedup-audit-2026-11-19.json');
if (dedupAudit19.target !== 50 || dedupAudit19.draftedCandidates !== 62 || dedupAudit19.validatedUniqueQuestions !== 50 || dedupAudit19.rejectedCandidates.length !== 12 || dedupAudit19.collisions.candidateExactStemCollisions !== 0 || dedupAudit19.collisions.candidateOptionSetCollisions !== 0 || dedupAudit19.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit19.collisions.withinBatchNearPairs !== 0 || dedupAudit19.mergedQuestions !== 50 || dedupAudit19.mergeStatus !== 'merged' || dedupAudit19.activeUniqueQuestionsAfterMerge !== 973 || dedupAudit19.postMergeAudit !== true) fail('19 November post-merge candidate/dedup audit totals are incorrect');

const dedupIndex20 = jsonFile('audit/dedup-index-2026-11-20.json');
if (dedupIndex20.schemaVersion !== 5 || dedupIndex20.canonical.questionCount !== 1043 || dedupIndex20.canonical.activeFingerprints.length !== 1043 || dedupIndex20.officialPyq.fileCount !== 18 || dedupIndex20.officialPyq.questionCount !== 2433 || dedupIndex20.archive.fileCount !== 18 || dedupIndex20.archive.questionCount !== 451 || dedupIndex20.allPyqFiles.fileCount !== 19 || dedupIndex20.allPyqFiles.questionCount !== 2572) fail('20 November full-bank dedup index totals are incorrect');
if (new Set(dedupIndex20.canonical.activeFingerprints.map(record=>record.i)).size !== 1043 || dedupIndex20.canonical.activeFingerprints.some(record=>!record.s || !record.o || !record.k)) fail('20 November active dedup index has duplicate IDs or missing fingerprints');
if (dedupIndex20.sourceInventory.supportingDataFilesReviewed !== 15 || dedupIndex20.sourceInventory.currentAffairsSourceItemsReviewed !== 19 || dedupIndex20.sourceInventory.explanationLibraryFilesReviewed !== 8 || dedupIndex20.sourceInventory.pyqTranscriptionAuditFilesReviewed !== 3 || dedupIndex20.sourceInventory.otherQuestionBankFilesOutsideCanonicalArchivesAndPyq !== 0) fail('20 November supporting-data source inventory is incomplete');
if (dedupIndex20.legacyPartialDuplicate.questionCount !== 139 || dedupIndex20.legacyPartialDuplicate.matchedStems !== 139 || dedupIndex20.legacyPartialDuplicate.matchedStemAndOptionSets !== 139 || dedupIndex20.candidateScan.accepted !== 70 || dedupIndex20.candidateScan.rejected !== 11 || dedupIndex20.candidateScan.exactStemCollisions !== 0 || dedupIndex20.candidateScan.optionSetCollisionsInFinalBatch !== 0 || dedupIndex20.candidateScan.withinBatchNearPairs !== 0 || dedupIndex20.candidateScan.unresolved !== 0) fail('20 November partial-duplicate or candidate collision audit is inconsistent');
if (dedupIndex20.mergeStatus !== 'merged' || dedupIndex20.mergedMainSha !== rampTracker.previousRunBeforeLatest?.postMergeSourceReview?.mergeCommitSha || dedupIndex20.postMergeAudit !== true) fail('20 November dedup index does not record the verified merge SHA and post-merge audit');
const pyqFingerprints20 = jsonFile('audit/dedup-pyq-fingerprints-2026-11-20.json');
if (pyqFingerprints20.count !== 2572 || pyqFingerprints20.files.length !== 19 || pyqFingerprints20.officialDistinctFileCount !== 18 || pyqFingerprints20.officialDistinctQuestionRecords !== 2433 || pyqFingerprints20.partialDuplicate.exactStemMatchesInFullPaper !== 139 || pyqFingerprints20.partialDuplicate.exactOptionMatchesInFullPaper !== 139 || pyqFingerprints20.fingerprints.length !== 82304) fail('20 November PYQ fingerprint file does not cover all 19 files and 2,572 records');
const dedupAudit20 = jsonFile('audit/dedup-audit-2026-11-20.json');
if (dedupAudit20.target !== 70 || dedupAudit20.draftedCandidates !== 81 || dedupAudit20.validatedUniqueQuestions !== 70 || dedupAudit20.rejectedCandidates.length !== 11 || dedupAudit20.collisions.candidateExactStemCollisionsInAcceptedBatch !== 0 || dedupAudit20.collisions.candidateOptionSetCollisionsInAcceptedBatch !== 0 || dedupAudit20.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit20.collisions.withinBatchNearPairs !== 0 || dedupAudit20.mergedQuestions !== 70 || dedupAudit20.activeUniqueQuestionsAfterMerge !== 1043) fail('20 November post-merge dedup audit totals are incorrect');
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
if (active.length !== 1406 || active.filter(q=>q.difficulty==='PYQ').length !== 111) fail('active question or PYQ-tagged totals do not match the audited counts');
if (batchFiles.length !== 22) fail('expected exactly 20 archived question batches');
const expectedSubjectCounts = {"Aptitude":32,"Arithmetic":197,"Art & Culture":1,"Books & Authors":1,"Computer":63,"Current Affairs":56,"Economy":90,"English":189,"Environment":69,"General Science":11,"Geography":93,"GST / Inspector of Taxes":100,"History":93,"International Organisations":1,"Meghalaya GK":102,"Officer Technical":17,"Polity":133,"Reasoning":60,"Science":95,"Static GK":3};
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

const completedRun23 = rampTracker.completedRun23;
const expansionBatch23 = jsonFile('question-batches/2026-11-23-original-practice.json');
if (!completedRun23 || completedRun23.date !== '2026-11-23' || completedRun23.status !== 'merged' || completedRun23.target !== 110 || completedRun23.draftedCandidates !== 110 || completedRun23.validatedQuestions !== 101 || completedRun23.rejectedCandidates !== 9 || completedRun23.mergedQuestions !== 101 || completedRun23.activeUniqueQuestionsAfterMerge !== 1288 || completedRun23.nextDailyTarget !== 130 || completedRun23.activeUniqueQuestionsAfterMerge !== 1288) fail('23 November completed campaign tracker is inconsistent');
if (expansionBatch23.questions.length !== 101 || expansionBatch23.questionCount !== 101 || expansionBatch23.target !== 110 || expansionBatch23.candidateCount !== 110 || expansionBatch23.rejectedCandidateCount !== 9 || expansionBatch23.status !== 'merged' || Object.values(expansionBatch23.subjects).reduce((a,b)=>a+b,0)!==101) fail('23 November practice batch totals or status are incorrect');
const ids23 = expansionBatch23.questions.map(q=>String(q.id));
if (new Set(ids23).size !== 101 || ids23.some(id=>!embeddedById.has(id))) fail('23 November question IDs are not unique or are missing from canonical Q');
for (const q of expansionBatch23.questions) {
 if (!q.topic || !q.examTags || !q.examTags.length || !q.e || q.e.length < 70 || !q.source || !q.source.includes('not an official PYQ') || q.label !== 'Original Practice' || q.sourceType !== 'Original Practice' || !q.sourceName || !q.sourceURL || !q.sourceURL.startsWith('https://') || q.sourceVerifiedDate !== '2026-11-23' || !q.verificationStatus || q.answerIndex !== q.a) fail('23 November question ' + q.id + ' is missing explanation, source, date, tags or Original Practice label');
}
if (!sw.includes('./question-batches/2026-11-23-original-practice.json') || !sw.includes('mpsc-smart-study-v5-59-20261123')) fail('23 November archive or service-worker cache version is missing');
if (!html.includes('2026-11-24-original-practice-118') || !html.includes('Q.length')) fail('23 November build marker or Q.length dashboard count is missing');
const dedupIndex23 = jsonFile('audit/dedup-index-2026-11-23.json');
if (dedupIndex23.schemaVersion !== 8 || dedupIndex23.canonical.questionCount !== 1288 || dedupIndex23.canonical.activeFingerprints.length !== 1288 || dedupIndex23.officialPyq.questionCount !== 2433 || dedupIndex23.allPyqFiles.questionCount !== 2572 || dedupIndex23.archive.fileCount !== 21 || dedupIndex23.archive.questionCount !== 696 || dedupIndex23.candidateScan.drafted !== 110 || dedupIndex23.candidateScan.accepted !== 101 || dedupIndex23.candidateScan.rejected !== 9 || dedupIndex23.candidateScan.unresolved !== 0 || dedupIndex23.mergeStatus !== 'merged' || dedupIndex23.postMergeAudit !== true || dedupIndex23.mergedMainSha !== completedRun23.mergeCommitSha || dedupIndex23.archive.mirrorParityVerified !== true || dedupIndex23.canonical.postMergeParityVerified !== true) fail('23 November dedup index totals or candidate scan are incorrect');
if (new Set(dedupIndex23.canonical.activeFingerprints.map(r=>r.i)).size !== 1288 || dedupIndex23.canonical.activeFingerprints.some(r=>!r.s || !r.o || !r.k || !Array.isArray(r.w))) fail('23 November active dedup fingerprints are incomplete or duplicated');
const dedupAudit23 = jsonFile('audit/dedup-audit-2026-11-23.json');
if (dedupAudit23.target !== 110 || dedupAudit23.draftedCandidates !== 110 || dedupAudit23.validatedUniqueQuestions !== 101 || dedupAudit23.rejectedCandidates.length !== 9 || dedupAudit23.collisions.candidateExactStemCollisions !== 0 || dedupAudit23.collisions.candidateOptionSetCollisions !== 0 || dedupAudit23.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit23.mergedQuestions !== 101 || dedupAudit23.mergeStatus !== 'merged' || dedupAudit23.postMergeAudit !== true || dedupAudit23.activeUniqueQuestionsAfterMerge !== 1288 || dedupAudit23.postMergeCommitSha !== completedRun23.mergeCommitSha || dedupAudit23.validation.repositoryTests !== 'passed') fail('23 November dedup audit totals are incorrect');
const pyqFingerprints23 = jsonFile('audit/dedup-pyq-fingerprints-2026-11-23.json');
if (pyqFingerprints23.count !== 2572 || pyqFingerprints23.files.length !== 19 || pyqFingerprints23.officialDistinctFileCount !== 18 || pyqFingerprints23.officialDistinctQuestionRecords !== 2433 || pyqFingerprints23.partialDuplicate.exactStemMatchesInFullPaper !== 139) fail('23 November PYQ fingerprint inventory is incomplete');

console.log('Local progress key and exact-paper guard preserved.');


const expansionBatch24 = jsonFile('question-batches/2026-11-24-original-practice.json');
if (expansionBatch24.questions.length !== 118 || expansionBatch24.questionIdRange !== '9420-9538 (one candidate ID rejected)' || expansionBatch24.target !== 130 || expansionBatch24.candidateCount !== 131 || expansionBatch24.rejectedCandidateCount !== 13 || expansionBatch24.acceptedUniqueQuestionCount !== 118 || expansionBatch24.rejectedCandidates.length !== 13 || Object.values(expansionBatch24.subjects).reduce((a,b)=>a+b,0)!==118) fail('24 November original-practice batch count, IDs, candidate and subject totals are incorrect');
const optionNorm24 = value => value.normalize('NFKD').toLowerCase().replace(/[^\\p{L}\\p{N}\\s]/gu,'').replace(/\\s+/g,' ').trim();
for (const question of expansionBatch24.questions) {
  if (!question.topic || !question.exam || !Array.isArray(question.examTags) || question.examTags.length !== 3 || !['MPSC Inspector of Taxes','DSC East Khasi Hills LDA-cum-Typist','MPSC Secretariat LDA'].every(track=>question.examTags.includes(track)) || !question.e || question.e.length < 120 || !question.source || !question.source.includes('not an official PYQ') || question.label !== 'Original Practice' || question.sourceType !== 'Original Practice' || !question.sourceName || !question.sourceURL || !question.sourceURL.startsWith('https://') || /\\s/.test(question.sourceURL) || question.sourceVerifiedDate !== '2026-11-24' || !question.verificationStatus || !question.verificationStatus.includes('2026-11-24') || question.difficulty === 'PYQ' || question.answerIndex !== question.a || question.o.length !== 4 || new Set(question.o.map(optionNorm24)).size !== 4 || !Number.isInteger(question.a) || question.a < 0 || question.a > 3 || !question.tags.includes(question.cat) || !question.tags.includes(question.topic) || !question.tags.includes('Original Practice')) fail('24 November question ' + question.id + ' has incomplete schema, options, answer, explanation, source or exam tags');
  if (question.cat === 'GST / Inspector of Taxes' && !question.sourceURL.startsWith('https://www.indiacode.nic.in/')) fail('24 November GST question ' + question.id + ' must use the official India Code statutory source');
}
if (expansionBatch24.deduplication?.exactStemCollisions !== 0 || expansionBatch24.deduplication?.optionSetCollisions !== 0 || expansionBatch24.deduplication?.nearSemanticCandidatesRejected !== 13 || expansionBatch24.deduplication?.withinBatchNearDuplicatePairs !== 0 || expansionBatch24.deduplication?.finalBatchNearPairs !== 0 || expansionBatch24.deduplication?.unresolvedSemanticCollisions !== 0 || expansionBatch24.deduplication?.pyqNearMatchesAtJaccard040 !== 0 || expansionBatch24.deduplication?.activeNearMatchesAtJaccard045 !== 0) fail('24 November collision audit is incomplete');
if (expansionBatch24.legalVerification?.asOf !== '2026-11-24' || expansionBatch24.legalVerification?.cgstActConsolidatedDate !== '2026-06-11' || expansionBatch24.legalVerification?.environmentReferences?.includes('Solid Waste Management Rules 2026 effective 2026-04-01') !== true) fail('24 November legal and environmental rule verification is missing');
if (expansionBatch24.legalVerification?.cbicInstruction?.reference !== 'Instruction No. 02/2026-GST' || expansionBatch24.legalVerification?.cbicInstruction?.date !== '2026-10-30' || expansionBatch24.legalVerification?.cbicInstruction?.scope !== 'Central Tax field formations under CBIC' || !expansionBatch24.legalVerification?.meghalayaStateInstructionStatus?.includes('No separate Meghalaya State GST instruction')) fail('CBIC interim instruction scope or Meghalaya applicability caveat is missing');
if (!sw.includes('./question-batches/2026-11-24-original-practice.json')) fail('service worker does not precache 24 November original-practice archive');
if (!html.includes('mpsc-build') || !html.includes('2026-11-24-original-practice-118') || !html.includes('Q.length') || html.includes('fetch(\"./question-batches/') || html.includes(\"fetch('./question-batches/\")) fail('24 November build marker, Q.length dashboard count or offline-first loader is incorrect');
const dedupIndex24 = jsonFile('audit/dedup-index-2026-11-24.json');
if (dedupIndex24.schemaVersion !== 9 || dedupIndex24.canonical.questionCount !== 1406 || dedupIndex24.canonical.activeFingerprints.length !== 1406 || dedupIndex24.officialPyq.fileCount !== 18 || dedupIndex24.officialPyq.questionCount !== 2433 || dedupIndex24.archive.fileCount !== 22 || dedupIndex24.archive.questionCount !== 814 || dedupIndex24.allPyqFiles.fileCount !== 19 || dedupIndex24.allPyqFiles.questionCount !== 2572) fail('24 November full-bank dedup index totals are incorrect');
if (new Set(dedupIndex24.canonical.activeFingerprints.map(record=>record.i)).size !== 1406 || dedupIndex24.canonical.activeFingerprints.some(record=>!record.s || !record.o || !record.k || !Array.isArray(record.w))) fail('24 November active dedup index has duplicate IDs or incomplete fingerprints');
if (dedupIndex24.candidateScan.drafted !== 131 || dedupIndex24.candidateScan.accepted !== 118 || dedupIndex24.candidateScan.rejected !== 13 || dedupIndex24.candidateScan.exactStemCollisions !== 0 || dedupIndex24.candidateScan.optionSetCollisions !== 0 || dedupIndex24.candidateScan.nearSemanticRejected !== 13 || dedupIndex24.candidateScan.withinBatchNearPairs !== 0 || dedupIndex24.candidateScan.finalBatchNearPairs !== 0 || dedupIndex24.candidateScan.unresolved !== 0 || dedupIndex24.candidateScan.rejectedCandidates.length !== 13) fail('24 November candidate collision audit is inconsistent');
const dedupAudit24 = jsonFile('audit/dedup-audit-2026-11-24.json');
if (dedupAudit24.target !== 130 || dedupAudit24.draftedCandidates !== 131 || dedupAudit24.validatedUniqueQuestions !== 118 || dedupAudit24.rejectedCandidates.length !== 13 || dedupAudit24.collisions.candidateExactStemCollisions !== 0 || dedupAudit24.collisions.candidateOptionSetCollisions !== 0 || dedupAudit24.collisions.unresolvedSemanticCollisions !== 0 || dedupAudit24.collisions.withinBatchNearPairs !== 0 || dedupAudit24.collisions.finalBatchNearPairs !== 0 || dedupAudit24.mergedQuestions !== 0 || dedupAudit24.mergeStatus !== 'pending_merge' || dedupAudit24.postMergeAudit !== false || dedupAudit24.activeUniqueQuestionsAfterMerge !== null) fail('24 November pre-merge audit is inconsistent');
const run24 = rampTracker.latestRun;
if (!run24 || run24.date !== '2026-11-24' || run24.target !== 130 || run24.draftedCandidates !== 131 || run24.validatedQuestions !== 118 || run24.rejectedCandidates !== 13 || run24.status !== 'pending_merge' || run24.mergedQuestions !== 0 || run24.activeUniqueAdditions !== 0 || run24.projectedActiveUniqueCount !== 1406 || run24.targetAchievementRate !== 0.9076923076923077 || rampTracker.currentDailyTarget !== 130 || rampTracker.nextDailyTarget !== 130 || rampTracker.currentActiveQuestions !== 1288 || rampTracker.cumulativeUniqueAdditionsSinceRampStart !== 407 || rampTracker.remainingTo10000 !== 8712) fail('24 November pending campaign tracker incorrectly counts unmerged questions or advances the ramp');
