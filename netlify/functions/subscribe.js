const GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

// 發送 welcome push
async function sendWelcomePush(subscription, name) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      'mailto:chiehastra@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const firstName = name.replace(/[姐哥師]$/, '').trim();
    const payload = JSON.stringify({
      title: '🔔 訂閱成功',
      body: `${firstName} 平安！有服事排班時會提前通知你 ✨`,
      url: '/',
    });
    await webpush.sendNotification(subscription, payload);
  } catch (e) {
    console.warn('welcome push 失敗（不影響訂閱）:', e.message);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  // GET ?action=names → 回傳同工名單
  if (event.httpMethod === 'GET') {
    const action = (event.queryStringParameters || {}).action;
    if (action === 'names') {
      try {
        const res = await fetch(GAS_URL + '?action=names', { redirect: 'follow' });
        const data = await res.json();
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) };
      } catch (err) {
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ names: [] }) };
      }
    }
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'unknown action' }) };
  }

  // POST → 儲存訂閱
  try {
    const body = JSON.parse(event.body || '{}');
    // 取消訂閱：依 endpoint 刪除
    if (body.action === 'unsubscribe') {
      if (!body.endpoint) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: '缺少 endpoint' }) };
      }
      await fetch(GAS_URL + '?action=unsubscribe&endpoint=' + encodeURIComponent(body.endpoint), { redirect: 'follow' });
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    const { name, notifyTime, subscription } = body;

    if (!name || !subscription || !subscription.endpoint) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: '缺少姓名或訂閱資訊' }) };
    }

    const hasSameday = (notifyTime || '').includes('|sameday');
    const url = GAS_URL
      + '?action=subscribe'
      + '&name='                + encodeURIComponent(name)
      + '&notifyTime='          + encodeURIComponent(notifyTime || '17:30')
      + '&remindBeforeService=' + (hasSameday ? '1' : '0')
      + '&endpoint='            + encodeURIComponent(subscription.endpoint)
      + '&p256dh='              + encodeURIComponent(subscription.keys.p256dh)
      + '&auth='                + encodeURIComponent(subscription.keys.auth);

    await fetch(url, { redirect: 'follow' });
    // 訂閱成功後立即發 welcome push 確認通知
    await sendWelcomePush(subscription, name);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
