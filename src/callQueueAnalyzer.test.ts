import { describe, expect, it } from 'vitest'
import { analyzeCallQueue } from './callQueueAnalyzer'

const prefix=(time:string,line:string)=>`2026-09-03 ${time},000 INFO ${line}`
const queue=(time:string,counter:number)=>prefix(time,`Queue Data List=> +60148200903:1788398355390116:${counter}`)
const skip=(time:string)=>prefix(time,'RoutingEntry.process(), Skip looking for agent (Due to there is another call with same LP alraedy queueing)')

describe('analyzeCallQueue',()=>{
 it('treats one same-LP skip as normal queue waiting, never a routing error',()=>{
  const [result]=analyzeCallQueue([queue('09:20:41',28),skip('09:20:42')].join('\n'))
  expect(result).toMatchObject({classification:'NORMAL QUEUE WAITING',agentSelectionSkipped:true,queueStatus:'WAITING'})
 })
 it('reports a queue delay when routing later succeeds',()=>{
  const [result]=analyzeCallQueue([queue('09:20:41',28),skip('09:20:42'),prefix('09:21:00','Routing success: Agent found')].join('\n'))
  expect(result.classification).toBe('QUEUE DELAY ONLY – EVENTUALLY ROUTED')
 })
 it('raises a possible block only after persistent repeated evidence',()=>{
  const [result]=analyzeCallQueue([queue('09:20:00',28),skip('09:20:01'),queue('09:21:00',64),skip('09:21:01'),queue('09:22:10',157),skip('09:22:11')].join('\n'))
  expect(result.classification).toBe('POSSIBLE SAME-LP QUEUE BLOCK')
 })
 it('keeps the third Queue Data List field as a priority/counter progression',()=>{
  const [result]=analyzeCallQueue([queue('09:20:00',28),queue('09:20:10',64),queue('09:20:20',201)].join('\n'))
  expect(result.queueCounters).toEqual([28,64,201])
 })
 it('interprets inactive routing state as waiting during same-LP queueing',()=>{
  const [result]=analyzeCallQueue([queue('09:20:00',28),prefix('09:20:01','Routing Entry CallerID:+60148200903 isProcessing:false Routing Entry isRoutingCall:false'),skip('09:20:02')].join('\n'))
  expect(result).toMatchObject({isProcessing:false,isRoutingCall:false,classification:'NORMAL QUEUE WAITING'})
 })
})
