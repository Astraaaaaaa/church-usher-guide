const SHEET_ID = '1CMaaFrrabbTXgVbBi9vFi_OWrbYbMvqkfTBKI9DTKww';

function csvUrl(tab) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = [];
    let cell = '', inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { row.push(cell.trim()); cell = ''; }
      else { cell += c; }
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

exports.handler = async function (event) {
  const tab = event.queryStringParameters?.tab || '2026';
  try {
    const res = await fetch(csvUrl(tab), { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=180',
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
