# SignalTrace V12 — Voice, Messaging & Connectivity Analyzer

V9 expands eFrontVoice-IVR into per-call production routing analysis. It correlates digit attempts, route-node and agent-lookup stages, booking, call-record creation, route completion, and disconnects; reports stage latency against configurable local thresholds; and keeps successful calls with recoverable delays or digit retries classified as successful with warnings. The IVR workflow accepts either `.log`/`.txt` uploads or pasted records and provides a call selector plus an expandable timestamped technical timeline.

SignalTrace V12 is a browser-only troubleshooting view for exported SocketIO / ECONNRESET, Asterisk / FreePBX, Asterisk-IVR, RTT / UNREACHABLE, and eFrontVoice `.log` and `.txt` files. The required log-type selection ensures that only the intended deterministic analyzer runs.

V11 adds offline case management to every analysis result. **Save Case** creates a unified JSON report containing a Section ID, module and analysis time, ticket/customer metadata, phone number, transaction ID, finding, evidence-based root cause, and recommendation. Browsers that support the File System Access API can save into a chosen `date/customer` folder; other browsers download the JSON file. **Case History** stores searchable report metadata in browser local storage so cases can be found by ticket, customer, phone, transaction ID, or root cause.

Case History groups saved reports operationally by analysis module and provides secondary country filtering inferred from supported phone-number country codes. Summary counters, module/country filters, sorting, pagination, responsive cards, and an expandable case-detail view work entirely in local browser state and remain compatible with older saved cases.

V11.5 standardizes every analyzer result through a shared presentation schema and renderer. Each existing parser remains independent, while adapters map its status, identifiers, chronological evidence, finding, root cause, and recommendations into the same OCOD5-inspired summary, collapsible Technical Details, and Technical Timeline layout.

The **OCOD5 WhatsApp Messaging** analyzer correlates outbound provider submissions and webhook callbacks by Message/Task ID, retains Conversation IDs, identifies inbound replies, reports Sent → Delivered → Read timing, and treats repeated callbacks as duplicates rather than failures. Friendly summaries show complete customer and business routing numbers while keeping message bodies out of the summary; matched raw records remain available only in the local expandable technical timeline. Send, delivery, and informational read thresholds are configurable in the upload workflow.

The **Asterisk/PBX Voicemail Analysis** module accepts one or multiple `.log`/`.txt` files for the same investigation. It keeps different Asterisk call IDs isolated, correlates PJSIP/SIP and Local channels, reconstructs voicemail greeting, beep, recording, disconnect, duration, abandon/save, mailbox, and storage events, and explains why a message was not persisted. Its standardized result includes exact supporting lines, confidence, operational commands, and a downloadable JSON report.

## Privacy and security model

- Log contents are read with the browser `FileReader` API and retained only in React component memory.
- There is no backend, upload API, telemetry, analytics, remote command execution, or live PBX connection.
- Uploaded log contents are never written to local storage, IndexedDB, cookies, a database, or an external service.
- A case report is written to a user-selected folder or browser download only after **Save Case** is submitted. Case History retains the generated report metadata in this browser's local storage; it does not retain the uploaded log.
- Refreshing or closing the tab discards the analysis.

## Windows development and TraceDesk URL

### One-time setup

Install a current Node.js LTS release, clone this repository, and install its packages:

```bash
npm install
```

Install Caddy from a Windows PowerShell prompt:

```powershell
winget install CaddyServer.Caddy
caddy version
```

Open a new terminal after installation so the updated `PATH` is available. The start script reports the same installation command if it cannot find Caddy.

You can validate the repository proxy configuration at any time:

```powershell
caddy validate --config .\Caddyfile --adapter caddyfile
```

`tracedesk.localhost` uses the standards-reserved `.localhost` suffix. Current browsers normally resolve it to the loopback interface automatically, so **do not edit the hosts file initially**. To check on the target Windows computer, open `http://tracedesk.localhost` after starting TraceDesk. If that browser genuinely cannot resolve it, run the following from PowerShell:

```powershell
Resolve-DnsName tracedesk.localhost
```

Only when resolution fails, open Notepad as Administrator, edit `C:\Windows\System32\drivers\etc\hosts`, and add:

```text
127.0.0.1 tracedesk.localhost
```

### Start and stop

Start Vite on its original internal port `5173` and Caddy on HTTP port `80`:

```powershell
npm run dev:tracedesk
```

