import { NextRequest, NextResponse } from 'next/server';
import { queryOpsDb } from '@/lib/opsDb';

async function ensureTable() {
  await queryOpsDb(`
    CREATE TABLE IF NOT EXISTS ops_visitor_logs (
      id               SERIAL PRIMARY KEY,
      -- Network
      ip               TEXT,
      ip_forwarded     TEXT,
      cf_ip            TEXT,
      real_ip          TEXT,
      -- Geo (from ip-api.com)
      geo_country      TEXT,
      geo_region       TEXT,
      geo_city         TEXT,
      geo_zip          TEXT,
      geo_lat          NUMERIC,
      geo_lon          NUMERIC,
      geo_isp          TEXT,
      geo_org          TEXT,
      geo_timezone     TEXT,
      geo_mobile       BOOLEAN,
      geo_proxy        BOOLEAN,
      geo_hosting      BOOLEAN,
      client_lat       NUMERIC,
      client_lon       NUMERIC,
      -- Browser
      user_agent       TEXT,
      browser_language TEXT,
      browser_languages TEXT,
      platform         TEXT,
      -- Screen
      screen_width     INT,
      screen_height    INT,
      screen_depth     INT,
      device_pixel_ratio NUMERIC,
      -- Hardware
      cpu_cores        INT,
      device_memory    NUMERIC,
      max_touch_points INT,
      -- Features
      timezone         TEXT,
      cookies_enabled  BOOLEAN,
      do_not_track     TEXT,
      -- WebGL
      webgl_vendor     TEXT,
      webgl_renderer   TEXT,
      -- Canvas fingerprint
      canvas_hash      TEXT,
      -- WebRTC local IPs
      webrtc_ips       TEXT,
      -- Connection
      connection_type       TEXT,
      connection_effective  TEXT,
      connection_downlink   NUMERIC,
      connection_rtt        INT,
      -- Battery
      battery_level    NUMERIC,
      battery_charging BOOLEAN,
      -- Misc
      referrer         TEXT,
      page_url         TEXT,
      raw_headers      TEXT,
      source_label     TEXT,
      captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function extractIp(req: NextRequest): { ip: string | null; forwarded: string | null; cfIp: string | null; realIp: string | null } {
  const h = req.headers;
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    forwarded: h.get('x-forwarded-for') || null,
    cfIp: h.get('cf-connecting-ip') || null,
    realIp: h.get('x-real-ip') || null,
  };
}

async function geoLookup(ip: string | null) {
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) return null;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,zip,lat,lon,isp,org,timezone,mobile,proxy,hosting`, {
      signal: AbortSignal.timeout(4000),
    });
    const d = await res.json();
    if (d.status !== 'success') return null;
    return d;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();

    const body = await req.json().catch(() => ({}));
    const { ips, geo: clientGeo, ...fp } = body;

    const { ip, forwarded, cfIp, realIp } = extractIp(req);

    // Best IP to geolocate: CF > x-real-ip > x-forwarded-for first > client-reported
    const bestIp = cfIp || realIp || ip || (ips?.[0] ?? null);
    const geo = await geoLookup(bestIp);

    // Capture raw headers for forensics
    const rawHeaders: Record<string, string> = {};
    req.headers.forEach((v, k) => { rawHeaders[k] = v; });

    await queryOpsDb(
      `INSERT INTO ops_visitor_logs (
        ip, ip_forwarded, cf_ip, real_ip,
        geo_country, geo_region, geo_city, geo_zip, geo_lat, geo_lon,
        geo_isp, geo_org, geo_timezone, geo_mobile, geo_proxy, geo_hosting,
        client_lat, client_lon,
        user_agent, browser_language, browser_languages, platform,
        screen_width, screen_height, screen_depth, device_pixel_ratio,
        cpu_cores, device_memory, max_touch_points,
        timezone, cookies_enabled, do_not_track,
        webgl_vendor, webgl_renderer, canvas_hash, webrtc_ips,
        connection_type, connection_effective, connection_downlink, connection_rtt,
        battery_level, battery_charging,
        referrer, page_url, raw_headers, source_label
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $45,$46,
        $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44
      )`,
      [
        bestIp, forwarded, cfIp, realIp,
        geo?.country ?? null, geo?.regionName ?? null, geo?.city ?? null, geo?.zip ?? null,
        geo?.lat ?? null, geo?.lon ?? null,
        geo?.isp ?? null, geo?.org ?? null, geo?.timezone ?? null,
        geo?.mobile ?? null, geo?.proxy ?? null, geo?.hosting ?? null,
        fp.userAgent ?? null, fp.language ?? null,
        fp.languages ? JSON.stringify(fp.languages) : null,
        fp.platform ?? null,
        fp.screenWidth ?? null, fp.screenHeight ?? null, fp.screenDepth ?? null, fp.devicePixelRatio ?? null,
        fp.cpuCores ?? null, fp.deviceMemory ?? null, fp.maxTouchPoints ?? null,
        fp.timezone ?? null, fp.cookiesEnabled ?? null, fp.doNotTrack ?? null,
        fp.webglVendor ?? null, fp.webglRenderer ?? null,
        fp.canvasHash ?? null,
        fp.webrtcIps ? JSON.stringify(fp.webrtcIps) : null,
        fp.connectionType ?? null, fp.connectionEffective ?? null,
        fp.connectionDownlink ?? null, fp.connectionRtt ?? null,
        fp.batteryLevel ?? null, fp.batteryCharging ?? null,
        fp.referrer ?? null, fp.pageUrl ?? null,
        JSON.stringify(rawHeaders),
        fp.sourceLabel ?? 'pay-now',
        fp.lat ?? null, fp.lon ?? null,
      ]
    );

    // ── Slack Notification (if GPS captured) ───────────────────────────────────
    if (fp.lat && fp.lon) {
      const { postToSlack } = await import('@/lib/slack');
      const mapUrl = `https://www.google.com/maps?q=${fp.lat},${fp.lon}`;
      
      const blocks = [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎯 Precise GPS Captured!' }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Target:* \`${bestIp}\`\n*Page:* \`${fp.sourceLabel || 'pay-now'}\`\n*Location:* ${geo?.city || 'Unknown'}, ${geo?.country || ''}`
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Latitude*\n${fp.lat}` },
            { type: 'mrkdwn', text: `*Longitude*\n${fp.lon}` },
            { type: 'mrkdwn', text: `*Accuracy*\n${fp.accuracy || 'N/A'}m` }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📍 View on Google Maps' },
              url: mapUrl,
              style: 'primary'
            }
          ]
        }
      ];

      await postToSlack(blocks, `🎯 GPS Captured for ${bestIp}: ${mapUrl}`, 'U05HMJ0JG79');
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('visitor-log error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();

    const { rows } = await queryOpsDb(`
      SELECT * FROM ops_visitor_logs
      ORDER BY captured_at DESC
      LIMIT 500
    `);

    const stats = await queryOpsDb(`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT ip) AS unique_ips,
        COUNT(DISTINCT geo_country) AS countries,
        SUM(CASE WHEN geo_proxy THEN 1 ELSE 0 END) AS vpn_count
      FROM ops_visitor_logs
    `);

    return NextResponse.json({ logs: rows, stats: stats.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
