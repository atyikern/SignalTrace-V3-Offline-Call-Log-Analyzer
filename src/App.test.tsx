import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

const calls = `[2026-03-14 09:42:11.001][C-000001a4] Executing [100@from-internal:1] Dial("PJSIP/201-0001", "PJSIP/100")
[2026-03-14 09:42:14.551][C-000001a4] DIALSTATUS=CHANUNAVAIL
[2026-03-14 09:43:00.000][C-000001a5] Executing [202@from-internal:1] Dial("PJSIP/201-0002", "PJSIP/202")
[2026-03-14 09:43:02.000][C-000001a5] PJSIP/202-0003 answered PJSIP/201-0002`

describe('App', () => {
  it('shows the offline and local-processing notices', () => {
    render(<App />)
    expect(screen.getByText('Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.')).toBeInTheDocument()
    expect(screen.getByText('Uploaded logs are processed locally and are not permanently stored.')).toBeInTheDocument()
  })

  it('reads once, lists multiple calls, and switches the in-memory selection', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose PBX log'), new File([calls], 'synthetic.log', { type: 'text/plain' }))
    await waitFor(() => expect(screen.getByText('C-000001a4 · Lines 1–2')).toBeInTheDocument())
    expect(screen.getByText('C-000001a5 · Lines 3–4')).toBeInTheDocument()
    expect(screen.getByText('Endpoint is unavailable')).toBeInTheDocument()
    await user.click(screen.getByText('C-000001a5 · Lines 3–4'))
    expect(screen.getByRole('heading', { name: 'Call was answered' })).toBeInTheDocument()
  })

  it('rejects unsupported file extensions before reading', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose PBX log'), new File(['data'], 'secrets.csv', { type: 'text/csv' }), { applyAccept: false })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an Asterisk or FreePBX .log or .txt file.')
  })
})
