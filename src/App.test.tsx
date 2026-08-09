import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

const log = `Agent: kumaresan Agent ID: 604 Extension: 8041
[2026-03-14 14:51:49] ECONNRESET EFV DESTROY
[2026-03-14 09:49:23] ECONNRESET EFV DESTROY
Agent: amina Agent ID: 605 Extension: 8042
[2026-03-14 11:02:01] Broken pipe`

const multipleExtensions = `[2026-08-09 03:00:00] VERBOSE[1] res_pjsip/pjsip_options.c: Contact 23177003/sip:a@10.0.0.3:50003;transport=ws is now Reachable. RTT: 25.000 msec
[2026-08-09 04:31:49] VERBOSE[2] res_pjsip/pjsip_options.c: Contact 23177011/sip:b@10.0.0.11:50011;transport=ws is now Unreachable. RTT: 0.000 msec
[2026-08-09 04:32:46] VERBOSE[3] res_pjsip/pjsip_options.c: Contact 23177011/sip:b@10.0.0.11:50011;transport=ws is now Reachable. RTT: 116.253 msec
[2026-08-09 04:33:49] VERBOSE[4] res_pjsip/pjsip_options.c: Contact 23177011/sip:b@10.0.0.11:50011;transport=ws is now Unreachable. RTT: 0.000 msec
[2026-08-09 04:34:49] VERBOSE[5] res_pjsip/pjsip_options.c: Contact 23177011/sip:b@10.0.0.11:50011;transport=ws is now Reachable. RTT: 25.000 msec
[2026-08-09 05:00:00] VERBOSE[6] res_pjsip/pjsip_options.c: Contact 8041/sip:c@10.0.0.4:50004;transport=ws is now Reachable. RTT: 350.000 msec`

describe('App', () => {
  it('shows the required offline and local-processing notices', () => {
    render(<App />)
    expect(screen.getByText('Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.')).toBeInTheDocument()
    expect(screen.getByText('Uploaded logs are processed locally and are not permanently stored.')).toBeInTheDocument()
  })

  it('shows a concise, chronological Agent network report without source details', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose log'), new File([log], 'synthetic.log', { type: 'text/plain' }))
    await user.selectOptions(await screen.findByLabelText('Selected Agent'), 'id:604')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'kumaresan' })).toBeInTheDocument())
    expect(screen.getByText('High network instability detected')).toBeInTheDocument()
    const times = screen.getAllByRole('time').map((time) => time.textContent)
    expect(times).toEqual(['09:49:23', '14:51:49'])
    expect(screen.queryByText(/Line \d+/)).not.toBeInTheDocument()
    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.queryByText('Agent ID')).not.toBeInTheDocument()
    expect(screen.queryByText('Extension')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Selected Extension')).not.toBeInTheDocument()
  })

  it('switches between analyzed Agents without reading the file again', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose log'), new File([log], 'synthetic.txt', { type: 'text/plain' }))
    const selector = await screen.findByLabelText('Selected Agent')
    await user.selectOptions(selector, 'id:605')
    expect(screen.getByRole('heading', { name: 'amina' })).toBeInTheDocument()
    expect(screen.getByText('Connection instability detected')).toBeInTheDocument()
    expect(within(screen.getByText('11:02:01').parentElement!).getByText('Broken pipe')).toBeInTheDocument()
  })

  it('rejects unsupported file extensions before reading', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    await user.upload(screen.getByLabelText('Choose log'), new File(['data'], 'network.csv', { type: 'text/csv' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a supported OpsCentral or PBX .log or .txt file.')
  })

  it('advertises OpsCentral SocketIO / EFV and Asterisk / FreePBX support', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'SignalTrace home' })).toHaveTextContent('SignalTrace V4')
    expect(screen.getByText('Log & Network Analyzer')).toBeInTheDocument()
    expect(screen.getByText('Supported Logs')).toBeInTheDocument()
    const supportedLogs = screen.getByText('Supported Logs').parentElement!
    expect(supportedLogs).toHaveTextContent('OpsCentral SocketIO / EFV')
    expect(supportedLogs).toHaveTextContent('Asterisk / FreePBX')
    expect(supportedLogs).toHaveTextContent('PJSIP RTT / Reachability')
  })

  it('automatically renders an Extension reachability report without an Agent', async () => {
    const pjsip = `[2026-08-09 04:31:49] VERBOSE[1] res_pjsip/pjsip_options.c: Contact 23177011/sip:test@10.0.0.1:50000;transport=ws is now Unreachable. RTT: 0.000 msec
[2026-08-09 04:32:46] VERBOSE[2] res_pjsip/pjsip_options.c: Contact 23177011/sip:test@10.0.0.1:50000;transport=ws is now Reachable. RTT: 116.253 msec`
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose log'), new File([pjsip], 'pjsip.log', { type: 'text/plain' }))
    const selector = await screen.findByLabelText('Selected Extension')
    expect(selector).toHaveValue('23177011')
    expect(screen.queryByRole('heading', { name: '23177011' })).not.toBeInTheDocument()
    expect(screen.getByText('RTT Warning')).toBeInTheDocument()
    expect(screen.getByText('Current Status').parentElement).toHaveTextContent('Reachable')
    expect(screen.getByText('Recovered after 57 sec')).toBeInTheDocument()
    expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
  })

  it('deduplicates, prioritizes, and naturally orders multiple Extension options', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose log'), new File([multipleExtensions], 'rtt.log', { type: 'text/plain' }))
    const selector = await screen.findByLabelText('Selected Extension')
    expect(selector).toHaveValue('23177011')
    expect(within(selector).getAllByRole('option').map((option) => option.textContent)).toEqual(['23177011', '8041', '23177003'])
  })

  it('changes only the displayed Extension report when selected', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose log'), new File([multipleExtensions], 'rtt.txt', { type: 'text/plain' }))
    const selector = await screen.findByLabelText('Selected Extension')
    expect(screen.getByText('Unstable')).toBeInTheDocument()
    expect(screen.getByText('116.253 ms')).toBeInTheDocument()
    await user.selectOptions(selector, '23177003')
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.queryByText('116.253 ms')).not.toBeInTheDocument()
  })

  it('keeps Agent and Extension selections independent in a mixed log', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Choose log'), new File([`${log}\n${multipleExtensions}`], 'mixed.log', { type: 'text/plain' }))
    const agentSelector = await screen.findByLabelText('Selected Agent')
    const extensionSelector = screen.getByLabelText('Selected Extension')
    expect(agentSelector).toHaveValue('id:605')
    expect(extensionSelector).toHaveValue('23177011')
    await user.selectOptions(agentSelector, 'id:604')
    expect(extensionSelector).toHaveValue('23177011')
    await user.selectOptions(extensionSelector, '8041')
    expect(agentSelector).toHaveValue('id:604')
    expect(screen.getByRole('heading', { name: 'kumaresan' })).toBeInTheDocument()
    expect(screen.getByText('High RTT')).toBeInTheDocument()
  })
})
