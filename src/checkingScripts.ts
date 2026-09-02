import type { LogType } from './types'

export interface CheckingScriptContext {
  tenantName: string
  phoneNumber: string
  agentId: string
  agentExtension: string
  logDate: string
  transactionId: string
  agentUsername: string
}

const logFile=(logDate:string)=>`log.log${logDate?`.${logDate}`:''}`

export interface CheckingScriptDefinition {
  id: string
  title: string
  optional?: boolean
  description: string
  buildCommand: (context: CheckingScriptContext) => string
}

export const DEFAULT_CHECKING_SCRIPTS: Partial<Record<LogType, CheckingScriptDefinition[]>> = {
  'pjsip-rtt': [
    {
      id: 'pjsip-extension-network-state',
      title: 'Step 1 — Extension Network State',
      description: 'Check whether the agent extension changed network/reachability state in the Asterisk full log.',
      buildCommand: ({ agentExtension }) => `sudo more /var/log/asterisk/full | grep "${agentExtension || 'agent extension number'} is now.*"`,
    },
    {
      id: 'pjsip-extension-unreachable',
      title: 'Step 2 — Unreachable Events',
      description: 'Find unreachable events for the affected agent extension.',
      buildCommand: ({ agentExtension }) => `sudo grep -i "unreachable" /var/log/asterisk/full | grep "${agentExtension || 'agent extension number'}"`,
    },
    {
      id: 'pjsip-rtt-spikes',
      title: 'Step 3 — High RTT Spikes',
      description: 'Find RTT measurements and spikes that may explain lag, network issues, or choppy voice.',
      buildCommand: () => 'sudo more /var/log/asterisk/full | grep "RTT.*"',
    },
  ],
  'socketio-efv': [
    {
      id: 'socketio-econnreset',
      title: 'Step 1 — ECONNRESET Events',
      description: 'Find every SocketIO ECONNRESET event in the current SocketIO log.',
      buildCommand: ({ tenantName }) => `sudo more /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/SocketIO/socketIO.log | grep "ECONNRESET"`,
    },
    {
      id: 'socketio-econnreset-agent',
      title: 'Step 2 — ECONNRESET by Agent',
      description: 'Filter ECONNRESET events for the affected agent username.',
      buildCommand: ({ tenantName, agentUsername }) => `sudo more /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/SocketIO/socketIO.log | grep "ECONNRESET" | grep '${agentUsername || 'agent username'}'`,
    },
    {
      id: 'socketio-efrontvoice-message',
      title: 'Step 3 — eFrontVoice Socket Message',
      description: 'Find socket-message records in the selected eFrontVoice log.',
      buildCommand: ({ tenantName, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more ${logFile(logDate)} | grep "socket message"`,
    },
    {
      id: 'socketio-efrontvoice-quit',
      title: 'Step 4 — Receive Quit Signal',
      description: 'Find receive quit-signal records in the selected eFrontVoice log.',
      buildCommand: ({ tenantName, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more ${logFile(logDate)} | grep "receive quit signal"`,
    },
  ],
  'ocod5-whatsapp': [
    {
      id: 'ocod5-whatsapp-customer-phone',
      title: 'Customer Phone Number Lookup',
      description: 'Search the OCOD5 WhatsApp log for the customer phone number.',
      buildCommand: ({ tenantName, phoneNumber }) => `cd /opt/ocapp/tenants-data/${tenantName || 'tenantname'}
sudo more ocod5-whatsapp-${tenantName || 'tenantname'}.log | grep "${phoneNumber || 'phone number'}"`,
    },
  ],
  'opscentral-webhook': [
    {
      id: 'webhook-customer-phone',
      title: 'Step 1 — Customer Phone Number',
      description: 'Find all OpsCentral Webhook records for the customer phone number.',
      buildCommand: ({ tenantName, phoneNumber, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'all'}/logs/OpsCentral-Webhook
sudo grep -F '${phoneNumber || 'customer phone number'}' ${logFile(logDate)}`,
    },
    {
      id: 'webhook-transaction',
      title: 'Step 2 — Webhook Transaction',
      description: 'Find all records for the selected webhook transaction ID.',
      buildCommand: ({ tenantName, transactionId, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'all'}/logs/OpsCentral-Webhook
sudo grep -F '[TRX: ${transactionId || 'transaction ID'}]' ${logFile(logDate)}`,
    },
    {
      id: 'webhook-routing-flow',
      title: 'Step 3 — Routing Flow and Errors',
      description: 'Filter a webhook transaction to its routing stages, decision points, timeout, failure, and error evidence.',
      buildCommand: ({ tenantName, transactionId, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'all'}/logs/OpsCentral-Webhook
sudo grep -F '[TRX: ${transactionId || 'transaction ID'}]' ${logFile(logDate)} | grep -Ei 'Received ID|isBlackList|isOperationHour|Valid selection|next node|IVR_NODE_ROUTE|agent group|End node|ERROR|Exception|failed|timeout'`,
    },
  ],
  'efrontvoice-ivr': [
    {
      id: 'efrontvoice-ivr-customer-phone',
      title: 'Customer Phone Number Lookup',
      description: 'Search the current or selected historical eFrontVoice-IVR log files for the customer phone number.',
      buildCommand: ({ tenantName, phoneNumber, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice-IVR
sudo more ${logFile(logDate)} | grep "${phoneNumber || 'phone number'}"`,
    },
  ],
  'efrontvoice': [
    {
      id: 'efrontvoice-step-1',
      title: 'Step 1 — Customer Phone Number',
      description: 'Check eFrontVoice records for the customer phone number.',
      buildCommand: ({ tenantName, phoneNumber, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more ${logFile(logDate)} | grep "${phoneNumber || 'phone number'}"`,
    },
    {
      id: 'efrontvoice-step-2',
      title: 'Step 2 — Agent Extension Time Frame',
      description: 'Check the agent extension records to investigate what happened during the affected time frame.',
      buildCommand: ({ tenantName, agentExtension, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more ${logFile(logDate)} | grep "${agentExtension || 'agent extension number'}"`,
    },
    {
      id: 'efrontvoice-agent-booking',
      title: 'Agent Booking Activity',
      optional: true,
      description: 'Check GETAVAILAGT, booking, unbooking, and booking-confirmation activity for the selected agent.',
      buildCommand: ({ tenantName, agentId, logDate }) => `grep -Ei '${agentId || 'agent ID'}.*(GETAVAILAGT|CONFIRMAGTBOOKING|UNBOOK|BOOK|booking)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/${logFile(logDate)}`,
    },
    {
      id: 'efrontvoice-agent-capacity',
      title: 'Agent Capacity / Occupancy',
      optional: true,
      description: 'Check capacity, concurrent-session, availability, occupancy, and booking records for the selected agent.',
      buildCommand: ({ tenantName, agentId, logDate }) => `grep -Ei '${agentId || 'agent ID'}.*(max|slot|capacity|concurrent|available|occupied|booking|booked)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/${logFile(logDate)}`,
    },
  ],
  'routing-delay': [
    {
      id: 'voice-routing-delay-step-1',
      title: 'Step 1 — IVR Routing Entry',
      description: 'Check the customer phone number in eFrontVoice-IVR and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice-IVR
sudo more ${logFile(logDate)} | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'voice-routing-delay-step-2',
      title: 'Step 2 — eFrontVoice Routing Entry',
      description: 'Check the same customer phone number in eFrontVoice and return matching RoutingEntry records.',
      buildCommand: ({ tenantName, phoneNumber, logDate }) => `cd /opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice
sudo more ${logFile(logDate)} | grep -i -n -e "${phoneNumber || 'phone number'}" | grep "RoutingEntry_"`,
    },
    {
      id: 'voice-routing-delay-agent-selection',
      title: 'Step 3 — Agent Selection Duration',
      description: 'Find selectCurrentMsgAgent() timings and identify warning, slow, or critical agent-selection delays.',
      buildCommand: ({ tenantName, phoneNumber, logDate }) => `grep -Ein '${phoneNumber || 'phone number'}.*selectCurrentMsgAgent\\(.*\\).*took:|selectCurrentMsgAgent\\(.*${phoneNumber || 'phone number'}.*\\).*took:' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/${logFile(logDate)}`,
    },
    {
      id: 'voice-routing-delay-agent-booking',
      title: 'Agent Booking Activity',
      optional: true,
      description: 'Check GETAVAILAGT, booking, unbooking, and booking-confirmation activity for the selected agent.',
      buildCommand: ({ tenantName, agentId, logDate }) => `grep -Ei '${agentId || 'agent ID'}.*(GETAVAILAGT|CONFIRMAGTBOOKING|UNBOOK|BOOK|booking)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/${logFile(logDate)}`,
    },
    {
      id: 'voice-routing-delay-agent-capacity',
      title: 'Agent Capacity / Occupancy',
      optional: true,
      description: 'Check capacity, concurrent-session, availability, occupancy, and booking records for the selected agent.',
      buildCommand: ({ tenantName, agentId, logDate }) => `grep -Ei '${agentId || 'agent ID'}.*(max|slot|capacity|concurrent|available|occupied|booking|booked)' \\
/opt/ocapp/tenants/${tenantName || 'tenantname'}/logs/eFrontVoice/${logFile(logDate)}`,
    },
  ],
}

DEFAULT_CHECKING_SCRIPTS['messaging-routing-delay']=DEFAULT_CHECKING_SCRIPTS['routing-delay']

export const checkingScriptsFor = (logType: LogType | '') =>
  logType ? DEFAULT_CHECKING_SCRIPTS[logType] ?? [] : []
