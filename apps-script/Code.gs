/**
 * Backend cho app "Chi tiêu nhà mình" — chạy trên Google Apps Script, lưu vào chính Google Sheet.
 * Tab "Items"  : các khoản chi theo tháng
 * Tab "Income" : các khoản thu theo tháng (tên + số tiền)
 * Tab "Types"  : loại khoản chi (tên, số tiền, hạn mặc định) — dropdown khi thêm khoản + "Tạo từ mẫu"
 * Tab "Months" : tên riêng đặt cho từng tháng (VD "Tháng cưới")
 *
 * Triển khai: Extensions → Apps Script → dán file này → Deploy → New deployment → Web app
 *   Execute as: Me · Who has access: Anyone
 *
 * PIN KHÔNG nằm trong code: Project Settings (⚙️) → Script properties → thêm PIN = <mã của bạn>.
 * Nhờ vậy file này push lên GitHub public cũng không lộ PIN.
 */

const ITEM_H = ['id', 'month', 'order', 'name', 'amount', 'status', 'note', 'updatedAt', 'updatedBy', 'due'];
const INC_H = ['month', 'name', 'amount', 'updatedAt', 'updatedBy'];
const TYPE_H = ['order', 'name', 'amount', 'due', 'updatedAt', 'updatedBy'];
const MONTH_H = ['month', 'name', 'updatedAt', 'updatedBy'];

// doGet/doPost chỉ chạy khi có request tới URL /exec. Bấm ▶ Run trong editor thì e = undefined.
function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (_) {}
  return handle_(p);
}

