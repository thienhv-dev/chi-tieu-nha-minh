/**
 * Backend cho app "Chi tiêu nhà mình" — chạy trên Google Apps Script, lưu vào chính Google Sheet.
 * Tab "Items"   : các khoản chi theo tháng
 * Tab "Income"  : các khoản thu theo tháng (tên + số tiền)
 * Tab "History" : lịch sử mọi thay đổi (ai, lúc nào, đổi gì)
 *
 * Triển khai: Extensions → Apps Script → dán file này → Deploy → New deployment → Web app
 *   Execute as: Me · Who has access: Anyone
 *
 * PIN KHÔNG nằm trong code: Project Settings (⚙️) → Script properties → thêm PIN = <mã của bạn>.
 * Nhờ vậy file này push lên GitHub public cũng không lộ PIN.
 */

const ITEM_H = ['id', 'month', 'order', 'name', 'amount', 'status', 'note', 'updatedAt', 'updatedBy', 'due'];
const INC_H = ['month', 'name', 'amount', 'updatedAt', 'updatedBy'];
const HIST_H = ['ts', 'user', 'month', 'itemId', 'itemName', 'action', 'field', 'oldValue', 'newValue'];

// doGet/doPost chỉ chạy khi có request tới URL /exec. Bấm ▶ Run trong editor thì e = undefined.
function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (_) {}
  return handle_(p);
}

// Chọn hàm này rồi bấm ▶ Run để kiểm tra cấu hình: tạo sẵn 3 tab và báo PIN đã đặt chưa (xem Execution log).
function setup() {
  sheet_('Items', ITEM_H);
  sheet_('Income', INC_H);
  sheet_('History', HIST_H);
  const pin = PropertiesService.getScriptProperties().getProperty('PIN');
  Logger.log(pin ? '✅ Đã tạo tab Items/Income/History. PIN đã đặt (' + pin.length + ' ký tự).'
                 : '⚠️ Đã tạo tab, nhưng CHƯA đặt PIN: Project Settings → Script properties → thêm PIN.');
}

function handle_(p) {
  try {
    const pin = PropertiesService.getScriptProperties().getProperty('PIN');
    if (!pin) return out_({ ok: false, error: 'Chưa đặt PIN trong Script properties' });
    if (String(p.key) !== pin) return out_({ ok: false, error: 'Sai mã PIN' });
    if (p.action === 'list') return out_(Object.assign({ ok: true }, list_(p.month)));

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const user = String(p.user || '?');
      switch (p.action) {
        case 'save': save_(p.item, user); break;
        case 'delete': del_(p.id, user); break;
        case 'bulkCreate': bulk_(p.month, p.items || [], user, 'Tạo từ mẫu'); break;
        case 'copyMonth': copy_(p.from, p.month, user); break;
        case 'setIncome': setIncome_(p.month, p.income || [], user); break;
        default: return out_({ ok: false, error: 'Unknown action' });
      }
    } finally {
      lock.releaseLock();
    }
    return out_(Object.assign({ ok: true }, list_(p.month)));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    // Để dạng text, tránh Sheets tự đổi "2026-10" thành ngày
    s.getRange(1, 1, s.getMaxRows(), headers.length).setNumberFormat('@');
    s.appendRow(headers);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#808080').setFontColor('#ffffff');
  } else if (s.getLastColumn() < headers.length) {
    // Sheet cũ thiếu cột mới (VD: khi thêm cột) → bổ sung tiêu đề
    const from = s.getLastColumn() + 1, n = headers.length - from + 1;
    s.getRange(1, from, s.getMaxRows(), n).setNumberFormat('@');
    s.getRange(1, from, 1, n).setValues([headers.slice(from - 1)])
      .setFontWeight('bold').setBackground('#808080').setFontColor('#ffffff');
  }
  return s;
}

function rows_(s, headers) {
  const v = s.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const o = { _row: i + 1 };
    headers.forEach((h, j) => { o[h] = v[i][j]; });
    out.push(o);
  }
  return out;
}

function clean_(o) {
  return {
    id: String(o.id), month: String(o.month), order: Number(o.order) || 0, name: String(o.name),
    amount: Number(o.amount) || 0, status: String(o.status || 'none'), note: String(o.note || ''),
    updatedAt: String(o.updatedAt || ''), updatedBy: String(o.updatedBy || ''),
    due: Number(o.due) || '', // hạn nộp: ngày trong tháng (1–31)
  };
}

function list_(month) {
  const items = rows_(sheet_('Items', ITEM_H), ITEM_H);
  const hist = rows_(sheet_('History', HIST_H), HIST_H);
  const inc = rows_(sheet_('Income', INC_H), INC_H);
  const months = Array.from(new Set(items.map(r => String(r.month)).concat(inc.map(r => String(r.month))))).sort();
  const incOf = m => inc.filter(r => String(r.month) === m).map(r => ({ name: String(r.name), amount: Number(r.amount) || 0 }));
  const prev = Array.from(new Set(inc.map(r => String(r.month)))).filter(m => m < month).sort().pop();
  return {
    months: months,
    income: incOf(month),
    lastIncome: prev ? incOf(prev) : [],
    items: items.filter(r => String(r.month) === month).map(clean_).sort((a, b) => a.order - b.order),
    history: hist.filter(r => String(r.month) === month).slice(-300).reverse().map(r => {
      const o = {}; HIST_H.forEach(h => { o[h] = String(r[h]); }); return o;
    }),
  };
}

