const GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec';

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };
  try {
    const res = await fetch(`${GAS_URL}?action=hit`, { redirect: 'follow' });
    if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ count: data.count }) };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ count: null }) };
  }
};
