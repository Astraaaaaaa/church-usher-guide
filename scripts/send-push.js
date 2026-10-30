// ========================================================================
// 招待網頁 GAS 後端（整份取代 Code.gs，貼上後「部署 → 管理部署作業 → 編輯 → 新版本」）
// ========================================================================

function doGet(e) {
  const action = e.parameter.action || '';

  if (action === 'hit') {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('_stats');
    if (!sheet) {
      sheet = ss.insertSheet('_stats');
      sheet.getRange('A1').setValue(0);
    }
    const cell = sheet.getRange('A1');
    const count = (parseInt(cell.getValue()) || 0) + 1;
    cell.setValue(count);
    return ContentService.createTextOutput(JSON.stringify({ count: count }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'react')         { return recordReaction(e.parameter.emoji || '', e.parameter.text || ''); }
  if (action === 'counts')        { return getReactionCounts(); }
  if (action === 'subscribe')     { return handleSubscribe(e); }
  if (action === 'unsubscribe')   { return handleUnsubscribe(e); }
  if (action === 'subscriptions') { return getSubscriptions(); }
  if (action === 'schedule')      { return getSchedule(e); }
  if (action === 'names')         { return getNames(); }

  // 預設：回傳整張 sheet
  const tab = e.parameter.tab || '2026';
  const cb  = e.parameter.callback || null;
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tab);
  if (!sheet) {
    const err = JSON.stringify({ error: 'Tab not found: ' + tab });
    return ContentService.createTextOutput(cb ? cb + '(' + err + ')' : err)
      .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  }
  const data = sheet.getDataRange().getValues();
  const body = JSON.stringify(data);
  return ContentService.createTextOutput(cb ? cb + '(' + body + ')' : body)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

// ── 回饋 ───────────────────────────────────────────────────────────────────
function recordReaction(emoji, text) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Reactions');
  if (!sheet) {
    sheet = ss.insertSheet('Reactions');
    sheet.appendRow(['時間', 'Emoji', '回饋文字']);
  }
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  sheet.appendRow([now, emoji, text]);
  return getReactionCounts();
}

function getReactionCounts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Reactions');
  const counts = {};
  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
    data.forEach(([e]) => { if (e) counts[e] = (counts[e] || 0) + 1; });
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, counts }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 訂閱 / 取消訂閱 ────────────────────────────────────────────────────────
// Subscriptions 欄位：A 姓名 | B notifyTime | C Endpoint | D P256dh | E Auth | F 建立時間
function handleSubscribe(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Subscriptions');
  if (!sheet) {
    sheet = ss.insertSheet('Subscriptions');
    sheet.appendRow(['姓名', 'notifyTime', 'Endpoint', 'P256dh', 'Auth', '建立時間']);
  }
  const name       = e.parameter.name       || '';
  const notifyTime = e.parameter.notifyTime || '1d_17:30';
  const endpoint   = e.parameter.endpoint   || '';
  const p256dh     = e.parameter.p256dh     || '';
  const auth       = e.parameter.auth       || '';
  const now        = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name && data[i][2] === endpoint) {
      sheet.getRange(i + 1, 2, 1, 4).setValues([[notifyTime, endpoint, p256dh, auth]]);
      return json({ ok: true, action: 'updated' });
    }
  }
  sheet.appendRow([name, notifyTime, endpoint, p256dh, auth, now]);
  return json({ ok: true, action: 'created' });
}

function handleUnsubscribe(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Subscriptions');
  const endpoint = e.parameter.endpoint || '';
  if (!sheet || !endpoint) return json({ ok: false });

  const data = sheet.getDataRange().getValues();
  let removed = 0;
  // 由下往上刪，避免列號位移；Endpoint 在第 3 欄（index 2）
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][2] === endpoint) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  return json({ ok: true, removed: removed });
}

function getSubscriptions() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Subscriptions');
  if (!sheet || sheet.getLastRow() < 2) return json([]);

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const result = data
    .filter(r => r[0] && r[2])
    .map(r => ({
      name:       r[0],
      notifyTime: r[1] || '1d_17:30',
      endpoint:   r[2],
      p256dh:     r[3],
      auth:       r[4]
    }));
  return json(result);
}

