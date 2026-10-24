// ============ 工具函数 ============
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pad(n) { return String(n).padStart(2, '0'); }

function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmt(n) { return (Math.round((n || 0) * 100) / 100).toFixed(2); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function iconHTML(icon, fallback) {
  const v = icon || fallback || '❔';
  if (typeof v === 'string' && v.startsWith('data:')) {
    return `<img class="icon-img" src="${v}" alt="">`;
  }
  return esc(v);
}

function arrayToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ============ 图片文件存储（图片单独存文件，数据文件保持小巧）============
const imageCache = {};

async function getImageUrl(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  if (imageCache[src]) return imageCache[src];
  const url = await window.api.loadImage(src);
  imageCache[src] = url;
  return url;
}

function imgTag(src) {
  if (!src) return '';
  if (src.startsWith('data:')) return `<img src="${src}">`;
  return `<img data-rel="${esc(src)}">`;
}

async function hydrateImages(container) {
  const imgs = container.querySelectorAll('img[data-rel]');
  for (const img of imgs) {
    const url = await getImageUrl(img.dataset.rel);
    if (url) img.src = url;
  }
}

// 把旧数据里存成文本的图片迁移到单独文件
async function migrateImages() {
  for (const t of state.transactions) {
    if (t.image && t.image.startsWith('data:')) {
      t.image = await window.api.saveImage('tx.png', t.image);
    }
  }
}

// ============ 默认分类 ============
const DEFAULT_CATS = {
  expense: [
    { id: 'e-food', name: '餐饮', icon: '🍜' },
    { id: 'e-transport', name: '交通', icon: '🚌' },
    { id: 'e-shopping', name: '购物', icon: '🛍️' },
    { id: 'e-house', name: '居住', icon: '🏠' },
    { id: 'e-utility', name: '水电', icon: '💡' },
    { id: 'e-fun', name: '娱乐', icon: '🎮' },
    { id: 'e-medical', name: '医疗', icon: '💊' },
    { id: 'e-edu', name: '教育', icon: '📚' },
    { id: 'e-other', name: '其他', icon: '📦' }
  ],
  income: [
    { id: 'i-salary', name: '工资', icon: '💰' },
    { id: 'i-bonus', name: '奖金', icon: '🧧' },
    { id: 'i-invest', name: '理财', icon: '📈' },
    { id: 'i-gift', name: '赠与', icon: '🎁' },
    { id: 'i-lottery', name: '彩票', icon: '🎰' },
    { id: 'i-other', name: '其他', icon: '💵' }
  ]
};

const ICON_CHOICES = ['🍜','🍔','🍕','☕','🍰','🍎','🍺','🍱','🚌','🚗','🚕','✈️','🚲','🛍️','👗','👟','💄','🎁','🏠','🏢','🔑','💡','💧','🔥','📶','🎮','🎬','🎵','🎤','🎨','⚽','💊','🏥','📚','✏️','🎓','🧾','💰','🧧','📈','🎰','💵','💳','🏦','🪙','📦','🎯','🌸','⭐','❤️','🐱'];

// ============ 全局状态 ============
let state = null;
let currentBookId = null;
let currentView = 'calendar';       // calendar / budget / assets / recurring
let viewDate = new Date();
let selectedDate = null;
let viewMode = 'month';             // month / year
let calendarTab = 'calendar';       // calendar / bill
let searchQuery = '';
let editingTxId = null;
let txType = 'expense';
let selectedCatId = null;
let txImage = null;
let catManageType = 'expense';
let editingBookId = null;
let editingAssetId = null;
let assetType = 'asset';
let editingRecurringId = null;
let recType = 'expense';
let recCatId = null;
let chartAsset = null, chartWorth = null;
let iconPickerTargetId = null;
let searchTimer = null;

// ============ DOM 引用 ============
const $ = (id) => document.getElementById(id);
const bookList = $('bookList');
const calendar = $('calendar');
const monthTitle = $('monthTitle');
const sumIncome = $('sumIncome'), sumExpense = $('sumExpense'), sumBalance = $('sumBalance');
const dayTitle = $('dayTitle'), txList = $('txList');
const txModal = $('txModal'), catModal = $('catModal'), bookModal = $('bookModal'), assetModal = $('assetModal'), iconModal = $('iconModal'), recurringModal = $('recurringModal');

// ============ 数据加载/保存 ============
function initData() {
  return {
    books: [{ id: uid(), name: '默认账本', icon: '🏠', mode: 'shared', linkedAssets: [] }],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATS)),
    transactions: [],
    budgets: {},
    assets: {},
    worthHistory: {},
    recurring: []
  };
}

async function load() {
  const d = await window.api.loadData();
  state = (d && Array.isArray(d.books)) ? d : initData();
  if (!state.categories) state.categories = JSON.parse(JSON.stringify(DEFAULT_CATS));
  if (!Array.isArray(state.transactions)) state.transactions = [];
  if (!state.budgets) state.budgets = {};
  if (!state.assets) state.assets = {};
  if (!state.worthHistory) state.worthHistory = {};
  if (!state.recurring) state.recurring = [];
  if (state.books.length === 0) {
    state.books.push({ id: uid(), name: '默认账本', icon: '🏠', mode: 'shared', linkedAssets: [] });
  }
  state.books.forEach(b => { if (!b.linkedAssets) b.linkedAssets = []; });
  migrateToSharedPool();
  await migrateImages();
  if (!state.books.find(b => b.id === currentBookId)) currentBookId = state.books[0].id;
  processRecurring();
  await save();
  renderAll();
}

async function save() {
  await window.api.saveData(state);
}

function getBook() {
  return state.books.find(b => b.id === currentBookId) || state.books[0];
}

function getCat(type, id) {
  return (state.categories[type] || []).find(c => c.id === id);
}

function accountName(accountId) {
  if (!accountId) return '';
  for (const key in state.assets) {
    const a = (state.assets[key] || []).find(x => x.id === accountId);
    if (a) return a.name;
  }
  return '';
}

function getPoolKey(book) {
  return 'shared';
}

