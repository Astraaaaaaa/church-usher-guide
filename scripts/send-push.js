#!/usr/bin/env node
/**
 * 每週六服事提醒推播腳本
 * 由 GitHub Actions 在台北時間每週六 17:30 執行
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

// 從全名去掉姓（第一個字）
function firstName(fullName) {
  const n = fullName.trim();
  // 兩個字（含以下）的名字不去姓；帶空格（如「容   容」）或稱謂（姐/哥/師）也直接用原名
  if (n.length <= 2 || /\s/.test(n) || /[姐哥師]$/.test(n)) return n;
  return n.slice(1);
}

// 取得台北時間現在的 weekday(0=Sun) 和 HH:MM
function getTaipeiNow() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return { weekday: now.getDay(), hour: String(now.getHours()).padStart(2,'0'), minute: String(now.getMinutes()).padStart(2,'0') };
}

// 判斷訂閱者的 notifyTime 是否符合目前執行時間
// notifyTime 格式："2d_17:30" 表示主日前2天 17:30 通知
// 主日 weekday=0，前1天=週六(6)，前2天=週五(5)，前3天=週四(4)
function shouldNotifyNow(notifyTime) {
  const { weekday, hour, minute } = getTaipeiNow();
  const currentTime = `${hour}:${minute}`;

  // 相容舊格式（純時間字串，如 "17:30"）→ 預設週六前1天
  if (!notifyTime.includes('d_')) {
    return weekday === 6 && currentTime >= notifyTime && currentTime <= notifyTime.replace(/(\d+)$/, m => String(parseInt(m)+10).padStart(2,'0'));
  }

  const [daysPart, timePart] = notifyTime.split('d_'); // e.g. "2", "17:30"
  const targetWeekday = (7 - parseInt(daysPart)) % 7; // 前1天=6(六), 前2天=5(五), 前3天=4(四)
  if (weekday !== targetWeekday) return false;

  // 整點後 0～15 分鐘內才發（容許 GitHub cron 延遲，但不提前）
  const [th, tm] = timePart.split(':').map(Number);
  const targetMin = th * 60 + tm;
  const nowMin = parseInt(hour) * 60 + parseInt(minute);
  const diff = nowMin - targetMin;
  return diff >= -2 && diff <= 15;
}

// 取得下週日日期字串 MM/DD（台北時間）
function nextSundayStr() {
  const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const daysUntil = tw.getDay() === 0 ? 7 : 7 - tw.getDay();
  tw.setDate(tw.getDate() + daysUntil);
  const m = String(tw.getMonth() + 1).padStart(2, '0');
  const d = String(tw.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}

// base64url → 標準 base64（補齊 padding，web-push 內部用 Buffer.from(...,'base64') 解碼）
function toBase64(str) {
  let s = (str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  return s;
}

async function main() {
  const dateStr = process.argv[2] || nextSundayStr();
  // 手動觸發（workflow_dispatch）時跳過時間篩選
  // 只有人工在 GitHub 按「Run workflow」才略過篩選；cron-job.org 的 repository_dispatch 仍要照訂閱時間篩選
  const isManual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  if (isManual) console.log('🔧 手動觸發，略過時間篩選');
  { const t = getTaipeiNow(); console.log(`🕒 觸發來源：${process.env.GITHUB_EVENT_NAME || '本機'}｜台北時間：週${t.weekday} ${t.hour}:${t.minute}｜isManual=${isManual}`); }
  console.log(`📅 查詢日期：${dateStr}`);

  // 1. 取輪值
  const schedRes = await fetch(`${GAS_URL}?action=schedule&date=${dateStr}`);
  const schedule = await schedRes.json();
  console.log(`📋 排班人數：${schedule.length}`);

  if (schedule.length === 0) {
    console.log('⚠️  當日無排班資料，結束。');
    return;
  }

  // 2. 取訂閱
  const subsRes = await fetch(`${GAS_URL}?action=subscriptions`);
  const subs    = await subsRes.json();
  console.log(`🔔 訂閱人數：${subs.length}`);

  const subMap = {};
  subs.forEach(s => {
    if (!subMap[s.name]) subMap[s.name] = [];
    subMap[s.name].push(s);
  });

  // 3. 發送推播
  let sent = 0, skipped = 0, failed = 0;

  for (const person of schedule) {
    const fname      = firstName(person.name);
    const captainPart = person.captain ? `找${person.captain}` : '找總召';
    const [mm, dd] = dateStr.split('/').map(Number);
    const dateLabel = `${mm}/${dd}（日）`;
    const body = `平安～ ${fname}！${dateLabel}${person.service}｜${person.station}｜${person.collectTime} ${captainPart}集合，謝謝您！`;
    const payload = JSON.stringify({ title: `${dateLabel} 招待服事提醒`, body, url: '/roster.html' });

    const personSubs = subMap[person.name] || [];
    if (personSubs.length === 0) {
      console.log(`  ⏭  ${person.name}（無訂閱）`);
      skipped++;
      continue;
    }

    // 手動觸發時略過時間篩選，否則只發給符合時段的訂閱
    const dueSubs = isManual
      ? personSubs
      : personSubs.filter(s => {
          const ok = shouldNotifyNow(s.notifyTime || '1d_17:30');
          console.log(`  🔍 ${person.name} notifyTime=${s.notifyTime || '(空，預設 1d_17:30)'} → ${ok ? '符合' : '不符合'}`);
          return ok;
        });
    if (dueSubs.length === 0) {
      console.log(`  ⏭  ${person.name}（不在通知時段）`);
      skipped++;
      continue;
    }

    for (const sub of dueSubs) {
      const p256dhB64 = toBase64(sub.p256dh);
      const authB64   = toBase64(sub.auth);
      const keyLen = Buffer.from(p256dhB64, 'base64').length;
      console.log(`  🔑 p256dh decoded: ${keyLen} bytes`);
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: p256dhB64, auth: authB64 } },
          payload
        );
        console.log(`  ✅ ${person.name} → ${person.service} ${person.station}`);
        sent++;
      } catch (err) {
        console.error(`  ❌ ${person.name} 失敗：${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n完成：送出 ${sent}，略過 ${skipped}，失敗 ${failed}`);
}

main().catch(err => {
  console.error('執行錯誤：', err);
  process.exit(1);
});