// ── 排班（招待 + 總召）─────────────────────────────────────────────────────
function getSchedule(e) {
  const dateParam = (e.parameter.date || '').trim();   // 格式 MM/DD，例如 11/01
  const tab       = e.parameter.tab || '2026';

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tab);
  if (!sheet) return json([]);

  const data = sheet.getDataRange().getValues();
  if (data.length < 3) return json([]);

  const stationRow = data[0];
  const serviceRow = data[1];

  let secondStart = -1;
  for (let c = 0; c < serviceRow.length; c++) {
    if (String(serviceRow[c]).includes('第二堂')) { secondStart = c; break; }
  }

  // 日期比對：同時支援 Date 物件和字串
  function cellToMD(cell) {
    if (cell instanceof Date) {
      const m = String(cell.getMonth() + 1).padStart(2, '0');
      const d = String(cell.getDate()).padStart(2, '0');
      return m + '/' + d;
    }
    return String(cell).trim();
  }

  let targetRow = -1;
  for (let r = 2; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      if (cellToMD(data[r][c]) === dateParam) { targetRow = r; break; }
    }
    if (targetRow >= 0) break;
  }
  if (targetRow < 0) return json([]);

  const month    = parseInt(dateParam.split('/')[0], 10);
  const captains = getCaptainsForMonth(month, tab);   // { '第一堂': {...}, '第二堂': {...} }

  const row   = data[targetRow];
  const chRe  = /^[\u4e00-\u9fa5]{2,4}$/;  // 純中文名字
  const results = [];

  for (let c = 0; c < row.length; c++) {
    const cell = String(row[c]).trim();
    if (!cell || cell === 'V' || cellToMD(row[c]) === dateParam) continue;
    if (!chRe.test(cell)) continue;

    const service     = (secondStart >= 0 && c >= secondStart) ? '第二堂' : '第一堂';
    const collectTime = service === '第一堂' ? '08:10' : '10:10';

    let station = '';
    for (let sc = c; sc >= 0; sc--) {
      const s = String(stationRow[sc]).trim();
      if (s && !/^[\u4e00-\u9fa5]{2,4}$/.test(s) && s !== 'V') { station = s; break; }
    }

    const area = station.includes('4F') || station.includes('四') ? '4F'
               : station.includes('B1') || station.includes('地下') ? 'B1'
               : station.includes('1F') || station.includes('一樓') ? '1F'
               : station.includes('親子') ? '親子' : '';
    const captain = ((captains[service] || {})[area]) || '';

    results.push({ name: cell, service, station, collectTime, captain });
  }

  // ── 加入當月總召（每位一則；同一人也排招待時，send-push.js 會合併成一則通知）──
  const CAPTAIN_COLLECT = { '第一堂': '08:10', '第二堂': '10:10' };   // 總召與招待集合時間相同
  ['第一堂', '第二堂'].forEach(function(svc) {
    const m = captains[svc] || {};
    Object.keys(m).forEach(function(area) {
      m[area].split(/[、,，\/／]/).forEach(function(n) {
        n = n.trim();
        if (!n) return;
        results.push({ name: n, role: 'captain', service: svc, station: area + ' 總召', collectTime: CAPTAIN_COLLECT[svc], captain: '' });
      });
    });
  });

  return json(results);
}

// ── 總召表（在「2026」分頁裡：月份 | 4F | 1F | 親子 | B1 | 1F | 親子）──────────
// B1 之前的欄位 = 第一堂（4F、1F、親子），B1 起 = 第二堂（B1、1F、親子）
// 名字會去掉所有空白（「容   容」→「容容」）
const CAPTAIN_AREAS_ = { '4F': 1, '1F': 1, '親子': 1, 'B1': 1 };

function findCaptainTable_(data) {
  const clean = function(v) { return String(v).replace(/\s+/g, ''); };
  for (let r = 0; r < data.length; r++) {
    const i4 = data[r].findIndex(function(v) { return clean(v) === '4F'; });
    const iB = data[r].findIndex(function(v) { return clean(v) === 'B1'; });
    if (i4 > 0 && iB > i4) return { hr: r, c4: i4, cB1: iB, monthCol: i4 - 1 };
  }
  return null;
}