function migrateToSharedPool() {
  state.books.forEach(b => { b.mode = 'shared'; });

  if (state.assets) {
    const shared = state.assets['shared'] || [];
    const ids = new Set(shared.map(a => a.id));
    for (const key in state.assets) {
      if (key === 'shared') continue;
      (state.assets[key] || []).forEach(a => {
        if (!ids.has(a.id)) { shared.push(a); ids.add(a.id); }
      });
      delete state.assets[key];
    }
    state.assets['shared'] = shared;
  }

  if (state.budgets) {
    const shared = state.budgets['shared'] || { totalMonth: null, totalYear: null, categories: {} };
    for (const key in state.budgets) {
      if (key === 'shared') continue;
      const b = state.budgets[key] || {};
      if (!shared.totalMonth) shared.totalMonth = b.totalMonth;
      if (!shared.totalYear) shared.totalYear = b.totalYear;
      if (b.categories) {
        shared.categories = shared.categories || {};
        for (const cid in b.categories) {
          if (!shared.categories[cid]) shared.categories[cid] = b.categories[cid];
        }
      }
      delete state.budgets[key];
    }
    state.budgets['shared'] = shared;
  }

  if (state.worthHistory) {
    const byDate = {};
    for (const key in state.worthHistory) {
      (state.worthHistory[key] || []).forEach(h => { byDate[h.date] = h.netWorth; });
      if (key !== 'shared') delete state.worthHistory[key];
    }
    state.worthHistory['shared'] = Object.keys(byDate).sort().map(d => ({ date: d, netWorth: byDate[d] }));
  }
}

function getBudgetData(poolKey) {
  if (!state.budgets[poolKey]) state.budgets[poolKey] = { totalMonth: null, totalYear: null, categories: {} };
  return state.budgets[poolKey];
}

function monthBudgetAmount(poolKey) {
  const b = state.budgets[poolKey];
  if (!b) return null;
  if (b.totalMonth) return b.totalMonth;
  if (b.totalYear) return b.totalYear / 12;
  return null;
}

function buildDelta() {
  const delta = {};
  state.transactions.forEach(t => {
    if (!t.accountId) return;
    delta[t.accountId] = (delta[t.accountId] || 0) + (t.type === 'income' ? t.amount : -t.amount);
  });
  return delta;
}

// ============ 周期记账自动补记 ============
function nextOccurrence(r, from) {
  const d = new Date(from);
  if (r.frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (r.frequency === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    const day = r.dayOfMonth || 1;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const lastDay = new Date(y, m + 1, 0).getDate();
    d.setFullYear(y, m, Math.min(day, lastDay));
  }
  return d;
}

function processRecurring() {
  if (!state.recurring || state.recurring.length === 0) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  state.recurring.forEach(r => {
    if (!r.startDate) r.startDate = dateStr(new Date());
    if (!r.lastRun) r.lastRun = r.startDate;
    let cursor = new Date(r.lastRun);
    let next = nextOccurrence(r, cursor);
    while (next <= today) {
      cursor = next;
      state.transactions.push({
        id: uid(),
        bookId: r.bookId,
        type: r.type,
        amount: r.amount,
        categoryId: r.categoryId,
        accountId: r.accountId || null,
        date: dateStr(cursor),
        note: r.note || '',
        image: null,
        recurringId: r.id,
        createdAt: Date.now()
      });
      next = nextOccurrence(r, cursor);
    }
    r.lastRun = dateStr(cursor);
  });
}

// ============ 渲染主入口 ============
function renderAll() {
  renderBooks();
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === currentView));
  $('viewCalendar').hidden = currentView !== 'calendar';
  $('viewBudget').hidden = currentView !== 'budget';
  $('viewAssets').hidden = currentView !== 'assets';
  $('viewRecurring').hidden = currentView !== 'recurring';

  if (currentView === 'calendar') renderCalendarView();
  else if (currentView === 'budget') renderBudgetView();
  else if (currentView === 'assets') renderAssetsView();
  else if (currentView === 'recurring') renderRecurringView();
}

function renderBooks() {
  bookList.innerHTML = '';
  state.books.forEach(b => {
    const li = document.createElement('li');
    li.className = 'book-item' + (b.id === currentBookId ? ' active' : '');
    li.innerHTML = `
      <span class="b-icon">${iconHTML(b.icon, '📒')}</span>
      <span class="b-name">${esc(b.name)}</span>
      <button class="b-edit" data-book="${b.id}">✎</button>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('b-edit')) {
        openBookModal(b.id);
      } else {
        currentBookId = b.id;
        renderAll();
      }
    });
    bookList.appendChild(li);
  });
}

// ============ 日历视图（日历 / 账单 / 搜索）============
function renderCalendarView() {
  renderSummary();
  const searching = searchQuery.length > 0;
  $('searchWrap').hidden = !searching;

  if (searching) {
    document.querySelector('.calendar-tabs').hidden = true;
    $('calendarWrap').hidden = true;
    $('billWrap').hidden = true;
    renderSearchResults();
    return;
  }

  document.querySelector('.calendar-tabs').hidden = false;
  const showBill = calendarTab === 'bill';
  $('calendarWrap').hidden = showBill;
  $('billWrap').hidden = !showBill;
  $('tabCalendar').classList.toggle('active', !showBill);
  $('tabList').classList.toggle('active', showBill);

  if (showBill) renderBillList();
  else { renderCalendar(); renderDayPanel(); }
}

function renderCalendar() {
  if (viewMode === 'year') { renderYearView(); return; }
  calendar.classList.remove('year-view');
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  monthTitle.textContent = `${year}年${month + 1}月`;

  const book = getBook();
  const ym = `${year}-${pad(month + 1)}`;
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const budget = monthBudgetAmount(getPoolKey(book));

  const byDay = {};
  const cumExpenseByDay = {};
  state.transactions.forEach(t => {
    if (t.bookId !== currentBookId || t.date.slice(0, 7) !== ym) return;
    if (!byDay[t.date]) byDay[t.date] = { income: 0, expense: 0 };
    if (t.type === 'income') byDay[t.date].income += t.amount;
    else byDay[t.date].expense += t.amount;
  });
  let cum = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${ym}-${pad(d)}`;
    cum += byDay[ds] ? byDay[ds].expense : 0;
    cumExpenseByDay[d] = cum;
  }

  const today = dateStr(new Date());
  calendar.innerHTML = '';
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const day = i - startOffset + 1;
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    let ds = null;

    if (day >= 1 && day <= daysInMonth) {
      ds = `${ym}-${pad(day)}`;
      cell.innerHTML = `<div class="day-num">${day}</div>`;
      const amounts = byDay[ds];
      if (amounts) {
        cell.innerHTML += `<div class="cal-amounts">
          ${amounts.expense ? `<span class="am-exp">支 ${fmt(amounts.expense)}</span>` : ''}
          ${amounts.income ? `<span class="am-inc">收 ${fmt(amounts.income)}</span>` : ''}
        </div>`;
      }
      if (ds === today) cell.classList.add('today');
      if (ds === selectedDate) cell.classList.add('selected');
      if (budget) {
        const cumBudget = budget * day / daysInMonth;
        cell.classList.add(cumExpenseByDay[day] > cumBudget ? 'over' : 'ok');
      }
    } else {
      cell.classList.add('other-month');
      const d = day < 1 ? new Date(year, month, day).getDate() : day - daysInMonth;
      cell.innerHTML = `<div class="day-num">${d}</div>`;
    }

    cell.addEventListener('click', () => {
      if (!ds) return;
      selectedDate = ds;
      renderAll();
    });

    calendar.appendChild(cell);
  }
}

