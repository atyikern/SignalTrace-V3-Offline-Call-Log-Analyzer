import { describe, expect, it } from 'vitest'
import { analysisStatusTone } from './SharedAnalysisReport'

describe('analysisStatusTone',()=>{
  it('marks failures red',()=>expect(analysisStatusTone('Routing Delay · No Available Agent')).toBe('failed'))
  it('marks successful outcomes with warnings orange',()=>expect(analysisStatusTone('Normal · Agent Found After Retry')).toBe('warning'))
  it('keeps clean successful outcomes green',()=>expect(analysisStatusTone('Normal · Agent Found')).toBe('success'))
})
