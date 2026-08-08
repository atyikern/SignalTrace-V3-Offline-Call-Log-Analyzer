import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

const log = `Agent: kumaresan Agent ID: 604 Extension: 8041
[2026-03-14 14:51:49] ECONNRESET EFV DESTROY
[2026-03-14 09:49:23] ECONNRESET EFV DESTROY
Agent: amina Agent ID: 605 Extension: 8042
[2026-03-14 11:02:01] Broken pipe`

describe('App', () => {
  it('shows the required offline and local-processing notices', () => {
    render(<App />)
    expect(screen.getByText('Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.')).toBeInTheDocument()
    expect(screen.getByText('Uploaded logs are processed locally and are not permanently stored.')).toBeInTheDocument()
  })

  it('shows a concise, chronological Agent network report without source details', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose PBX log'), new File([log], 'synthetic.log', { type: 'text/plain' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'kumaresan' })).toBeInTheDocument())
    expect(screen.getByText('604')).toBeInTheDocument()
    expect(screen.getByText('8041')).toBeInTheDocument()
    expect(screen.getByText('High network instability detected')).toBeInTheDocument()
    const times = screen.getAllByRole('time').map((time) => time.textContent)
    expect(times).toEqual(['09:49:23', '14:51:49'])
    expect(screen.queryByText(/Line \d+/)).not.toBeInTheDocument()
    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
  })

  it('switches between analyzed Agents without reading the file again', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose PBX log'), new File([log], 'synthetic.txt', { type: 'text/plain' }))
    const selector = await screen.findByLabelText('Selected Agent')
    await user.selectOptions(selector, 'id:605')
    expect(screen.getByRole('heading', { name: 'amina' })).toBeInTheDocument()
    expect(screen.getByText('Media quality instability detected')).toBeInTheDocument()
    expect(within(screen.getByText('11:02:01').parentElement!).getByText('Broken pipe')).toBeInTheDocument()
  })

  it('rejects unsupported file extensions before reading', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose PBX log'), new File(['data'], 'network.csv', { type: 'text/csv' }), { applyAccept: false })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an Asterisk or FreePBX .log or .txt file.')
  })
})
