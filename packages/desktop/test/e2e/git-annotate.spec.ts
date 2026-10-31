import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expectNoRendererErrors, launchElectron, sendIpcToRenderer, waitForEditor, waitForMenuReady } from './helpers'

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Ada Lovelace',
  GIT_AUTHOR_EMAIL: 'ada@example.com',
  GIT_COMMITTER_NAME: 'Ada Lovelace',
  GIT_COMMITTER_EMAIL: 'ada@example.com',
  GIT_AUTHOR_DATE: '2024-01-15T10:00:00+00:00',
  GIT_COMMITTER_DATE: '2024-01-15T10:00:00+00:00',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: tmpdir()
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const COMMITTED = [
  '# Notes',
  '',
  'First paragraph.',
  '',
  'Second paragraph.',
  '',
  'Third paragraph.',
  '',
  'Fourth paragraph.',
  ''
].join('\n')

// First paragraph edited, third deleted, fifth added.
const WORKING = [
  '# Notes',
  '',
  'First paragraph edited.',
  '',
  'Second paragraph.',
  '',
  'Fourth paragraph.',
  '',
  'Fifth paragraph (new).',
  ''
].join('\n')

const findProjectWindow = async(windows: Page[]): Promise<Page | null> => {
  for (const candidate of windows) {
    if (await candidate.locator('.side-bar-file').count()) return candidate
  }
  return null
}

test('git annotations show blame and changes in both modes, the commit dialog and tree marks', async() => {
  test.setTimeout(120000)
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'marktext-git-')))
  git(directory, 'init', '-q')
  git(directory, 'config', 'commit.gpgsign', 'false')
  const notesPath = path.join(directory, 'notes.md')
  writeFileSync(notesPath, COMMITTED)
  git(directory, 'add', 'notes.md')
  git(directory, 'commit', '-q', '-m', 'feat: first draft')
  const sha = git(directory, 'rev-parse', 'HEAD').trim()
  writeFileSync(notesPath, WORKING)
  writeFileSync(path.join(directory, 'untracked.md'), '# New\n')

  const { app, page: firstPage } = await launchElectron([directory], {
    preferences: { language: 'en', autoSave: false, tabBarVisibility: true }
  })
  let page = firstPage
  try {
    await expect
      .poll(async() => {
        const found = await findProjectWindow(app.windows())
        if (found) page = found
        return !!found
      }, { timeout: 15000 })
      .toBe(true)
    await waitForMenuReady(app)

    // Tree marks come from `git status` of the opened folder.
    const notesRow = page.locator('.side-bar-file[title$="notes.md"]').first()
    await expect(notesRow).toHaveClass(/git-modified/)
    await expect(page.locator('.side-bar-file[title$="untracked.md"]').first()).toHaveClass(/git-untracked/)

    await notesRow.click()
    await waitForEditor(page)
    await expect(page.locator('.tabs-container > li.active')).toContainText('notes.md')

    // The title bar shows a commit glyph for the block under the caret; the
    // commit details live in its tooltip.
    const blameLine = page.locator('.title-bar .git-blame-line')
    await expect(blameLine).toBeVisible()
    await expect(blameLine).toHaveAttribute('title', /Ada Lovelace/)
    await expect(blameLine).toHaveAttribute('title', /feat: first draft/)
    await expect(blameLine).not.toHaveClass(/uncommitted/)

    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.toggle-git-annotate')
    const rows = page.locator('.git-gutter__row')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(0)).toHaveText('2024-01-15 Ada Lovelace')
    await expect(rows.nth(0)).not.toHaveClass(/is-modified|is-added/)
    await expect(rows.nth(1)).toHaveClass(/is-modified/)
    await expect(rows.nth(1)).toHaveText('Not committed')
    await expect(rows.nth(2)).toHaveClass(/has-deleted/)
    await expect(rows.nth(2)).toHaveAttribute('title', /Third paragraph\./)
    await expect(rows.nth(3)).toHaveText('2024-01-15 Ada Lovelace')
    await expect(rows.nth(4)).toHaveClass(/is-added/)

    // Clicking a row opens the commit dialog with SHA, author and message.
    await rows.nth(0).click()
    const dialog = page.locator('.git-commit-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.git-commit__sha')).toHaveText(sha)
    await expect(dialog).toContainText('Ada Lovelace <ada@example.com>')
    await expect(dialog).toContainText('feat: first draft')
    await expect(dialog.locator('.git-commit__files li')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // Uncommitted rows explain themselves instead of loading a commit.
    await rows.nth(4).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.git-commit__uncommitted')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // Source code mode gets a CodeMirror gutter with the same data per line.
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.source-code-mode')
    const markers = page.locator('.source-code .cm-git-annotate')
    await expect(markers).toHaveCount(10)
    await expect(markers.nth(0)).toHaveText('2024-01-15 Ada Lovelace')
    await expect(markers.nth(2)).toHaveText('Not committed')
    await expect(page.locator('.source-code .git-line-modified')).toHaveCount(1)
    await expect(page.locator('.source-code .git-line-added')).toHaveCount(2)
    await expect(page.locator('.source-code .git-line-deleted-after')).toHaveCount(1)

    // Toggling off removes the gutter and is remembered per window.
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.toggle-git-annotate')
    await expect(markers).toHaveCount(0)
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.source-code-mode')
    await expect(page.locator('.git-gutter')).toHaveCount(0)

    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    rmSync(directory, { recursive: true, force: true })
  }
})
