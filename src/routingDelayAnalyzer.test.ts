import { describe, expect, it } from 'vitest'
import { analyzeRoutingDelay } from './routingDelayAnalyzer'

describe('analyzeRoutingDelay',()=>{
  it('keeps a clean but incomplete log segment GOOD',()=>{
    const log=`2026-09-01 12:26:08,350 INFO [Thread-1] RoutingEntry_1|GETAVAILAGT|20|7|1|1|4|4|2|null|60174279943|false
2026-09-01 12:26:08,355 INFO [Thread-1] selectCurrentMsgAgent(callerID) took: 5 ms`
    const [analysis]=analyzeRoutingDelay(log)
    expect(analysis).toMatchObject({routingHealth:'GOOD',finalRoutingOutcome:'Not Confirmed',evidenceCompleteness:'Partial',lookupAttempts:1,retryCount:0,selectCurrentMsgAgentStatus:'GOOD'})
    expect(analysis.finding).toMatch(/No abnormal routing delay detected/i)
  })

  it('never reports an agent-search end before its first request',()=>{
    const log=`2026-09-02 15:26:02,364 INFO [WS_1#01165546654#1] RoutingEntry_1|GETAVAILAGT|20|6|1|1|4|4|2|null|01165546654|false
2026-09-02 14:46:50,384 INFO [WS_1#01165546654#1] received GETAVAILAGT_RSP with agent ID: 810`
    const [analysis]=analyzeRoutingDelay(log)
    expect(analysis.agentSearchStart).toContain('15:26:02,364')
    expect(analysis.agentSearchEnd).toBeUndefined()
    expect(analysis.totalRoutingWaitMs).toBeUndefined()
  })

  it('attributes slow selection to the root cause and keeps capacity and booking churn as evidence',()=>{
    const log=`2026-08-10 10:00:00,000 INFO [Timer] [WS_7#601155411633#7] startClient()
2026-08-10 10:00:01,000 INFO [Thread-1] [WS_7#601155411633#7] RoutingEntry_1|GETAVAILAGT|20|7|1|1|4|4|2|null|601155411633|false
2026-08-10 10:00:05,000 INFO [Thread-1] [WS_7#601155411633#7] RoutingEntry_2|GETAVAILAGT|20|7|1|1|4|4|2|null|601155411633|false
2026-08-10 10:00:25,788 INFO [Thread-2] [WS_7#601155411633#7] selectCurrentMsgAgent(callerID) took: 24788 ms
2026-08-10 10:00:26,000 INFO [Thread-2] [WS_7#601155411633#7] received GETAVAILAGT_RSP with agent ID: 810
2026-08-10 10:00:27,000 INFO [Thread-2] [WS_7#601155411633#7] received GETAVAILAGT_RSP with agent ID: 810
2026-08-10 10:00:28,000 INFO [Thread-2] [WS_7#601155411633#7] Agent ID: 810 occupied: 1 max capacity: 2 cancelAgentBooking automatically unbooking agent`
    const [analysis]=analyzeRoutingDelay(log)
    expect(analysis).toMatchObject({lookupAttempts:2,slowResponseCount:2,overlappingRequestCount:1,longestSelectCurrentMsgAgentDurationMs:24788,selectCurrentMsgAgentStatus:'CRITICAL - SEVERE',selectedAgentId:810,agentOccupiedSlots:1,agentMaximumCapacity:2,agentHasAvailableCapacity:true,bookingCancellations:1,automaticUnbookEvents:1,routingHealth:'CRITICAL'})
    expect(analysis.rootCauseAssessment).toMatch(/likely root cause/i)
    expect(analysis.rootCauseAssessment).toMatch(/available capacity/i)
  })
})
