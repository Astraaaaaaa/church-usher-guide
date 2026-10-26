const GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec';

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };
  const params = event.queryStringParameters || {};
  const emoji = params.emoji || '';
  const text = params.text || '';
  const action = emoji ? 'react' : 'counts';
  try {
    const url = GAS_URL + '?action=' + action
      + (emoji ? '&emoji=' + encodeURIComponent(emoji) : '')
      + (text  ? '&text='  + encodeURIComponent(text)  : '');
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('GAS ' + res.status);
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, counts: {} }) };
  }
};
