const GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec';

exports.handler = async function (event) {
  const tab = event.queryStringParameters?.tab || '2026';
  try {
    const res = await fetch(`${GAS_URL}?tab=${encodeURIComponent(tab)}`, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
      body: JSON.stringify(rows),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
