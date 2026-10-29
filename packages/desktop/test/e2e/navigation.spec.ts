import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  enterSourceMode,
  expectNoRendererErrors,
  launchElectron,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const PLAN = [
  '# Plan',
  '',
  '**K1. First?**',
  '',
  'a) yes',
  'b) no',
  '',
  'Atsakymas: a',
  '',
  '**K2. Second?**',
  '',
  'a) yes',
  '',
  'Atsakymas:',
  ''
].join('\n')

const DONE = ['# Done', '', '**K1. Only?**', '', 'a) yes', '', 'Atsakymas: a', ''].join('\n')

// 40 paragraphs, one per two source lines: far enough apart for caret jumps.
const NOTES = `${Array.from({ length: 40 }, (_, index) => `Line ${index + 1} of the notes.`).join('\n\n')}\n`

const findProjectWindow = async(windows: Page[]): Promise<Page | null> => {
  for (const candidate of windows) {
    if (await candidate.locator('.side-bar-file').count()) return candidate
  }
  return null
}

const sourceCursorLine = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const element = document.querySelector('.CodeMirror') as { CodeMirror?: { getCursor(): { line: number } } } | null
    return element?.CodeMirror?.getCursor().line ?? -1
  })

test('plan dots, hidden empty folders, back/forward places and double Shift', async() => {
  test.setTimeout(120000)
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'marktext-nav-')))
  writeFileSync(path.join(directory, 'plan.md'), PLAN)
  writeFileSync(path.join(directory, 'done.md'), DONE)
  writeFileSync(path.join(directory, 'notes.md'), NOTES)
  mkdirSync(path.join(directory, 'empty'))
  mkdirSync(path.join(directory, 'sub'))
  writeFileSync(path.join(directory, 'sub', 'inner.md'), '# Inner\n')

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

    // Plan files get a dot read from disk; other files get none.
    const planRow = page.locator('.side-bar-file[title$="plan.md"]').first()
    const notesRow = page.locator('.side-bar-file[title$="notes.md"]').first()
    await expect(planRow.locator('.plan-dot')).toHaveClass(/pending/, { timeout: 15000 })
    await expect(planRow.locator('.plan-dot')).toHaveAttribute('title', '1 of 2 plan questions answered')
    await expect(page.locator('.side-bar-file[title$="done.md"] .plan-dot').first()).toHaveClass(/done/)
    await expect(notesRow.locator('.plan-dot')).toHaveCount(0)

    // Folders without files are not listed; folders with files are.
    await expect(page.locator('.folder-name[title$="/sub"]')).toHaveCount(1)
    await expect(page.locator('.folder-name[title$="/empty"]')).toHaveCount(0)

    // Opening files records places; back and forward walk through them.
    await notesRow.click()
    await waitForEditor(page)
    await expect(page.locator('.tabs-container > li.active')).toContainText('notes.md')
    await planRow.click()
    await expect(page.locator('.tabs-container > li.active')).toContainText('plan.md')
    // The opened-files list shows the same dot as the tree.
    await expect(page.locator('.opened-file .plan-dot').first()).toHaveClass(/pending/)

    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.navigate-back')
    await expect(page.locator('.tabs-container > li.active')).toContainText('notes.md')
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.navigate-forward')
    await expect(page.locator('.tabs-container > li.active')).toContainText('plan.md')

    // A caret jump inside one file is a place of its own.
    await notesRow.click()
    await expect(page.locator('.tabs-container > li.active')).toContainText('notes.md')
    await enterSourceMode(page, app)
    await page.evaluate(() => {
      const element = document.querySelector('.CodeMirror') as { CodeMirror?: { setCursor(line: number, ch: number): void; focus(): void } } | null
      element?.CodeMirror?.focus()
      element?.CodeMirror?.setCursor(60, 0)
    })
    await expect.poll(() => sourceCursorLine(page)).toBe(60)
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.navigate-back')
    await expect.poll(() => sourceCursorLine(page)).toBeLessThan(11)
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.navigate-forward')
    await expect.poll(() => sourceCursorLine(page)).toBe(60)

    // Two quick taps of the left Shift open the file search.
    await page.keyboard.press('ShiftLeft')
    await page.keyboard.press('ShiftLeft')
    const search = page.locator('.command-palette input.search')
    await expect(search).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(search).toBeHidden()

    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    rmSync(directory, { recursive: true, force: true })
  }
})
