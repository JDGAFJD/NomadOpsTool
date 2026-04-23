import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, name } = await request.json();

    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const slackToken = process.env.SLACK_BOT_TOKEN;
    const targetUserId = 'U05HMJ0JG79'; // Bryan Fury's Slack User ID

    const messageText = `*🔐 New OPS Access Request*\n\n*Name:* ${name}\n*Email:* ${email}\n\n_Please approve or deny this user's profile in the Postgres database._`;

    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: targetUserId,
        text: messageText
      })
    });

    const slackData = await slackRes.json();

    if (!slackData.ok) {
      console.error('Slack API Error:', slackData.error);
      return NextResponse.json({ error: 'Failed to send request to admin' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Request Access Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
