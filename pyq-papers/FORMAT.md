# Exact PYQ paper data format

Only transcribe a paper from an original user-uploaded paper or a verified official source. Never create or predict content in this directory.

## Catalogue: `pyq-papers/index.json`

```json
{
  "schemaVersion": 1,
  "description": "Only exact transcriptions of user-uploaded historical papers belong here.",
  "papers": [
    {
      "id": "inspector-of-taxes-2021-series-iii",
      "exam": "Inspector of Taxes",
      "year": 2021,
      "series": "III",
      "title": "Inspector of Tax — Series III",
      "totalQuestions": 150,
      "transcribedQuestions": 150,
      "durationMinutes": 150,
      "complete": true,
      "answerKeyVerified": false,
      "questionsPath": "pyq-papers/inspector-of-taxes-2021-series-iii.json",
      "sourceDescription": "Original paper uploaded by the user",
      "answerKeySource": null
    }
  ]
}
```

The example above documents the shape only; it is not an available paper and must not be copied into the live catalogue until the paper and every question have actually been checked.

## Paper file

Each paper file is JSON with a `questions` array. Keep printed question order and option order unchanged.

```json
{
  "questions": [
    {
      "number": 1,
      "text": "Exact question text from the source",
      "options": ["Exact option A", "Exact option B", "Exact option C", "Exact option D"],
      "answerIndex": null,
      "explanation": ""
    }
  ]
}
```

- `number`: original printed number.
- `text`: verbatim transcription, including punctuation and relevant spelling.
- `options`: exactly four options in the original order for this MCQ runner.
- `answerIndex`: zero-based index only when supported by a verified answer key; otherwise `null`.
- `explanation`: may be added after key verification; do not alter the original question or options.
- Incomplete papers must have `complete: false` and must not start as a full timed examination.
- The online PYQ runner does not provide a PDF viewer or PDF download.
- Mock tests use the separate practice bank and must never pull questions from this archive.
