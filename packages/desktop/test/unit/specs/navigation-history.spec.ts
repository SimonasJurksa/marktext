import { describe, expect, it } from 'vitest'
import { JUMP_LINES, NavigationHistory } from '@/navigation/history'

const place = (pathname: string, line: number, tabId: string | null = pathname) => ({ pathname, tabId, line })

describe('NavigationHistory', () => {
  it('starts empty and cannot move', () => {
    const history = new NavigationHistory()
    expect(history.current).toBeNull()
    expect(history.canGoBack).toBe(false)
    expect(history.canGoForward).toBe(false)
    expect(history.back()).toBeNull()
    expect(history.forward()).toBeNull()
  })

  it('records a new entry per file and walks back and forward', () => {
    const history = new NavigationHistory()
    history.visit(place('/a.md', 3))
    history.visit(place('/b.md', 0))
    history.visit(place('/c.md', 12))
    expect(history.entries).toHaveLength(3)

    expect(history.back()).toEqual(place('/b.md', 0))
    expect(history.back()).toEqual(place('/a.md', 3))
    expect(history.canGoBack).toBe(false)
    expect(history.forward()).toEqual(place('/b.md', 0))
    expect(history.forward()).toEqual(place('/c.md', 12))
    expect(history.canGoForward).toBe(false)
  })

  it('keeps small caret moves inside the current entry and makes jumps new entries', () => {
    const history = new NavigationHistory()
    history.visit(place('/a.md', 0))
    history.visit(place('/a.md', JUMP_LINES))
    expect(history.entries).toEqual([place('/a.md', JUMP_LINES)])

    history.visit(place('/a.md', JUMP_LINES * 3))
    expect(history.entries.map((entry) => entry.line)).toEqual([JUMP_LINES, JUMP_LINES * 3])

    // Back lands on the updated line, not the line first visited.
    expect(history.back()?.line).toBe(JUMP_LINES)
  })

  it('drops the forward history when a new place is visited after going back', () => {
    const history = new NavigationHistory()
    history.visit(place('/a.md', 0))
    history.visit(place('/b.md', 0))
    history.visit(place('/c.md', 0))
    history.back()
    history.back()
    history.visit(place('/d.md', 0))
    expect(history.entries.map((entry) => entry.pathname)).toEqual(['/a.md', '/d.md'])
    expect(history.canGoForward).toBe(false)
  })

  it('identifies untitled buffers by tab and forgets them when the tab closes', () => {
    const history = new NavigationHistory()
    history.visit(place('', 0, 'tab-1'))
    history.visit(place('/a.md', 0, 'tab-2'))
    history.visit(place('', 40, 'tab-1'))
    expect(history.entries).toHaveLength(3)

    history.forgetTab('tab-1')
    expect(history.entries).toEqual([place('/a.md', 0, 'tab-2')])
    expect(history.index).toBe(0)
  })

  it('keeps places of a closed file so it can be reopened, without the stale tab id', () => {
    const history = new NavigationHistory()
    history.visit(place('/a.md', 5, 'tab-1'))
    history.visit(place('/b.md', 0, 'tab-2'))
    history.forgetTab('tab-1')
    expect(history.entries[0]).toEqual({ pathname: '/a.md', tabId: null, line: 5 })
    expect(history.back()).toEqual({ pathname: '/a.md', tabId: null, line: 5 })
  })
})
