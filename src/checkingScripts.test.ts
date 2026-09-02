import { describe, expect, it } from 'vitest'
import { checkingScriptsFor } from './checkingScripts'

describe('checkingScriptsFor',()=>{
  it('provides RoutingEntry and agent checks for eFrontVoice',()=>{
    const scripts=checkingScriptsFor('efrontvoice')
    expect(scripts.map(script=>script.title)).toEqual(['Step 1 — IVR Routing Entry','Step 2 — eFrontVoice Routing Entry','Agent Booking Activity','Agent Capacity / Occupancy'])
    expect(scripts[0].buildCommand({tenantName:'demo',phoneNumber:'60174279943',agentId:''})).toContain('/tenants/demo/logs/eFrontVoice-IVR')
  })
})
