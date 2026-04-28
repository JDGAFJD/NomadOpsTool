import { getSetting } from './db';

export const SLACK_NAME_MAP: Record<string, string> = {
  'jessica.garza':    'U03V2LF24H0',
  'jessica':          'U03V2LF24H0',
  'jaden.garza':      'U03VCD68PL0',
  'jaden':            'U03VCD68PL0',
  'olayinka':         'U041A1GMFSA',
  'joshua':           'U04FRC9EUE7',
  'bryan':            'U05HMJ0JG79',
  'bryan.fury':       'U05HMJ0JG79',
  'bryan@nomadinternet.com': 'U05HMJ0JG79',
  'sam':              'U05J4HE19N0',
  'sam.fash':         'U05J4HE19N0',
  'sam@nomadinternet.com': 'U05J4HE19N0',
  'wisdom':           'U09C5DABNJF',
  'tiffany':          'U09C7V8Q2UA',
  'donald':           'U09CJN82597',
  'amaara':           'U09CJN8GLJV',
  'jeremiah':         'U09CN4Z5UMP',
  'jeremiah@nomadinternet.com': 'U09CN4Z5UMP',
  'danial':           'U09CNBK3NQH',
  'justin':           'U09CNBLKGL9',
  'bella':            'U09E8KUGSTF',
  'beatriz':          'U09GLBSJN11',
  'jonathon':         'U09HLQ6229K',
  'rudy':             'U09J3KB0HFB',
  'precious':         'U09K2UXQWG5',
  'joel':             'U0A5C62CRV3',
};

export function resolveSlackId(agentEmail: string): string | null {
  const email = agentEmail.toLowerCase();
  if (SLACK_NAME_MAP[email]) return SLACK_NAME_MAP[email];
  const localPart = email.split('@')[0];
  if (SLACK_NAME_MAP[localPart]) return SLACK_NAME_MAP[localPart];
  const firstName = localPart.split('.')[0];
  if (SLACK_NAME_MAP[firstName]) return SLACK_NAME_MAP[firstName];
  return null;
}

export async function postToSlack(blocks: any[], text: string, channel: string = '0-urgent-live-calls') {
  const token = getSetting('slack_bot_token');
  if (!token) {
    console.error('Slack Bot Token not configured in settings.');
    return { ok: false, error: 'Slack not configured' };
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, blocks, text }),
    });
    return await res.json();
  } catch (err: any) {
    console.error('Slack fetch error:', err);
    return { ok: false, error: err.message };
  }
}
