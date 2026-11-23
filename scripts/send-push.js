#!/usr/bin/env node
/**
 * 服事提醒推播腳本（主日招待 + 禱告會招待）
 * 由 cron-job.org → repository_dispatch 觸發
 * MODE：sunday（只跑主日）／prayer（只跑禱告會）／空白或 all（兩者都跑）
 */

const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const GAS_URL       = process.env.GAS_URL;

if (!VAPID_PUBLIC || !VAPID_PRIVATE || !GAS_URL) {
  console.error('❌ 缺少環境變數：VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / GAS_URL');
  process.exit(1);
}

webpush.setVapidDetails('mailto:chiehastra@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
{
  const crypto = require('crypto');
  const FRONTEND_KEY = 'BO8Gv6RyZRiGnqgvX0Xy5afubq3wSrZDRgB8kH4gPRgEFJEkHbzpjohG_ldqyEu_EKsQLGOop_WX0oxgkdYHBak';
  let derived = '';
  try {
    const e = crypto.createECDH('prime256v1');
    e.setPrivateKey(Buffer.from(VAPID_PRIVATE.trim(), 'base64url'));
    derived = e.getPublicKey().toString('base64url');
  } catch (err) { console.log('私鑰無法解析:', err.message); }
  console.log('Secret公鑰==前端公鑰:', VAPID_PUBLIC.trim() === FRONTEND_KEY);
  console.log('私鑰推算公鑰==前端公鑰:', derived === FRONTEND_KEY);
  console.log('Secret含多餘空白:', VAPID_PUBLIC !== VAPID_PUBLIC.trim() || VAPID_PRIVATE !== VAPID_PRIVATE.trim());
}

const MODE       = (process.env.MODE || '').trim() || 'all';
const RUN_SUNDAY = MODE === 'sunday' || MODE === 'all';
const RUN_PRAYER = MODE === 'prayer' || MODE === 'all';
// 只有人工在 GitHub 按「Run workflow」才略過篩選；勾「照訂閱時間篩選」則不略過
// workflow_dispatch = 手動觸發；repository_dispatch = cron-job.org 外部觸發
// 兩者都視為「主動觸發」，bypass 時間視窗限制
const isManual = (
  process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ||
  process.env.GITHUB_EVENT_NAME === 'repository_dispatch'
) && process.env.RESPECT_SCHEDULE !== 'true';

const CAPTAIN_COLLECT = { '第一堂': '08:10', '第二堂': '10:10' };
const CLOSING = '感謝您的擺上～主日見！';
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

// ── 工具函式 ────────────────────────────────────────────────────────────
const norm = n => String(n || '').replace(/\s+/g, '');

function firstName(fullName) {
  const n = fullName.trim();
  if (n.length <= 2 || /\s/.test(n) || /[姐哥師]$/.test(n)) return n;
  return n.slice(1);
}

function getTaipeiNow() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    weekday: now.getDay(),
    hour: String(now.getHours()).padStart(2, '0'),
    minute: String(now.getMinutes()).padStart(2, '0'),
  };
}

function nowMinutes() {
  const { hour, minute } = getTaipeiNow();
  return parseInt(hour) * 60 + parseInt(minute);
}

// 現在是否落在目標時間窗口（早 2 分 ~ 晚 15 分，容許 GitHub 啟動延遲）
function inWindow(targetMin) {
  const diff = nowMinutes() - targetMin;
  return diff >= -2 && diff <= 15;
}

// notifyTime "1d_17:00" → { days, targetMin }；舊格式 "HH:MM" 視為前1天
function parseNotify(notifyTime) {
  const nt = (notifyTime || '1d_17:30').split('|')[0]; // strip |sameday suffix
  let days = 1, timePart = nt;
  if (nt.includes('d_')) {
    const [d, t] = nt.split('d_');
    days = parseInt(d);
    timePart = t;
  }
  const [th, tm] = timePart.split(':').map(Number);
  return { days, targetMin: th * 60 + tm };
}

function hasSameday(notifyTime) {
  return (notifyTime || '').includes('|sameday');
}