function renderYearView() {
  calendar.classList.add('year-view');
  const year = viewDate.getFullYear();
  monthTitle.textContent = `${year}年`;

  const book = getBook();
  const budget = monthBudgetAmount(getPoolKey(book));

  const byMonth = {};
  state.transactions.forEach(t => {
    if (t.bookId !== currentBookId) return;
    const ym = t.date.slice(0, 7);
    if (ym.slice(0, 4) !== String(year)) return;
    if (!byMonth[ym]) byMonth[ym] = { income: 0, expense: 0 };
    if (t.type === 'income') byMonth[ym].income += t.amount;
    else byMonth[ym].expense += t.amount;
  });

  const now = new Date();
  calendar.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const ym = `${year}-${pad(m + 1)}`;
    const data = byMonth[ym];
    const cell = document.createElement('div');
    cell.className = 'cal-cell year-cell' + (data ? '' : ' empty');
    if (year === now.getFullYear() && m === now.getMonth()) cell.classList.add('today');
    const balance = data ? data.income - data.expense : 0;
    const over = data && (budget ? data.expense > budget : balance < 0);
    if (over) cell.classList.add('over');
    cell.innerHTML = `
      <div class="month-label">${m + 1}月</div>
      <div class="cal-amounts">
        ${data && data.expense ? `<span class="am-exp">支 ${fmt(data.expense)}</span>` : ''}
        ${data && data.income ? `<span class="am-inc">收 ${fmt(data.income)}</span>` : ''}
        ${data ? `<span class="am-bal ${balance >= 0 ? 'pos' : 'neg'}">结余 ${fmt(balance)}</span>` : ''}
      </div>
    `;
    cell.addEventListener('click', () => {
      viewDate = new Date(year, m, 1);
      viewMode = 'month';
      renderAll();
    });
    calendar.appendChild(cell);
  }
}

function renderSummary() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const ym = `${year}-${pad(month + 1)}`;
  let inc = 0, exp = 0;
  state.transactions.forEach(t => {
    if (t.bookId !== currentBookId) return;
    if (viewMode === 'year') {
      if (t.date.slice(0, 4) !== String(year)) return;
    } else if (t.date.slice(0, 7) !== ym) return;
    if (t.type === 'income') inc += t.amount; else exp += t.amount;
  });
  sumIncome.textContent = fmt(inc);
  sumExpense.textContent = fmt(exp);
  sumBalance.textContent = fmt(inc - exp);
}

function renderDayPanel() {
  if (!selectedDate) {
    dayTitle.textContent = '点击日历上的某天查看明细';
    txList.innerHTML = '<li class="empty-tip">这里会显示选中日期的收支明细</li>';
    return;
  }
  const book = getBook();
  dayTitle.textContent = `${selectedDate} · ${book.name}`;
  const dayTx = state.transactions
    .filter(t => t.bookId === currentBookId && t.date === selectedDate)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (dayTx.length === 0) {
    txList.innerHTML = '<li class="empty-tip">这一天还没有记录，点右上角「记一笔」补记</li>';
    return;
  }

  txList.innerHTML = '';
  dayTx.forEach(t => {
    const cat = getCat(t.type, t.categoryId);
    const li = document.createElement('li');
    li.className = 'tx-item';
    li.innerHTML = `
      <span class="t-icon">${iconHTML(cat ? cat.icon : null, '❔')}</span>
      <span class="t-info">
        <span class="t-cat">${esc(cat ? cat.name : '未分类')}</span>
        ${t.note ? `<span class="t-note">${esc(t.note)}</span>` : ''}
      </span>
      ${t.image ? `<span class="t-thumb">${imgTag(t.image)}</span>` : ''}
      <span class="t-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</span>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.t-thumb')) openImageViewer(t.image);
      else openTxModal(t.id);
    });
    txList.appendChild(li);
  });
  hydrateImages(txList);
}

// ============ 账单列表 ============
function renderBillList() {
  const billList = $('billList');
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  let html = '<table class="bill-table"><thead><tr><th>日期</th><th>收入</th><th>支出</th><th>结余</th></tr></thead><tbody>';

  if (viewMode === 'year') {
    let cum = 0;
    for (let m = 0; m < 12; m++) {
      const ym = `${year}-${pad(m + 1)}`;
      let inc = 0, exp = 0;
      state.transactions.forEach(t => {
        if (t.bookId !== currentBookId || t.date.slice(0, 7) !== ym) return;
        if (t.type === 'income') inc += t.amount; else exp += t.amount;
      });
      if (inc === 0 && exp === 0) continue;
      cum += inc - exp;
      html += `<tr><td>${m + 1}月</td><td class="inc">${fmt(inc)}</td><td class="exp">${fmt(exp)}</td><td class="${cum >= 0 ? 'inc' : 'exp'}">${fmt(cum)}</td></tr>`;
    }
  } else {
    const ym = `${year}-${pad(month + 1)}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let cum = 0, any = false;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${ym}-${pad(d)}`;
      let inc = 0, exp = 0;
      state.transactions.forEach(t => {
        if (t.bookId !== currentBookId || t.date !== ds) return;
        if (t.type === 'income') inc += t.amount; else exp += t.amount;
      });
      if (inc === 0 && exp === 0) continue;
      any = true;
      cum += inc - exp;
      html += `<tr><td>${d}日</td><td class="inc">${fmt(inc)}</td><td class="exp">${fmt(exp)}</td><td class="${cum >= 0 ? 'inc' : 'exp'}">${fmt(cum)}</td></tr>`;
    }
    if (!any) {
      billList.innerHTML = '<div class="empty-tip">这个月还没有账单记录</div>';
      return;
    }
  }

  html += '</tbody></table>';
  billList.innerHTML = html;
}

// ============ 搜索 ============
function renderSearchResults() {
  const q = searchQuery.toLowerCase();
  const qNum = parseFloat(searchQuery);
  const all = state.transactions.filter(t => {
    if (t.bookId !== currentBookId) return false;
    const cat = getCat(t.type, t.categoryId);
    const catName = cat ? cat.name.toLowerCase() : '';
    const note = (t.note || '').toLowerCase();
    const textMatch = catName.includes(q) || note.includes(q);
    const numMatch = searchQuery !== '' && !isNaN(qNum) && Math.abs(t.amount - qNum) < 0.005;
    return textMatch || numMatch;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const MAX = 200;
  const results = all.slice(0, MAX);
  $('searchResultTitle').textContent = all.length > MAX
    ? `「${searchQuery}」共 ${all.length} 条，显示前 ${MAX} 条`
    : `「${searchQuery}」的搜索结果（${all.length} 条）`;

  const list = $('searchResultList');
  list.innerHTML = '';
  if (results.length === 0) {
    list.innerHTML = '<li class="empty-tip">没有找到匹配的记录</li>';
    return;
  }
  results.forEach(t => {
    const cat = getCat(t.type, t.categoryId);
    const li = document.createElement('li');
    li.className = 'tx-item';
    li.innerHTML = `
      <span class="t-icon">${iconHTML(cat ? cat.icon : null, '❔')}</span>
      <span class="t-info">
        <span class="t-cat">${esc(cat ? cat.name : '未分类')}</span>
        <span class="t-note">${t.date}${t.note ? ' · ' + esc(t.note) : ''}</span>
      </span>
      ${t.image ? `<span class="t-thumb">${imgTag(t.image)}</span>` : ''}
      <span class="t-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</span>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.t-thumb')) openImageViewer(t.image);
      else openTxModal(t.id);
    });
    list.appendChild(li);
  });
  hydrateImages(list);
}

