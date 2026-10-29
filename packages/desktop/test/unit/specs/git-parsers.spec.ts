import { describe, expect, it } from 'vitest'
import {
  parseBlamePorcelain,
  parseCommitDetails,
  parseStatusPorcelain,
  parseUnifiedDiff
} from 'main_renderer/git/parsers'
import keybindingsLinux from 'main_renderer/keyboard/keybindingsLinux'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const ZERO = '0'.repeat(40)

const BLAME = [
  `${SHA_A} 1 1 2`,
  'author Ada Lovelace',
  'author-mail <ada@example.com>',
  'author-time 1700000000',
  'author-tz +0000',
  'committer Ada Lovelace',
  'committer-mail <ada@example.com>',
  'committer-time 1700000000',
  'committer-tz +0000',
  'summary feat: first draft',
  'filename notes.md',
  '\t# Notes',
  `${SHA_A} 2 2`,
  '\t',
  `${ZERO} 3 3 1`,
  'author External file (--contents)',
  'author-mail <external.file>',
  'author-time 1700000500',
  'author-tz +0000',
  'committer External file (--contents)',
  'committer-mail <external.file>',
  'committer-time 1700000500',
  'committer-tz +0000',
  'summary Version of notes.md from standard input',
  'previous ' + SHA_B + ' notes.md',
  'filename notes.md',
  '\tbrand new line',
  `${SHA_B} 3 4 1`,
  'author Grace Hopper',
  'author-mail <grace@example.com>',
  'author-time 1700001000',
  'author-tz +0000',
  'committer Grace Hopper',
  'committer-mail <grace@example.com>',
  'committer-time 1700001000',
  'committer-tz +0000',
  'summary fix: wording',
  'previous ' + SHA_A + ' notes.md',
  'filename notes.md',
  '\tlast line',
  ''
].join('\n')

describe('git parsers', () => {
  it('binds Ctrl+Alt+G to the annotate toggle on Linux', () => {
    expect(keybindingsLinux.get('view.toggle-git-annotate')).toBe('Ctrl+Alt+G')
  })

  it('parses porcelain blame into per-line commits and uncommitted lines', () => {
    const { commits, lines } = parseBlamePorcelain(BLAME)
    expect(lines).toEqual([SHA_A, SHA_A, '', SHA_B])
    expect(Object.keys(commits).sort()).toEqual([SHA_A, SHA_B])
    expect(commits[SHA_A]).toEqual({
      sha: SHA_A,
      author: 'Ada Lovelace',
      authorMail: 'ada@example.com',
      authorTime: 1700000000,
      summary: 'feat: first draft'
    })
    expect(commits[SHA_B].summary).toBe('fix: wording')
  })

  it('parses unified diff hunks including pure deletions and single-line headers', () => {
    const diff = [
      'diff --git a/head b/-',
      '--- a/head',
      '+++ b/-',
      '@@ -2 +2 @@ context',
      '-old second',
      '+new second',
      '@@ -4,2 +4,0 @@',
      '-gone one',
      '-gone two',
      '@@ -7,0 +6,2 @@',
      '+added one',
      '+added two',
      ''
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      { oldStart: 2, oldCount: 1, newStart: 2, newCount: 1, oldLines: ['old second'], newLines: ['new second'] },
      { oldStart: 4, oldCount: 2, newStart: 4, newCount: 0, oldLines: ['gone one', 'gone two'], newLines: [] },
      { oldStart: 7, oldCount: 0, newStart: 6, newCount: 2, oldLines: [], newLines: ['added one', 'added two'] }
    ])
  })

  it('parses NUL-separated status records and skips rename sources', () => {
    const output = [' M docs/a.md', '?? new.md', 'A  staged.md', 'R  renamed.md', 'old.md', 'D  gone.md', 'UU both.md', ''].join('\0')
    expect(parseStatusPorcelain(output)).toEqual([
      { path: 'docs/a.md', status: 'modified' },
      { path: 'new.md', status: 'untracked' },
      { path: 'staged.md', status: 'added' },
      { path: 'renamed.md', status: 'renamed' },
      { path: 'gone.md', status: 'deleted' },
      { path: 'both.md', status: 'conflict' }
    ])
  })

  it('parses commit details with a multi-line body and changed files', () => {
    const show = [SHA_A, 'Ada Lovelace', 'ada@example.com', '1700000000', 'Ada Lovelace', '1700000100', 'feat: first draft\n\nLonger body.\n\n'].join('\0')
    const files = 'M\tnotes.md\nA\tdocs/new.md\n'
    expect(parseCommitDetails(show, files)).toEqual({
      sha: SHA_A,
      author: 'Ada Lovelace',
      authorMail: 'ada@example.com',
      authorTime: 1700000000,
      committer: 'Ada Lovelace',
      commitTime: 1700000100,
      message: 'feat: first draft\n\nLonger body.',
      files: [
        { status: 'M', path: 'notes.md' },
        { status: 'A', path: 'docs/new.md' }
      ]
    })
    expect(parseCommitDetails('garbage', '')).toBeNull()
  })
})
