const GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

// 名字去姓（3字以上取後兩字，2字以下或英文全取）
function givenName(fullName) {
  const n = (fullName || '').replace(/[姐哥師兄妹]$/, '').trim();
  if (n.length <= 2 || /\s/.test(n)) return n;
  return n.slice(1);
}

// 解析 notifyTime → 中文說明（e.g. "2d_20:00" → "週五 20:00"）
function notifyLabel(notifyTime) {
  const nt = (notifyTime || '').split('|')[0];
  const DAY = { '1': '週六', '2': '週五', '3': '週四' };
  if (nt.includes('d_')) {
    const [d, t] = nt.split('d_');
    return `${DAY[d] || `前${d}天`} ${t}`;
  }
  return nt;
}

async function sendConfirmPush(subscription, name, notifyTime, isUpdate) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      'mailto:chiehastra@gmail.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const gn = givenName(name);
    const label = notifyLabel(notifyTime);
    const hasSameday = (notifyTime || '').includes('|sameday');
    const payload = JSON.stringify(isUpdate ? {
      title: '✅ 設定已更新',
      body: `${gn} 的提醒已更新，${label} 有排班時會通知你` + (hasSameday ? '，服事當天也會提醒 🔔' : ' 🔔'),
      url: '/',
    } : {
      title: '🔔 訂閱成功',
      body: `${gn} 平安！${label} 有排班時會提前通知你 ✨`,
      url: '/',
    });
    await webpush.sendNotification(subscription, payload);
  } catch (e) {
    console.warn('confirm push 失敗（不影響訂閱）:', e.message);
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

    const { name, notifyTime, subscription, isUpdate } = body;

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
    await sendConfirmPush(subscription, name, notifyTime, !!isUpdate);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
