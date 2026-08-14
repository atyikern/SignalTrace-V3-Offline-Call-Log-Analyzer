import type { VoicemailCallAnalysis, VoicemailEvent } from './types'

export function normalizeVoicemailRecords(text:string) {
  return text.split(/\r?\n|(?=\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?\])|(?<!\[)(?=\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?)/).map(line=>line.trim()).filter(Boolean)
}

const callIdFor=(line:string)=>line.match(/\b(C-[0-9a-f]+)\b/i)?.[1]
const channelsFor=(line:string)=>[...line.matchAll(/\b((?:PJSIP|SIP|Local)\/[A-Za-z0-9_@.+:;-]+(?:-[A-Za-z0-9]+)?(?:;[12])?)/gi)].map(match=>match[1])
const channelKey=(channel:string)=>channel.replace(/;[12]$/,'').toLowerCase()
const voicemailRelated=(line:string)=>/VoiceMail\s*\(|app_voicemail|unavail\.|busy\.|greet|beep\.|Recording the message|recording (?:was|duration)|abandon|voicemail|User hung up|hungup|hangup|permission denied|no space left|disk full/i.test(line)
const timestampFor=(line:string)=>{const value=line.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{1,3})?)/)?.[1];if(!value)return undefined;const epochMs=Date.parse(value.replace(' ','T').replace(',','.'));return Number.isNaN(epochMs)?undefined:{timestamp:value,epochMs}}