// ============ 预算视图 ============
function renderBudgetView() {
  const book = getBook();
  $('budgetBookName').textContent = book.name;
  const poolKey = getPoolKey(book);
  const budget = getBudgetData(poolKey);
  const now = new Date();
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const yearStr = String(now.getFullYear());

  let monthSpent = 0, yearSpent = 0;
  state.transactions.forEach(t => {
    if (t.bookId !== book.id || t.type !== 'expense') return;
    if (t.date.slice(0, 7) === ym) monthSpent += t.amount;
    if (t.date.slice(0, 4) === yearStr) yearSpent += t.amount;
  });

  $('budgetMonthSpent').textContent = fmt(monthSpent);
  $('budgetYearSpent').textContent = fmt(yearSpent);

  $('budgetMonthInput').value = budget.totalMonth || '';
  $('budgetMonthLimit').textContent = budget.totalMonth ? fmt(budget.totalMonth) : '未设置';
  setBar($('budgetMonthBar'), budget.totalMonth, monthSpent);

  $('budgetYearInput').value = budget.totalYear || '';
  $('budgetYearLimit').textContent = budget.totalYear ? fmt(budget.totalYear) : '未设置';
  setBar($('budgetYearBar'), budget.totalYear, yearSpent);

  renderCatBudgetList();
}

function setBar(barEl, limit, spent) {
  const pct = limit ? Math.min(100, spent / limit * 100) : 0;
  barEl.style.width = pct + '%';
  barEl.classList.toggle('over', !!limit && spent > limit);
}

