const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  // 只在 GET 時才計數（避免爬蟲 POST 重複觸發）
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const store = getStore('site-analytics');
    const raw = await store.get('views');
    const count = (parseInt(raw) || 0) + 1;
    await store.set('views', String(count));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ count }),
    };
  } catch (err) {
    // Blobs 不可用時靜默失敗，不影響主頁
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ count: null, error: err.message }),
    };
  }
};