Then open [http://tracedesk.localhost](http://tracedesk.localhost). Caddy forwards normal HTTP and Vite hot-module-reload WebSocket traffic to `127.0.0.1:5173`. Automatic HTTPS is explicitly disabled for this local hostname. Direct development access remains available at [http://localhost:5173](http://localhost:5173).

Stop both process trees safely using the PIDs recorded by the start script:

```powershell
npm run stop:tracedesk
```

Run the start command again after restarting Windows; no service or automatic startup entry is installed. Normally a standard PowerShell window is sufficient. If Windows refuses permission to bind port `80`, rerun PowerShell **as Administrator**. Administrator privileges are also required if a hosts-file entry is necessary.

The original Vite-only workflow remains available and does not require Caddy or port `80`:

```powershell
npm run dev
```

### Port-conflict troubleshooting

The TraceDesk start script checks ports `80` and `5173` before launching anything. If either is occupied, inspect the listener:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 80,5173 |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process -Id <OwningProcess>
```

Stop the conflicting application if appropriate, or stop an earlier TraceDesk session with `npm run stop:tracedesk`. Runtime logs and PID state are placed in the ignored `.tracedesk` directory. If a previous process was terminated externally and only stale state remains, confirm neither port is listening, remove `.tracedesk\processes.json`, and start again.

## Quality checks

Quality checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Analysis behavior

SignalTrace supports both explicit `Agent`, `Agent ID`, and `Extension` metadata and OpsCentral entries shaped like `[io: sessionId <<== efv: ... ] [ Agent Name ] EFV ...`. SocketIO session IDs are retained internally and allow an otherwise unidentified event to be associated only when that exact session also has an explicitly named Agent. Timestamp proximity alone never assigns an unidentified event.

The analyzer detects approved network and media indicators, sorts problem times chronologically, and groups indicators at the same time or within a configurable window. The default grouping window is two seconds. Duplicate indicators inside a group appear once. Both bracketed timestamps and OpsCentral prefixes such as `2026-04-03 09:49:23 - info:` are supported.

Physical source lines and original text are retained internally for diagnostics and automated testing, but the normal result page deliberately does not display source excerpts or line numbers.

### PJSIP RTT and reachability

PJSIP option events are grouped independently by Extension. SignalTrace extracts each event's Reachable/Unreachable status, numeric RTT, timestamp, IP address, port, transport, and contact identity. Concatenated Asterisk records are split whenever a new bracketed timestamp begins.

Reachable RTT values use adjustable thresholds:

- **Good:** below 100 ms
- **Warning:** 100 ms through 199.999 ms
- **High:** 200 ms through 499.999 ms
- **Critical:** 500 ms or more
- **Unreachable:** any Unreachable status, including RTT `0.000`

Unreachable RTT zeroes never enter the rolling RTT baseline. Reachable events at or above the Warning threshold, or with a significant increase over recent reachable values, are marked as RTT spikes. Exact contact identity is preferred when matching a recovery to an outage.

Per-Extension results track current status separately from overall network status, plus Unreachable event count, recovery count, longest outage, highest and average reachable RTT, and spike count.

### Severity rules

**Critical**

- `ECONNRESET`
- `EFV DESTROY`
- Unreachable
- Connection reset

**Important**

- Broken pipe
- WebSocket disconnect/error
- timeout or timed out
- Connection refused
- transport error

**Media Quality**

- RTP packet loss
- lost packets
- jitter
- RTP timeout
- media timeout

## Result presentation

Agent reports display:

1. Agent
2. Network Status
3. Chronologically sorted Problem Times and deduplicated indicators
4. Finding
5. Possible Impact
6. Conclusion

All Agents with detected problems are analyzed on the initial file read. Changing the selection does not reread the file.

PJSIP reports display:

1. Extension
2. Network Status and Current Status
3. Chronological Problem Times
4. Finding
5. Possible Impact
6. Conclusion

No report displays source evidence or parser internals.

When multiple Extensions are detected, a separate **Selected Extension** control shows one report at a time. Options are deduplicated and ordered with Extensions that have Unreachable events or RTT spikes first, followed by network severity and natural Extension order. The initial selection therefore opens the most diagnostically useful Extension. Mixed files retain independent Selected Agent and Selected Extension controls.

## Current limitations

- Conventional unscoped entries require preceding Agent metadata. SocketIO entries require a named Agent or an exact session ID that is explicitly mapped to one; otherwise they are ignored.
- Matching is deterministic pattern recognition rather than a complete PBX or SIP protocol parser.
- The analyzer cannot prove that a network indicator affected an active call or determine what either party heard.
- It cannot inspect live PBX state, packet paths, firewall/NAT behavior, carrier systems, or endpoint configuration.
- Files are limited to 50 MB, and analysis currently runs on the browser UI thread.

## Test data

All repository fixtures are synthetic and contain no real phone numbers, credentials, customer data, or production log material.


### eFrontVoice-IVR call flow

V5 accepts phone-number grep output from eFrontVoice-IVR logs. Contextual Caller ID patterns identify phone numbers, while Call ID remains the mandatory session boundary. Independent Selected Phone Number and Selected Call controls default to the most severe call (then latest), and never affect Agent or Extension selections. The concise report extracts call metadata, Collect Digits attempts, prompts, retry limits, next-node failures, routing state, system hangup sequences, and disconnection context without assigning unsupported meanings to numeric error or call-status values.

#### IVR timestamp and campaign terminology

eFrontVoice-IVR timestamps accept both `YYYY-MM-DD HH:mm:ss,SSS` production records and second-only records. Milliseconds are retained for stable event ordering while the timeline displays `HH:mm:ss`. The internal `routePoint` remains compatible with earlier data, but V5 exposes it to support engineers as the **Campaign Phone Number**. Collect Digits attempts count only configuration/start records containing `minNumOfDigits`; waiting and result lines never create extra attempts.


### eFrontVoice call routing and Agent Extension analysis

V6 adds independent **Selected Voice Caller ID**, **Selected Voice Call**, and **Selected Voice Extension** workflows. The parser splits concatenated millisecond-timestamp records, keeps calls isolated by explicit Call ID, aggregates repeated Agent searches, and recognizes transaction creation, Agent booking, ringing, connection, talk, disconnect, and hold evidence. A prolonged search remains a warning when a later connection proves routing succeeded.

Extension analysis recognizes login, SIP/WebRTC registration, monitoring, explicit Extension states, PBX connectivity, calls, and monitor shutdown. An ignored `agentTerminalNotReady` is treated as a recovered warning when later presence or call activity proves operation; it is not automatically promoted to a failure.

### Explicit log-type selection

Before reading a file, SignalTrace groups log types into **Voice** (eFrontVoice, eFrontVoice-IVR, Asterisk-IVR), **Messaging** (Webhook, OCOD5 WhatsApp), and **Connectivity** (SocketIO / ECONNRESET, RTT / UNREACHABLE). The **Others → UI** entry is visible but disabled and cannot run an analyzer. The Analyze action remains disabled until both a type and local file are selected. Only the selected parser executes, so normal eFrontVoice messages such as `IvrClientHandler` or `100|IVR|` cannot create an IVR report. Selecting a replacement file and using **New log** clear all prior results and entity selections.

### Asterisk-IVR call routing

V7 adds an explicit **Asterisk-IVR** log type. Calls are conservatively isolated by Process ID, linked ID, unique ID, and only then Caller ID/time fallback. The report distinguishes answered or normally transferred calls from `BUSY`, `CHANUNAVAIL`, `NOANSWER`, and incomplete routing, includes a selected-call evidence timeline and ring duration, and recommends status-specific checks without executing commands. `NORMACAUSE` alone is never treated as proof of answer.

### Webhook messaging flow

V8 adds an explicit **Webhook** analyzer for locally uploaded messaging-flow logs. Transactions are isolated by `[TRX: …]`, joined timestamp records are normalized, node journeys and confirmed routing outcomes are reconstructed, and message content, credentials, tokens, authorization data, and passwords are masked in every visible, copied, or exported record. Customer numbers remain fully visible for support correlation. Successful routing confirms assignment to an Agent group only; it does not claim Agent acceptance or reply.

#### CallFront Agent routing

Webhook transactions now include a separate **Agent Routing Analysis** when IVR client, `GETAVAILAGT`, response, processing-value, or CallFront disconnection records are present. The analysis correlates by complete WebSocket session rather than worker thread, distinguishes client lifecycle from actual Agent lookup, supports retries and final `-1` results, measures request-to-response delay, and never treats Agent selection as proof of Agent acceptance or reply.

#### Authoritative eFrontVoice Transaction IDs

eFrontVoice Caller Routing treats only explicit `TID: <number>` fields as authoritative Transaction IDs. Repeated TID records are deduplicated in the transaction selector, while generic transaction-object `id=`, Call ID, Agent ID, and customer ID fields are never displayed as the Transaction ID. Calls without an explicit TID show **Not detected**.