// Chọn hàm này rồi bấm ▶ Run để kiểm tra cấu hình: tạo sẵn các tab và báo PIN đã đặt chưa (xem Execution log).
function setup() {
  sheet_('Items', ITEM_H);
  sheet_('Income', INC_H);
  sheet_('Types', TYPE_H);
  sheet_('Months', MONTH_H);
  const pin = PropertiesService.getScriptProperties().getProperty('PIN');
  Logger.log(pin ? '✅ Đã tạo tab Items/Income/Types/Months. PIN đã đặt (' + pin.length + ' ký tự).'
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
        case 'delete': del_(p.id); break;
        case 'bulkCreate': bulk_(p.month, p.items || [], user); break;
        case 'copyMonth': copy_(p.from, p.month, user); break;
        case 'setIncome': setIncome_(p.month, p.income || [], user); break;
        case 'setTypes': setTypes_(p.types || [], user); break;
        case 'setMonthName': setMonthName_(p.month, p.name, user); break;
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
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
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

// Ghi thêm dòng mới. KHÔNG dùng appendRow: nó bỏ qua định dạng text và tự đổi "2026-10" thành ngày.
function append_(s, rows) {
  if (!rows.length) return;
  const r = s.getRange(s.getLastRow() + 1, 1, rows.length, rows[0].length);
  r.setNumberFormat('@');
  r.setValues(rows.map(row => row.map(v => v === undefined || v === null ? '' : String(v))));
}

function rows_(s, headers) {
  const v = s.getDataRange().getValues();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const o = { _row: i + 1 };
    headers.forEach((h, j) => {
      let x = v[i][j];
      // Ô đã lỡ bị Sheets đổi thành ngày → trả về dạng chuỗi như lúc ghi
      if (x instanceof Date) x = h === 'month' ? Utilities.formatDate(x, tz, 'yyyy-MM') : x.toISOString();
      o[h] = x;
    });
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
  const inc = rows_(sheet_('Income', INC_H), INC_H);
  const monthNames = {};
  rows_(sheet_('Months', MONTH_H), MONTH_H).forEach(r => { if (String(r.name)) monthNames[String(r.month)] = String(r.name); });
  const months = Array.from(new Set(items.map(r => String(r.month)).concat(inc.map(r => String(r.month)), Object.keys(monthNames)))).sort();
  const incOf = m => inc.filter(r => String(r.month) === m).map(r => ({ name: String(r.name), amount: Number(r.amount) || 0 }));
  const prev = Array.from(new Set(inc.map(r => String(r.month)))).filter(m => m < month).sort().pop();
  const types = rows_(sheet_('Types', TYPE_H), TYPE_H).sort((a, b) => Number(a.order) - Number(b.order))
    .map(r => ({ name: String(r.name), amount: Number(r.amount) || 0, due: Number(r.due) || '' }));
  return {
    months: months,
    monthNames: monthNames,
    types: types,
    income: incOf(month),
    lastIncome: prev ? incOf(prev) : [],
    items: items.filter(r => String(r.month) === month).map(clean_).sort((a, b) => a.order - b.order),
  };
}

function save_(item, user) {
  const s = sheet_('Items', ITEM_H);
  const all = rows_(s, ITEM_H);
  const now = new Date().toISOString();
  const cur = all.find(r => String(r.id) === String(item.id));

  if (cur) {
    const next = Object.assign(clean_(cur), item, { updatedAt: now, updatedBy: user });
    s.getRange(cur._row, 1, 1, ITEM_H.length).setNumberFormat('@').setValues([ITEM_H.map(h => String(next[h]))]);
  } else {
    const order = Math.max(0, ...all.filter(r => String(r.month) === item.month).map(r => Number(r.order) || 0)) + 1;
    const next = clean_(Object.assign({ order: order, status: 'none' }, item, {
      id: Utilities.getUuid().slice(0, 8), updatedAt: now, updatedBy: user,
    }));
    append_(s, [ITEM_H.map(h => next[h])]);
  }
}

function del_(id) {
  const s = sheet_('Items', ITEM_H);
  const cur = rows_(s, ITEM_H).find(r => String(r.id) === String(id));
  if (cur) s.deleteRow(cur._row);
}

function bulk_(month, items, user) {
  const s = sheet_('Items', ITEM_H);
  if (rows_(s, ITEM_H).some(r => String(r.month) === month)) throw new Error('Tháng này đã có dữ liệu');
  const now = new Date().toISOString();
  append_(s, items.map((it, i) => {
    const o = clean_({ id: Utilities.getUuid().slice(0, 8), month: month, order: i + 1, name: it.name,
      amount: it.amount, status: 'none', note: it.note || '', due: it.due, updatedAt: now, updatedBy: user });
    return ITEM_H.map(h => o[h]);
  }));
}

function copy_(from, month, user) {
  const src = rows_(sheet_('Items', ITEM_H), ITEM_H)
    .filter(r => String(r.month) === from)
    .sort((a, b) => a.order - b.order);
  if (!src.length) throw new Error('Tháng ' + from + ' không có dữ liệu');
  bulk_(month, src, user);
  // Chép luôn thu nhập nếu tháng mới chưa nhập
  const inc = rows_(sheet_('Income', INC_H), INC_H);
  if (!inc.some(r => String(r.month) === month)) {
    setIncome_(month, inc.filter(r => String(r.month) === from), user);
  }
}

// Thay toàn bộ danh sách thu nhập của tháng
function setIncome_(month, list, user) {
  const s = sheet_('Income', INC_H);
  const now = new Date().toISOString();
  rows_(s, INC_H).filter(r => String(r.month) === month).map(r => r._row)
    .sort((a, b) => b - a).forEach(r => s.deleteRow(r));
  append_(s, list.map(x => ({ name: String(x.name || '').trim(), amount: Number(x.amount) || 0 }))
    .filter(x => x.name).map(x => [month, x.name, x.amount, now, user]));
}

// Thay toàn bộ danh sách loại khoản chi (không theo tháng)
function setTypes_(list, user) {
  const s = sheet_('Types', TYPE_H);
  const n = s.getLastRow();
  if (n > 1) s.getRange(2, 1, n - 1, TYPE_H.length).clearContent();
  const now = new Date().toISOString();
  append_(s, list.map(x => ({ name: String(x.name || '').trim(), amount: Number(x.amount) || 0, due: Number(x.due) || '' }))
    .filter(x => x.name).map((x, i) => [i + 1, x.name, x.amount, x.due, now, user]));
}

// Đặt tên riêng cho một tháng; tên rỗng = bỏ tên riêng (về "Tháng N")
function setMonthName_(month, name, user) {
  const s = sheet_('Months', MONTH_H);
  const cur = rows_(s, MONTH_H).find(r => String(r.month) === month);
  name = String(name || '').trim().slice(0, 30);
  if (!name) { if (cur) s.deleteRow(cur._row); return; }
  const row = [month, name, new Date().toISOString(), user];
  if (cur) s.getRange(cur._row, 1, 1, MONTH_H.length).setNumberFormat('@').setValues([row]);
  else append_(s, [row]);
}
