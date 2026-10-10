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
