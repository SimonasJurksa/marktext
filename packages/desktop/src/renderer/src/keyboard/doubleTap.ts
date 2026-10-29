/**
 * Recognises two quick taps of one key, the IDE "double Shift" gesture: press
 * and release, press and release, each press shorter than `interval`, the
 * second press within `interval` of the first release, and no other key in
 * between. Typing a capital letter never qualifies: the letter's key arrives
 * while Shift is down and cancels the gesture.
 */

export interface TapKeyEvent {
  code: string
  repeat: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

type Stage = 'idle' | 'firstDown' | 'armed' | 'secondDown'

export class DoubleTapDetector {
  private stage: Stage = 'idle'
  private downAt = 0
  private releasedAt = 0

  constructor(
    private readonly code: string,
    private readonly interval = 300
  ) {}

  keyDown(event: TapKeyEvent, time: number): void {
    const foreign = event.code !== this.code || event.repeat || event.ctrlKey || event.altKey || event.metaKey
    if (foreign) {
      this.stage = 'idle'
      return
    }
    const quickEnough = this.stage === 'armed' && time - this.releasedAt <= this.interval
    this.stage = quickEnough ? 'secondDown' : 'firstDown'
    this.downAt = time
  }

  /** Returns whether this release completes a double tap. */
  keyUp(event: { code: string }, time: number): boolean {
    if (event.code !== this.code) {
      this.stage = 'idle'
      return false
    }
    const shortPress = time - this.downAt <= this.interval
    const stage = this.stage
    if (stage === 'secondDown') {
      this.stage = 'idle'
      return shortPress
    }
    if (stage === 'firstDown' && shortPress) {
      this.stage = 'armed'
      this.releasedAt = time
      return false
    }
    this.stage = 'idle'
    return false
  }
}
