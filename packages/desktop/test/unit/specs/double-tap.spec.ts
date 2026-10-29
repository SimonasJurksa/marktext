import { describe, expect, it } from 'vitest'
import { DoubleTapDetector } from '@/keyboard/doubleTap'

const key = (code: string, extra: Partial<{ repeat: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
  code,
  repeat: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...extra
})

const tap = (detector: DoubleTapDetector, code: string, at: number, hold = 50): boolean => {
  detector.keyDown(key(code), at)
  return detector.keyUp(key(code), at + hold)
}

describe('DoubleTapDetector', () => {
  it('completes on the release of a second quick tap', () => {
    const detector = new DoubleTapDetector('ShiftLeft')
    expect(tap(detector, 'ShiftLeft', 0)).toBe(false)
    expect(tap(detector, 'ShiftLeft', 200)).toBe(true)
  })

  it('needs a fresh pair of taps after completing', () => {
    const detector = new DoubleTapDetector('ShiftLeft')
    tap(detector, 'ShiftLeft', 0)
    tap(detector, 'ShiftLeft', 200)
    expect(tap(detector, 'ShiftLeft', 400)).toBe(false)
    expect(tap(detector, 'ShiftLeft', 600)).toBe(true)
  })

  it('ignores a second tap that comes too late', () => {
    const detector = new DoubleTapDetector('ShiftLeft', 300)
    tap(detector, 'ShiftLeft', 0)
    expect(tap(detector, 'ShiftLeft', 400)).toBe(false)
  })

  it('ignores presses held longer than the interval', () => {
    const detector = new DoubleTapDetector('ShiftLeft', 300)
    expect(tap(detector, 'ShiftLeft', 0, 500)).toBe(false)
    expect(tap(detector, 'ShiftLeft', 600)).toBe(false)
    expect(tap(detector, 'ShiftLeft', 800)).toBe(true)
  })

  it('is cancelled by any other key, so typing a capital letter never triggers it', () => {
    const detector = new DoubleTapDetector('ShiftLeft')
    tap(detector, 'ShiftLeft', 0)
    detector.keyDown(key('ShiftLeft'), 100)
    detector.keyDown(key('KeyA'), 120)
    detector.keyUp(key('KeyA'), 140)
    expect(detector.keyUp(key('ShiftLeft'), 160)).toBe(false)
  })

  it('ignores the right Shift, key repeats and chords with other modifiers', () => {
    const detector = new DoubleTapDetector('ShiftLeft')
    expect(tap(detector, 'ShiftRight', 0)).toBe(false)
    expect(tap(detector, 'ShiftRight', 100)).toBe(false)

    tap(detector, 'ShiftLeft', 300)
    detector.keyDown(key('ShiftLeft', { repeat: true }), 400)
    expect(detector.keyUp(key('ShiftLeft'), 420)).toBe(false)

    tap(detector, 'ShiftLeft', 600)
    detector.keyDown(key('ShiftLeft', { ctrlKey: true }), 700)
    expect(detector.keyUp(key('ShiftLeft'), 720)).toBe(false)
  })
})