function renderCatBudgetList() {
  const book = getBook();
  const poolKey = getPoolKey(book);
  const budget = getBudgetData(poolKey);
  const now = new Date();
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const list = $('catBudgetList');
  list.innerHTML = '';

  (state.categories.expense || []).forEach(c => {
    let spent = 0;
    state.transactions.forEach(t => {
      if (t.bookId === book.id && t.type === 'expense' && t.categoryId === c.id && t.date.slice(0, 7) === ym) {
        spent += t.amount;
      }
    });
    const amount = budget.categories[c.id] || '';
    const over = amount && spent > amount;
    const li = document.createElement('li');
    li.className = 'cat-budget-item' + (over ? ' over' : '');
    li.innerHTML = `
      <span class="c-icon">${iconHTML(c.icon, '❔')}</span>
      <span class="c-name">${esc(c.name)}</span>
      <span class="c-spent">已花 ${fmt(spent)}</span>
      <input type="number" class="cb-input" data-cat="${c.id}" placeholder="设预算" min="0" value="${amount}">
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.cb-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      const b = getBudgetData(getPoolKey(getBook()));
      if (v && v > 0) b.categories[inp.dataset.cat] = v;
      else delete b.categories[inp.dataset.cat];
      save();
      renderBudgetView();
    });
  });
}

function saveMonthBudget() {
  const v = parseFloat($('budgetMonthInput').value);
  const b = getBudgetData(getPoolKey(getBook()));
  b.totalMonth = (v && v > 0) ? Math.round(v * 100) / 100 : null;
  save();
  renderBudgetView();
}

function saveYearBudget() {
  const v = parseFloat($('budgetYearInput').value);
  const b = getBudgetData(getPoolKey(getBook()));
  b.totalYear = (v && v > 0) ? Math.round(v * 100) / 100 : null;
  save();
  renderBudgetView();
}

// ============ 资产视图 ============
function calcPool(poolKey) {
  const items = state.assets[poolKey] || [];
  const delta = buildDelta();
  let total = 0, liab = 0;
  items.forEach(a => {
    const bal = a.amount + (delta[a.id] || 0);
    if (a.type === 'asset') total += bal; else liab += bal;
  });
  return { total, liab, net: total - liab };
}

function renderAssetsView() {
  const book = getBook();
  $('assetsBookName').textContent = book.name;
  const poolKey = getPoolKey(book);
  if (!state.assets[poolKey]) state.assets[poolKey] = [];
  const { total, liab, net } = calcPool(poolKey);
  $('totalAssets').textContent = fmt(total);
  $('totalLiabilities').textContent = fmt(liab);
  const netEl = $('netWorth');
  netEl.textContent = fmt(net);
  netEl.style.color = net >= 0 ? 'var(--income)' : 'var(--expense)';

  const delta = buildDelta();
  const list = $('assetList');
  list.innerHTML = '';
  const items = state.assets[poolKey];
  if (items.length === 0) {
    list.innerHTML = '<li class="empty-tip">还没有账户，点右上角「添加资产」开始</li>';
  } else {
    items.forEach(a => {
      const bal = a.amount + (delta[a.id] || 0);
      const li = document.createElement('li');
      li.className = 'asset-item';
      li.innerHTML = `
        <span class="a-icon">${iconHTML(a.icon, a.type === 'asset' ? '💵' : '💳')}</span>
        <span class="a-info">
          <span class="a-name">${esc(a.name)}</span>
          <span class="a-type ${a.type}">${a.type === 'asset' ? '资产' : '负债'}</span>
        </span>
        <span class="a-amount ${a.type}">${a.type === 'asset' ? '+' : '-'}${fmt(bal)}</span>
      `;
      li.addEventListener('click', () => openAssetModal(a.id));
      list.appendChild(li);
    });
  }

  renderAssetCharts();
}

function renderAssetCharts() {
  const poolKey = getPoolKey(getBook());
  const items = state.assets[poolKey] || [];
  const delta = buildDelta();
  const palette = ['#ff8fab', '#fb6f92', '#2eb872', '#f4a261', '#8ecae6', '#ffd166', '#e5989b', '#90be6d'];

  if (chartAsset) { chartAsset.destroy(); chartAsset = null; }
  if (items.length > 0) {
    chartAsset = new Chart($('assetPie'), {
      type: 'doughnut',
      data: {
        labels: items.map(a => a.name),
        datasets: [{
          data: items.map(a => a.amount + (delta[a.id] || 0)),
          backgroundColor: items.map((a, i) => a.type === 'asset' ? palette[i % palette.length] : '#f25c82'),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: '#5c4a54' } } }
      }
    });
  }

  if (chartWorth) { chartWorth.destroy(); chartWorth = null; }
  const history = state.worthHistory[poolKey] || [];
  chartWorth = new Chart($('worthLine'), {
    type: 'line',
    data: {
      labels: history.map(h => h.date.slice(5)),
      datasets: [{
        label: '净资产', data: history.map(h => h.netWorth),
        borderColor: '#fb6f92', backgroundColor: 'rgba(251,111,146,.15)',
        fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#fb6f92'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { font: { size: 10 }, color: '#a88b95' }, grid: { color: '#ffe0e8' } },
        x: { ticks: { font: { size: 9 }, color: '#a88b95' }, grid: { display: false } }
      }
    }
  });
}

function recordWorthSnapshot() {
  const poolKey = getPoolKey(getBook());
  if (!state.worthHistory) state.worthHistory = {};
  if (!state.worthHistory[poolKey]) state.worthHistory[poolKey] = [];
  const { net } = calcPool(poolKey);
  const today = dateStr(new Date());
  const list = state.worthHistory[poolKey];
  const last = list[list.length - 1];
  if (last && last.date === today) last.netWorth = net;
  else list.push({ date: today, netWorth: net });
  if (list.length > 365) list.splice(0, list.length - 365);
}

// ============ 周期记账视图 ============
function renderRecurringView() {
  const list = $('recurringList');
  list.innerHTML = '';
  const items = state.recurring.filter(r => r.bookId === currentBookId);
  if (items.length === 0) {
    list.innerHTML = '<li class="empty-tip">还没有周期记账，点右上角「添加周期」设置房租、水电等固定费用</li>';
    return;
  }
  items.forEach(r => {
    const cat = getCat(r.type, r.categoryId);
    const freqText = r.frequency === 'weekly' ? '每周' : r.frequency === 'yearly' ? '每年' : `每月${r.dayOfMonth || 1}号`;
    const li = document.createElement('li');
    li.className = 'recurring-item';
    li.innerHTML = `
      <span class="t-icon">${iconHTML(cat ? cat.icon : null, '❔')}</span>
      <span class="t-info">
        <span class="t-cat">${esc(r.note || (cat ? cat.name : ''))}</span>
        <span class="t-note">${freqText} · ${r.type === 'income' ? '收入' : '支出'} · ${esc(cat ? cat.name : '未分类')}</span>
      </span>
      <span class="t-amount ${r.type}">${r.type === 'income' ? '+' : '-'}${fmt(r.amount)}</span>
    `;
    li.addEventListener('click', () => openRecurringModal(r.id));
    list.appendChild(li);
  });
}

function setRecType(type) {
  recType = type;
  document.querySelectorAll('#recurringTypeSwitch .type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type));
  recCatId = null;
  renderRecCatGrid();
}

function renderRecCatGrid() {
  const grid = $('recCatGrid');
  grid.innerHTML = '';
  (state.categories[recType] || []).forEach(c => {
    const div = document.createElement('div');
    div.className = 'cat-cell' + (c.id === recCatId ? ' active' : '');
    div.innerHTML = `<span class="c-icon">${iconHTML(c.icon, '❔')}</span><span>${esc(c.name)}</span>`;
    div.addEventListener('click', () => { recCatId = c.id; renderRecCatGrid(); });
    grid.appendChild(div);
  });
}

function renderRecAccountOptions(book, selectedAccountId) {
  const poolKey = getPoolKey(book);
  const items = (state.assets[poolKey] || []).filter(a => a.type === 'asset');
  const linked = book.linkedAssets || [];
  const list = linked.length ? items.filter(a => linked.includes(a.id)) : items;
  const delta = buildDelta();
  const select = $('recAccount');
  select.innerHTML = '<option value="">不关联账户</option>';
  list.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.name}（余额 ${fmt(a.amount + (delta[a.id] || 0))}）`;
    if (a.id === selectedAccountId) opt.selected = true;
    select.appendChild(opt);
  });
}

function toggleRecDayRow() {
  $('recDayRow').hidden = $('recFrequency').value !== 'monthly';
}

function openRecurringModal(id) {
  editingRecurringId = id || null;
  $('recurringModalTitle').textContent = id ? '编辑周期记账' : '添加周期记账';
  $('btnDeleteRecurring').classList.toggle('hidden', !id);
  const book = getBook();

  if (id) {
    const r = state.recurring.find(x => x.id === id);
    if (!r) return;
    setRecType(r.type);
    $('recNote').value = r.note || '';
    $('recAmount').value = r.amount;
    $('recFrequency').value = r.frequency || 'monthly';
    $('recDay').value = r.dayOfMonth || 1;
    $('recStart').value = r.startDate || dateStr(new Date());
    recCatId = r.categoryId || null;
    renderRecCatGrid();
    renderRecAccountOptions(book, r.accountId || '');
  } else {
    setRecType('expense');
    $('recNote').value = '';
    $('recAmount').value = '';
    $('recFrequency').value = 'monthly';
    $('recDay').value = 1;
    $('recStart').value = dateStr(new Date());
    recCatId = null;
    renderRecCatGrid();
    renderRecAccountOptions(book, '');
  }
  toggleRecDayRow();
  recurringModal.hidden = false;
}

