/**
 * Back/forward history of editing places, the way IDEs keep one: a place is a
 * file plus a line, and only jumps create entries. Small caret moves update the
 * entry the caret is in, so "back" returns to where you worked, not to the
 * previous line.
 */

export interface NavigationPlace {
  /** Absolute path; empty for an untitled buffer. */
  pathname: string
  /** Tab that showed the place; null once that tab is closed. */
  tabId: string | null
  /** 0-based line in the markdown source. */
  line: number
}

/** Caret moves of at most this many lines stay inside the current entry. */
export const JUMP_LINES = 10
const MAX_ENTRIES = 100

const samePlace = (a: NavigationPlace, b: NavigationPlace): boolean =>
  a.pathname ? a.pathname === b.pathname : a.tabId === b.tabId

export class NavigationHistory {
  entries: NavigationPlace[] = []
  /** Position of the place shown now; -1 while nothing was visited. */
  index = -1

  get current(): NavigationPlace | null {
    return this.entries[this.index] ?? null
  }

  get canGoBack(): boolean {
    return this.index > 0
  }

  get canGoForward(): boolean {
    return this.index < this.entries.length - 1
  }

  /**
   * Records that `place` is shown now. Moving the caret a little within the
   * current entry only updates that entry; anything else starts a new entry
   * and drops the forward history.
   */
  visit(place: NavigationPlace): void {
    const current = this.current
    if (current && samePlace(current, place) && Math.abs(current.line - place.line) <= JUMP_LINES) {
      current.line = place.line
      current.tabId = place.tabId
      return
    }
    this.entries.splice(this.index + 1)
    this.entries.push({ ...place })
    if (this.entries.length > MAX_ENTRIES) this.entries.shift()
    this.index = this.entries.length - 1
  }

  back(): NavigationPlace | null {
    if (!this.canGoBack) return null
    this.index--
    return this.current
  }

  forward(): NavigationPlace | null {
    if (!this.canGoForward) return null
    this.index++
    return this.current
  }

  /**
   * The tab is gone. Places with a path stay (the file can be reopened);
   * untitled places disappear with their buffer.
   */
  forgetTab(tabId: string): void {
    const removedBefore = this.entries
      .slice(0, this.index + 1)
      .filter((entry) => !entry.pathname && entry.tabId === tabId).length
    this.entries = this.entries.filter((entry) => entry.pathname || entry.tabId !== tabId)
    for (const entry of this.entries) {
      if (entry.tabId === tabId) entry.tabId = null
    }
    this.index = Math.min(this.index - removedBefore, this.entries.length - 1)
  }
}
