import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import keybindingsLinux from 'main_renderer/keyboard/keybindingsLinux'
import { formatAnswer, parsePlanQuestions, splitAnswer, writeAnswer } from '@/planQuestions'

const PLAN = `# Plan

1 iteracija — klausimai

**K1. Ką daryti su užklausomis?**

**Trumpai:** registras nepasiekiamas.

a) **išjungti abu skaitytojus dabar** (rekomenduojama)
b) palikti kaip yra
c) sumažinti tempą (1 psl. kas 15 min, backfill'ą tik vieną kartą naktį su
 5 s tarpais)

Atsakymas:

**N2. Ar įjungti perstatymą?**

a) įjungti dabar (rekomenduojama)
b) palaukti

Atsakymas: b — kai lentelė pildysis

---

**K3. Laisvas klausimas be variantų?**

Atsakymas:
Taip, tekstas kitoje eilutėje.

## Kita dalis

Čia ne klausimas. Atsakymas: niekam.
`

describe('plan questions', () => {
  it('binds the wizard to Ctrl+Shift+K on Linux and moves code fence to Ctrl+Alt+K', () => {
    expect(keybindingsLinux.get('edit.answer-plan-questions')).toBe('Ctrl+Shift+K')
    expect(keybindingsLinux.get('paragraph.code-fence')).toBe('Ctrl+Alt+K')
  })

  it('parses questions, options, recommendations and answers from the template', () => {
    const summary = parsePlanQuestions(PLAN)

    expect(summary.total).toBe(3)
    expect(summary.answered).toBe(2)
    expect(summary.questions.map((q) => q.id)).toEqual(['K1', 'N2', 'K3'])

    const [k1, n2, k3] = summary.questions
    expect(k1!.title).toBe('Ką daryti su užklausomis?')
    expect(k1!.summary).toBe('**Trumpai:** registras nepasiekiamas.')
    expect(k1!.options).toEqual([
      { letter: 'a', text: '**išjungti abu skaitytojus dabar**', recommended: true },
      { letter: 'b', text: 'palikti kaip yra', recommended: false },
      {
        letter: 'c',
        text: "sumažinti tempą (1 psl. kas 15 min, backfill'ą tik vieną kartą naktį su 5 s tarpais)",
        recommended: false
      }
    ])
    expect(k1!.answered).toBe(false)
    expect(k1!.answerLine).toBe(13)

    expect(n2!.answered).toBe(true)
    expect(n2!.answer).toBe('b — kai lentelė pildysis')

    expect(k3!.options).toEqual([])
    expect(k3!.answered).toBe(true)
    expect(k3!.answer).toBe('Taip, tekstas kitoje eilutėje.')
  })

  it('accepts the English Answer keyword and keeps it when writing', () => {
    const plan = '**Q1. Deploy on Friday?**\n\na) yes\nb) no\n\nAnswer:\n'
    const { questions, answered, total } = parsePlanQuestions(plan)
    expect(total).toBe(1)
    expect(answered).toBe(0)
    expect(questions[0]!.answerKeyword).toBe('Answer')
    expect(writeAnswer(plan, questions[0]!, 'b').markdown).toBe('**Q1. Deploy on Friday?**\n\na) yes\nb) no\n\nAnswer: b\n')
  })

  it('parses the documented example plan', () => {
    const example = readFileSync(path.resolve(__dirname, '../../../../../docs/examples/plan-example.md'), 'utf8')
    const summary = parsePlanQuestions(example)
    expect(summary.questions.map((q) => q.id)).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
    expect(summary.answered).toBe(1)
    expect(summary.questions[0]!.options.filter((o) => o.recommended).map((o) => o.letter)).toEqual(['a'])
    expect(summary.questions[1]!.answer).toBe('a — the owner already writes the menu in Markdown')
  })

  it('returns an empty summary for documents without the template', () => {
    expect(parsePlanQuestions('# Notes\n\nAtsakymas: nothing\n')).toEqual({
      questions: [],
      answered: 0,
      total: 0
    })
    expect(parsePlanQuestions('**K1. Question**\n\na) yes\n')).toEqual({
      questions: [],
      answered: 0,
      total: 0
    })
    expect(parsePlanQuestions('')).toEqual({ questions: [], answered: 0, total: 0 })
  })

  it('splits and formats stored answers', () => {
    const options = [{ letter: 'a', text: '', recommended: false }]
    expect(splitAnswer('a', options)).toEqual({ letter: 'a', comment: '' })
    expect(splitAnswer('a — note', options)).toEqual({ letter: 'a', comment: 'note' })
    expect(splitAnswer('a - note', options)).toEqual({ letter: 'a', comment: 'note' })
    expect(splitAnswer('z — note', options)).toEqual({ letter: null, comment: 'z — note' })
    expect(splitAnswer('free text', options)).toEqual({ letter: null, comment: 'free text' })

    expect(formatAnswer('a', '')).toBe('a')
    expect(formatAnswer('a', ' note ')).toBe('a — note')
    expect(formatAnswer(null, 'multi\nline')).toBe('multi line')
    expect(formatAnswer(null, '')).toBe('')
  })

  it('writes an answer onto the Atsakymas line and keeps the rest intact', () => {
    const { questions } = parsePlanQuestions(PLAN)
    const { markdown, line } = writeAnswer(PLAN, questions[0]!, 'c — bandom')

    expect(line).toBe(13)
    expect(markdown.split('\n')[13]).toBe('Atsakymas: c — bandom')
    expect(markdown.replace('Atsakymas: c — bandom', 'Atsakymas:')).toBe(PLAN)
    expect(parsePlanQuestions(markdown).answered).toBe(3)
  })

  it('appends an answer line when a question has none and preserves CRLF', () => {
    const crlf = '**K1. Q**\r\n\r\na) yes\r\nb) no\r\n\r\n**K2. Q2**\r\n\r\nAtsakymas:\r\n'
    const { questions } = parsePlanQuestions(crlf)
    expect(questions[0]!.answerLine).toBeNull()

    const { markdown, line } = writeAnswer(crlf, questions[0]!, 'a')
    expect(markdown).toBe('**K1. Q**\r\n\r\na) yes\r\nb) no\r\n\r\nAtsakymas: a\r\n\r\n**K2. Q2**\r\n\r\nAtsakymas:\r\n')
    expect(line).toBe(5)
    expect(parsePlanQuestions(markdown).answered).toBe(1)
  })
})
