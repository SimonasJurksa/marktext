import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { launchElectron, sendIpcToRenderer, waitForEditor } from './helpers'

const PREFERENCES = {
  language: 'en',
  autoSave: false,
  startUpAction: 'restoreAll',
  tabBarVisibility: true,
  sideBarVisibility: false
}

// File names of every tab the saved session knows about.
const savedTabs = (userDataDir: string): string[] => {
  const dir = path.join(userDataDir, 'editorStates')
  if (!existsSync(dir)) return []
  const names: string[] = []
  for (const entry of readdirSync(dir)) {
    const state = JSON.parse(readFileSync(path.join(dir, entry), 'utf8')) as {
      tabs?: { pathname?: string }[]
    }
    for (const tab of state.tabs ?? []) {
      if (tab.pathname) names.push(path.basename(tab.pathname))
    }
  }
  return names.sort()
}

const editorWindows = (windows: Page[], page: Page): Page[] =>
  windows.filter((window) => window.url() === page.url())

test('a launch with a file keeps the saved session and adds the file to it', async() => {
  test.setTimeout(120000)
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'marktext-session-')))
  const userDataDir = path.join(directory, 'user-data')
  const first = path.join(directory, 'first.md')
  const second = path.join(directory, 'second.md')
  writeFileSync(first, '# First\n')
  writeFileSync(second, '# Second\n')
  try {
    const launch = await launchElectron([first], { preferences: PREFERENCES, userDataDir })
    await waitForEditor(launch.page)
    await expect(launch.page.locator('.tabs-container > li')).toHaveCount(1)
    await expect.poll(() => savedTabs(userDataDir), { timeout: 15000 }).toEqual(['first.md'])
    await launch.app.close()

    // Opening another file from the file manager used to wipe that session.
    const relaunch = await launchElectron([second], { preferences: PREFERENCES, userDataDir })
    const page = relaunch.page
    try {
      await waitForEditor(page)
      const tabs = page.locator('.tabs-container > li')
      await expect(tabs).toHaveCount(2, { timeout: 15000 })
      await expect(tabs.filter({ hasText: 'first.md' })).toHaveCount(1)
      await expect(tabs.filter({ hasText: 'second.md' })).toHaveCount(1)
      await expect(page.locator('.tabs-container > li.active')).toContainText('second.md')
      expect(editorWindows(relaunch.app.windows(), page)).toHaveLength(1)
      await expect.poll(() => savedTabs(userDataDir), { timeout: 15000 }).toEqual(['first.md', 'second.md'])
    } finally {
      await relaunch.app.close()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('toggling the tab bar is remembered in the preferences file', async() => {
  test.setTimeout(60000)
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'marktext-tabbar-')))
  const userDataDir = path.join(directory, 'user-data')
  const preferencesPath = path.join(userDataDir, 'preferences.json')
  const readTabBar = (): unknown =>
    (JSON.parse(readFileSync(preferencesPath, 'utf8')) as { tabBarVisibility?: unknown }).tabBarVisibility
  const { app, page } = await launchElectron([], {
    preferences: { ...PREFERENCES, tabBarVisibility: false },
    userDataDir
  })
  try {
    await waitForEditor(page)
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.toggle-tabbar')
    await expect.poll(readTabBar, { timeout: 10000 }).toBe(true)
    await sendIpcToRenderer(app, 'mt::execute-command-by-id', 'view.toggle-tabbar')
    await expect.poll(readTabBar, { timeout: 10000 }).toBe(false)
  } finally {
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
