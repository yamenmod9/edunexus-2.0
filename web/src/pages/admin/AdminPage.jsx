import { useEffect, useRef, useState } from 'react'

import {
  forms as formsApi,
  questions as questionsApi,
  taxonomy as taxonomyApi,
} from '../../api/client.js'
import MathText from '../../components/MathText.jsx'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Spinner,
  humanize,
} from '../../components/ui.jsx'

const BLANK = {
  section: 'math',
  domain: 'algebra',
  skill: '',
  difficulty: 'medium',
  question_type: 'multiple_choice',
  stimulus: '',
  stem: '',
  choices: [
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ],
  correct_answer: 'A',
  rationale: '',
  source: 'self_authored',
}

function toPayload(draft) {
  const payload = {
    section: draft.section,
    domain: draft.domain,
    skill: draft.skill.trim(),
    difficulty: draft.difficulty,
    question_type: draft.question_type,
    stem: draft.stem.trim(),
    correct_answer: draft.correct_answer.trim(),
    source: draft.source,
  }
  if (draft.stimulus.trim()) payload.stimulus = draft.stimulus.trim()
  if (draft.rationale.trim()) payload.rationale = draft.rationale.trim()
  if (draft.question_type === 'multiple_choice') {
    payload.choices = draft.choices
      .filter((c) => c.text.trim())
      .map((c) => ({ id: c.id, text: c.text.trim() }))
  }
  return payload
}

