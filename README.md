# SignalTrace V3 — Offline PBX Call Log Analyzer

SignalTrace V3 is a browser-only network-troubleshooting view for exported Asterisk / FreePBX `.log` and `.txt` files. Its result answers one focused question: **At what times did this Agent experience network disconnection or network instability?**

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

SignalTrace identifies explicit `Agent`, `Agent ID`, and `Extension` fields and associates subsequent timestamped entries with that Agent until a new Agent begins. It detects approved network and media indicators, sorts problem times chronologically, and groups indicators at the same time or within a configurable window. The default grouping window is two seconds. Duplicate indicators inside a group appear once.

Physical source lines and original text are retained internally for diagnostics and automated testing, but the normal result page deliberately does not display source excerpts or line numbers.

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

For the selected Agent, the report displays only:

1. Agent, Agent ID, and Extension
2. Network Status
3. Chronologically sorted Problem Times and deduplicated indicators
4. Finding
5. Possible Impact
6. Conclusion

All Agents with detected problems are analyzed on the initial file read. Changing the selection does not reread the file.

## Current limitations

- Agent association requires explicit Agent metadata before the related events. Unscoped entries before that metadata are ignored.
- Matching is deterministic pattern recognition rather than a complete PBX or SIP protocol parser.
- The analyzer cannot prove that a network indicator affected an active call or determine what either party heard.
- It cannot inspect live PBX state, packet paths, firewall/NAT behavior, carrier systems, or endpoint configuration.
- Files are limited to 50 MB, and analysis currently runs on the browser UI thread.

## Test data

All repository fixtures are synthetic and contain no real phone numbers, credentials, customer data, or production log material.
