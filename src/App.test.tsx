import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import webhookFixture from './test/fixtures/webhook-healthy.log?raw'
import asteriskIvrFixture from './test/fixtures/asterisk-ivr.log?raw'
import voiceFixture from './test/fixtures/voice-routing.log?raw'
import ivrFixture from './test/fixtures/ivr-call-flow.log?raw'

const log = `Agent: kumaresan Agent ID: 604 Extension: 8041
[2026-03-14 14:51:49] ECONNRESET EFV DESTROY
[2026-03-14 09:49:23] ECONNRESET EFV DESTROY
Agent: amina Agent ID: 605 Extension: 8042
[2026-03-14 11:02:01] Broken pipe`


async function uploadAndAnalyze(user: ReturnType<typeof userEvent.setup>, contents: string, name: string, type: 'socketio-efv'|'pjsip-rtt'|'efrontvoice-ivr'|'efrontvoice'|'asterisk-ivr'|'opscentral-webhook') {
  await user.selectOptions(screen.getByLabelText('Log Type'), type)
  await user.upload(screen.getByLabelText('Choose log'), new File([contents], name, { type: 'text/plain' }))
  await user.click(screen.getByRole('button', { name: 'Analyze' }))
}

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
    await uploadAndAnalyze(user, log, 'synthetic.log', 'socketio-efv')
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
    await uploadAndAnalyze(user, log, 'synthetic.txt', 'socketio-efv')
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
    expect(screen.getByRole('button', { name: 'SignalTrace home' })).toHaveTextContent('SignalTrace V8')
    expect(screen.getByText('Log, Voice & Network Analyzer')).toBeInTheDocument()
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
    await uploadAndAnalyze(user, pjsip, 'pjsip.log', 'pjsip-rtt')
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
    await uploadAndAnalyze(user, multipleExtensions, 'rtt.log', 'pjsip-rtt')
    const selector = await screen.findByLabelText('Selected Extension')
    expect(selector).toHaveValue('23177011')
    expect(within(selector).getAllByRole('option').map((option) => option.textContent)).toEqual(['23177011', '8041', '23177003'])
  })

  it('changes only the displayed Extension report when selected', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadAndAnalyze(user, multipleExtensions, 'rtt.txt', 'pjsip-rtt')
    const selector = await screen.findByLabelText('Selected Extension')
    expect(screen.getByText('Unstable')).toBeInTheDocument()
    expect(screen.getByText('116.253 ms')).toBeInTheDocument()
    await user.selectOptions(selector, '23177003')
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.queryByText('116.253 ms')).not.toBeInTheDocument()
  })


  it('selects the failed IVR call and keeps Phone Number and Call state separate', async () => {
    const user = userEvent.setup(); render(<App />)
    await uploadAndAnalyze(user, ivrFixture, 'ivr.txt', 'efrontvoice-ivr')
    expect(await screen.findByLabelText('Selected Phone Number')).toHaveValue('+60139610712')
    const callSelector = screen.getByLabelText('Selected Call')
    expect(callSelector).toHaveValue('178244679334766')
    expect(screen.getByText('IVR Call Flow Analysis')).toBeInTheDocument()
    expect(screen.getByText('Unable to Retrieve Next Node')).toBeInTheDocument()
    expect(screen.getByText('Campaign Phone Number')).toBeInTheDocument()
    expect(screen.getByText('0386897800')).toBeInTheDocument()
    expect(screen.queryByText('Unknown time')).not.toBeInTheDocument()
    await user.selectOptions(callSelector, '178246906457037')
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.queryByText('Unable to Retrieve Next Node')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Selected Phone Number')).toHaveValue('+60139610712')
  })
  it('keeps independent eFrontVoice Caller and Call selectors and defaults to the failed call', async () => {
    const user=userEvent.setup(); render(<App />)
    await uploadAndAnalyze(user, voiceFixture, 'voice.txt', 'efrontvoice')
    expect(await screen.findByLabelText('Selected Voice Caller ID')).toHaveValue('96946315')
    const calls=screen.getByLabelText('Selected Voice Call'); expect(calls).toHaveValue('178606822570871')
    expect(screen.getByText('Not Reached')).toBeInTheDocument()
    await user.selectOptions(calls,'178606822570870')
    expect(screen.getByText('Successful')).toBeInTheDocument()
    expect(within(screen.getByText('Caller ID Routing Analysis').closest('article')!).getByText('Agent ID').parentElement).toHaveTextContent('21')
  })

  it('requires both a Log Type and file before analysis', async () => {
    const user=userEvent.setup(); render(<App />)
    const analyze=screen.getByRole('button',{name:'Analyze'})
    expect(screen.getByLabelText('Log Type')).toBeRequired(); expect(analyze).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Log Type'),'efrontvoice'); expect(analyze).toBeDisabled()
    await user.upload(screen.getByLabelText('Choose log'),new File([voiceFixture],'voice.log',{type:'text/plain'})); expect(analyze).toBeEnabled()
  })

  it('uses eFrontVoice selection as source of truth despite internal IVR communication strings', async () => {
    const user=userEvent.setup(); render(<App />)
    await uploadAndAnalyze(user, `${voiceFixture}\n2026-08-07 17:02:00,000 DEBUG IvrClientHandler CallFrontIvrCommandReceiver RoutingEntry 100|IVR|`, 'voice.log', 'efrontvoice')
    expect(await screen.findByText('Caller ID Routing Analysis')).toBeInTheDocument()
    expect(screen.queryByText('IVR Call Flow Analysis')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Selected Phone Number')).not.toBeInTheDocument()
  })

  it('runs only the explicitly selected IVR analyzer', async () => {
    const user=userEvent.setup(); render(<App />)
    await uploadAndAnalyze(user, ivrFixture, 'ivr.log', 'efrontvoice-ivr')
    expect(await screen.findByText('IVR Call Flow Analysis')).toBeInTheDocument()
    expect(screen.queryByText('Caller ID Routing Analysis')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Selected Voice Caller ID')).not.toBeInTheDocument()
  })

  it('New log clears results, file, and selected Log Type', async () => {
    const user=userEvent.setup(); render(<App />)
    await uploadAndAnalyze(user, voiceFixture, 'voice.log', 'efrontvoice')
    await user.click(await screen.findByRole('button',{name:/New log/i}))
    expect(screen.getByLabelText('Log Type')).toHaveValue('')
    expect(screen.getByRole('button',{name:'Analyze'})).toBeDisabled()
    expect(screen.queryByText('Caller ID Routing Analysis')).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:/Select log file/i})).toBeInTheDocument()
  })

  it('selecting a new file clears the previous result before analysis', async () => {
    const user=userEvent.setup(); render(<App />)
    await uploadAndAnalyze(user, voiceFixture, 'first.log', 'efrontvoice')
    await user.upload(screen.getByLabelText('Choose log'),new File([voiceFixture],'second.log',{type:'text/plain'}))
    expect(screen.queryByText('Caller ID Routing Analysis')).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Analyze'})).toBeEnabled()
  })

  it('runs only Asterisk-IVR analysis and switches isolated calls', async () => {
    const user=userEvent.setup();render(<App />)
    await uploadAndAnalyze(user,asteriskIvrFixture,'asterisk-ivr.log','asterisk-ivr')
    expect(await screen.findByText('Selected call routing analysis')).toBeInTheDocument()
    expect(screen.queryByText('IVR Call Flow Analysis')).not.toBeInTheDocument()
    expect(screen.queryByText('Agent Extension Analysis')).not.toBeInTheDocument()
    const selector=screen.getByLabelText('Selected Call');expect(selector).toHaveValue('process:94')
    expect(screen.getAllByText('Channel Unavailable').length).toBeGreaterThan(1)
    await user.selectOptions(selector,'process:92')
    expect(screen.getAllByText('Successfully Transferred').length).toBeGreaterThan(0)
    expect(screen.getByText('11 sec')).toBeInTheDocument()
  })

  it('renders the masked OpsCentral Webhook messaging-flow report and filters internally', async () => {
    const user=userEvent.setup();render(<App />)
    await uploadAndAnalyze(user,webhookFixture,'webhook.log','opscentral-webhook')
    expect(await screen.findByText('Messaging Flow')).toBeInTheDocument()
    expect(screen.getByText('TRX 4125 — 6598****28 — 10:37:26 — Successfully Routed')).toBeInTheDocument()
    expect(screen.getAllByText('Successfully Routed').length).toBeGreaterThan(0)
    expect(screen.getByText('19.2 sec')).toBeInTheDocument()
    const journey=screen.getByText('Flow Journey').parentElement!
    expect(within(journey).getByText('532').parentElement).toHaveTextContent('Start')
    expect(within(journey).getByText('544').parentElement).toHaveTextContent('Route to Agent Group')
    expect(document.body).not.toHaveTextContent('6598175528')
    expect(document.body).not.toHaveTextContent('hello my account is failing')
    await user.type(screen.getByLabelText('Search'),'6598175528')
    expect(screen.getByText('TRX 4125 — 6598****28 — 10:37:26 — Successfully Routed')).toBeInTheDocument()
  })

})
