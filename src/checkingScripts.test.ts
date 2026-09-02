import { describe, expect, it } from 'vitest'
import { checkingScriptsFor } from './checkingScripts'

describe('checkingScriptsFor',()=>{
  it('provides RoutingEntry and agent checks for eFrontVoice',()=>{
    const scripts=checkingScriptsFor('efrontvoice')
    expect(scripts.map(script=>script.title)).toEqual(['Step 1 — Customer Phone Number','Step 2 — Agent Extension Time Frame','Agent Booking Activity','Agent Capacity / Occupancy'])
    expect(scripts[0].buildCommand({tenantName:'demo',phoneNumber:'60174279943',agentId:'',agentExtension:'',logDate:'',transactionId:'',agentUsername:''})).toContain('/tenants/demo/logs/eFrontVoice')
  })

  it('limits eFrontVoice-IVR searches to the selected dated logs',()=>{
    const [script]=checkingScriptsFor('efrontvoice-ivr')
    const command=script.buildCommand({tenantName:'demo',phoneNumber:'1114434177',agentId:'',agentExtension:'',logDate:'2026-07-30',transactionId:'',agentUsername:''})
    expect(command).toContain('/tenants/demo/logs/eFrontVoice-IVR')
    expect(command).toContain('log.log.2026-07-30')
    expect(command).toContain('1114434177')
  })

  it('provides focused webhook transaction checks',()=>{
    const scripts=checkingScriptsFor('opscentral-webhook')
    const command=scripts[2].buildCommand({tenantName:'',phoneNumber:'6598175528',agentId:'',agentExtension:'',logDate:'2026-08-08',transactionId:'4125',agentUsername:''})
    expect(command).toContain('/tenants/all/logs/OpsCentral-Webhook')
    expect(command).toContain("[TRX: 4125]")
    expect(command).toContain('log.log.2026-08-08')
    expect(command).toContain('IVR_NODE_ROUTE')
  })

  it('provides SocketIO ECONNRESET and eFrontVoice follow-up checks',()=>{
    const scripts=checkingScriptsFor('socketio-efv')
    const context={tenantName:'demo',phoneNumber:'',agentId:'',agentExtension:'',logDate:'2026-02-09',transactionId:'',agentUsername:'amina'}
    expect(scripts[1].buildCommand(context)).toContain("grep 'amina'")
    expect(scripts[2].buildCommand(context)).toContain('log.log.2026-02-09')
    expect(scripts[3].buildCommand(context)).toContain('receive quit signal')
  })

  it('provides RTT and unreachable extension checks',()=>{
    const scripts=checkingScriptsFor('pjsip-rtt')
    const context={tenantName:'',phoneNumber:'',agentId:'',agentExtension:'236470',logDate:'',transactionId:'',agentUsername:''}
    expect(scripts[0].buildCommand(context)).toContain('236470 is now.*')
    expect(scripts[1].buildCommand(context)).toContain('grep -i "unreachable"')
    expect(scripts[2].buildCommand(context)).toContain('RTT.*')
  })

  it('provides a tenant-specific OCOD5 WhatsApp phone-number check',()=>{
    const [script]=checkingScriptsFor('ocod5-whatsapp')
    const command=script.buildCommand({tenantName:'demo',phoneNumber:'60174279943',agentId:'',agentExtension:'',logDate:'',transactionId:'',agentUsername:''})
    expect(command).toContain('/tenants-data/demo')
    expect(command).toContain('ocod5-whatsapp-demo.log')
    expect(command).toContain('60174279943')
  })
})
