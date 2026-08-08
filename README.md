# SignalTrace V3 — Offline PBX Call Log Analyzer

SignalTrace V3 is a browser-only troubleshooting tool for synthetic or exported Asterisk / FreePBX `.log` and `.txt` files. It groups physical log lines by exact Asterisk call identifier, presents each detected call independently, and links every timeline event and deterministic finding to its original source line.

## Privacy and security model

- Log contents are read with the browser `FileReader` API and retained only in React component memory.
- There is no backend, API, upload, telemetry, analytics, remote command execution, or live PBX connection.
- Log contents are never written to local storage, IndexedDB, cookies, the filesystem, or any database.
- Diagnostic commands are displayed as recommendations only and are never executed.
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

## Correlation contract

Only physical lines containing an exact Asterisk `[C-…]` identifier participate in a call. That identifier is the primary and required grouping key. Timestamp proximity, channel similarity, extension, and bridge names never cause otherwise unrelated lines to be grouped. All detected calls are analyzed during the initial read so the selected call can be changed without reopening the file.

## Deterministic rules

| ID | Finding | Default classification |
| --- | --- | --- |
| PBX-001 | Dialed extension was not found | Probable Root Cause |
| PBX-002 | No matching dialplan route | Probable Root Cause |
| PBX-003 | Endpoint is unavailable | Error |
| PBX-004 | Call was rejected as busy | Warning |
| PBX-005 | Call was not answered | Warning |
| PBX-006 | Network or channel congestion | Error |
| PBX-007 | SIP authentication failed | Probable Root Cause |
| PBX-008 | Registration failed | Error |
| PBX-009 | Codec negotiation failed | Probable Root Cause |
| PBX-010 | RTP inactivity timeout | Error |
| PBX-011 | Possible one-way audio indicator | Warning |
| PBX-012 | DTMF handling problem | Warning |
| PBX-013 | Call ended unexpectedly | Error |
| PBX-014 | Normal call clearing observed | Observed Event |
| PBX-015 | Call was answered | Observed Event |
| PBX-016 | Channels joined a bridge | Observed Event |

A warning or error is not promoted to a root cause. When an explicit answer or bridge event occurs after a provisional no-answer, busy, unavailable, or congestion symptom, that contradictory failure finding is suppressed. The underlying source event remains visible in the timeline.

## Current limitations

- This release recognizes Asterisk call identifiers formatted as `[C-…]`; older or customized logs without that identifier are not correlated.
- Parsing is deterministic pattern matching, not a full SIP protocol parser.
- Unscoped global messages are intentionally ignored because they cannot be conservatively assigned to a call.
- The analyzer cannot inspect live PBX state, network packets, firewall/NAT behavior, carrier systems, endpoint configuration, or what a caller heard.
- Very large logs are limited to 50 MB to protect browser responsiveness; analysis currently runs on the UI thread.
- Recommendations are generic next checks and must be adapted and run manually by an authorized administrator.

## Test data

Repository fixtures are synthetic and contain no real phone numbers, credentials, customer data, or production log material.
