#!/usr/bin/env node
/**
 * 本地測試推播腳本
 * 用法：node scripts/test-push.js
 *
 * 先在 preview.py 完成訂閱，再執行這個腳本發測試通知
 */

const webpush = require('web-push');
const path = require('path');
const fs = require('fs');

// 從 .env 載入 VAPID 金鑰（不可硬編碼到程式碼）
const dotenvPath = path.join(__dirname, '..', '.env');
if (require('fs').existsSync(dotenvPath)) {
  require('fs').readFileSync(dotenvPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('❌ 缺少 VAPID 金鑰，請確認 .env 有 VAPID_PUBLIC_KEY 和 VAPID_PRIVATE_KEY');
  process.exit(1);
}

webpush.setVapidDetails('mailto:chiehastra@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

const subsFile = path.join(__dirname, '..', '.preview_subscriptions.json');

if (!fs.existsSync(subsFile)) {
  console.error('❌ 找不到訂閱記錄，請先在瀏覽器完成訂閱再執行此腳本');
  process.exit(1);
}

const subs = JSON.parse(fs.readFileSync(subsFile, 'utf8'));
if (subs.length === 0) {
  console.error('❌ 沒有訂閱記錄');
  process.exit(1);
}

const latest = subs[subs.length - 1];
console.log(`📤 發送測試通知給：${latest.name}（notifyTime: ${latest.notifyTime || '未設定'}）`);

const payload = JSON.stringify({
  title: '🔔 主日招待服事提醒 🔔',
  body: `平安～ ${latest.name}，明主日第一堂在4F内招服事，請在08:10找總召集合，謝謝您！（測試通知）`
});

const sub = latest.subscription;
const normalizedSub = {
  endpoint: sub.endpoint,
  keys: {
    p256dh: (sub.keys.p256dh || '').replace(/-/g, '+').replace(/_/g, '/'),
    auth:   (sub.keys.auth   || '').replace(/-/g, '+').replace(/_/g, '/'),
  }
};
webpush.sendNotification(normalizedSub, payload)
  .then(() => console.log('✅ 通知發送成功！請查看瀏覽器'))
  .catch(err => console.error('❌ 發送失敗：', err.message));
