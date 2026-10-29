// ========================================================================
// 貼到 GAS doGet 的 if 判斷區（在現有的 if/else 前面加這幾段）
// ========================================================================

// -- 在 doGet 裡加這幾個 action -------------------------------------------

//  if (action === 'subscribe')     { return handleSubscribe(e); }
//  if (action === 'subscriptions') { return getSubscriptions(); }
//  if (action === 'schedule')      { return getSchedule(e); }

// ========================================================================
// 把以下函數貼到 doGet 外面（與 recordReaction 等並列）
// ========================================================================

function handleSubscribe(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Subscriptions');
  if (!sheet) {
    sheet = ss.insertSheet('Subscriptions');
    sheet.appendRow(['姓名', 'Endpoint', 'P256dh', 'Auth', '建立時間']);
  }
  const name     = e.parameter.name     || '';
  const endpoint = e.parameter.endpoint || '';
  const p256dh   = e.parameter.p256dh   || '';
  const auth     = e.parameter.auth     || '';
  const now      = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  // 若同名同 endpoint 已存在則更新，否則新增
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name && data[i][1] === endpoint) {
      sheet.getRange(i + 1, 3, 1, 2).setValues([[p256dh, auth]]);
      return json({ ok: true, action: 'updated' });
    }
  }
  sheet.appendRow([name, endpoint, p256dh, auth, now]);
  return json({ ok: true, action: 'created' });
}

function getSubscriptions() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Subscriptions');
  if (!sheet || sheet.getLastRow() < 2) return json([]);

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const result = data
    .filter(r => r[0] && r[1])
    .map(r => ({ name: r[0], endpoint: r[1], p256dh: r[2], auth: r[3] }));
  return json(result);
}

function getSchedule(e) {
  const dateParam = (e.parameter.date || '').trim(); // 格式 MM/DD，例如 11/02
  const tab       = e.parameter.tab || '2026';

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tab);
  if (!sheet) return json([]);

  const data = sheet.getDataRange().getValues();
  if (data.length < 3) return json([]);

  const stationRow = data[0]; // 站位名稱
  const serviceRow = data[1]; // 第一堂 / 第二堂 標籤列

  // 找到「第二堂」開始的欄位
  let secondStart = -1;
  for (let c = 0; c < serviceRow.length; c++) {
    if (String(serviceRow[c]).includes('第二堂')) { secondStart = c; break; }
  }

  // 找日期列
  let targetRow = -1;
  for (let r = 2; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      if (String(data[r][c]).trim() === dateParam) { targetRow = r; break; }
    }
    if (targetRow >= 0) break;
  }
  if (targetRow < 0) return json([]);

  // 取總召（讀 Captains 分頁，依月份）
  const month = parseInt(dateParam.split('/')[0], 10);
  const captains = getCaptainsForMonth(month);

  // 掃描日期列，抓出所有人名
  const row   = data[targetRow];
  const chRe  = /^[一-龥\s　]{2,10}$/;
  const results = [];

  for (let c = 0; c < row.length; c++) {
    const cell = String(row[c]).trim().replace(/\s+/g, ' ');
    if (!cell || cell === 'V' || cell === dateParam) continue;
    if (!chRe.test(cell)) continue;

    const service     = (secondStart >= 0 && c >= secondStart) ? '第二堂' : '第一堂';
    const collectTime = service === '第一堂' ? '08:10' : '10:10';

    // 往左找最近的站位名
    let station = '';
    for (let sc = c; sc >= 0; sc--) {
      const s = String(stationRow[sc]).trim();
      if (s && !chRe.test(s) && s !== 'V') { station = s; break; }
    }

    // 判斷區域對應的總召
    const area    = station.includes('4F') || station.includes('四') ? '4F'
                  : station.includes('B1') || station.includes('地下') ? 'B1'
                  : station.includes('1F') || station.includes('一樓') ? '1F'
                  : '';
    const captain = captains[area] || '';

    results.push({ name: cell, service, station, collectTime, captain });
  }

  return json(results);
}

function getCaptainsForMonth(month) {
  // 讀「總召表」分頁（欄位：月份 | 4F | 1F | 親子 | B1 | ...）
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('總召表');
  if (!sheet) return {};

  const data    = sheet.getDataRange().getValues();
  const headers = data[0]; // ['月份', '4F', '1F', '親子', 'B1', ...]

  const monthNames = ['一月','二月','三月','四月','五月','六月',
                      '七月','八月','九月','十月','十一月','十二月'];
  const target = monthNames[month - 1];

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === target) {
      const map = {};
      headers.forEach(function(h, i) {
        if (h && i > 0) map[String(h).trim()] = String(data[r][i]).trim();
      });
      return map;
    }
  }
  return {};
}

// 小工具：回傳 JSON response
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
