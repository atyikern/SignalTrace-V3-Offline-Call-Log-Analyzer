import { useMemo, useState } from 'react'
import { Check, Clipboard } from 'lucide-react'
import { checkingScriptsFor } from './checkingScripts'
import type { LogType } from './types'

export function CheckingScriptsPanel({ logType }: { logType: LogType | '' }) {
  const [tenantName, setTenantName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [agentId, setAgentId] = useState('')
  const [copiedId, setCopiedId] = useState<string>()

  const scripts = useMemo(() => checkingScriptsFor(logType), [logType])

  if (!scripts.length) return null

  const copyCommand = async (id: string, command: string) => {
    await navigator.clipboard.writeText(command)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(current => current === id ? undefined : current), 1600)
  }

  const context = { tenantName, phoneNumber, agentId }

  return (
    <aside className="checking-scripts-panel" aria-label="Recommended checking scripts">
      <div className="checking-scripts-heading">
        <span>Recommended Checking Scripts</span>
        <small>Commands update automatically from the values below.</small>
      </div>

      <div className="checking-script-inputs">
        <label>
          Tenant Name
          <input
            value={tenantName}
            onChange={event => setTenantName(event.target.value)}
            placeholder="tenantname"
          />
        </label>

        <label>
          Phone Number
          <input
            value={phoneNumber}
            onChange={event => setPhoneNumber(event.target.value)}
            placeholder="60174279943"
          />
        </label>

        <label>
          Agent ID
          <input
            value={agentId}
            onChange={event => setAgentId(event.target.value)}
            placeholder="agent ID"
          />
        </label>
      </div>

      <div className="checking-script-list">
        {scripts.map(script => {
          const command = script.buildCommand(context)
          const copied = copiedId === script.id

          return (
            <section className="checking-script-card" key={script.id}>
              <header>
                <div>
                  <strong>{script.title}</strong>
                  {script.optional && <span className="optional-badge">Optional</span>}
                </div>
                <small>{script.description}</small>
              </header>

              <pre><code>{command}</code></pre>

              <button
                type="button"
                className="copy-script-button"
                onClick={() => copyCommand(script.id, command)}
              >
                {copied ? <Check size={15} /> : <Clipboard size={15} />}
                {copied ? 'Copied' : 'Copy Script'}
              </button>
            </section>
          )
        })}
      </div>
    </aside>
  )
}
