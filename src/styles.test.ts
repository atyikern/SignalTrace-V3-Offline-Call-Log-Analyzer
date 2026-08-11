import { describe, expect, it } from 'vitest'
import styles from './styles.css?raw'

describe('SignalTrace V11.5 theme', () => {
  it('uses the global light operations-dashboard palette', () => {
    expect(styles).toContain('background: #f6f8fb')
    expect(styles).toContain('--panel: #ffffff')
    expect(styles).toContain('--border: #dbe4ef')
    expect(styles).toContain('--mint: #1677ff')
    expect(styles).not.toContain('#071012')
    expect(styles).not.toContain('radial-gradient')
  })

  it('keeps navigation, upload, privacy, and report surfaces bright', () => {
    expect(styles).toMatch(/\.app-header[^}]+background: rgba\(255, 255, 255/)
    expect(styles).toMatch(/\.upload-workflow[^}]+background: #fff/)
    expect(styles).toMatch(/\.trust-strip > div[^}]+background: #fff/)
    expect(styles).toMatch(/\.network-report[^}]+background: #ffffff/)
  })
})
