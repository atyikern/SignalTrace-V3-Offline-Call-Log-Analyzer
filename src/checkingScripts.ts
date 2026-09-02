import type { LogType } from './types'

export interface CheckingScriptContext {
  tenantName: string
  phoneNumber: string
  agentId: string
}

export interface CheckingScriptDefinition {
  id: string
  title: string
  optional?: boolean
  description: string
  buildCommand: (context: CheckingScriptContext) => string
}

export const DEFAULT_CHECKING_SCRIPTS: Partial<Record<LogType, CheckingScriptDefinition[]>> = {
  'efrontvoice': [
    {
      id: 'efrontvoice-step-1',
      title: 'Step 1 — IVR Routing Entry',
      description: 'Check the customer phone number in eFrontVoice-IVR and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice-IVR
sudo more log.log | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'efrontvoice-step-2',
      title: 'Step 2 — eFrontVoice Routing Entry',
      description: 'Check the same customer phone number in eFrontVoice and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more log.log | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'efrontvoice-agent-booking',
      title: 'Agent Booking Activity',
      optional: true,
      description: 'Check GETAVAILAGT, booking, unbooking, and booking-confirmation activity for the selected agent.',
      buildCommand: ({ tenantName, agentId }) => `grep -Ei '${agentId || 'agent ID'}.*(GETAVAILAGT|CONFIRMAGTBOOKING|UNBOOK|BOOK|booking)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/log.log`,
    },
    {
      id: 'efrontvoice-agent-capacity',
      title: 'Agent Capacity / Occupancy',
      optional: true,
      description: 'Check capacity, concurrent-session, availability, occupancy, and booking records for the selected agent.',
      buildCommand: ({ tenantName, agentId }) => `grep -Ei '${agentId || 'agent ID'}.*(max|slot|capacity|concurrent|available|occupied|booking|booked)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/log.log`,
    },
  ],
  'routing-delay': [
    {
      id: 'voice-routing-delay-step-1',
      title: 'Step 1 — IVR Routing Entry',
      description: 'Check the customer phone number in eFrontVoice-IVR and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice-IVR
sudo more log.log | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'voice-routing-delay-step-2',
      title: 'Step 2 — eFrontVoice Routing Entry',
      description: 'Check the same customer phone number in eFrontVoice and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more log.log | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'voice-routing-delay-agent-selection',
      title: 'Step 3 — Agent Selection Duration',
      description: 'Find selectCurrentMsgAgent() timings and identify warning, slow, or critical agent-selection delays.',
      buildCommand: ({ tenantName, phoneNumber }) => `grep -Ein '${phoneNumber || 'phone number'}.*selectCurrentMsgAgent\\(.*\\).*took:|selectCurrentMsgAgent\\(.*${phoneNumber || 'phone number'}.*\\).*took:' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/log.log`,
    },
    {
      id: 'voice-routing-delay-agent-booking',
      title: 'Agent Booking Activity',
      optional: true,
      description: 'Check GETAVAILAGT, booking, unbooking, and booking-confirmation activity for the selected agent.',
      buildCommand: ({ tenantName, agentId }) => `grep -Ei '${agentId || 'agent ID'}.*(GETAVAILAGT|CONFIRMAGTBOOKING|UNBOOK|BOOK|booking)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/log.log`,
    },
    {
      id: 'voice-routing-delay-agent-capacity',
      title: 'Agent Capacity / Occupancy',
      optional: true,
      description: 'Check capacity, concurrent-session, availability, occupancy, and booking records for the selected agent.',
      buildCommand: ({ tenantName, agentId }) => `grep -Ei '${agentId || 'agent ID'}.*(max|slot|capacity|concurrent|available|occupied|booking|booked)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/log.log`,
    },
  ],
}

DEFAULT_CHECKING_SCRIPTS['messaging-routing-delay']=DEFAULT_CHECKING_SCRIPTS['routing-delay']

export const checkingScriptsFor = (logType: LogType | '') =>
  logType ? DEFAULT_CHECKING_SCRIPTS[logType] ?? [] : []
