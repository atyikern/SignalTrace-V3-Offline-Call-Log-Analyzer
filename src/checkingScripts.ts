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
  'messaging-license': [
    {
      id: 'messaging-license-step-1',
      title: 'Step 1 — IVR Routing Entry',
      description: 'Check the customer phone number in eFrontVoice-IVR and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice-IVR
sudo more log.log | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'messaging-license-step-2',
      title: 'Step 2 — eFrontVoice Routing Entry',
      description: 'Check the same customer phone number in eFrontVoice and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more log.log | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'messaging-license-agent-booking',
      title: 'Agent Booking Activity',
      optional: true,
      description: 'Check GETAVAILAGT, booking, unbooking, and booking-confirmation activity for the selected agent.',
      buildCommand: ({ tenantName, agentId }) => `grep -Ei '${agentId || 'agent ID'}.*(GETAVAILAGT|CONFIRMAGTBOOKING|UNBOOK|BOOK|booking)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/log.log`,
    },
    {
      id: 'messaging-license-agent-capacity',
      title: 'Agent Capacity / Occupancy',
      optional: true,
      description: 'Check capacity, concurrent-session, availability, occupancy, and booking records for the selected agent.',
      buildCommand: ({ tenantName, agentId }) => `grep -Ei '${agentId || 'agent ID'}.*(max|slot|capacity|concurrent|available|occupied|booking|booked)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/log.log`,
    },
  ],
}

export const checkingScriptsFor = (logType: LogType | '') =>
  logType ? DEFAULT_CHECKING_SCRIPTS[logType] ?? [] : []
