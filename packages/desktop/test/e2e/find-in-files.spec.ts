import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expectNoRendererErrors, launchElectron, sendIpcToRenderer, waitForEditor, waitForMenuReady } from './helpers'

test('Find in Files searches any directory with a file mask, multi-line queries and a preview', async() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'marktext-find-in-files-'))
  const scratch = path.join(directory, 'scratch')
  mkdirSync(path.join(scratch, 'sub'), { recursive: true })
  mkdirSync(path.join(scratch, '.hidden'), { recursive: true })
  writeFileSync(path.join(scratch, 'plan.md'), '# Plan\n\n**K1. Q**\n\nAtsakymas:\n\nnothing-needle here\n')
  writeFileSync(path.join(scratch, 'sub', 'notes.md'), 'intro\nAtsakymas:\r\n\r\nmagic-needle line\n')
  writeFileSync(path.join(scratch, 'sub', 'log.txt'), 'magic-needle in text file\n')
  writeFileSync(path.join(scratch, '.hidden', 'secret.md'), 'magic-needle hidden\n')
  writeFileSync(path.join(scratch, '.gitignore'), 'sub/\n')
  const openPath = path.join(directory, 'open.md')
  writeFileSync(openPath, '# Open\n')

  const { app, page } = await launchElectron([openPath], {
    preferences: { language: 'en', openFilesInNewWindow: false, tabBarVisibility: true }
  })
  const dialog = page.locator('.find-in-files-dialog')
  const query = dialog.locator('textarea.fif__query')
  const matches = dialog.locator('.fif__match')
  const files = dialog.locator('.fif__file')
  try {
    await waitForEditor(page)
    await waitForMenuReady(app)

    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'edit.find-in-files')
    await expect(dialog).toBeVisible()
    await expect(query).toBeFocused()

    // Directory defaults to the open file's folder; point it at the fixture tree.
    const directoryInput = dialog.locator('.fif__field--directory input')
    await expect(directoryInput).toHaveValue(directory)
    await directoryInput.fill(scratch)

    // Default mask *.md: ignored (.gitignore) and hidden files are searched too.
    await query.fill('magic-needle')
    await query.press('Enter')
    await expect(files).toHaveCount(2)
    await expect(matches).toHaveCount(2)
    await expect(dialog.locator('.fif__status')).toHaveText('2 matches in 2 files')
    await expect(dialog.locator('.fif__match.selected')).toHaveCount(1)
    await expect(dialog.locator('.fif__preview-line.hit')).toHaveCount(1)

    // File mask switches to text files.
    await dialog.locator('.fif__field--mask input').fill('*.txt')
    await query.press('Enter')
    await expect(files).toHaveCount(1)
    await expect(files.first()).toContainText('log.txt')
    await expect(dialog.locator('.fif__preview-line.hit')).toContainText('magic-needle in text file')

    // Multi-line literal query: "Atsakymas:" followed by an empty line, CRLF tolerant.
    await dialog.locator('.fif__field--mask input').fill('*.md')
    await query.fill('Atsakymas:\n\n')
    await query.press('Enter')
    await expect(files).toHaveCount(2)
    await expect(files.filter({ hasText: 'notes.md' })).toHaveCount(1)
    await expect(files.filter({ hasText: 'plan.md' })).toHaveCount(1)

    // Arrow keys move the selection and the preview follows; Enter opens the file at the match.
    const notesMatch = matches.filter({ hasText: 'Atsakymas' }).nth(1)
    await notesMatch.click()
    await expect(dialog.locator('.fif__match.selected')).toHaveCount(1)
    await dialog.locator('.fif__results').focus()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowDown')
    await expect(dialog.locator('.fif__match.selected .fif__match-line')).toHaveText('2')
    await expect(dialog.locator('.fif__preview-line.hit').first()).toContainText('Atsakymas:')
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.locator('.tabs-container > li.active')).toContainText('notes.md')

    // Reopening remembers the directory and mask.
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'edit.find-in-files')
    await expect(dialog).toBeVisible()
    await expect(directoryInput).toHaveValue(scratch)
    await expect(dialog.locator('.fif__field--mask input')).toHaveValue('*.md')
    await expect(dialog.locator('#fif-directory-history option')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    rmSync(directory, { recursive: true, force: true })
  }
})
