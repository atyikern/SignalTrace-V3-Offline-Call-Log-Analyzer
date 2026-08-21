import type {
  AgentMessagingCapacity,
  AgentMessagingCapacityStatus,
  LicenseOccupancyAnalysis,
  LicenseOccupancyEvent,
  LicensePoolStatus,
} from './types'

function parseTimestamp(line:string):{timestamp?:string;timestampMs?:number}{
  const match=line.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}),(\d{3})/)
  if(!match)return{}
  const timestamp=`${match[1]} ${match[2]}.${match[3]}`
  const value=Date.parse(`${match[1]}T${match[2]}.${match[3]}`)
  return {timestamp,timestampMs:Number.isFinite(value)?value:undefined}
}

function capacityStatus(current?:number,max?:number):AgentMessagingCapacityStatus{
  if(current===undefined||max===undefined||max<=0)return'UNKNOWN'
  if(current>max)return'EXCEEDED'
  if(current===max)return'FULL'
  if(current/max>=0.8)return'NEAR LIMIT'
  return'AVAILABLE'
}

function poolStatus(used?:number,total?:number,insufficient=false):LicensePoolStatus{
  if(insufficient)return'INSUFFICIENT'
  if(used===undefined||total===undefined||total<=0)return'UNKNOWN'
  if(used>total)return'EXCEEDED'
  if(used===total)return'FULL'
  if(used/total>=0.8)return'NEAR LIMIT'
  return'NORMAL'
}

const capacityPriority:Record<AgentMessagingCapacityStatus,number>={
  EXCEEDED:5,
  FULL:4,
  'NEAR LIMIT':3,
  AVAILABLE:2,
  UNKNOWN:1,
}