function saveRecurring() {
  const amount = parseFloat($('recAmount').value);
  const note = $('recNote').value.trim();
  if (!amount || amount <= 0) { alert('请输入正确的金额'); return; }
  if (!recCatId) { alert('请选择分类'); return; }
  const frequency = $('recFrequency').value;
  const dayOfMonth = parseInt($('recDay').value) || 1;
  const startDate = $('recStart').value || dateStr(new Date());
  const cat = getCat(recType, recCatId);
  const payload = {
    bookId: currentBookId,
    type: recType,
    amount: Math.round(amount * 100) / 100,
    categoryId: recCatId,
    note: note || (cat ? cat.name : ''),
    accountId: $('recAccount').value || null,
    frequency,
    dayOfMonth,
    startDate
  };

  if (editingRecurringId) {
    const r = state.recurring.find(x => x.id === editingRecurringId);
    if (r) { Object.assign(r, payload); r.lastRun = startDate; }
  } else {
    state.recurring.push({ id: uid(), lastRun: startDate, ...payload });
  }
  processRecurring();
  save();
  recurringModal.hidden = true;
  renderAll();
}

function deleteRecurring() {
  if (!editingRecurringId) return;
  const cnt = state.transactions.filter(t => t.recurringId === editingRecurringId).length;
  const msg = cnt ? `确定删除这个周期吗？已生成的 ${cnt} 笔记录也会一起删除。` : '确定删除这个周期吗？';
  if (!confirm(msg)) return;
  state.recurring = state.recurring.filter(x => x.id !== editingRecurringId);
  state.transactions = state.transactions.filter(t => t.recurringId !== editingRecurringId);
  save();
  recurringModal.hidden = true;
  renderAll();
}