// 主日：前1天=週六、前2天=週五、當天=週日
function shouldNotifyNow(notifyTime) {
  const { weekday } = getTaipeiNow();
  const { days, targetMin } = parseNotify(notifyTime);
  return weekday === (7 - days) % 7 && inWindow(targetMin);
}

function todayStr() {
  const { month, day } = getTaipeiNow();
  return String(month).padStart(2, '0') + '/' + String(day).padStart(2, '0');
}

// 下一個主日（週日當天則是 7 天後）
function nextSundayStr() {
  const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const daysUntil = tw.getDay() === 0 ? 7 : 7 - tw.getDay();
  tw.setDate(tw.getDate() + daysUntil);
  return String(tw.getMonth() + 1).padStart(2, '0') + '/' + String(tw.getDate()).padStart(2, '0');
}

function toBase64(str) {
  let s = (str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return s;
}

async function pushTo(sub, payload, label) {
  const p256dh = toBase64(sub.p256dh);
  const auth   = toBase64(sub.auth);
  if (Buffer.from(p256dh, 'base64').length !== 65) {
    console.warn(`  ⚠️  ${label} p256dh 長度異常，略過`);
    return false;
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh, auth } }, payload);
    console.log(`  ✅ ${label}`);
    return true;
  } catch (err) {
    console.error(`  ❌ ${label}：${err.message}`);
    return false;
  }
}

function buildSubMap(subs) {
  const map = {};
  subs.forEach(s => { (map[norm(s.name)] ||= []).push(s); });
  return map;
}

// 解析 GAS 回傳的日期（ISO UTC 字串 或 YYYY/MM/DD）→ Date（台北時間）
function parsePrayerDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (s.includes('T')) return new Date(new Date(s).toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return null;
}

// 就位時間：只接受 "HH:MM" 文字，其他（例如時間格式被轉成 ISO）一律用 18:50
function parsePrayerTime(val) {
  const s = String(val || '').trim();
  return /^\d{1,2}:\d{2}$/.test(s) ? s : '18:50';
}

