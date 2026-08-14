import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import viteConfig from '../vite.config'

describe('TraceDesk local development proxy', () => {
  it('keeps Vite on 5173 and allows the local TraceDesk hostname', () => {
    expect(viteConfig.server).toMatchObject({ host:'127.0.0.1', port:5173, strictPort:true })
    expect(viteConfig.server?.allowedHosts).toContain('tracedesk.localhost')
  })

  it('uses an HTTP-only Caddy reverse proxy with WebSocket-capable reverse_proxy handling', () => {
    const caddyfile=readFileSync(new URL('../Caddyfile',import.meta.url),'utf8')
    expect(caddyfile).toMatch(/auto_https\s+off/)
    expect(caddyfile).toMatch(/http:\/\/tracedesk\.localhost/)
    expect(caddyfile).toMatch(/reverse_proxy\s+127\.0\.0\.1:5173/)
    expect(caddyfile).not.toMatch(/https:\/\//)
  })

  it('provides guarded Windows start and stop scripts', () => {
    const start=readFileSync(new URL('../scripts/start-tracedesk.ps1',import.meta.url),'utf8')
    const stop=readFileSync(new URL('../scripts/stop-tracedesk.ps1',import.meta.url),'utf8')
    expect(start).toContain('Get-NetTCPConnection')
    expect(start).toContain('winget install CaddyServer.Caddy')
    expect(start).toContain("foreach ($port in 80, 5173)")
    expect(stop).toContain('taskkill.exe')
    expect(stop).toContain('processes.json')
  })
})
