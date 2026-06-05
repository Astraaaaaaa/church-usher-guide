const CSV_URL =
  'https://docs.google.com/spreadsheets/d/' +
  '1CMaaFrrabbTXgVbBi9vFi_OWrbYbMvqkfTBKI9DTKww' +
  '/gviz/tq?tqx=out:csv&sheet=2026';

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

exports.handler = async function () {
  try {
    const res = await fetch(CSV_URL, { redirect: 'follow' });
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