// ── 主日招待 ────────────────────────────────────────────────────────────
async function runSunday(subs) {
  console.log('\n⛪ ===== 主日招待提醒 =====');
  const { weekday } = getTaipeiNow();
  // 週日當天查「今天」，其他天查「下個主日」
  const dateStr = process.argv[2] || (weekday === 0 ? todayStr() : nextSundayStr());
  console.log(`📅 查詢日期：${dateStr}`);

  const schedule = await (await fetch(`${GAS_URL}?action=schedule&date=${dateStr}`)).json();
  console.log(`📋 排班人數：${schedule.length}`);
  if (schedule.length === 0) {
    console.log('⚠️  當日無主日排班資料，略過主日提醒。');
    return;
  }

  const subMap = buildSubMap(subs);

  // 同一人可能有多筆（兩堂、總召＋招待）→ 合併成一則
  const groups = new Map();
  schedule.forEach(e => {
    const k = norm(e.name);
    if (!/^[\u4e00-\u9fa5]{2,6}$/.test(k)) { console.log(`  ⚠️  略過不像人名的資料：${k}`); return; }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  });

  // 日期顯示 yyyy.mm.dd
  const [mm, dd] = dateStr.split('/').map(Number);
  const twNow = getTaipeiNow();
  let year = twNow.year;
  if (mm < twNow.month - 6) year += 1;
  else if (mm > twNow.month + 6) year -= 1;
  const wd = WEEKDAY_ZH[new Date(year, mm - 1, dd).getDay()];
  const dateLabel = `${year}.${String(mm).padStart(2, '0')}.${String(dd).padStart(2, '0')}（${wd}）`;

  const place = e => `📍${e.service}｜${e.station}`;
  const when = e => e.role === 'captain'
    ? `⏰${CAPTAIN_COLLECT[e.service] || e.collectTime} 抵達集合招待`
    : `⏰${e.collectTime} ${e.captain ? '請找' + e.captain : '請找總召'}集合`;

  let sent = 0, skipped = 0, failed = 0;

  for (const [name, entries] of groups) {
    const personSubs = subMap[name] || [];
    if (!personSubs.length) { console.log(`  ⏭  ${name}（無訂閱）`); skipped++; continue; }

    const dueSubs = isManual
      ? personSubs
      : personSubs.filter(s => {
          const ok = shouldNotifyNow(s.notifyTime);
          console.log(`  🔍 ${name} notifyTime=${s.notifyTime || '(空，預設 1d_17:30)'} → ${ok ? '符合' : '不符合'}`);
          return ok;
        });
    if (!dueSubs.length) { console.log(`  ⏭  ${name}（不在通知時段）`); skipped++; continue; }

    const aliasEntry = entries.find(e => e.alias);
    const fname = aliasEntry ? aliasEntry.alias : firstName(name);
    const greet = `${fname} 平安～`;
    const summary = entries.map(e => `${e.service} ${e.station}`).join(' + ');

    let title, body;
    if (entries.length === 1) {
      const e = entries[0];
      body = `${greet}\n${place(e)} ${when(e)}\n${CLOSING}`;
      title = `${dateLabel} ${e.role === 'captain' ? '總召' : '招待'}服事提醒`;
    } else {
      const nums = ['①', '②', '③', '④'];
      body = `${greet}\n` +
        entries.map((e, i) => `${nums[i] || (i + 1) + '.'} ${place(e)} ${when(e)}`).join('\n') +
        `\n${CLOSING}`;
      title = `${dateLabel} 服事提醒`;
    }
    const payload = JSON.stringify({ title, body, url: '/roster.html' });

    for (const sub of dueSubs) (await pushTo(sub, payload, `${name} → ${summary}`)) ? sent++ : failed++;
  }
  console.log(`主日提醒完成：送出 ${sent}，略過 ${skipped}，失敗 ${failed}`);

  // ── 週日當天：「服事當天也提醒我」（第一堂 08:00、第二堂 10:00）──
  if (weekday === 0) {
    console.log('\n🔔 週日：檢查「服事當天也提醒我」…');
    const REMIND_AT = { '第一堂': 8 * 60, '第二堂': 10 * 60 };
    let rSent = 0, rSkip = 0;

    for (const [name, entries] of groups) {
      // 勾選當天提醒、且這個時段沒有被上面的主日提醒發過（避免同一小時收兩則）
      const rSubs = (subMap[name] || []).filter(s =>
        hasSameday(s.notifyTime) &&
        (isManual || !shouldNotifyNow(s.notifyTime)));
      if (!rSubs.length) continue;

      const due = entries.filter(e => {
        const t = REMIND_AT[e.service];
        return t !== undefined && (isManual || inWindow(t));
      });
      if (!due.length) { rSkip++; continue; }

      const aliasEntry = entries.find(e => e.alias);
      const fname = aliasEntry ? aliasEntry.alias : firstName(name);
      const body = `${fname} 平安～\n` + due.map(e => `${place(e)} ${when(e)}`).join('\n') + `\n記得準時集合禱告！`;
      const payload = JSON.stringify({ title: `${dateLabel} 服事提醒`, body, url: '/roster.html' });
      for (const sub of rSubs) if (await pushTo(sub, payload, `[當天] ${name} → ${due.map(e => e.service).join('、')}`)) rSent++;
    }
    console.log(`當天提醒：送出 ${rSent}，略過 ${rSkip}`);
  }
}