function log_(user, month, item, action, field, oldV, newV) {
  sheet_('History', HIST_H).appendRow([
    new Date().toISOString(), user, month, item.id || '', item.name || '', action, field || '',
    oldV === undefined ? '' : String(oldV), newV === undefined ? '' : String(newV),
  ]);
}

function save_(item, user) {
  const s = sheet_('Items', ITEM_H);
  const all = rows_(s, ITEM_H);
  const now = new Date().toISOString();
  const cur = all.find(r => String(r.id) === String(item.id));

  if (cur) {
    ['name', 'amount', 'status', 'note', 'due'].forEach(f => {
      const a = String(cur[f]), b = String(item[f] === undefined ? cur[f] : item[f]);
      if (a !== b) log_(user, cur.month, { id: cur.id, name: item.name || cur.name }, 'update', f, a, b);
    });
    const next = Object.assign(clean_(cur), item, { updatedAt: now, updatedBy: user });
    s.getRange(cur._row, 1, 1, ITEM_H.length).setValues([ITEM_H.map(h => next[h])]);
  } else {
    const order = Math.max(0, ...all.filter(r => String(r.month) === item.month).map(r => Number(r.order) || 0)) + 1;
    const next = clean_(Object.assign({ order: order, status: 'none' }, item, {
      id: Utilities.getUuid().slice(0, 8), updatedAt: now, updatedBy: user,
    }));
    s.appendRow(ITEM_H.map(h => next[h]));
    log_(user, next.month, next, 'create', '', '', next.amount);
  }
}

function del_(id, user) {
  const s = sheet_('Items', ITEM_H);
  const cur = rows_(s, ITEM_H).find(r => String(r.id) === String(id));
  if (!cur) return;
  s.deleteRow(cur._row);
  log_(user, cur.month, cur, 'delete', '', cur.amount, '');
}

function bulk_(month, items, user, label) {
  const s = sheet_('Items', ITEM_H);
  if (rows_(s, ITEM_H).some(r => String(r.month) === month)) throw new Error('Tháng này đã có dữ liệu');
  const now = new Date().toISOString();
  const rows = items.map((it, i) => {
    const o = clean_({ id: Utilities.getUuid().slice(0, 8), month: month, order: i + 1, name: it.name,
      amount: it.amount, status: 'none', note: it.note || '', due: it.due, updatedAt: now, updatedBy: user });
    return ITEM_H.map(h => o[h]);
  });
  if (rows.length) s.getRange(s.getLastRow() + 1, 1, rows.length, ITEM_H.length).setValues(rows);
  log_(user, month, {}, 'bulk', '', '', label + ' · ' + rows.length + ' khoản');
}

function copy_(from, month, user) {
  const src = rows_(sheet_('Items', ITEM_H), ITEM_H)
    .filter(r => String(r.month) === from)
    .sort((a, b) => a.order - b.order);
  if (!src.length) throw new Error('Tháng ' + from + ' không có dữ liệu');
  bulk_(month, src, user, 'Sao chép từ ' + from);
  // Chép luôn thu nhập nếu tháng mới chưa nhập
  const inc = rows_(sheet_('Income', INC_H), INC_H);
  if (!inc.some(r => String(r.month) === month)) {
    setIncome_(month, inc.filter(r => String(r.month) === from), user);
  }
}

// Thay toàn bộ danh sách thu nhập của tháng; ghi lịch sử phần thêm / sửa / xoá theo tên
function setIncome_(month, list, user) {
  const s = sheet_('Income', INC_H);
  const cur = rows_(s, INC_H).filter(r => String(r.month) === month);
  const now = new Date().toISOString();
  const next = list.map(x => ({ name: String(x.name || '').trim(), amount: Number(x.amount) || 0 })).filter(x => x.name);
  const old = {}, neu = {};
  cur.forEach(r => { old[String(r.name)] = Number(r.amount) || 0; });
  next.forEach(x => { neu[x.name] = x.amount; });
  next.forEach(x => {
    if (!(x.name in old)) log_(user, month, x, 'income', 'amount', '', x.amount);
    else if (old[x.name] !== x.amount) log_(user, month, x, 'income', 'amount', old[x.name], x.amount);
  });
  Object.keys(old).forEach(n => { if (!(n in neu)) log_(user, month, { name: n }, 'income', 'amount', old[n], ''); });
  cur.map(r => r._row).sort((a, b) => b - a).forEach(r => s.deleteRow(r));
  if (next.length) s.getRange(s.getLastRow() + 1, 1, next.length, INC_H.length).setValues(next.map(x => [month, x.name, x.amount, now, user]));
}
