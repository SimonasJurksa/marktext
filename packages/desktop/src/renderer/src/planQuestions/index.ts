/**
 * Plan-question template support.
 *
 * Plans written for (and by) AI agents use a fixed shape: a bold question line
 * such as `**K1. Title**` (any short letter prefix: K1, N1, Q12 …), optional
 * explanatory paragraphs, lettered options `a) …`, `b) …` and an answer line
 * `Atsakymas:`. A question counts as answered when text follows the colon or
 * when non-empty lines follow the answer line before the next question or a
 * section boundary (`---`, heading).
 */

export interface PlanOption {
  letter: string
  text: string
  recommended: boolean
}

export interface PlanQuestion {
  /** Identifier from the question line, e.g. `K1`. */
  id: string
  title: string
  /** 0-based line index of the question line. */
  line: number
  /** Explanatory text between the question and its options (markdown kept as is). */
  summary: string
  options: PlanOption[]
  /** 0-based line index of the `Atsakymas:` line, or null when it is missing. */
  answerLine: number | null
  /** 0-based line index of the last line belonging to this question. */
  endLine: number
  answer: string
  answered: boolean
}

export interface PlanSummary {
  questions: PlanQuestion[]
  answered: number
  total: number
}

export const QUESTION_RE = /^\*\*([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]{1,4}\d+)\.\s*(.+?)\*\*\s*$/
const OPTION_RE = /^([a-z])\)\s*(.*)$/
const ANSWER_RE = /^Atsakymas:\s*(.*)$/
const BOUNDARY_RE = /^(---+\s*$|#{1,6}\s)/
const RECOMMENDED_RE = /\(rekomenduojam[a-z]*\)/i

const EMPTY: PlanSummary = Object.freeze({ questions: [], answered: 0, total: 0 }) as PlanSummary

const stripCr = (line: string): string => (line.endsWith('\r') ? line.slice(0, -1) : line)

/**
 * Parses every plan question in `markdown`. Cheap enough to run on each
 * keystroke: a single pass over the lines, skipped entirely for documents
 * without an answer line.
 */
export const parsePlanQuestions = (markdown: string | null | undefined): PlanSummary => {
  if (!markdown || !markdown.includes('Atsakymas:')) return EMPTY

  const lines = markdown.split('\n').map(stripCr)
  const starts: number[] = []
  for (let index = 0; index < lines.length; index++) {
    if (QUESTION_RE.test(lines[index] ?? '')) starts.push(index)
  }
  if (!starts.length) return EMPTY

  const questions: PlanQuestion[] = []
  for (let n = 0; n < starts.length; n++) {
    const start = starts[n]!
    const nextStart = starts[n + 1] ?? lines.length
    let end = nextStart
    for (let index = start + 1; index < nextStart; index++) {
      if (BOUNDARY_RE.test(lines[index] ?? '')) {
        end = index
        break
      }
    }
    questions.push(parseQuestion(lines, start, end))
  }

  return {
    questions,
    answered: questions.filter((question) => question.answered).length,
    total: questions.length
  }
}

const parseQuestion = (lines: string[], start: number, end: number): PlanQuestion => {
  const match = QUESTION_RE.exec(lines[start] ?? '')!
  const summary: string[] = []
  const options: PlanOption[] = []
  let answerLine: number | null = null
  const answerText: string[] = []

  for (let index = start + 1; index < end; index++) {
    const line = lines[index] ?? ''
    if (answerLine !== null) {
      answerText.push(line)
      continue
    }
    const answer = ANSWER_RE.exec(line)
    if (answer) {
      answerLine = index
      answerText.push(answer[1] ?? '')
      continue
    }
    const option = OPTION_RE.exec(line)
    if (option) {
      options.push({ letter: option[1]!, text: option[2] ?? '', recommended: false })
      continue
    }
    const last = options[options.length - 1]
    if (last && line.trim()) {
      // Wrapped option text continues on the following (usually indented) lines.
      last.text = `${last.text} ${line.trim()}`
    } else if (!last) {
      summary.push(line)
    }
  }

  for (const option of options) {
    option.recommended = RECOMMENDED_RE.test(option.text)
    option.text = option.text.replace(RECOMMENDED_RE, '').replace(/\s+/g, ' ').trim()
  }

  const answer = answerText.join('\n').trim()
  return {
    id: match[1]!,
    title: match[2]!.trim(),
    line: start,
    summary: summary.join('\n').trim(),
    options,
    answerLine,
    endLine: end - 1,
    answer,
    answered: answer.length > 0
  }
}

/** Splits a stored answer (`a — comment`) back into its option letter and comment. */
export const splitAnswer = (
  answer: string,
  options: PlanOption[]
): { letter: string | null; comment: string } => {
  const match = /^([a-z])(?:\s*[—–-]\s*([\s\S]*))?$/.exec(answer.trim())
  if (match && options.some((option) => option.letter === match[1])) {
    return { letter: match[1]!, comment: (match[2] ?? '').trim() }
  }
  return { letter: null, comment: answer.trim() }
}

/** Formats the text written after `Atsakymas:` for a chosen option and/or comment. */
export const formatAnswer = (letter: string | null, comment: string): string => {
  const note = comment.replace(/\s*\n\s*/g, ' ').trim()
  if (letter && note) return `${letter} — ${note}`
  if (letter) return letter
  return note
}

/**
 * Returns `markdown` with the answer of `question` replaced by `answer`. The
 * answer goes on the `Atsakymas:` line; when a question has no such line one
 * is appended at the end of the question. Any older multi-line answer below
 * the line is left untouched. The returned line is where the answer landed.
 */
export const writeAnswer = (
  markdown: string,
  question: PlanQuestion,
  answer: string
): { markdown: string; line: number } => {
  const rawLines = markdown.split('\n')
  const text = answer.trim()
  const render = (line: string | undefined): string =>
    `Atsakymas:${text ? ` ${text}` : ''}${line?.endsWith('\r') ? '\r' : ''}`

  if (question.answerLine !== null) {
    rawLines[question.answerLine] = render(rawLines[question.answerLine])
    return { markdown: rawLines.join('\n'), line: question.answerLine }
  }

  // No answer line yet: append one after the last non-empty line of the question.
  let insertAt = question.endLine
  while (insertAt > question.line && !stripCr(rawLines[insertAt] ?? '').trim()) insertAt--
  const eol = rawLines[insertAt]?.endsWith('\r') ? '\r' : ''
  rawLines.splice(insertAt + 1, 0, eol, render(eol ? '\r' : ''))
  return { markdown: rawLines.join('\n'), line: insertAt + 2 }
}
