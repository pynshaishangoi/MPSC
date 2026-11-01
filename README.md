# MPSC Smart Study Hub V5

GitHub-ready Meghalaya MPSC study website focused on LDA and officer-post preparation.

## Current repository status (1 November 2026)
- **592 embedded questions** in the static question bank.
- **87 items** are tagged as PYQ. These are individual questions, not 87 complete papers. The LDA Secretariat May 2025 Series I now has 67 transcribed questions (printed Q1–67), with 83 still outstanding.
- The app loads seven additive batches: 11 Oct (33), 12 Oct (30), 30 Oct (35), 30 Oct major (32), 31 Oct (10), 1 Nov practice (8) and 1 Nov verified LDA PYQs (20). This is **168 additional records**, giving an expected active total of **760 unique question records** after all seven batches load.
- The 10 October archive contains 31 IDs that already exist in the embedded bank; it is not loaded by the application and must not be counted as additional questions.
- The Study Notes library contains **14 subjects and 34 chapters** after this update. Chapter summaries are revision aids, not a substitute for current official Acts, rules, syllabi or notifications.
- The simulator supports original question-number display when a question has `paperNo`, and preserves ascending order when the selected pool contains one paper ID with numbered questions.
- **Complete exact-paper status: not yet complete.** The LDA Secretariat May 2025 Series I transcription remains partial (67 of 150 questions). Questions 68–150 remain. Exact full-paper timed mode must remain disabled until the complete paper, original numbering/options and official answer-key verification are all present.

## Latest update — 1 November 2026
- Added three dated current-affairs briefs: Khanduli finger-millet revival in West Jaintia Hills (Meghalaya Government, 27 Oct), the High Level Committee on Banking for Viksit Bharat (PIB, 30 Oct), and the COP17 Yerevan Pathway (Reuters, 31 Oct).
- Added eight questions in `question-batches/2026-11-01.json`: three source-linked current-affairs questions and five clearly labelled original practice questions across GST/Inspector of Taxes, arithmetic, reasoning, computer knowledge and English. Added 20 exact PYQs in `question-batches/2026-11-01-lda-pyq.json` for printed questions 26, 29, 30 and 51–67.
- Expanded Meghalaya GK notes with an agriculture/millets chapter and GST/Inspector of Taxes notes with an evidence-led return-review chapter.
- Updated the question loader and service-worker precache; the cache is now `mpsc-smart-study-v5-22-20261101`.
- Existing local progress remains under the same `mpscV4` storage key; no progress, bookmark, note or study-log schema was changed.

## Priorities still open
1. Transcribe the remaining 130 questions from the LDA Secretariat May 2025 Series I paper and other requested papers, preserving original order, printed numbering and option order.
2. Verify each answer against the relevant official MPSC final answer key, recording the key/source and any ambiguity.
3. Add detailed, question-specific explanations, including independently checked working for aptitude and mathematics.
4. Enable exact-paper timed mode only when a paper's full question count, numbering, options and answer verification have been checked.
5. Continue improving mock-test review, mobile usability, revision tools and topic analytics.

## Source policy
Official MPSC material is the primary source for paper text, answer keys, notices and syllabus changes. Genuine PYQs and original practice questions must remain clearly distinct. Use the official [Previous Year Questions](https://www.mpsc.meghalaya.gov.in/pyq.html), [Answer Keys](https://mpsc.meghalaya.gov.in/anskey.html) and [Answer-Key Notifications](https://mpsc.meghalaya.gov.in/notifications-ak.html) pages as the source of record.

## Question-count method
The active count is calculated from the 592 embedded question objects plus the seven files explicitly loaded by the app. The 10 October archive is excluded because its 31 IDs duplicate embedded records and it is not in the loader. Do not use raw ID matches or archived batch totals as the active count.

## Audit trail
- `audit/pyq-transcription-2026-10-31.json`: previous LDA Secretariat Series I transcription status.
- `audit/pyq-transcription-2026-11-01.json`: updated verified coverage through printed question 67.
- `audit/maintenance-2026-10-31.json`: previous question-bank and validation baseline.
- `audit/maintenance-2026-11-01.json`: this run's additions and validation results.