// ── 禱告會招待（週一）────────────────────────────────────────────────────
async function runPrayer(subs) {
  console.log('\n🙏 ===== 禱告會招待提醒 =====');
  const { weekday, year, month, day } = getTaipeiNow();

  const pRes  = await fetch(`${GAS_URL}?tab=${encodeURIComponent('禱告會')}`);
  const pRows = pRes.ok ? await pRes.json() : [];
  console.log(`📋 禱告會分頁列數：${pRows.length}`);

  const findPrayer = date => pRows.slice(1).find(row => {
    const d = parsePrayerDate(row[0]);
    return d && d.getFullYear() === date.getFullYear()
             && d.getMonth() === date.getMonth()
             && d.getDate() === date.getDate();
  });
  const mmdd = date => String(date.getMonth() + 1).padStart(2, '0') + '/' + String(date.getDate()).padStart(2, '0');
  const matchSubs = worker => {
    const full = norm(worker);
    const stripped = full.replace(/[姐哥師]$/, '');
    return subs.filter(s => { const k = norm(s.name); return k === full || k === stripped; });
  };

  // A. 提前提醒：依訂閱者「服事前 N 天」，目標是下個週一
  //    週日 = 前1天、週六 = 前2天；週一本身不跑這段
  const daysUntilMonday = ((1 - weekday) + 7) % 7 || 7;
  if (weekday !== 1 && (daysUntilMonday === 1 || daysUntilMonday === 2)) {
    const nextMon = new Date(year, month - 1, day + daysUntilMonday);
    const adv = findPrayer(nextMon);
    if (!adv) {
      console.log(`  （${mmdd(nextMon)} 無禱告會排班）`);
    } else {
      const workers = [String(adv[1] || '').trim(), String(adv[2] || '').trim()].filter(Boolean);
      const pTime = parsePrayerTime(adv[3]);
      console.log(`  提前提醒對象：${workers.join('、')} @ ${mmdd(nextMon)} ${pTime}`);

      for (const worker of workers) {
        const dueSubs = matchSubs(worker).filter(s => {
          if (isManual) return true;
          const { days, targetMin } = parseNotify(s.notifyTime);
          const ok = days === daysUntilMonday && inWindow(targetMin);
          console.log(`  🔍 ${worker} notifyTime=${s.notifyTime} → ${ok ? '符合' : '不符合'}`);
          return ok;
        });
        if (!dueSubs.length) { console.log(`  ⏭  ${worker}（無訂閱或不在通知時段）`); continue; }

        const body = `${firstName(norm(worker))}平安！${mmdd(nextMon)} ${pTime} 禱告會招待，謝謝！`;
        const payload = JSON.stringify({ title: '禱告會招待提醒', body, url: '/' });
        for (const sub of dueSubs) await pushTo(sub, payload, `[禱告會提前] ${worker}`);
      }
    }
  } else if (weekday !== 1) {
    console.log('  （今天不在提前提醒範圍，只有週六、週日會發）');
  }

  // B. 當天提醒：週一 18:00，發給所有有訂閱的同工
  const t = getTaipeiNow();
  // MODE=prayer = cron-job.org 專在週一 18:00 觸發，bypass 時間
  // 其他情況（MODE=all，GitHub Actions）確認實際是台北 18:00
  const isMondayEvening = weekday === 1 && (MODE === 'prayer' || (parseInt(t.hour) === 18 && parseInt(t.minute) <= 30));
  if (!isMondayEvening) { console.log('  （現在不是週一 18:00，略過當天提醒）'); return; }

  const todayPrayer = findPrayer(new Date(year, month - 1, day));
  if (!todayPrayer) { console.log('  （今天無禱告會排班）'); return; }

  const workers = [String(todayPrayer[1] || '').trim(), String(todayPrayer[2] || '').trim()].filter(Boolean);
  const pTime = parsePrayerTime(todayPrayer[3]);
  console.log(`  當天提醒對象：${workers.join('、')} @ ${pTime}`);

  for (const worker of workers) {
    const ms = matchSubs(worker);
    if (!ms.length) { console.log(`  ⏭  ${worker}（無訂閱）`); continue; }
    const body = `${firstName(norm(worker))}平安！今天 ${pTime} 前請到四樓協助發禱告單，20:10記得算人數，謝謝！`;
    const payload = JSON.stringify({ title: '禱告會招待提醒', body, url: '/' });
    for (const sub of ms) await pushTo(sub, payload, `[禱告會當天] ${worker}`);
  }
}

// ── 主程式 ──────────────────────────────────────────────────────────────
async function main() {
  const t = getTaipeiNow();
  console.log(`🕒 來源:${process.env.GITHUB_EVENT_NAME || '本機'}｜MODE=${MODE}｜台北:週${WEEKDAY_ZH[t.weekday]} ${t.hour}:${t.minute}｜isManual=${isManual}`);

  const subs = await (await fetch(`${GAS_URL}?action=subscriptions`)).json();
  console.log(`🔔 訂閱人數：${subs.length}`);

  if (RUN_SUNDAY) await runSunday(subs);
  if (RUN_PRAYER) await runPrayer(subs);
}

main().catch(err => {
  console.error('執行錯誤：', err);
  process.exit(1);
});