// ============ 记账弹窗 ============
function setTxType(type) {
  txType = type;
  document.querySelectorAll('#typeSwitch .type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type));
  selectedCatId = null;
  renderCatGrid();
}

function renderCatGrid() {
  const grid = $('catGrid');
  grid.innerHTML = '';
  (state.categories[txType] || []).forEach(c => {
    const div = document.createElement('div');
    div.className = 'cat-cell' + (c.id === selectedCatId ? ' active' : '');
    div.innerHTML = `<span class="c-icon">${iconHTML(c.icon, '❔')}</span><span>${esc(c.name)}</span>`;
    div.addEventListener('click', () => {
      selectedCatId = c.id;
      renderCatGrid();
    });
    grid.appendChild(div);
  });
}

function renderAccountOptions(book, selectedAccountId) {
  const poolKey = getPoolKey(book);
  const items = (state.assets[poolKey] || []).filter(a => a.type === 'asset');
  const linked = book.linkedAssets || [];
  const list = linked.length ? items.filter(a => linked.includes(a.id)) : items;
  const delta = buildDelta();
  const select = $('txAccount');
  select.innerHTML = '<option value="">不关联账户</option>';
  list.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.name}（余额 ${fmt(a.amount + (delta[a.id] || 0))}）`;
    if (a.id === selectedAccountId) opt.selected = true;
    select.appendChild(opt);
  });
}

function setTxImage(dataUrl) {
  txImage = dataUrl;
  const prev = $('txImagePreview');
  const btnAdd = $('btnAddImage');
  const btnRemove = $('btnRemoveImage');
  if (dataUrl) {
    prev.innerHTML = `<img src="${dataUrl}">`;
    prev.classList.remove('hidden');
    btnAdd.classList.add('hidden');
    btnRemove.classList.remove('hidden');
  } else {
    prev.innerHTML = '';
    prev.classList.add('hidden');
    btnAdd.classList.remove('hidden');
    btnRemove.classList.add('hidden');
  }
}

async function openTxModal(id) {
  editingTxId = id || null;
  $('txModalTitle').textContent = id ? '编辑记录' : '记一笔';
  $('btnDeleteTx').classList.toggle('hidden', !id);
  const book = getBook();

  if (id) {
    const t = state.transactions.find(x => x.id === id);
    if (!t) return;
    setTxType(t.type);
    $('txAmount').value = t.amount;
    $('txDate').value = t.date;
    $('txNote').value = t.note || '';
    selectedCatId = t.categoryId || null;
    renderCatGrid();
    renderAccountOptions(book, t.accountId || '');
    if (t.image) {
      const url = await getImageUrl(t.image);
      setTxImage(url);
    } else {
      setTxImage(null);
    }
  } else {
    setTxType(txType);
    $('txAmount').value = '';
    $('txDate').value = selectedDate || dateStr(new Date());
    $('txNote').value = '';
    selectedCatId = null;
    renderCatGrid();
    renderAccountOptions(book, '');
    setTxImage(null);
  }
  txModal.hidden = false;
  $('txAmount').focus();
}

async function saveTx() {
  const amount = parseFloat($('txAmount').value);
  const date = $('txDate').value;
  if (!amount || amount <= 0) { alert('请输入正确的金额'); return; }
  if (!date) { alert('请选择日期'); return; }
  if (!selectedCatId) { alert('请选择一个分类'); return; }

  let image = null;
  if (txImage) {
    image = await window.api.saveImage('tx.png', txImage);
  }

  const payload = {
    bookId: currentBookId,
    type: txType,
    amount: Math.round(amount * 100) / 100,
    categoryId: selectedCatId,
    date,
    note: $('txNote').value.trim(),
    accountId: $('txAccount').value || null,
    image
  };

  if (editingTxId) {
    const t = state.transactions.find(x => x.id === editingTxId);
    if (t) Object.assign(t, payload);
  } else {
    state.transactions.push({ id: uid(), createdAt: Date.now(), ...payload });
  }
  save();
  txModal.hidden = true;
  selectedDate = date;
  const [y, m] = date.split('-').map(Number);
  if (y === viewDate.getFullYear() && m - 1 === viewDate.getMonth()) {
    renderAll();
  } else {
    viewDate = new Date(y, m - 1, 1);
    renderAll();
  }
}

function deleteTx() {
  if (!editingTxId) return;
  if (!confirm('确定删除这条记录吗？')) return;
  state.transactions = state.transactions.filter(t => t.id !== editingTxId);
  save();
  txModal.hidden = true;
  renderAll();
}

// ============ 导出 Excel ============
async function exportExcel() {
  const book = getBook();
  const rows = state.transactions
    .filter(t => t.bookId === currentBookId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => {
      const cat = getCat(t.type, t.categoryId);
      return [t.date, t.type === 'income' ? '收入' : '支出', cat ? cat.name : '未分类', t.amount, accountName(t.accountId), t.note || ''];
    });

  const ws = XLSX.utils.aoa_to_sheet([
    ['日期', '类型', '分类', '金额', '账户', '备注'], ...rows
  ]);
  ws['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '账单');
  const array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const base64 = arrayToBase64(array);
  const res = await window.api.exportExcel(`${book.name}-账单-${dateStr(new Date())}.xlsx`, base64);
  if (res && res.ok) alert('导出成功！');
}

// ============ 分类管理弹窗 ============
function setCatManageType(type) {
  catManageType = type;
  document.querySelectorAll('#catTypeSwitch .type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type));
  renderCatManageList();
}

function renderCatManageList() {
  const list = $('catManageList');
  list.innerHTML = '';
  (state.categories[catManageType] || []).forEach(c => {
    const li = document.createElement('li');
    li.className = 'cat-manage-item';
    li.innerHTML = `
      <span class="c-icon">${iconHTML(c.icon, '❔')}</span>
      <span class="c-name">${esc(c.name)}</span>
      <button class="del-btn" title="删除">✕</button>
    `;
    li.querySelector('.del-btn').addEventListener('click', () => deleteCat(c));
    list.appendChild(li);
  });
}

function deleteCat(cat) {
  const used = state.transactions.filter(t => t.categoryId === cat.id).length;
  const msg = used
    ? `「${cat.name}」分类下有 ${used} 条记录，删除后这些记录会变成"未分类"，确定删除吗？`
    : `确定删除分类「${cat.name}」吗？`;
  if (!confirm(msg)) return;
  state.categories[catManageType] = state.categories[catManageType].filter(x => x.id !== cat.id);
  state.transactions.forEach(t => { if (t.categoryId === cat.id) t.categoryId = null; });
  const b = state.budgets['shared'];
  if (b && b.categories) delete b.categories[cat.id];
  save();
  renderCatManageList();
}

function addCat() {
  const name = $('newCatName').value.trim();
  const icon = $('newCatIcon').value || '📌';
  if (!name) { alert('请输入分类名称'); return; }
  state.categories[catManageType].push({ id: uid(), name, icon });
  $('newCatName').value = '';
  $('newCatIcon').value = '';
  updateIconPreview('newCatIcon');
  save();
  renderCatManageList();
}

function openCatModal() {
  setCatManageType('expense');
  $('newCatName').value = '';
  $('newCatIcon').value = '';
  updateIconPreview('newCatIcon');
  catModal.hidden = false;
}

// ============ 账本弹窗 ============
function renderLinkedAssets(selectedIds) {
  const box = $('linkedAssets');
  const items = (state.assets['shared'] || []).filter(a => a.type === 'asset');
  box.innerHTML = '';
  if (items.length === 0) {
    box.innerHTML = '<span class="empty-tip">还没有资产账户，先去「资产」页添加</span>';
    return;
  }
  items.forEach(a => {
    const label = document.createElement('label');
    label.className = 'linked-asset-item';
    label.innerHTML = `
      <input type="checkbox" value="${a.id}" ${(selectedIds || []).includes(a.id) ? 'checked' : ''}>
      <span>${iconHTML(a.icon, '💵')} ${esc(a.name)}</span>
    `;
    box.appendChild(label);
  });
}

function openBookModal(id) {
  editingBookId = id || null;
  $('bookModalTitle').textContent = id ? '编辑账本' : '新建账本';
  $('btnDeleteBook').classList.toggle('hidden', !id);
  if (id) {
    const b = state.books.find(x => x.id === id);
    if (!b) return;
    $('bookName').value = b.name;
    $('bookIcon').value = b.icon || '';
    updateIconPreview('bookIcon');
    renderLinkedAssets(b.linkedAssets || []);
  } else {
    $('bookName').value = '';
    $('bookIcon').value = '';
    updateIconPreview('bookIcon');
    renderLinkedAssets([]);
  }
  bookModal.hidden = false;
  $('bookName').focus();
}

function saveBook() {
  const name = $('bookName').value.trim();
  if (!name) { alert('请输入账本名称'); return; }
  const icon = $('bookIcon').value || '📒';
  const linked = [];
  document.querySelectorAll('#linkedAssets input[type=checkbox]:checked').forEach(cb => linked.push(cb.value));

  if (editingBookId) {
    const b = state.books.find(x => x.id === editingBookId);
    if (b) { b.name = name; b.icon = icon; b.linkedAssets = linked; }
  } else {
    const nb = { id: uid(), name, icon, mode: 'shared', linkedAssets: linked };
    state.books.push(nb);
    currentBookId = nb.id;
  }
  save();
  bookModal.hidden = true;
  renderAll();
}

function deleteBook() {
  if (!editingBookId) return;
  if (state.books.length <= 1) { alert('至少保留一个账本'); return; }
  const b = state.books.find(x => x.id === editingBookId);
  const cnt = state.transactions.filter(t => t.bookId === editingBookId).length;
  const msg = cnt
    ? `确定删除账本「${b.name}」吗？其中的 ${cnt} 条记录也会一起删除。`
    : `确定删除账本「${b.name}」吗？`;
  if (!confirm(msg)) return;
  state.books = state.books.filter(x => x.id !== editingBookId);
  state.transactions = state.transactions.filter(t => t.bookId !== editingBookId);
  state.recurring = state.recurring.filter(r => r.bookId !== editingBookId);
  if (currentBookId === editingBookId) currentBookId = state.books[0].id;
  save();
  bookModal.hidden = true;
  renderAll();
}

// ============ 资产弹窗 ============
function setAssetType(type) {
  assetType = type;
  document.querySelectorAll('#assetTypeSwitch .type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type));
}

function openAssetModal(id) {
  editingAssetId = id || null;
  $('assetModalTitle').textContent = id ? '编辑账户' : '添加资产';
  $('btnDeleteAsset').classList.toggle('hidden', !id);
  if (id) {
    const poolKey = getPoolKey(getBook());
    const a = state.assets[poolKey].find(x => x.id === id);
    if (!a) return;
    $('assetName').value = a.name;
    $('assetIcon').value = a.icon || '';
    setAssetType(a.type);
    $('assetAmount').value = a.amount;
    updateIconPreview('assetIcon');
  } else {
    $('assetName').value = '';
    $('assetIcon').value = '';
    setAssetType('asset');
    $('assetAmount').value = '';
    updateIconPreview('assetIcon');
  }
  assetModal.hidden = false;
  $('assetName').focus();
}

function saveAsset() {
  const name = $('assetName').value.trim();
  const amount = parseFloat($('assetAmount').value);
  if (!name) { alert('请输入名称'); return; }
  if (!amount || amount <= 0) { alert('请输入正确的金额'); return; }
  const poolKey = getPoolKey(getBook());
  const icon = $('assetIcon').value || (assetType === 'asset' ? '💵' : '💳');
  const payload = { name, icon, type: assetType, amount: Math.round(amount * 100) / 100 };

  if (editingAssetId) {
    const a = state.assets[poolKey].find(x => x.id === editingAssetId);
    if (a) Object.assign(a, payload);
  } else {
    state.assets[poolKey].push({ id: uid(), ...payload });
  }
  recordWorthSnapshot();
  save();
  assetModal.hidden = true;
  renderAssetsView();
}

function deleteAsset() {
  if (!editingAssetId) return;
  if (!confirm('确定删除这个账户吗？')) return;
  const poolKey = getPoolKey(getBook());
  state.assets[poolKey] = state.assets[poolKey].filter(x => x.id !== editingAssetId);
  state.transactions.forEach(t => { if (t.accountId === editingAssetId) t.accountId = null; });
  state.recurring.forEach(r => { if (r.accountId === editingAssetId) r.accountId = null; });
  recordWorthSnapshot();
  save();
  assetModal.hidden = true;
  renderAssetsView();
}

// ============ 图标选择器 ============
function updateIconPreview(targetId) {
  const val = $(targetId).value;
  const prev = $(targetId + 'Preview');
  if (prev) prev.innerHTML = val ? iconHTML(val, '❔') : '❔';
}

function openIconPicker(targetId) {
  iconPickerTargetId = targetId;
  renderIconGrid();
  iconModal.hidden = false;
}

function renderIconGrid() {
  const grid = $('iconGrid');
  grid.innerHTML = '';
  ICON_CHOICES.forEach(ic => {
    const d = document.createElement('div');
    d.className = 'icon-choice';
    d.textContent = ic;
    d.addEventListener('click', () => pickIcon(ic));
    grid.appendChild(d);
  });
}

function pickIcon(value) {
  if (iconPickerTargetId) {
    $(iconPickerTargetId).value = value;
    updateIconPreview(iconPickerTargetId);
  }
  iconModal.hidden = true;
}

function uploadIcon(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => compressImage(e.target.result, 128, (dataUrl) => pickIcon(dataUrl));
  reader.readAsDataURL(file);
}

function compressImage(dataUrl, maxSize, cb) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    cb(canvas.toDataURL('image/png'));
  };
  img.src = dataUrl;
}

// ============ 图片查看 ============
async function openImageViewer(src) {
  const url = await getImageUrl(src);
  $('imageViewerImg').src = url || '';
  $('imageViewer').hidden = false;
}

// ============ 视图切换 ============
function switchView(view) {
  currentView = view;
  renderAll();
}

// ============ 事件绑定 ============
function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.addEventListener('click', () => switchView(b.dataset.view)));

  $('prevMonth').addEventListener('click', () => {
    if (viewMode === 'year') viewDate.setFullYear(viewDate.getFullYear() - 1);
    else viewDate.setMonth(viewDate.getMonth() - 1);
    renderAll();
  });
  $('nextMonth').addEventListener('click', () => {
    if (viewMode === 'year') viewDate.setFullYear(viewDate.getFullYear() + 1);
    else viewDate.setMonth(viewDate.getMonth() + 1);
    renderAll();
  });
  $('monthTitle').addEventListener('click', () => {
    viewMode = viewMode === 'month' ? 'year' : 'month';
    renderAll();
  });
  $('btnToday').addEventListener('click', () => {
    viewMode = 'month';
    viewDate = new Date();
    selectedDate = dateStr(viewDate);
    renderAll();
  });

  $('tabCalendar').addEventListener('click', () => { calendarTab = 'calendar'; renderAll(); });
  $('tabList').addEventListener('click', () => { calendarTab = 'bill'; renderAll(); });

  $('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value;
    searchTimer = setTimeout(() => {
      searchQuery = val.trim();
      if (searchQuery) currentView = 'calendar';
      renderAll();
    }, 250);
  });
  $('btnClearSearch').addEventListener('click', () => {
    clearTimeout(searchTimer);
    $('searchInput').value = '';
    searchQuery = '';
    calendarTab = 'calendar';
    renderAll();
  });

  $('btnAddTx').addEventListener('click', () => openTxModal(null));
  $('btnSaveTx').addEventListener('click', saveTx);
  $('btnDeleteTx').addEventListener('click', deleteTx);
  document.querySelectorAll('#typeSwitch .type-btn').forEach(b =>
    b.addEventListener('click', () => setTxType(b.dataset.type)));

  $('btnAddImage').addEventListener('click', () => $('txImageInput').click());
  $('txImageInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => compressImage(ev.target.result, 900, (dataUrl) => setTxImage(dataUrl));
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  });
  $('btnRemoveImage').addEventListener('click', () => setTxImage(null));

  $('btnSaveMonthBudget').addEventListener('click', saveMonthBudget);
  $('btnSaveYearBudget').addEventListener('click', saveYearBudget);

  $('btnAddAsset').addEventListener('click', () => openAssetModal(null));
  $('btnSaveAsset').addEventListener('click', saveAsset);
  $('btnDeleteAsset').addEventListener('click', deleteAsset);
  document.querySelectorAll('#assetTypeSwitch .type-btn').forEach(b =>
    b.addEventListener('click', () => setAssetType(b.dataset.type)));

  $('btnAddRecurring').addEventListener('click', () => openRecurringModal(null));
  $('btnSaveRecurring').addEventListener('click', saveRecurring);
  $('btnDeleteRecurring').addEventListener('click', deleteRecurring);
  document.querySelectorAll('#recurringTypeSwitch .type-btn').forEach(b =>
    b.addEventListener('click', () => setRecType(b.dataset.type)));
  $('recFrequency').addEventListener('change', toggleRecDayRow);

  $('btnExportExcel').addEventListener('click', exportExcel);

  $('btnManageCats').addEventListener('click', openCatModal);
  $('btnAddCat').addEventListener('click', addCat);
  document.querySelectorAll('#catTypeSwitch .type-btn').forEach(b =>
    b.addEventListener('click', () => setCatManageType(b.dataset.type)));

  $('btnAddBook').addEventListener('click', () => openBookModal(null));
  $('btnSaveBook').addEventListener('click', saveBook);
  $('btnDeleteBook').addEventListener('click', deleteBook);

  document.querySelectorAll('.pick-icon').forEach(b =>
    b.addEventListener('click', () => openIconPicker(b.dataset.target)));
  $('btnUploadIcon').addEventListener('click', () => $('iconFileInput').click());
  $('iconFileInput').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) uploadIcon(e.target.files[0]);
    e.target.value = '';
  });

  $('btnCloseImageViewer').addEventListener('click', () => $('imageViewer').hidden = true);
  $('imageViewer').addEventListener('click', (e) => {
    if (e.target === $('imageViewer')) $('imageViewer').hidden = true;
  });

  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => $(b.dataset.close).hidden = true));
  document.querySelectorAll('.modal-overlay').forEach(ov =>
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.hidden = true; }));
}

// ============ 启动 ============
window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  selectedDate = dateStr(new Date());
  load();
});
