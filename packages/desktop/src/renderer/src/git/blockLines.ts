// Maps the WYSIWYG engine's top-level blocks to line ranges of the serialized
// document, so line-based git data (blame, hunks) can be shown per block.

export interface BlockLineRange {
  // 0-based, end exclusive.
  start: number
  end: number
}

interface EngineBlock {
  domNode: HTMLElement | null
  getState(): unknown
}

interface EngineLike {
  getMarkdown(): string
  editor: {
    jsonState: { getMarkdownFromState(state: unknown[]): string }
    scrollPage: { children: { map<M>(callback: (block: EngineBlock, index: number) => M): M[] } } | null
  }
}

export interface BlockRanges {
  markdown: string
  ranges: Array<BlockLineRange | null>
}

// Each block's own serialization is searched for, in order, inside the whole
// document. A block whose first line cannot be found is skipped (`null`) so the
// following blocks still resolve.
export const locateBlocks = (markdown: string, blockTexts: string[]): Array<BlockLineRange | null> => {
  const lines = markdown.split('\n')
  const ranges: Array<BlockLineRange | null> = []
  let cursor = 0
  for (const text of blockTexts) {
    const blockLines = text.replace(/\n$/, '').split('\n')
    const first = blockLines[0]
    let found = -1
    for (let line = cursor; line < lines.length; line++) {
      if (lines[line] === first || (first.trim() !== '' && lines[line].trim() === first.trim())) {
        found = line
        break
      }
    }
    if (found < 0) {
      ranges.push(null)
      continue
    }
    const end = Math.min(lines.length, found + blockLines.length)
    ranges.push({ start: found, end })
    cursor = end
  }
  return ranges
}

export const computeBlockRanges = (engine: unknown): BlockRanges => {
  const muya = engine as EngineLike
  const markdown = muya.getMarkdown()
  const page = muya.editor.scrollPage
  if (!page) return { markdown, ranges: [] }
  const texts = page.children.map((block) => {
    try {
      return muya.editor.jsonState.getMarkdownFromState([block.getState()])
    } catch {
      return ''
    }
  })
  return { markdown, ranges: locateBlocks(markdown, texts) }
}

export const blockDomNodes = (engine: unknown): Array<HTMLElement | null> => {
  const page = (engine as EngineLike).editor.scrollPage
  return page ? page.children.map((block) => block.domNode) : []
}
