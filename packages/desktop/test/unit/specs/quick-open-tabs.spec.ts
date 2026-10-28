import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bus from '@/bus'
import QuickOpenTabsCommand from '@/commands/quickOpenTabs'
import keybindingsLinux from 'main_renderer/keyboard/keybindingsLinux'
import type { IFileState } from '@shared/types/files'

const tab = (id: string, pathname: string, markdown = '', extra: Partial<IFileState> = {}): IFileState =>
  ({
    id,
    pathname,
    filename: pathname ? path.posix.basename(pathname) : 'Untitled-1',
    markdown,
    isSaved: true,
    ...extra
  }) as IFileState

describe('QuickOpenTabsCommand', () => {
  let editor: { tabs: IFileState[]; currentFile: IFileState | null; UPDATE_CURRENT_FILE: ReturnType<typeof vi.fn> }
  let command: QuickOpenTabsCommand

  beforeEach(() => {
    Object.assign(window, {
      path: { basename: path.posix.basename, dirname: path.posix.dirname }
    })
    const tabs = [
      tab('a', '/repo/plan.md', '# Plan\n\nQuestion: which DB?\n'),
      tab('b', '/repo/docs/README.md', 'Intro\nsee plan below\n', { isSaved: false }),
      tab('c', '', 'scratch notes')
    ]
    editor = { tabs, currentFile: tabs[0]!, UPDATE_CURRENT_FILE: vi.fn() }
    command = new QuickOpenTabsCommand(editor as unknown as ConstructorParameters<typeof QuickOpenTabsCommand>[0])
  })

  it('binds Ctrl+E on Linux and moves source code mode to Ctrl+/', () => {
    expect(keybindingsLinux.get('file.quick-open-tabs')).toBe('Ctrl+E')
    expect(keybindingsLinux.get('view.source-code-mode')).toBe('Ctrl+/')
  })

  it('lists only open tabs, marks unsaved ones and preselects the next tab', async() => {
    await command.run()

    expect(command.subcommands.map((item) => item.description)).toEqual([
      'plan.md',
      '● README.md',
      'Untitled-1'
    ])
    expect(command.subcommands[1]!.detail).toBe('/repo/docs')
    expect(command.subcommandSelectedIndex).toBe(1)
  })

  it('throws when no tabs are open so the palette stays closed', async() => {
    editor.tabs = []
    await expect(command.run()).rejects.toThrow()
  })

  it('matches names first, then content lines with their line numbers', async() => {
    await command.run()
    const results = await command.search('PLAN')

    expect(results.map((item) => item.id)).toEqual(['a', 'a:1', 'b:2'])
    expect(results[1]!.detail).toBe('plan.md:1')
    expect(results[2]!.description).toBe('see plan below')
  })

  it('switches tab and opens find prefilled for content matches', async() => {
    vi.useFakeTimers()
    const emit = vi.spyOn(bus, 'emit')
    await command.run()
    await command.search('which')

    const done = command.executeSubcommand('a:3')
    await vi.runAllTimersAsync()
    await done

    expect(editor.UPDATE_CURRENT_FILE).toHaveBeenCalledWith(editor.tabs[0])
    expect(emit).toHaveBeenCalledWith('find', { query: 'which' })
    vi.useRealTimers()
  })

  it('switches tab and focuses the editor for name matches', async() => {
    const emit = vi.spyOn(bus, 'emit')
    await command.run()
    await command.executeSubcommand('c')

    expect(editor.UPDATE_CURRENT_FILE).toHaveBeenCalledWith(editor.tabs[2])
    expect(emit).toHaveBeenCalledWith('editor-focus')
  })
})