function mailboxFor(line:string) {
  const match=line.match(/VoiceMail\s*\([^,]+,\s*["']?(\d+)(?:@([A-Za-z0-9_-]+))?/i)
  return match?{mailbox:match[1],context:match[2]??'default'}:undefined
}

export function analyzeVoicemail(text:string):VoicemailCallAnalysis[] {
  const records=normalizeVoicemailRecords(text)
  if(!records.some(line=>/VoiceMail\s*\(|app_voicemail|Recording the message|voicemail/i.test(line)))return[]
  const channelCalls=new Map<string,Set<string>>()
  for(const line of records){const id=callIdFor(line);if(!id)continue;for(const channel of channelsFor(line)){const key=channelKey(channel);const ids=channelCalls.get(key)??new Set();ids.add(id);channelCalls.set(key,ids)}}
  type Group={key:string;callId?:string;lines:Array<{line:string;lineNumber:number}>}
  const groups=new Map<string,Group>();let activeKey:string|undefined
  records.forEach((line,index)=>{const explicit=callIdFor(line);const mapped=channelsFor(line).map(channel=>channelCalls.get(channelKey(channel))).find(ids=>ids?.size===1);const mappedId=mapped?.values().next().value as string|undefined
    let key=explicit??mappedId
    if(key)activeKey=key
    else if(voicemailRelated(line))key=activeKey??`unknown:${index+1}`
    if(!key)return
    const group=groups.get(key)??{key,callId:explicit??mappedId,lines:[]};group.lines.push({line,lineNumber:index+1});groups.set(key,group)
  })
  return [...groups.values()].filter(group=>group.lines.some(row=>voicemailRelated(row.line))).map(group=>analyzeGroup(group)).sort((a,b)=>b.problemScore-a.problemScore||(b.events[0]?.epochMs??0)-(a.events[0]?.epochMs??0))
}

function analyzeGroup(group:{key:string;callId?:string;lines:Array<{line:string;lineNumber:number}>}):VoicemailCallAnalysis {
  const events:VoicemailEvent[]=[];let mailbox:string|undefined;let context:string|undefined;let callerNumber:string|undefined;let calledNumber:string|undefined;let recordingDurationSeconds:number|undefined;let minimumDurationSeconds:number|undefined
  const channels=new Set<string>();const push=(row:{line:string;lineNumber:number},type:VoicemailEvent['type'],label:string)=>{const timestamp=timestampFor(row.line);events.push({timestamp:timestamp?.timestamp,epochMs:timestamp?.epochMs,lineNumber:row.lineNumber,type,label,rawLine:row.line})}
  for(const row of group.lines){const line=row.line;channelsFor(line).forEach(channel=>channels.add(channel));const target=mailboxFor(line);if(target){mailbox=target.mailbox;context=target.context;calledNumber??=target.mailbox;push(row,'ROUTED',`Call routed to mailbox ${target.mailbox}@${target.context}`)}
    callerNumber??=line.match(/CALLERID(?:\(num\))?\s*[=:]\s*["']?(\+?\d+)/i)?.[1]??line.match(/caller(?:\s*id)?\s*[=:>]\s*["']?(\+?\d{6,})/i)?.[1]
    calledNumber??=line.match(/(?:DNID|called(?:\s+number)?|extension|exten)\s*[=:>]\s*["']?(\d{3,})/i)?.[1]
    if(/Playing\s+["']?(?:[^"'\s/]*\/)?unavail\./i.test(line))push(row,'GREETING','Unavailable greeting played')
    else if(/Playing\s+["']?(?:[^"'\s/]*\/)?busy\./i.test(line))push(row,'GREETING','Busy greeting played')
    else if(/Playing\s+.*(?:greet|custom)/i.test(line))push(row,'GREETING','Custom or available greeting played')
    if(/Playing\s+["']?(?:[^"'\s/]*\/)?beep\./i.test(line))push(row,'BEEP','Beep played')
    if(/Recording the message|started recording|recording started/i.test(line))push(row,'RECORDING_STARTED','Voicemail recording started')
    if(/User hung up|caller.*(?:hung up|disconnect)|channel.*(?:hung up|disconnect)|Hangup\s*\(/i.test(line))push(row,'DISCONNECTED',/PJSIP|SIP/i.test(line)?'PJSIP/SIP caller channel disconnected':'Caller or channel disconnected')
    const duration=line.match(/Recording was\s*(\d+(?:\.\d+)?)\s*seconds? long/i)??line.match(/recording duration\D+(\d+(?:\.\d+)?)\s*(?:seconds?|sec)/i);if(duration){recordingDurationSeconds=Number(duration[1]);push(row,'DURATION',`Recording duration detected as ${recordingDurationSeconds} seconds`)}
    const minimum=line.match(/at least\s*(\d+(?:\.\d+)?)(?:\s*(?:seconds?|sec))?/i);if(minimum)minimumDurationSeconds=Number(minimum[1])
    if(/abandon(?:ing|ed)?/i.test(line))push(row,'ABANDONED','Asterisk abandoned the voicemail recording')
    if(/(?:voicemail|message).*(?:successfully saved|saved successfully|stored)|Saving (?:the )?(?:voicemail|message)|renam(?:e|ed|ing).*msg\d+/i.test(line))push(row,'SAVED','Voicemail message saved successfully')
    if(/mailbox.*(?:does not exist|not found|not configured|unavailable)|invalid mailbox|no such mailbox/i.test(line))push(row,'MAILBOX_ERROR','Mailbox is unavailable or not configured')
    if(/permission denied|read-only file system|unable to (?:open|write|create).*(?:voicemail|msg|file)/i.test(line))push(row,'STORAGE_ERROR','Voicemail file permission or write error')
    if(/no space left|disk full|ENOSPC/i.test(line))push(row,'STORAGE_ERROR','Voicemail storage is full')
    if(/app_voicemail.*(?:ERROR|failed|failure)|voicemail application error/i.test(line))push(row,'APPLICATION_ERROR','Voicemail application error')
  }
  events.sort((a,b)=>(a.epochMs??Number.MAX_SAFE_INTEGER)-(b.epochMs??Number.MAX_SAFE_INTEGER)||a.lineNumber-b.lineNumber)
  const has=(type:VoicemailEvent['type'])=>events.some(event=>event.type===type);let outcome:VoicemailCallAnalysis['outcome']='Inconclusive';let classification:VoicemailCallAnalysis['classification']='Unknown cause due to incomplete logs';let confidence:VoicemailCallAnalysis['confidence']='Low';let rootCause='The available log evidence does not contain a confirmed voicemail save or failure outcome.';let finding='Voicemail activity was detected, but the final message outcome cannot be confirmed from the available records.';let problemScore=30
  if(has('STORAGE_ERROR')){outcome='Storage or permission problem';classification='File permission or storage problem';confidence='High';rootCause=events.find(event=>event.type==='STORAGE_ERROR')!.label;finding='A confirmed voicemail storage or file-writing problem prevented normal message persistence.';problemScore=100}
  else if(has('APPLICATION_ERROR')){outcome='Voicemail application error';classification='Voicemail application error';confidence='High';rootCause='Asterisk logged a confirmed voicemail application failure.';finding='A voicemail application error prevented the normal message flow from completing.';problemScore=95}
  else if(has('MAILBOX_ERROR')){outcome='Mailbox configuration problem';classification='Mailbox unavailable or not configured';confidence='High';rootCause='Asterisk reported that the requested mailbox was unavailable, missing, or not configured.';finding='The call could not use the requested voicemail mailbox.';problemScore=90}
  else if(has('SAVED')){outcome='Voicemail saved successfully';classification='Valid voicemail saved successfully';confidence='High';rootCause='No voicemail failure was detected; Asterisk explicitly reported that the message was saved.';finding='A valid voicemail recording was successfully saved.';problemScore=0}
  else if(has('ABANDONED')&&(recordingDurationSeconds??Infinity)<(minimumDurationSeconds??1)){outcome='No voicemail saved';classification=recordingDurationSeconds===0&&has('DISCONNECTED')?'Caller or upstream channel disconnected during voicemail recording':'Recording too short and abandoned';confidence='High';rootCause=recordingDurationSeconds===0&&has('DISCONNECTED')?'The caller-side or upstream SIP channel disconnected immediately after voicemail recording started. Asterisk recorded 0 seconds of audio. Because the recording did not meet the minimum duration of 1 second, Asterisk abandoned it and did not create a voicemail message.':`The recording was ${recordingDurationSeconds??0} seconds long, below the required minimum of ${minimumDurationSeconds??1} second, so Asterisk abandoned it.`;finding=recordingDurationSeconds===0?'The voicemail system operated normally, but no message appeared because the caller channel disconnected immediately after recording began. The recording duration was 0 seconds, so Asterisk abandoned it.':'Asterisk abandoned the voicemail because its recording duration was below the configured minimum.';problemScore=80}
  else if(has('ABANDONED')){outcome='No voicemail saved';classification='Recording too short and abandoned';confidence='Medium';rootCause='Asterisk explicitly abandoned the recording, but the available records do not include enough duration evidence to identify the precise threshold comparison.';finding='Asterisk abandoned the voicemail recording and did not save a message.';problemScore=80}
  else if(has('DISCONNECTED')&&!has('RECORDING_STARTED')){outcome='No voicemail saved';classification='Caller hung up before recording';confidence='High';rootCause=has('BEEP')?'The caller disconnected after the beep but before voicemail recording started.':'The caller disconnected before the voicemail beep and recording stage.';finding='The call ended before Asterisk began recording a voicemail message.';problemScore=75}
  const mailboxPath=mailbox??'<mailbox>';const recommendedActions=outcome==='No voicemail saved'?['Make another test call.','Speak for at least 5–10 seconds after the beep.',`Check the mailbox INBOX directory: ls -lah /var/spool/asterisk/voicemail/${context??'default'}/${mailboxPath}/INBOX/`,'If the call still disconnects, run `asterisk -rvvvvv`, then `pjsip set logger on`, and identify which side sends the SIP BYE.']:outcome==='Mailbox configuration problem'?['Confirm the mailbox and voicemail context exist in Asterisk configuration.','Reload the voicemail configuration and repeat the call.']:outcome==='Storage or permission problem'?['Check free disk space and filesystem mount status.','Verify Asterisk ownership and write permissions under /var/spool/asterisk/voicemail/.']:outcome==='Voicemail application error'?['Review the exact app_voicemail error and surrounding Asterisk records.','Verify voicemail configuration, dependencies, and filesystem access before repeating the call.']:outcome==='Voicemail saved successfully'?['Check the mailbox INBOX and notification delivery if the message is not visible to the user.']:['Upload a wider log interval or additional PBX log files for this call ID.']
  return{key:group.callId??group.key,callId:group.callId,callerNumber,calledNumber,mailbox,context,channels:[...channels],outcome,classification,confidence,recordingDurationSeconds,minimumDurationSeconds,events,finding,rootCause,recommendedActions,problemScore}
}