function getCaptainsForMonth(month, tab) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab || '2026');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const t = findCaptainTable_(data);
  if (!t) return {};

  const clean = function(v) { return String(v).replace(/\s+/g, ''); };
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const target = monthNames[month - 1];
  const header = data[t.hr];

  for (let r = t.hr + 1; r < data.length; r++) {
    if (clean(data[r][t.monthCol]) !== target) continue;
    const result = { '第一堂': {}, '第二堂': {} };
    for (let c = t.c4; c < header.length; c++) {
      const area = clean(header[c]);
      if (!CAPTAIN_AREAS_[area]) break;          // 只收 4F／1F／親子／B1，遇到其他欄位就停（避免讀到同一列右邊的別的資料）
      const name = clean(data[r][c]);
      if (!name) continue;
      result[c < t.cB1 ? '第一堂' : '第二堂'][area] = name;
    }
    return result;
  }
  return {};
}

function getCaptainNames() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('2026');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const t = findCaptainTable_(data);
  if (!t) return [];
  const clean = function(v) { return String(v).replace(/\s+/g, ''); };
  const set = {};
  for (let r = t.hr + 1; r < data.length; r++) {
    if (!/月$/.test(clean(data[r][t.monthCol]))) break;
    for (let c = t.c4; c < data[t.hr].length; c++) {
      if (!CAPTAIN_AREAS_[clean(data[t.hr][c])]) break;
      const n = clean(data[r][c]);
      if (n) set[n] = true;
    }
  }
  return Object.keys(set);
}

// ── 訂閱選單的同工名單（投入名單分頁 + 總召）──────────────────────────────
function getNames() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('投入名單');
  const nameSet = new Set();

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    const INCLUDE = new Set(['穩定投入', '新加入', '回歸']);

    // 找標題列：含有「姓名」的列
    let headerRow = -1;
    const nameCols   = []; // 姓名欄 index
    const statusCols = []; // 對應投入狀態欄 index

    for (let r = 0; r < Math.min(10, data.length); r++) {
      const row = data[r];
      const nameIdxs = [];
      for (let c = 0; c < row.length; c++) {
        if (String(row[c]).trim() === '姓名') nameIdxs.push(c);
      }
      if (nameIdxs.length > 0) {
        headerRow = r;
        nameIdxs.forEach(function(nc) {
          for (let c = nc + 1; c < Math.min(nc + 5, row.length); c++) {
            if (String(row[c]).trim() === '投入狀態') {
              nameCols.push(nc);
              statusCols.push(c);
              break;
            }
          }
        });
        break;
      }
    }

    if (headerRow >= 0) {
      for (let r = headerRow + 1; r < data.length; r++) {
        for (let i = 0; i < nameCols.length; i++) {
          const name   = String(data[r][nameCols[i]]).trim();
          const status = String(data[r][statusCols[i]]).trim();
          if (name && name.length >= 2 && INCLUDE.has(status)) {
            // 去掉括號備註，如「李欣彤(維萍姐)」→「李欣彤」
            nameSet.add(name.replace(/[（(].+?[）)]/g, '').trim());
          }
        }
      }
    }
  }

  // 總召（來自 2026 分頁的總召表）
  getCaptainNames().forEach(function(n) { nameSet.add(n); });

  return json({ names: Array.from(nameSet).sort() });
}

// ── 除錯用（在編輯器手動執行，看「執行記錄」）──────────────────────────────
function debugSubs() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Subscriptions');
  if (!sheet) { Logger.log('❌ 找不到 Subscriptions sheet'); return; }
  Logger.log('✅ lastRow: ' + sheet.getLastRow());
  sheet.getDataRange().getValues().forEach(function(r, i) { Logger.log('row ' + i + ': ' + JSON.stringify(r)); });
}

function debugCaptains() {
  Logger.log(JSON.stringify(getCaptainsForMonth(11)));
  Logger.log(JSON.stringify(getCaptainNames()));
}

// 小工具：回傳 JSON response
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
