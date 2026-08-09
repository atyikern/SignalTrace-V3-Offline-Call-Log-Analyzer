# SignalTrace V4 — Log & Network Analyzer

SignalTrace V4 is a browser-only network-troubleshooting view for exported OpsCentral SocketIO / EFV, Asterisk / FreePBX, and PJSIP RTT / Reachability `.log` and `.txt` files. It automatically detects compatible records without requiring a log-type selection.

## Privacy and security model

- Log contents are read with the browser `FileReader` API and retained only in React component memory.
- There is no backend, upload API, telemetry, analytics, remote command execution, or live PBX connection.
- Log contents are never written to local storage, IndexedDB, cookies, the filesystem, or a database.
- Refreshing or closing the tab discards the analysis.

## Development

Requires a current Node.js LTS release.

```bash
npm install
npm run dev
```

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

## Current limitations

- Conventional unscoped entries require preceding Agent metadata. SocketIO entries require a named Agent or an exact session ID that is explicitly mapped to one; otherwise they are ignored.
- Matching is deterministic pattern recognition rather than a complete PBX or SIP protocol parser.
- The analyzer cannot prove that a network indicator affected an active call or determine what either party heard.
- It cannot inspect live PBX state, packet paths, firewall/NAT behavior, carrier systems, or endpoint configuration.
- Files are limited to 50 MB, and analysis currently runs on the browser UI thread.

## Test data

All repository fixtures are synthetic and contain no real phone numbers, credentials, customer data, or production log material.