function QuestionForm({ taxonomy, onSaved }) {
  const [draft, setDraft] = useState(BLANK)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)

  const sections = taxonomy?.sections ?? []
  const domains = sections.find((s) => s.value === draft.section)?.domains ?? []

  function set(name, value) {
    setDraft((current) => {
      const next = { ...current, [name]: value }
      if (name === 'section') {
        // Domains are section-specific; the server rejects a mismatch, so keep
        // the form from ever offering one.
        const first = sections.find((s) => s.value === value)?.domains?.[0]?.value
        if (first) next.domain = first
        if (value !== 'math' && current.question_type === 'grid_in') {
          next.question_type = 'multiple_choice'
        }
      }
      return next
    })
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const created = await questionsApi.create(toPayload(draft))
      setSaved(created)
      setDraft(BLANK)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const isGridIn = draft.question_type === 'grid_in'

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">Author a question</h2>
      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">Saved. Question id {saved.id}.</Alert>}

      <form onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="q-section" label="Section">
            <select
              id="q-section"
              value={draft.section}
              onChange={(e) => set('section', e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            >
              {sections.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field id="q-domain" label="Domain">
            <select
              id="q-domain"
              value={draft.domain}
              onChange={(e) => set('domain', e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            >
              {domains.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </Field>
          <Field
            id="q-skill"
            label="Skill"
            required
            value={draft.skill}
            onChange={(e) => set('skill', e.target.value)}
            hint="Free text, e.g. Linear equations in one variable"
          />
          <Field id="q-difficulty" label="Difficulty">
            <select
              id="q-difficulty"
              value={draft.difficulty}
              onChange={(e) => set('difficulty', e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            >
              {(taxonomy?.difficulties ?? []).map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </Field>
          <Field id="q-type" label="Question type">
            <select
              id="q-type"
              value={draft.question_type}
              onChange={(e) => set('question_type', e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            >
              <option value="multiple_choice">Multiple Choice</option>
              {/* Grid-in is math-only (CLAUDE.md section 5). */}
              {draft.section === 'math' && <option value="grid_in">Grid In</option>}
            </select>
          </Field>
        </div>

        <Field id="q-stimulus" label="Stimulus (optional)">
          <textarea
            id="q-stimulus"
            rows={3}
            value={draft.stimulus}
            onChange={(e) => set('stimulus', e.target.value)}
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm"
          />
        </Field>

        <Field id="q-stem" label="Question">
          <textarea
            id="q-stem"
            rows={3}
            required
            value={draft.stem}
            onChange={(e) => set('stem', e.target.value)}
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm"
          />
        </Field>
        <p className="-mt-2 mb-4 text-xs text-ink-faint">
          Wrap math in $…$ for inline or $$…$$ for a display block.
        </p>

        {isGridIn ? (
          <Field
            id="q-answer"
            label="Accepted answer(s)"
            required
            value={draft.correct_answer}
            onChange={(e) => set('correct_answer', e.target.value)}
            hint="Separate alternatives with | — for example 3|-3"
          />
        ) : (
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium">Choices</legend>
            {draft.choices.map((choice, i) => (
              <div key={choice.id} className="mb-2 flex items-center gap-2">
                <label className="flex items-center gap-1 text-sm font-semibold">
                  <input
                    type="radio"
                    name="correct"
                    checked={draft.correct_answer === choice.id}
                    onChange={() => set('correct_answer', choice.id)}
                    aria-label={`Mark choice ${choice.id} correct`}
                  />
                  {choice.id}
                </label>
                <input
                  value={choice.text}
                  aria-label={`Choice ${choice.id} text`}
                  onChange={(e) =>
                    setDraft((current) => {
                      const choices = [...current.choices]
                      choices[i] = { ...choices[i], text: e.target.value }
                      return { ...current, choices }
                    })
                  }
                  className="flex-1 rounded-md border border-line-strong px-3 py-2 text-sm"
                />
              </div>
            ))}
            <p className="text-xs text-ink-faint">
              The radio button marks the correct choice.
            </p>
          </fieldset>
        )}

        <Field id="q-rationale" label="Explanation (optional)">
          <textarea
            id="q-rationale"
            rows={2}
            value={draft.rationale}
            onChange={(e) => set('rationale', e.target.value)}
            className="w-full rounded-md border border-line-strong px-3 py-2 text-sm"
          />
        </Field>

        {draft.stem && (
          <div className="mb-4 rounded-md bg-sunken p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-ink-faint">Preview</p>
            <MathText>{draft.stem}</MathText>
          </div>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save question'}
        </Button>
      </form>
    </Card>
  )
}

function ImportPanel({ onImported }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  async function upload(event) {
    event.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await questionsApi.importFile(file))
      onImported?.()
    } catch (err) {
      // A 207 is a partial success, and the client throws only on !ok, so this
      // really is a failure - but the payload still lists the row errors.
      setError(err.message)
      setResult(err.payload ?? null)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Bulk import</h2>
      <p className="mb-4 text-sm text-ink-soft">
        A <code>.csv</code> or <code>.json</code> file. Rows are validated one by one:
        good rows import even if others fail, and failures come back with their row
        number.
      </p>
      {error && <Alert>{error}</Alert>}
      {result && (
        <Alert tone={result.failed ? 'warn' : 'success'}>
          Imported {result.imported}. Failed {result.failed ?? 0}.
          {result.errors?.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.errors.slice(0, 8).map((row) => (
                <li key={row.row}>
                  Row {row.row}: {Object.keys(row.errors).join(', ')}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      <form onSubmit={upload} className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json"
          aria-label="Question file to import"
          className="text-sm"
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
      </form>
    </Card>
  )
}

function FormBuilder({ onBuilt }) {
  const [name, setName] = useState('')
  const [perModule, setPerModule] = useState(8)
  const [minutes, setMinutes] = useState(12)
  const [error, setError] = useState(null)
  const [built, setBuilt] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setBuilt(null)
    try {
      const created = await formsApi.create({
        name: name.trim(),
        blueprint: {
          reading_writing: {
            questions_per_module: Number(perModule),
            time_limit_seconds: Number(minutes) * 60,
          },
          math: {
            questions_per_module: Number(perModule),
            time_limit_seconds: Number(minutes) * 60,
          },
        },
      })
      setBuilt(created)
      setName('')
      onBuilt?.()
    } catch (err) {
      const shortfalls = err.payload?.shortfalls ?? []
      setError(
        shortfalls.length
          ? `${err.message}. ${shortfalls
              .map((s) => `${humanize(s.section)} is short by ${s.short_by}`)
              .join('; ')}.`
          : err.message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Assemble a test form</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Builds six modules from the bank — module 1 plus both module 2 variants, per
        section. Needs {perModule * 3} questions in each section.
      </p>
      {error && <Alert>{error}</Alert>}
      {built && <Alert tone="success">Built “{built.name}” with {built.modules.length} modules.</Alert>}
      <form onSubmit={submit}>
        <Field
          id="form-name"
          label="Form name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="form-per-module"
            label="Questions per module"
            type="number"
            min="1"
            max="100"
            value={perModule}
            onChange={(e) => setPerModule(e.target.value)}
            hint="Leave at 27/22 for full length; smaller makes a practice form."
          />
          <Field
            id="form-minutes"
            label="Minutes per module"
            type="number"
            min="1"
            max="120"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Assembling…' : 'Assemble form'}
        </Button>
      </form>
    </Card>
  )
}

export default function AdminPage() {
  const [taxonomy, setTaxonomy] = useState(null)
  const [recent, setRecent] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    taxonomyApi.get().then(setTaxonomy).catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    questionsApi
      .list({ per_page: 5 })
      .then((data) => setRecent(data.items))
      .catch(() => setRecent([]))
  }, [refreshKey])

  const refresh = () => setRefreshKey((k) => k + 1)

  if (!taxonomy) return <Spinner label="Loading admin tools" />

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">Admin</h1>
      <p className="mb-5 text-sm text-ink-faint">
        Author and import questions, and assemble them into adaptive test forms.
      </p>

      <div className="space-y-5">
        <ImportPanel onImported={refresh} />
        <FormBuilder onBuilt={refresh} />
        <QuestionForm taxonomy={taxonomy} onSaved={refresh} />

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Recently added</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-faint">The bank is empty.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((question) => (
                <li key={question.id} className="border-b border-line pb-2 text-sm">
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge tone="info">{humanize(question.section)}</Badge>
                    <Badge>{humanize(question.domain)}</Badge>
                    <Badge>{humanize(question.difficulty)}</Badge>
                  </div>
                  <span className="text-ink-soft">{question.stem.slice(0, 110)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
