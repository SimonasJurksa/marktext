/**
 * Plan-question template support for the renderer: the parser lives in
 * `common/planQuestions/parser` (the main process reads plan status from disk
 * with it); the answer-writing helpers below are only needed by the wizard.
 */

import { stripCr, type PlanOption, type PlanQuestion } from 'common/planQuestions/parser'

export {
  DEFAULT_ANSWER_KEYWORD,
  QUESTION_RE,
  parsePlanQuestions,
  type PlanOption,
  type PlanQuestion,
  type PlanSummary
} from 'common/planQuestions/parser'

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
    `${question.answerKeyword}:${text ? ` ${text}` : ''}${line?.endsWith('\r') ? '\r' : ''}`

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
