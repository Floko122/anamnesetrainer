# Case History Trainer

A dependency-free static learning exercise designed for GitHub Pages. Open it with:

```text
https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/?series=demo-basics
```

The value of `series` maps to `cases/<series>.json`; for example, `?series=demo-basics` loads `cases/demo-basics.json`.

Append `&lang=de` to load a supported interface language (for example `?series=demo-basics&lang=de`). The interface labels are loaded from `i18n/<language>.json`; add a new JSON file there to support another language. If a requested file is unavailable, the app falls back to English.

## Deploy on GitHub Pages

1. Create a GitHub repository and upload this folder's contents to its root.
2. In **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
3. Open the Pages URL with `?series=demo-basics` appended.

## Case JSON model

Each series has a shared `diagnosisPool`. A case can remove candidates with `diagnoses.exclude` and add candidates with `diagnoses.include`. Its `diagnoses.correct` list must contain one or more diagnoses that appear in the resulting pool.

The optional `labels` property carries translated learner-facing content. Put series title, description, category prompts, and diagnosis labels under `labels.<language>`. Put each case's title, presentation, and question text/answers under `cases[].labels.<language>`. The included `demo-basics.json` provides a complete German example.

Questions use a stable `id`. Clicking a question is irreversible for that case: it reveals the answer, records the question ID in the active case result, and unlocks any questions whose `required` IDs have all been asked.

All questions, including vegetative history, system and past history, medication/allergies, substance use, social/family history, and primary-care context, belong directly in each case's `questions` array. They are structurally equivalent to the targeted questions and can therefore be used equally in question-based scoring.

```json
{
  "id": "my-series",
  "title": "My case series",
  "defaultTimeLimitSeconds": 300,
  "diagnosisPool": ["Diagnosis A", "Diagnosis B"],
  "cases": [{
    "id": "case-1",
    "title": "Case title",
    "presentation": "Initial information shown to the learner.",
    "questions": [{
      "id": "onset",
      "category": "History of presenting complaint",
      "text": "When did it start?",
      "answer": "Three days ago."
    }, {
      "id": "onset-detail",
      "category": "History of presenting complaint",
      "text": "Was it sudden?",
      "answer": "Yes.",
      "required": ["onset"]
    }],
    "diagnoses": {
      "include": [],
      "exclude": [],
      "correct": ["Diagnosis A"]
    }
  }]
}
```

## Scoring

For each case, the **remaining-time percentage** is the score unit. A learner must select at least one correct diagnosis to score or receive success feedback.

`case score = remaining-time percentage × max(0, correct selections − wrong selections)`

Thus, selecting one correct answer at 80% time remaining earns 80 points; selecting two correct answers earns 160; one correct plus one wrong earns 0. A wrong-only submission and a timeout earn 0. Total series score is shown at completion and saved only in the current browser's local storage so a future visit can show a completion reminder.

## Reusing question data in scoring

Each completed case creates an in-memory result record. Its `askedQuestionIds`, `selectedDiagnoses`, `correctSelections`, `wrongSelections`, remaining time, and timeout status are passed to `calculateScore()` in `app.js`. Edit that single function to add question-based rewards or penalties. The detailed record is not stored after the browser session ends; only the final total is retained locally for the completion reminder.
