# Exact PYQ paper data format

Only transcribe a paper from an original user-uploaded paper or a verified official source. Never create or predict content in this directory.

## Catalogue: `pyq-papers/index.json`

A catalogue record becomes selectable for full timed practice only when `complete: true`, `transcribedQuestions === totalQuestions`, and `questionsPath` points to its exact-paper JSON. A paper may be complete while containing explicitly unscored defective items, provided every printed question, option, and explanation is preserved and the timed runner excludes those items from scoring.

For a complete paper, record the source-based timing and marks where printed: `durationMinutes`, `marksPerQuestion`, `fullMarks`, and `negativeMarking`. Do not invent these values when the source does not state them.

## Paper file

Each paper file is JSON with a `questions` array. Keep printed question order and option order unchanged.

```json
{
  "schemaVersion": 1,
  "paperId": "meghalaya-pyq-002",
  "complete": true,
  "durationMinutes": 150,
  "marksPerQuestion": 2,
  "fullMarks": 300,
  "negativeMarking": false,
  "sections": [
    {"title": "Part A", "startQuestion": 1, "endQuestion": 75, "questionCount": 75}
  ],
  "candidateInstructions": ["Original instructions from the source booklet"],
  "officialAnswerKey": {
    "url": "https://official.example/answer-key.pdf",
    "date": "YYYY-MM-DD",
    "documentNumber": "official document number"
  },
  "questions": [
    {
      "number": 1,
      "text": "Exact question text from the source",
      "options": ["Exact option A", "Exact option B", "Exact option C", "Exact option D"],
      "answerIndex": 0,
      "officialAnswerIndex": 0,
      "answerStatus": "official_answer_key",
      "explanation": "Independently written reasoning",
      "section": "Part A",
      "sectionInstruction": "Exact directions printed for this question group",
      "passage": "A shared reading or cloze passage, attached to its first question",
      "targetWord": "Exact underlined source phrase"
    }
  ]
}
```

- `number`: original printed number.
- `text`: verbatim question wording, including punctuation and relevant spelling.
- `options`: exactly four options in the original order for this MCQ runner.
- `answerIndex`: zero-based independently solved answer used for scoring only when a defensible answer exists.
- `officialAnswerIndex`: zero-based option from a verified official answer key, stored separately from the independent solution.
- `answerStatus`: explicit provenance/status, including key agreement, key disagreement, caveat, or unresolved item.
- `explanation`: independently written reasoning. For an unscored item, explain precisely why no defensible unique option exists.
- `section`, `sectionInstruction`, `passage`, and `targetWord`: preserve printed section boundaries, group directions, shared passages, and underlined text.
- `answerIndex: null` is permitted only when the item is explicitly marked unresolved, has a clear explanation, and is excluded from scoring by the exact-paper runner.
- When an official key conflicts with a defensible independent solution, retain both indices and explain the discrepancy; never silently replace the independent solution with the official key.
- Incomplete papers must have `complete: false` and must not start as a full timed examination.
- The exact-paper runner must display the source timing, marks, sections, directions, passages and underlined targets; it must show unresolved questions as unscored and never count an attempted unscored item as incorrect.
- The online PYQ runner does not provide a PDF viewer or PDF download.
- Mock tests use the separate practice bank and must never pull questions from this archive.
