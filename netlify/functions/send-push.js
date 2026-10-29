const webpush = require('web-push');
const GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec';

webpush.setVapidDetails(
  'mailto:chiehastra@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// 從全名去掉姓（第一個字）
function firstName(fullName) {
  const n = fullName.replace(/\s+/g, '').trim();
  // 若名字含空格（如「容   容」）或帶稱謂（如「沈雁姐」），直接回傳整個名字
  if (/[\s　]/.test(fullName.trim()) || fullName.includes('姐') || fullName.includes('哥') || fullName.includes('師')) {
    return fullName.trim();
  }
  return n.length > 1 ? n.slice(1) : n;
}

// 取得下週日日期字串 MM/DD（台北時間）
function nextSundayStr() {
  const now = new Date();
  const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const day = tw.getDay(); // 0=Sun
  const daysUntil = day === 0 ? 7 : 7 - day;
  tw.setDate(tw.getDate() + daysUntil);
  const m = String(tw.getMonth() + 1).padStart(2, '0');
  const d = String(tw.getDate()).padStart(2, '0');
  return m + '/' + d;
}

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  // 允許手動帶 test=1&name=xxx 測試單人
  const params = event.queryStringParameters || {};
  const isTest = params.test === '1';
  const testName = params.name || '';

  try {
    const dateStr = params.date || nextSundayStr();

    // 1. 取得當日輪值
    const schedUrl = GAS_URL + '?action=schedule&date=' + dateStr;
    const schedRes = await fetch(schedUrl, { redirect: 'follow' });
    let schedule = await schedRes.json(); // [{name, service, station, collectTime, captain}]

    if (isTest && testName) {
      schedule = schedule.filter(p => p.name === testName);
    }

    // 2. 取得所有訂閱
    const subsUrl = GAS_URL + '?action=subscriptions';
    const subsRes = await fetch(subsUrl, { redirect: 'follow' });
    const subs = await subsRes.json(); // [{name, endpoint, p256dh, auth}]

    // name → subscription[] map
    const subMap = {};
    subs.forEach(s => {
      if (!subMap[s.name]) subMap[s.name] = [];
      subMap[s.name].push(s);
    });

    // 3. 發送推播
    const results = [];
    for (const person of schedule) {
      const fname = firstName(person.name);
      const captainPart = person.captain ? `找${person.captain}` : '找總召';
      const body = `平安～ ${fname}，明主日${person.service}在${person.station}服事，請在${person.collectTime}${captainPart}集合，謝謝您！`;
      const payload = JSON.stringify({ title: '🔔 主日招待服事提醒 🔔', body });

      const personSubs = subMap[person.name] || [];
      if (personSubs.length === 0) {
        results.push({ name: person.name, status: 'no_subscription' });
        continue;
      }

      for (const sub of personSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          results.push({ name: person.name, station: person.station, status: 'sent' });
        } catch (err) {
          results.push({ name: person.name, status: 'failed', error: err.message });
        }
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, date: dateStr, sent: results.length, results }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
