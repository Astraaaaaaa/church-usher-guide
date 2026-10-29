const GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

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
    const { name, notifyTime, subscription } = body;

    if (!name || !subscription || !subscription.endpoint) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: '缺少姓名或訂閱資訊' }) };
    }

    const url = GAS_URL
      + '?action=subscribe'
      + '&name='       + encodeURIComponent(name)
      + '&notifyTime=' + encodeURIComponent(notifyTime || '17:30')
      + '&endpoint='   + encodeURIComponent(subscription.endpoint)
      + '&p256dh='     + encodeURIComponent(subscription.keys.p256dh)
      + '&auth='       + encodeURIComponent(subscription.keys.auth);

    await fetch(url, { redirect: 'follow' });
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