export function analyzeLicenseOccupancy(contents:string):LicenseOccupancyAnalysis[]{
  const lines=contents.split(/\r?\n/)
  const events:LicenseOccupancyEvent[]=[]
  const agents=new Map<string,AgentMessagingCapacity>()
  let usedLicense:number|undefined
  let totalLicense:number|undefined
  let insufficient=false
  let noAvailableAgentResponses=0
  let successfulBookings=0

  lines.forEach((line,index)=>{
    const time=parseTimestamp(line)
    const common={...time,lineNumber:index+1,rawLine:line}

    if(/license insufficient/i.test(line)){
      insufficient=true
      events.push({...common,type:'LICENSE',label:'Messaging license insufficient'})
    }

    const module19=line.match(/Module:\s*19,\s*Used License:\s*(\d+),\s*Total License:\s*(\d+)/i)
    if(module19){
      usedLicense=Number(module19[1]);totalLicense=Number(module19[2])
      events.push({...common,type:'LICENSE',label:`Module 19 license usage ${usedLicense}/${totalLicense}`})
    } else {
      const totalOnly=line.match(/Module:\s*19,\s*Total License:\s*(\d+)/i)
      if(totalOnly){totalLicense=Number(totalOnly[1]);events.push({...common,type:'LICENSE',label:`Module 19 total license ${totalLicense}`})}
    }

    const login=line.match(/Agent \[(\d+)\].*(?:loginMsg\(\)|LOGIN_RSP.*19=true|updateLicense agentID:\s*\1,\s*licenseJson:\s*\[19\])/i)
    if(login)events.push({...common,type:'LOGIN',label:`Agent ${login[1]} Messaging login/license evidence`})

    const capacity=line.match(/getMsgAgentInReadyAwaySkillSet,\s*agentID:\s*(\d+),\s*currentSessionCampaign:\s*(\d+),\s*currentSessionAll:\s*(\d+),\s*maxSessionCampaign:\s*(\d+)/i)
    if(capacity){
      const agentId=capacity[1]
      const current=Number(capacity[2]), all=Number(capacity[3]), max=Number(capacity[4])
      const observedStatus=capacityStatus(current,max)
      const utilization=max>0?(current/max)*100:undefined
      const existing=agents.get(agentId)??{agentId,status:'UNKNOWN',observations:0,events:[]}
      const peakSessionCampaign=Math.max(existing.peakSessionCampaign??current,current)
      const peakUtilizationPercentage=max>0?(peakSessionCampaign/max)*100:undefined
      const status=capacityPriority[observedStatus]>capacityPriority[existing.status]?observedStatus:existing.status
      const event:LicenseOccupancyEvent={...common,type:'AGENT_CAPACITY',label:`Agent ${agentId} messaging capacity ${current}/${max} (${observedStatus})`}
      agents.set(agentId,{
        ...existing,
        currentSessionCampaign:current,
        currentSessionAll:all,
        maxSessionCampaign:max,
        peakSessionCampaign,
        availableSlots:Math.max(0,max-current),
        utilizationPercentage:utilization,
        peakUtilizationPercentage,
        status,
        firstSeen:existing.firstSeen??time.timestamp,
        lastSeen:time.timestamp??existing.lastSeen,
        observations:existing.observations+1,
        events:[...existing.events,event],
      })
      events.push(event)
    }

    if(/GETAVAILAGT_RSP\|-1\|false\|false\|false\|false/i.test(line)){
      noAvailableAgentResponses+=1
      events.push({...common,type:'ROUTING',label:'GETAVAILAGT returned no available agent'})
    }

    const booking=line.match(/CONFIRMAGTBOOKING_RSP\|OK\|(\d+)/i)
    if(booking){
      successfulBookings+=1
      events.push({...common,type:'BOOKING',label:`Agent booking confirmed (${booking[1]})`})
    }
  })

  const list=[...agents.values()].sort((a,b)=>
    capacityPriority[b.status]-capacityPriority[a.status]||Number(a.agentId)-Number(b.agentId)
  )
  const fullAgents=list.filter(a=>a.status==='FULL').length
  const exceededAgents=list.filter(a=>a.status==='EXCEEDED').length
  const availableAgents=list.filter(a=>a.status==='AVAILABLE'||a.status==='NEAR LIMIT').length
  const licenseStatus=poolStatus(usedLicense,totalLicense,insufficient)
  const licenseUtilizationPercentage=usedLicense!==undefined&&totalLicense&&totalLicense>0?(usedLicense/totalLicense)*100:undefined
  const capacityProblem=fullAgents>0||exceededAgents>0

  const findingParts:string[]=[]
  if(usedLicense!==undefined&&totalLicense!==undefined)findingParts.push(`Messaging Module 19 license usage was ${usedLicense}/${totalLicense} (${licenseStatus}).`)
  if(capacityProblem)findingParts.push(`${fullAgents} agent(s) were at their configured messaging-session limit and ${exceededAgents} agent(s) exceeded it.`)
  if(noAvailableAgentResponses>0)findingParts.push(`${noAvailableAgentResponses} GETAVAILAGT response(s) returned no available agent; this is supporting routing evidence and is not treated as proof of slot exhaustion by itself.`)
  if(!findingParts.length)findingParts.push('No supported Messaging license or agent-capacity evidence was detected.')

  let rootCause='No confirmed Messaging license or agent-capacity exhaustion was detected.'
  if(insufficient)rootCause='The tenant reported an explicit Messaging license-insufficient condition.'
  else if(licenseStatus==='FULL'||licenseStatus==='EXCEEDED')rootCause='The tenant Messaging license pool reached or exceeded its configured capacity.'
  else if(capacityProblem)rootCause='One or more individual agents reached or exceeded their configured concurrent Messaging session capacity.'

  const result:LicenseOccupancyAnalysis={
    key:'module-19',
    moduleId:19,
    usedLicense,totalLicense,licenseUtilizationPercentage,licenseStatus,
    licenseInsufficientDetected:insufficient,
    agents:list,fullAgents,exceededAgents,availableAgents,
    noAvailableAgentResponses,successfulBookings,
    finding:findingParts.join(' '),
    rootCause,
    recommendations:[
      'Review agents reported as FULL or EXCEEDED and confirm whether their active Messaging sessions are expected.',
      'Compare Module 19 Used License with Total License when investigating tenant-level license exhaustion.',
      'Use GETAVAILAGT_RSP|-1 only as supporting evidence; correlate it with agent capacity, skillset, login state, and routing eligibility.',
    ],
    events,
  }
  return (events.length||list.length||usedLicense!==undefined||totalLicense!==undefined||insufficient)?[result]:[]
}
