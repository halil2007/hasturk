// Lisans / deneme hatırlatmaları: hangi gün hangi e-posta (bkz. tenants.js → reminderOf)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderOf } from '../src/tenants.js';

const D = 864e5, now = Date.parse('2026-10-10T09:00:00Z');
const lic = (days) => ({ trial: 0, expires_at: now + days * D - 3600e3 });
const trial = (days, extra = {}) => ({ trial: 1, expires_at: now + days * D - 3600e3, created_at: now - (7 - days) * D, usage: '{"channels":0}', ...extra });

test('lisans: bitişe 15, 7, 3 ve 1 gün kala ve süre dolunca hatırlatma', () => {
  assert.equal(reminderOf(lic(20), now), null);
  assert.equal(reminderOf(lic(15), now).k, 'd15');
  assert.equal(reminderOf(lic(12), now).k, 'd15', '15 günlük eşik bir kez (aynı anahtar)');
  assert.equal(reminderOf(lic(7), now).k, 'd7');
  assert.equal(reminderOf(lic(3), now).k, 'd3');
  assert.equal(reminderOf(lic(1), now).k, 'd1');
  assert.equal(reminderOf({ trial: 0, expires_at: now - D }, now).k, 'expired');
  assert.equal(reminderOf({ trial: 0, expires_at: now - 5 * D }, now), null, 'çok eski bitişe yeniden yazılmaz');
});

test('deneme: kurulum hatırlatması (mağaza bağlanmadıysa), 3 ve 1 gün kala, süre dolunca', () => {
  assert.equal(reminderOf(trial(6), now).k, 'setup', '2. gün, mağaza yok');
  assert.equal(reminderOf(trial(6, { usage: '{"channels":2}' }), now), null, 'mağaza bağlandıysa kurulum hatırlatması yok');
  assert.equal(reminderOf(trial(7, { created_at: now - 3600e3 }), now), null, 'ilk gün hatırlatma yok');
  assert.equal(reminderOf(trial(3), now).k, 'd3');
  assert.equal(reminderOf(trial(1), now).k, 'd1');
  assert.equal(reminderOf({ trial: 1, expires_at: now - 3600e3 }, now).k, 'expired');
});
