# MPSC Smart Study Hub V5

GitHub-ready Meghalaya MPSC study website focused on LDA and officer-post preparation.

## Current repository status
- **592 questions** in the current question bank.
- **67 questions** are tagged as PYQ items. These are individual PYQ questions/concepts, not 67 complete papers.
- The daily practice batch is stored separately in `question-batches/2026-10-10.json`; its questions are labelled as original practice, not official PYQs.
- The simulator supports original question-number display when a question has `paperNo`, and preserves ascending order when the selected pool contains one paper ID with numbered questions.
- **Complete exact-paper status: not yet complete.** The current bank does not yet contain the full set of requested papers as separately identified, fully transcribed datasets with original numbering, complete options, answer-key verification, and explanations for every question. Do not treat PYQ-only practice as an exact original paper.

## Priorities still open
1. Transcribe all 19 requested uploaded papers in original order and preserve printed question numbers and option order.
2. Verify each answer against the relevant official MPSC answer key, recording the key/source and any ambiguity.
3. Add detailed, question-specific explanations, including working for aptitude and mathematics.
4. Add a paper selector and full-paper timed-test mode that only enables a paper when its completeness and answer verification have been checked.
5. Test timing, scoring, unanswered questions, answer review, mobile layout, and question order before calling a paper complete.

## Source policy
Official MPSC material is the primary source for paper text, answer keys, notices, and syllabus changes. Genuine PYQs and original practice questions must remain clearly distinct. Use the official [Previous Year Questions](https://www.mpsc.meghalaya.gov.in/pyq.html), [Answer Keys](https://mpsc.meghalaya.gov.in/anskey.html), and [Answer-Key Notifications](https://mpsc.meghalaya.gov.in/notifications-ak.html) pages as the source of record.

## Recent verified code change
PR #14 was merged on 10 October 2026. Question cards now display `paperNo` when available and fall back to the question-bank ID for ordinary practice questions. This display change does not mean the 19 complete-paper transcriptions are finished.


## Question counts and transcription status (31 October 2026)
- The embedded question array contains **592 questions**.
- The application loads four additive dated batches (11 Oct: 33; 12 Oct: 30; 30 Oct: 35; 30 Oct major: 32), for **130 additional unique questions** and an active baseline of **722**.
- The 10 October archive contains 31 IDs that already exist in the embedded bank; it is not loaded by the application and must not be counted as additional questions.
- The 31 October release adds 10 new questions (7 dated current-affairs items and 3 original practice questions), taking the expected active count to **732** after the branch is merged and the batch loads.
- **LDA Secretariat May 2025, Series I:** questions 1–20 have been transcribed from the uploaded booklet with printed numbering and option order preserved. Their answers were checked against the MPSC final answer key dated 17 December 2025. The paper has 150 questions; 130 remain. The paper is **not complete**, and exact full-paper timed mode must remain disabled until all 150 are transcribed and verified.
- The 31 October transcription audit is in `audit/pyq-transcription-2026-10-31.json`; the 31 October question batch and current-affairs feed are stored separately.
