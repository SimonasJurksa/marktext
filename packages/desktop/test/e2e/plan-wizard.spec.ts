import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expectNoRendererErrors, launchElectron, sendIpcToRenderer, waitForEditor, waitForMenuReady } from './helpers'

const PLAN = [
  '# Plan',
  '',
  '**K1. Which database?**',
  '',
  '**Trumpai:** we need one.',
  '',
  'a) Postgres (rekomenduojama)',
  'b) SQLite',
  '',
  'Atsakymas:',
  '',
  '**K2. Ship this week?**',
  '',
  'a) yes',
  'b) no',
  '',
  'Atsakymas:',
  ''
].join('\n')

test('plan badge counts answers and the Ctrl+Shift+K wizard writes them into the document', async() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'marktext-plan-wizard-'))
  const planPath = path.join(directory, 'plan.md')
  writeFileSync(planPath, PLAN)
  const { app, page } = await launchElectron([planPath], {
    preferences: { language: 'en', autoSave: true, autoSaveDelay: 1000, tabBarVisibility: true }
  })
  const badge = page.locator('.title-bar .plan-badge')
  const tabBadge = page.locator('.tabs-container > li .plan-badge')
  const dialog = page.locator('.plan-wizard-dialog')
  try {
    await waitForEditor(page)
    await waitForMenuReady(app)
    await expect(badge).toHaveText('0/2')
    await expect(badge).toHaveClass(/pending/)
    await expect(tabBadge).toHaveText('0/2')

    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'edit.answer-plan-questions')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.plan-wizard__title')).toContainText('K1. Which database?')
    await expect(dialog.locator('.plan-wizard__option').filter({ hasText: 'Postgres' })).toContainText('recommended')

    // Letter hotkey picks an option, Enter moves on and writes the answer.
    await page.keyboard.press('b')
    await expect(dialog.locator('.plan-wizard__option.selected')).toContainText('b)')
    await page.keyboard.press('Enter')
    await expect(dialog.locator('.plan-wizard__title')).toContainText('K2. Ship this week?')
    await expect(badge).toHaveText('1/2')
    await expect(page.locator('.editor-component')).toContainText('Atsakymas: b')

    await dialog.locator('.plan-wizard__option').filter({ hasText: 'a)' }).click()
    await dialog.locator('textarea.plan-wizard__comment').fill('after review')
    await dialog.getByRole('button', { name: 'Finish' }).click()
    await expect(dialog).toBeHidden()
    await expect(badge).toHaveText('2/2')
    await expect(badge).toHaveClass(/done/)
    await expect(tabBadge).toHaveClass(/done/)
    await expect(page.locator('.editor-component')).toContainText('Atsakymas: a — after review')

    // Auto save (on by default in this fork) persists the answers to disk.
    await expect.poll(() => readFileSync(planPath, 'utf8'), { timeout: 10000 }).toContain('Atsakymas: a — after review')
    expect(readFileSync(planPath, 'utf8')).toContain('Atsakymas: b\n')

    // Reopening starts at the first question again (all answered) with the stored answer loaded.
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'edit.answer-plan-questions')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.plan-wizard__title')).toContainText('K1.')
    await expect(dialog.locator('.plan-wizard__option.selected')).toContainText('b)')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    rmSync(directory, { recursive: true, force: true })
  }
})
