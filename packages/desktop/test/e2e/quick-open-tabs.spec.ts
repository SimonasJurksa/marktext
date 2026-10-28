import { expect, test } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { expectNoRendererErrors, launchElectron, sendIpcToRenderer, waitForEditor, waitForMenuReady } from './helpers'

const openSwitcher = async(app: ElectronApplication, page: Page) => {
  // Make sure any previous palette has fully closed before reopening it.
  await expect(page.locator('input.search:visible')).toHaveCount(0)
  await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'file.quick-open-tabs')
  const input = page.locator('input.search:visible').first()
  await expect(input).toHaveAttribute('placeholder', 'Search open files by name or content')
  await expect(input).toBeFocused()
  return input
}

test('Ctrl+E switcher lists open tabs and jumps to name and content matches', async() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'marktext-open-tabs-'))
  const planPath = path.join(directory, 'plan.md')
  const notesPath = path.join(directory, 'notes.md')
  writeFileSync(planPath, '# Plan\n\nOpen question: which database?\n')
  writeFileSync(notesPath, '# Notes\n\nNothing here.\n')
  const { app, page } = await launchElectron([planPath, notesPath], {
    preferences: { language: 'en', openFilesInNewWindow: false, tabBarVisibility: true }
  })
  const activeTab = page.locator('.tabs-container > li.active')
  try {
    await waitForEditor(page)
    await waitForMenuReady(app)
    await expect(page.locator('.tabs-container > li')).toHaveCount(2)
    await expect(activeTab).toContainText('plan.md')

    const input = await openSwitcher(app, page)
    await expect(page.locator('.commands li.command-item')).toHaveCount(2)

    // Enter on the preselected entry jumps to the other (non-active) tab.
    await input.press('Enter')
    await expect(activeTab).toContainText('notes.md')

    await (await openSwitcher(app, page)).pressSequentially('plan')
    // Wait for the filtered list (name match plus the "# Plan" content line).
    await expect(page.locator('.commands li.command-item').filter({ hasText: 'plan.md:1' })).toHaveCount(1)
    await expect(page.locator('.commands li.command-item').first()).toContainText('plan.md')
    await page.locator('input.search:visible').first().press('Enter')
    await expect(activeTab).toContainText('plan.md')

    // Go back to notes so the content match below has to switch tabs.
    await page.locator('.tabs-container > li').filter({ hasText: 'notes.md' }).click()
    await expect(activeTab).toContainText('notes.md')

    await (await openSwitcher(app, page)).pressSequentially('database')
    const contentMatch = page.locator('.commands li.command-item').filter({ hasText: 'plan.md:3' })
    await expect(contentMatch).toHaveCount(1)
    await contentMatch.click()
    await expect(activeTab).toContainText('plan.md')
    await expect(page.locator('.search-bar input').first()).toHaveValue('database')

    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    rmSync(directory, { recursive: true, force: true })
  }
})
