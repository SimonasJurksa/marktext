import { describe, expect, it } from 'vitest'
import { holdsFiles, visibleFolders } from '@/components/sideBar/emptyFolders'
import type { TreeFileNode, TreeFolderNode } from '@/components/sideBar/types'

const file = (pathname: string): TreeFileNode => ({
  pathname,
  name: pathname.split('/').pop() ?? '',
  isDirectory: false,
  isFile: true,
  isMarkdown: true
})

const folder = (pathname: string, folders: TreeFolderNode[] = [], files: TreeFileNode[] = []): TreeFolderNode => ({
  pathname,
  name: pathname.split('/').pop() ?? '',
  isDirectory: true,
  isFile: false,
  isMarkdown: false,
  folders,
  files
})

const never = (): boolean => false

describe('empty folders in the file tree', () => {
  const notes = folder('/p/notes', [], [file('/p/notes/a.md')])
  const deep = folder('/p/deep', [folder('/p/deep/inner', [], [file('/p/deep/inner/b.md')])])
  const empty = folder('/p/empty', [folder('/p/empty/also-empty')])

  it('counts files anywhere below a folder', () => {
    expect(holdsFiles(notes)).toBe(true)
    expect(holdsFiles(deep)).toBe(true)
    expect(holdsFiles(empty)).toBe(false)
  })

  it('hides folders without files unless asked to show them', () => {
    const all = [notes, deep, empty]
    expect(visibleFolders(all, { showEmpty: false, keep: never })).toEqual([notes, deep])
    expect(visibleFolders(all, { showEmpty: true, keep: never })).toEqual(all)
  })

  it('keeps an empty folder, and its parents, when the caller asks for it', () => {
    const keep = (candidate: TreeFolderNode): boolean => candidate.pathname === '/p/empty/also-empty'
    expect(visibleFolders([empty], { showEmpty: false, keep })).toEqual([empty])
    expect(visibleFolders(empty.folders, { showEmpty: false, keep })).toEqual(empty.folders)
  })
})
