/**
 * Plan-question template parser, shared by the renderer (badges, wizard) and
 * the main process (file-tree status read from disk).
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
  /** Keyword used on the answer line (`Atsakymas` or `Answer`). */
  answerKeyword: string
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
// `Atsakymas:` is Lithuanian for `Answer:`; both keywords are accepted.
const ANSWER_RE = /^(Atsakymas|Answer):\s*(.*)$/i
export const DEFAULT_ANSWER_KEYWORD = 'Atsakymas'
const BOUNDARY_RE = /^(---+\s*$|#{1,6}\s)/
const RECOMMENDED_RE = /\((rekomenduojam[a-z]*|recommended)\)/i

const EMPTY: PlanSummary = Object.freeze({ questions: [], answered: 0, total: 0 }) as PlanSummary

export const stripCr = (line: string): string => (line.endsWith('\r') ? line.slice(0, -1) : line)

/**
 * Parses every plan question in `markdown`. Cheap enough to run on each
 * keystroke: a single pass over the lines, skipped entirely for documents
 * without an answer line.
 */
export const parsePlanQuestions = (markdown: string | null | undefined): PlanSummary => {
  if (!markdown || !/(Atsakymas|Answer):/i.test(markdown)) return EMPTY

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
  let answerKeyword = DEFAULT_ANSWER_KEYWORD
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
      answerKeyword = answer[1] ?? DEFAULT_ANSWER_KEYWORD
      answerText.push(answer[2] ?? '')
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
    answerKeyword,
    endLine: end - 1,
    answer,
    answered: answer.length > 0
  }
}
