/* ============================================================
   Insights + To-Do prototype.

   One shared To-Do list, fed by every module. That is Patrick's point
   ("all the to-do actions end up in the same place") and Stephen's ask
   ("build a prototype for a to-do list, simple to use").
   ============================================================ */

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const money = n => 'R' + Math.round(Math.abs(n)).toLocaleString('en-ZA');

/* Anything a user typed, or any string that reaches innerHTML, is escaped.
   Without this, a to-do of "<img src=x onerror=...>" executes. */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* The app's "today" is 14 Jul 2026, to match the data. */
const NOW = new Date('2026-07-14T00:00:00');

const ordinal = n => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/* Paying the scheduled instalment on a bond, a vehicle loan or a student loan
   is not a problem, it is the deal. Only revolving credit punishes you for
   paying the minimum, so only revolving credit gets the warning. */
const REVOLVING = ['Credit Card Repayment', 'Store Account', 'Overdraft', 'Buy Now Pay Later'];
/* Build the date from LOCAL parts. toISOString() converts to UTC and, east of
   Greenwich, silently rolls "today" back to yesterday, which made a fresh
   to-do land in the Overdue bucket the moment it was created. */
const isoPlus = days => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const dayDiff = iso => Math.round((new Date(iso + 'T00:00:00') - NOW) / 86400000);

/* A to-do without a deadline is a wish. Say when, in words a person uses. */
function dueLabel(iso) {
  if (!iso) return { text: 'No date', cls: 'due-none' };
  const n = dayDiff(iso);
  if (n < 0) return { text: n === -1 ? 'Yesterday' : `${Math.abs(n)} days overdue`, cls: 'due-over' };
  if (n === 0) return { text: 'Today', cls: 'due-now' };
  if (n === 1) return { text: 'Tomorrow', cls: 'due-now' };
  if (n <= 7) return { text: `In ${n} days`, cls: 'due-soon' };
  return { text: new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), cls: 'due-later' };
}

/* Microsoft To Do's useful idea: group by when it matters, not by where it came from. */
const BUCKETS = [
  { id: 'over', label: 'Overdue', test: t => t.due && dayDiff(t.due) < 0 },
  { id: 'now', label: 'Today and tomorrow', test: t => t.due && dayDiff(t.due) >= 0 && dayDiff(t.due) <= 1 },
  { id: 'week', label: 'This week', test: t => t.due && dayDiff(t.due) > 1 && dayDiff(t.due) <= 7 },
  { id: 'later', label: 'Later', test: t => t.due && dayDiff(t.due) > 7 },
  { id: 'none', label: 'No date', test: t => !t.due },
];

/* ---------------- the shared to-do store ---------------- */
const KEY = 'v22-todos';
const Store = {
  items: JSON.parse(localStorage.getItem(KEY) || '[]'),
  save() { localStorage.setItem(KEY, JSON.stringify(this.items)); paintBadges(); },
  add(insight) {
    if (this.items.some(i => i.insightId === insight.id && !i.done && !i.archived)) return false;
    this.items.unshift({
      id: 'todo-' + Date.now() + '-' + Math.round(performance.now()),
      insightId: insight.id,
      module: insight.module,
      text: insight.todo,
      why: insight.title,
      evidence: insight.evidence,
      priority: insight.priority || 5,
      actionType: 'off-platform',
      due: insight.dueInDays != null ? isoPlus(insight.dueInDays) : null,
      done: false,
      archived: false,
      added: new Date().toISOString(),
    });
    this.save();
    return true;
  },
  addManual(text) {
    if (!text.trim()) return;
    this.items.unshift({ id: 'todo-' + Date.now(), module: null, text: text.trim(), due: null, done: false, archived: false,
      priority: 5, actionType: 'manual', added: new Date().toISOString(), manual: true });
    this.save();
  },
  edit(id, text) { const i = this.items.find(x => x.id === id); if (i && text.trim()) { i.text = text.trim(); this.save(); } },
  setDue(id, iso) { const i = this.items.find(x => x.id === id); if (i) { i.due = iso || null; this.save(); } },
  toggle(id) { const i = this.items.find(x => x.id === id); if (i) { i.done = !i.done; i.doneAt = i.done ? new Date().toISOString() : null; this.save(); } },
  archive(id) { const i = this.items.find(x => x.id === id); if (i) { i.archived = true; i.archivedAt = new Date().toISOString(); this.save(); } },
  restore(id) { const i = this.items.find(x => x.id === id); if (i) { i.archived = false; i.archivedAt = null; this.save(); } },
  remove(id) { this.items = this.items.filter(x => x.id !== id); this.save(); },
  open() { return this.items.filter(i => !i.done && !i.archived); },
  doneItems() { return this.items.filter(i => i.done && !i.archived); },
  archivedItems() { return this.items.filter(i => i.archived); },
  hasFor(insightId) { return this.items.some(i => i.insightId === insightId && !i.done && !i.archived); },
};

/* ---------------- state ---------------- */
/* "Not now" means not now, so a dismissal lasts for this session only and is
   deliberately NOT persisted. Reloading brings the card back. This keeps the
   word honest and stops a demo from permanently losing its insights. The
   to-do list, which a person expects to persist, still does. */
const State = { insights: [], filter: 'all', dismissed: [], txFilter: null, mktCat: null,
  todoView: { q: '', status: 'all', module: 'all', sort: 'due' } };

/* Priority on a task is inherited from the insight that created it (1 = most
   urgent). Shown as a dot and used for the Priority sort. Honest: it is the
   engine's own ranking, not a made-up score. */
function prMeta(p) {
  if (p <= 2) return { cls: 'pr-hi', label: 'High priority' };
  if (p === 3) return { cls: 'pr-md', label: 'Medium priority' };
  return { cls: 'pr-lo', label: 'Low priority' };
}

/* The current budget month, derived from the app's "today" so the Transactions
   "Current budget" chip filters on real dates, not a hardcoded string. */
const CUR_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;

/* The transactions the engine itself treats as unusual or wrong: a first-time
   merchant far above the typical spend (the same signal dash-5 fires on) and
   both legs of an exact duplicate charge (the tx-4 signal). Derived, not a
   hardcoded id list, so the "Suspicious" filter cannot drift from the insights. */
function suspiciousTxIds() {
  const ids = new Set(), byKey = {};
  DATA.tx.forEach(t => {
    if (t.amount < 0 && t.firstTimeMerchant && t.farAboveTypical) ids.add(t.id);
    if (t.amount < 0) {
      const k = `${t.merchant}|${t.amount}|${t.date}`;
      if (byKey[k]) { ids.add(t.id); ids.add(byKey[k]); } else byKey[k] = t.id;
    }
  });
  return ids;
}

/* Every chip is a truthful predicate over the real TX rows. View-only: no chip
   mutates DATA. */
const TX_FILTERS = {
  'Current budget': t => t.date.slice(0, 7) === CUR_MONTH,
  'Unseen': t => t.seen === false,
  'Uncategorised': t => t.uncategorised === true,
  'Pending': t => t.pending === true,
  'Suspicious': (t, susp) => susp.has(t.id),
};

/* When an in-app action navigates and then opens its own modal/drawer, we must
   NOT let the navigation's render close that overlay. Any OTHER navigation (a
   sidebar tap, a back button) should clear a stuck overlay off the new page. */
let navFromAction = false;

/* Each module's own UI, rebuilt from the live app, so insights land inside the
   surface the customer already knows. Declared here because the surfaces below
   are assigned before viewModule() reads them. */
const MODULE_CHROME = {};
const MODULE_WIRE = {};

function refresh() {
  State.insights = runEngine(DATA).filter(i => !State.dismissed.includes(i.id));
}
function dismiss(id) {
  State.dismissed.push(id);
  refresh(); render();
}

/* ---------------- chrome: sidebar ---------------- */
const NAV = [
  { label: 'Home', route: '#/dashboard', icon: 'Home.png' },
  { label: 'Transactions', route: '#/transactions', icon: 'Transactions.svg' },
  { label: 'Budget', route: '#/budgeting', icon: 'Budget.png' },
  { label: 'Investments', route: '#/investments', icon: 'Investments.png' },
  { label: 'My Wealth', route: '#/accounts', icon: 'MyWealth.svg', sub: 'Accounts' },
  { label: 'Financial Fitness', route: '#/fitness', icon: 'FinancialFitness.svg' },
  { label: 'Goals', route: '#/goals', icon: 'Goals.svg' },
  { label: 'Family Circle', route: '#/family', icon: 'Family.svg' },
  { label: 'Debt', route: '#/debt', icon: 'Goals.svg' },
  { label: 'Insurance', route: '#/insurance', icon: 'FinancialFitness.svg' },
  { label: 'Crypto Portfolio', route: '#/crypto', icon: 'Crypto.svg' },
  { label: 'Marketplace', route: '#/marketplace', icon: 'Marketplace.svg' },
  { label: 'Insights', route: '#/insights', icon: 'insights.png' },
  /* NEW. The one shared list. */
  { label: 'To-Do', route: '#/todo', icon: null, todo: true, badge: 'New' },
  { label: 'Product Updates', route: '#/updates', icon: 'Updates.png', badge: 'New' },
];

function paintNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  const hash = location.hash || '#/insights';
  const open = Store.open().length;
  NAV.forEach(item => {
    const a = el('a', item.route === hash ? 'on' : '');
    a.href = item.route;
    const icon = item.todo
      ? `<span class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></span>`
      : `<span class="ico"><img src="assets/img/${item.icon}" alt=""></span>`;
    const badge = item.todo && open
      ? `<span class="nav-count">${open}</span>`
      : item.badge ? `<span class="badge-new">${item.badge}</span>` : '';
    a.innerHTML = `${icon}<span>${item.label}</span>${item.sub ? `<span class="sub">${item.sub}</span>` : ''}${badge}`;
    nav.appendChild(a);
  });
  nav.appendChild(el('div', 'side-div'));
  const tara = el('a', '');
  tara.href = '#/insights';
  tara.innerHTML = `<span class="ico tara"><img src="assets/img/tara-advisor.png" alt=""></span><span>Tara AI</span>`;
  tara.onclick = e => { e.preventDefault(); openTara(); };
  nav.appendChild(tara);
}

function paintBadges() {
  paintNav();
  const open = Store.open().length;
  const b = $('#bell-badge');
  if (b) b.textContent = 8 + open;
}

/* ---------------- drawer + modal + toast ---------------- */
function openDrawer(title, html) {
  $('#drawer-title').textContent = title;
  $('#drawer-bd').innerHTML = html;
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#scrim').classList.remove('open');
}
function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-bd').innerHTML = html;
  $('#modal-wrap').classList.add('on');
}
function closeModal() { $('#modal-wrap').classList.remove('on'); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ---------------- insight card ---------------- */
function statusChip(i) {
  if (i.status === 'blocked') return `<span class="chip chip-blocked" title="${(i.blockedBy || '').replace(/"/g, "'")}">Needs rails</span>`;
  if (i.status === 'moved') return `<span class="chip chip-moved">Moved from Budgeting</span>`;
  return '';
}
function actionChip(i) {
  if (i.precursor) return `<span class="chip chip-ask">You answer</span>`;
  if (i.action === 'todo') return `<span class="chip chip-todo">To-do</span>`;
  if (i.action === 'wizard') return `<span class="chip chip-wizard">Wizard</span>`;
  return `<span class="chip chip-inapp">Tara does it</span>`;
}

/* The blockedBy note is written for us, with names in it ("Stephen: ..."). It is
   never shown to a customer with the attribution attached. Strip the leading
   "Name:" so the reason stands on its own. */
function customerBlockedReason(s) {
  return String(s || '').replace(/^\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?:\s*/, '');
}

/* Confidence is derived, never invented. A card that reads a real balance,
   policy or transaction is high confidence. A card that projects forward (a
   pace, a forecast, a months-to-clear figure) is medium and says why, so the
   number is never dressed up as more certain than it is. */
function confidenceOf(i) {
  const ev = (i.evidence || '').toLowerCase();
  const projected = /(on this pace|about |around |roughly|projected|by around|at your current|finishes the month|months from)/.test(ev)
    || ['debt-3', 'budget-1', 'dash-4'].includes(i.id);
  if (projected) return { label: 'Medium confidence', cls: 'conf-md',
    why: 'This uses a projection from your current pace, so it moves as the month plays out.' };
  return { label: 'High confidence', cls: 'conf-hi',
    why: 'This is read straight from your accounts, so it reflects your real balances and transactions.' };
}

/* The recommended action in plain words, and whether it happens in Vault22 or
   off platform. Off-platform actions become a to-do; in-app actions Tara runs. */
function recommendedAction(i) {
  if (i.status === 'blocked') return { where: 'Not yet', text: 'Shaped and visible, but it will not act until the rails behind it are real.' };
  if (i.precursor) return { where: 'In Vault22', text: 'Answer two quick questions so Tara can look at your cover.' };
  if (i.action === 'todo') return { where: 'Off platform', text: i.todo || 'Adds a task to your to-do list to do yourself.' };
  if (i.action === 'wizard') return { where: 'In Vault22', text: (i.cta || 'Open the guided setup') + ', a guided setup inside the app.' };
  return { where: 'In Vault22', text: (i.inApp || i.cta || 'Tara does this for you') + '.' };
}

/* The full insight, opened as a drawer: what it is, why Tara raised it, the data
   it read, how confident it is, and the one recommended action, with the same
   action button the card carries and a deep link back to the module it came
   from. This is the "open insight, read why, choose action" journey in one place. */
function openInsightDetail(i) {
  const mod = MODULES.find(m => m.id === i.module);
  const conf = confidenceOf(i);
  const rec = recommendedAction(i);
  const already = i.action === 'todo' && Store.hasFor(i.id);

  let actionBtn;
  if (i.status === 'blocked') actionBtn = `<button class="btn btn-ghost btn-block" data-dwhy="${i.id}">Why is this blocked?</button>`;
  else if (i.precursor) actionBtn = `<button class="btn btn-primary btn-block" data-dinapp="${i.id}">Answer now</button>`;
  else if (i.action === 'wizard') actionBtn = `<button class="btn btn-primary btn-block" data-dwizard="${i.wizard}">${esc(i.cta || 'Start')}</button>`;
  else if (i.action === 'todo') actionBtn = already
    ? `<button class="btn btn-ghost btn-block" disabled>✓ Already on your to-do list</button>`
    : `<button class="btn btn-primary btn-block" data-dtodo="${i.id}">Add to my to-do list</button>`;
  else actionBtn = `<button class="btn btn-primary btn-block" data-dinapp="${i.id}">${esc(i.cta || 'Let Tara do it')}</button>`;

  openDrawer('Insight', `
    <div class="dr-tags">${actionChipHtml(i)} ${statusChipHtml(i)} <span class="conf ${conf.cls}">${conf.label}</span></div>
    <p class="dr-lead">${esc(i.title)}</p>
    <p class="dr-para">${esc(i.body)}</p>
    <div class="dr-block">
      <h4>Why Tara raised this</h4>
      <p>Tara read ${esc((i.reads || '').replace(/\.$/, '').toLowerCase())} and found something worth your attention.</p>
    </div>
    <div class="dr-block">
      <h4>The data behind it</h4>
      <p>${esc(i.evidence)}</p>
    </div>
    <div class="dr-block">
      <h4>Confidence</h4>
      <p><span class="conf ${conf.cls}">${conf.label}</span> ${esc(conf.why)}</p>
    </div>
    <div class="dr-block">
      <h4>Recommended action</h4>
      <p><span class="where-tag where-${rec.where === 'Off platform' ? 'off' : 'in'}">${rec.where}</span> ${esc(rec.text)}</p>
    </div>
    ${actionBtn}
    ${mod ? `<a class="dr-golink" href="#/${i.module}">Open ${esc(mod.label)} ↗</a>` : ''}
    <p class="dr-note">Tara shows options and never gives financial advice.</p>`);

  const bd = $('#drawer-bd');
  const wireOne = (sel, fn) => { const b = bd.querySelector(sel); if (b) b.onclick = fn; };
  wireOne('[data-dtodo]', () => { if (Store.add(i)) { toast('Added to your to-do list'); closeDrawer(); render(); } });
  wireOne('[data-dinapp]', () => { closeDrawer(); if (i.precursor) { openPrecursor(i); } else runInApp(i); });
  wireOne('[data-dwizard]', b => openWizard(i.wizard));
  wireOne('[data-dwhy]', () => openBlockedDrawer(i));
  bd.querySelectorAll('.dr-golink, [href^="#/"]').forEach(a => a.onclick = () => closeDrawer());
}
function actionChipHtml(i) { return actionChip(i); }
function statusChipHtml(i) { return statusChip(i) || ''; }

function insightCard(i) {
  const mod = MODULES.find(m => m.id === i.module);
  const card = el('article', 'ins' + (i.status === 'blocked' ? ' ins-blocked' : ''));
  const already = i.action === 'todo' && Store.hasFor(i.id);

  let cta = '';
  if (i.status === 'blocked') {
    cta = `<button class="btn btn-ghost" data-why="${i.id}">Why is this blocked?</button>`;
  } else if (i.action === 'wizard') {
    cta = `<button class="btn btn-primary" data-wizard="${i.wizard}">${i.cta}</button>`;
  } else if (i.action === 'todo') {
    cta = already
      ? `<button class="btn btn-ghost btn-sm" disabled>✓ On your list</button>`
      : `<button class="btn btn-primary" data-todo="${i.id}">Add to my to-do list</button>`;
  } else {
    cta = `<button class="btn btn-primary" data-inapp="${i.id}">${i.cta || 'Let Tara do it'}</button>`;
  }

  const conf = confidenceOf(i);
  card.innerHTML = `
    <div class="ins-top">
      <span class="ins-mod">${esc(mod ? mod.label : i.module)}</span>
      ${actionChip(i)} ${statusChip(i)}
    </div>
    <h3><button class="ins-title-btn" data-detail="${i.id}">${esc(i.title)}</button></h3>
    <p class="ins-body">${esc(i.body)}</p>
    <details class="ins-ev">
      <summary>What Tara read</summary>
      <p class="ev-reads"><strong>Reads:</strong> ${esc(i.reads)}</p>
      <p class="ev-data">${esc(i.evidence)}</p>
      ${i.status !== 'blocked' ? `<p class="ev-conf"><span class="conf ${conf.cls}">${conf.label}</span></p>` : ''}
    </details>
    <div class="ins-cta">
      ${cta}
      <button class="btn btn-ghost btn-sm" data-detail="${i.id}">Details</button>
      <button class="btn btn-ghost btn-sm" data-dismiss="${i.id}">Not now</button>
    </div>`;
  return card;
}

function wireCards(root) {
  root.querySelectorAll('[data-todo]').forEach(b => b.onclick = () => {
    const i = State.insights.find(x => x.id === b.dataset.todo);
    if (Store.add(i)) { toast('Added to your to-do list'); render(); }
  });
  root.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => dismiss(b.dataset.dismiss));
  root.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => {
    const i = State.insights.find(x => x.id === b.dataset.detail);
    if (i) openInsightDetail(i);
  });
  root.querySelectorAll('[data-why]').forEach(b => b.onclick = () => {
    const i = State.insights.find(x => x.id === b.dataset.why);
    if (i) openBlockedDrawer(i);
  });
  root.querySelectorAll('[data-inapp]').forEach(b => b.onclick = () => {
    const i = State.insights.find(x => x.id === b.dataset.inapp);
    if (i.precursor) { openPrecursor(i); return; }
    runInApp(i);
  });
  root.querySelectorAll('[data-wizard]').forEach(b => b.onclick = () => openWizard(b.dataset.wizard));
}

/* The blocked-insight drawer: honest about what rail it is waiting on, with the
   customer-safe reason (staff attribution stripped). */
function openBlockedDrawer(i) {
  openDrawer('Why this is blocked', `
    <p class="dr-lead">${esc(i.title)}</p>
    <div class="dr-block">
      <h4>What it needs before it can ship</h4>
      <p>${esc(customerBlockedReason(i.blockedBy))}</p>
    </div>
    <div class="dr-block">
      <h4>What it would read</h4>
      <p>${esc(i.reads)}</p>
    </div>
    <div class="dr-block">
      <h4>What it found in your data</h4>
      <p>${esc(i.evidence)}</p>
    </div>
    <p class="dr-note">We are showing this card so the shape is reviewable, but it will not act until the rails behind it are real.</p>`);
}

/* The insurance precursor. Stephen: ask before you advise. Answering it unlocks
   the cover insight gated behind it. */
function openPrecursor(i) {
  openDrawer('Tell us what you own', `
    <p class="dr-lead">We will not guess at your cover. Answer these and we can tell you where you are exposed.</p>
    <div class="ask">
      <span class="ask-q">Do you own a car?</span>
      <div class="ask-a"><button class="btn btn-ghost btn-sm" data-ask="car" data-v="1">Yes</button><button class="btn btn-ghost btn-sm" data-ask="car" data-v="0">No</button></div>
    </div>
    <div class="ask">
      <span class="ask-q">Do you own a home?</span>
      <div class="ask-a"><button class="btn btn-ghost btn-sm" data-ask="home" data-v="1">Yes</button><button class="btn btn-ghost btn-sm" data-ask="home" data-v="0">No</button></div>
    </div>
    <button class="btn btn-primary btn-block" id="ask-save" disabled>Save my answers</button>
    <p class="dr-note">Until you answer, we say nothing about your cover. Tara shows options and never gives financial advice.</p>`);

  const picked = {};
  $('#drawer-bd').querySelectorAll('[data-ask]').forEach(btn => btn.onclick = () => {
    const k = btn.dataset.ask;
    $('#drawer-bd').querySelectorAll(`[data-ask="${k}"]`).forEach(x => x.classList.remove('picked'));
    btn.classList.add('picked');
    picked[k] = btn.dataset.v === '1';
    $('#ask-save').disabled = !('car' in picked && 'home' in picked);
  });
  $('#ask-save').onclick = () => {
    DATA.insurance.ownsCar = picked.car;
    DATA.insurance.ownsHome = picked.home;
    closeDrawer();
    toast(picked.car ? 'Thanks. We can look at your car cover now.' : 'Thanks. Noted.');
    refresh(); render();
  };
}

/* BUDGETING. The live budget dashboard, cut down to what the insights need to
   sit inside: income, the funded bars, and the Needs / Wants / Savings labels
   Patrick supplied. The two wizards Stephen asked for hang off the cards. */
MODULE_CHROME.budgeting = () => {
  const b = DATA.budget;
  const budgeted = b.reduce((s, c) => s + c.budget, 0);
  const spent = b.reduce((s, c) => s + c.spent, 0);
  const left = budgeted - spent;
  const byType = t => b.filter(c => c.type === t).reduce((s, c) => s + c.spent, 0);
  const withAlerts = b.filter(c => c.alerts.length).length;

  return `
    <p class="page-sub">${money(spent)} of ${money(budgeted)} spent. ${money(left)} left this month.</p>

    <div class="stat-row">
      <div class="stat"><span class="stat-l">Income</span><span class="stat-n">${money(DATA.income.expected)}</span></div>
      <div class="stat"><span class="stat-l">Budgeted</span><span class="stat-n">${money(budgeted)}</span></div>
      <div class="stat"><span class="stat-l">Spent</span><span class="stat-n stat-amber">${money(spent)}</span></div>
      <div class="stat"><span class="stat-l">Left</span><span class="stat-n ${left < 0 ? 'stat-red' : ''}">${money(left)}</span></div>
      <div class="stat"><span class="stat-l">Alerts set</span><span class="stat-n">${withAlerts} of ${b.length}</span></div>
    </div>

    <div class="nws">
      ${['Need', 'Want', 'Savings & Investments'].map(t => `
        <div class="nws-b">
          <span class="nws-l">${t}</span>
          <strong>${money(byType(t))}</strong>
        </div>`).join('')}
    </div>

    <h3 class="sect-h">Your categories</h3>
    <div class="cat-list">
      ${b.map(c => {
        const pct = c.budget ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : 0;
        const over = c.spent > c.budget;
        return `
          <div class="cat">
            <div class="cat-top">
              <span class="cat-nm">${c.name}</span>
              ${c.type ? `<span class="chip chip-${c.type === 'Need' ? 'inapp' : c.type === 'Want' ? 'todo' : 'wizard'}">${c.type}</span>` : ''}
              ${c.alerts.length ? `<span class="cat-alert">Alerts ${c.alerts.join(', ')}%</span>` : '<span class="cat-noalert">No alert</span>'}
              <span class="cat-nums">${money(c.spent)} of ${money(c.budget)}</span>
            </div>
            <div class="cat-bar"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></div>
          </div>`;
      }).join('')}
    </div>`;
};

/* GOALS. Stephen moved the Needs / Wants insight here: "suggest this insight
   sits in the Goals section, when they are setting a goal and need to find some
   savings (they can trim from Wants)." So the goals it can fund are shown. */
MODULE_CHROME.goals = () => {
  const gs = DATA.goals;
  const totalTarget = gs.reduce((s, g) => s + g.target, 0);
  const achieved = gs.filter(g => g.pct >= 100).length;
  const dateLabel = d => d ? new Date(d + '-01T00:00:00').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : '-';
  return `
    <div class="v-card plan-card">
      <div><strong class="plan-h">Plan toward a goal</strong><div class="v-note">Choose a goal, set a timeframe, and map the path to get there. Takes about 60 seconds.</div></div>
      <button class="btn btn-primary" id="g-create">+ Create a goal</button>
    </div>
    <div class="stat-row">
      <div class="stat"><span class="stat-l">Active goals</span><span class="stat-n">${gs.length}</span></div>
      <div class="stat"><span class="stat-l">Achieved</span><span class="stat-n">${achieved}</span></div>
      <div class="stat"><span class="stat-l">Total target</span><span class="stat-n">${money(totalTarget)}</span></div>
    </div>
    ${gs.map(g => {
      const onTrack = g.monthly > 0;
      const status = g.pct >= 100 ? 'Achieved' : onTrack ? 'On track' : 'Needs a plan';
      return `<div class="g-card">
        <div class="g-top"><span class="g-nm">${esc(g.name)}</span><span class="g-status ${onTrack || g.pct >= 100 ? '' : 'g-status-off'}">${status}</span></div>
        <div class="pbar"><i style="width:${g.pct}%"></i></div>
        <div class="g-pct">${g.pct}% completed</div>
        <div class="g-fields">
          <div class="g-f"><span class="gf-l">Invested</span><span class="gf-v pos">${money(g.saved)}</span></div>
          <div class="g-f"><span class="gf-l">Target</span><span class="gf-v">${money(g.target)}</span></div>
          <div class="g-f"><span class="gf-l">Target date</span><span class="gf-v">${dateLabel(g.targetDate)}</span></div>
          <div class="g-f"><span class="gf-l">Installment</span><span class="gf-v">${g.monthly ? money(g.monthly) : '-'}</span></div>
          <div class="g-f"><span class="gf-l">Interval</span><span class="gf-v">Monthly</span></div>
          <div class="g-f"><span class="gf-l">Pace</span><span class="gf-v">${onTrack ? 'On track' : '-'}</span></div>
        </div>
      </div>`;
    }).join('')}`;
};
MODULE_WIRE.goals = v => {
  const b = v.querySelector('#g-create');
  if (b) b.onclick = () => goalFlow({ id: 'manual-goal' }, { lead: 'Create a goal and map the path to it.', name: '', target: 10000, monthly: 500 });
};

/* INSURANCE. The precursor card must be answered before any cover advice runs,
   so the module shows what we know and, honestly, what we have not asked. */
MODULE_CHROME.insurance = () => {
  const ins = DATA.insurance;
  return `
    <p class="page-sub">${ins.policies.length} policies. We do not guess at what you own.</p>
    <div class="stat-row">
      <div class="stat"><span class="stat-l">Policies</span><span class="stat-n">${ins.policies.length}</span></div>
      <div class="stat"><span class="stat-l">Monthly premiums</span><span class="stat-n">${money(ins.policies.reduce((s, p) => s + p.premium, 0))}</span></div>
      <div class="stat"><span class="stat-l">Do you own a car?</span><span class="stat-n stat-amber">${ins.ownsCar === null ? 'Not asked' : ins.ownsCar ? 'Yes' : 'No'}</span></div>
      <div class="stat"><span class="stat-l">Do you own a home?</span><span class="stat-n stat-amber">${ins.ownsHome === null ? 'Not asked' : ins.ownsHome ? 'Yes' : 'No'}</span></div>
    </div>
    <h3 class="sect-h">Your policies</h3>
    <div class="debt-grid">
      ${ins.policies.map(p => `
        <div class="debt-c">
          <div class="debt-c-top"><span class="debt-c-nm">${p.type}</span></div>
          <span class="debt-c-kind">${p.insurer}, since ${new Date(p.since).getFullYear()}</span>
          <div class="debt-c-nums">
            <div><span>Premium</span><strong>${money(p.premium)}/mo</strong></div>
            <div><span>Cover</span><strong>${money(p.cover)}</strong></div>
          </div>
        </div>`).join('')}
    </div>`;
};

/* ---------------- wizards (Stephen's ask on budgeting 1 and 2) ---------------- */
function openWizard(which) {
  if (which === 'alerts') {
    const noAlerts = DATA.budget.filter(c => c.budget > 0 && !c.alerts.length);
    openModal('Set up spending alerts', `
      <p class="wz-lead">You have ${noAlerts.length} categories with a budget and no alert on them. Alerts warn you before you go over, not after.</p>
      <div class="wz-pick">
        <span class="wz-lbl">Warn me at</span>
        <div class="wz-chips">
          <button class="wz-chip on" data-pct="50">50%</button>
          <button class="wz-chip on" data-pct="80">80%</button>
          <button class="wz-chip on" data-pct="100">100%</button>
          <input class="wz-custom" id="wz-custom" type="number" min="1" max="100" placeholder="Custom %">
        </div>
      </div>
      <div class="wz-list">
        ${noAlerts.map(c => `<label class="wz-row"><input type="checkbox" checked data-cat="${c.id}"><span>${c.name}</span><em>${money(c.spent)} of ${money(c.budget)}</em></label>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" id="wz-save">Turn on alerts</button>`);
    $('#modal-bd').querySelectorAll('.wz-chip').forEach(c => c.onclick = () => c.classList.toggle('on'));
    $('#wz-save').onclick = () => {
      const pcts = [...$('#modal-bd').querySelectorAll('.wz-chip.on')].map(c => +c.dataset.pct);
      const custom = +$('#wz-custom').value;
      if (custom > 0 && custom <= 100 && !pcts.includes(custom)) pcts.push(custom);
      const cats = [...$('#modal-bd').querySelectorAll('[data-cat]:checked')].map(c => c.dataset.cat);
      // An alert with no threshold is not an alert. Refuse to save an empty one.
      if (!pcts.length) { toast('Pick at least one threshold to alert at'); return; }
      if (!cats.length) { toast('Pick at least one category'); return; }
      const sorted = pcts.sort((a, b) => a - b);
      cats.forEach(id => { const c = DATA.budget.find(x => x.id === id); if (c) c.alerts = sorted.slice(); });
      closeModal();
      toast(`Alerts on for ${cats.length} categor${cats.length > 1 ? 'ies' : 'y'} at ${sorted.join(', ')}%`);
      refresh(); render();
    };
  }

  if (which === 'budget') {
    const unreal = DATA.budget.filter(c => c.sixMonthAverage > c.budget * 1.4 && c.budget > 0);
    openModal('Set your budgets to what you actually spend', `
      <p class="wz-lead">These budgets are well below your six-month average. A budget you break every month stops being useful.</p>
      <div class="wz-list">
        ${unreal.map(c => `
          <div class="wz-row wz-row-b">
            <span>${c.name}</span>
            <em>now ${money(c.budget)} &middot; average ${money(c.sixMonthAverage)}</em>
            <input type="number" data-bud="${c.id}" value="${Math.round(c.sixMonthAverage)}">
          </div>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" id="wz-save2">Save these budgets</button>`);
    $('#wz-save2').onclick = () => {
      const rows = [...$('#modal-bd').querySelectorAll('[data-bud]')];
      // A blank or negative budget is not a budget. Clamp before saving so no
      // category can end up as RNaN or a negative number.
      const bad = rows.filter(r => r.value === '' || isNaN(+r.value) || +r.value < 0);
      if (bad.length) { toast('Enter a budget of zero or more for every category'); bad[0].focus(); return; }
      rows.forEach(r => { const c = DATA.budget.find(x => x.id === r.dataset.bud); if (c) c.budget = Math.round(+r.value); });
      closeModal();
      toast(`${rows.length} budget${rows.length > 1 ? 's' : ''} updated`);
      refresh(); render();
    };
  }
}

/* ---------------- Tara ---------------- */
function openTara() {
  const open = Store.open();
  const all = State.insights;                               // same basis as the Insights page
  const live = all.filter(i => i.status !== 'blocked');
  const needYou = live.filter(i => i.action === 'todo').length;
  const taraCan = live.filter(i => i.action !== 'todo').length;
  const blocked = all.length - live.length;
  const oldest = open.length ? esc(open[open.length - 1].text) : '';
  openDrawer('Tara', `
    <div class="tara-hd">
      <img src="assets/img/tara-advisor.png" alt="">
      <div>
        <strong>Tara</strong>
        <span>Your financial advisor</span>
      </div>
    </div>
    <p class="dr-lead">I have read your ${DATA.accounts.length} accounts, ${DATA.tx.length} transactions this month, ${DATA.debts.length} debts and ${DATA.insurance.policies.length} policies.</p>
    <div class="dr-block">
      <h4>What I found</h4>
      <p>${all.length} things worth your attention. ${needYou} need you to do something off platform, so they belong on your to-do list. ${taraCan} I can handle here${blocked ? `, and ${blocked} are still waiting on rails we do not have yet` : ''}.</p>
    </div>
    <div class="dr-block">
      <h4>Your list</h4>
      <p>${open.length ? `${open.length} open item${open.length > 1 ? 's' : ''}. Oldest: "${oldest}"` : 'Nothing on it yet.'}</p>
    </div>
    <a class="btn btn-primary btn-block" href="#/insights" onclick="closeDrawer()">See all insights</a>
    <p class="dr-note">I show you options and I never give financial advice.</p>`);
}

/* ---------------- views ---------------- */
function viewInsights() {
  const v = $('#view');
  const live = State.insights.filter(i => i.status !== 'blocked');
  const blocked = State.insights.filter(i => i.status === 'blocked');
  /* Marko's DEV note: "at most the best three current-month signals".
     Forty-nine cards is not insight, it is noise. Lead with three. */
  const best = State.filter === 'all' ? live.slice(0, 3) : [];
  const rest = State.insights.filter(i => !best.includes(i));

  const shown = State.filter === 'all' ? rest
    : State.filter === 'todo' ? rest.filter(i => i.action === 'todo')
    : State.filter === 'tara' ? rest.filter(i => i.action !== 'todo')
    : rest.filter(i => i.module === State.filter);

  /* One consistent basis for every count on this page and in Tara.
     total = everything firing. needYou = actionable off-platform (todo AND not
     blocked, so it has a real Add button). taraCan = on-platform AND not blocked.
     blocked = shaped but not actionable. needYou + taraCan + blocked = total. */
  const total = State.insights.length;
  const needYou = live.filter(i => i.action === 'todo').length;
  const taraCan = live.filter(i => i.action !== 'todo').length;

  v.innerHTML = `
    <div class="page-head">
      <h1>Insights</h1>
    </div>
    <p class="page-sub">${total} insights from your real data. ${needYou} need you, ${taraCan} Tara can handle, ${blocked.length} waiting on rails.</p>

    <section class="best">
      <div class="best-hd">
        <img src="assets/img/tara-advisor.png" alt="">
        <div>
          <span class="best-eyebrow">Tara</span>
          <h2>Your best next steps</h2>
        </div>
        <span class="best-count">${Store.open().length} on your list</span>
      </div>
      <div class="best-grid" id="best-grid"></div>
    </section>

    <h3 class="sect-h">Everything else</h3>

    <div class="ins-summary">
      <div class="sum">
        <span class="sum-n">${needYou}</span>
        <span class="sum-l">need you<em>they go to your to-do list</em></span>
      </div>
      <div class="sum">
        <span class="sum-n">${taraCan}</span>
        <span class="sum-l">Tara can do<em>handled on platform</em></span>
      </div>
      <div class="sum">
        <span class="sum-n">${Store.open().length}</span>
        <span class="sum-l">on your list<em><a href="#/todo">open the list</a></em></span>
      </div>
    </div>

    <div class="filters" id="filters">
      <button class="f ${State.filter === 'all' ? 'on' : ''}" data-f="all">All ${total}</button>
      <button class="f ${State.filter === 'todo' ? 'on' : ''}" data-f="todo">To-do</button>
      <button class="f ${State.filter === 'tara' ? 'on' : ''}" data-f="tara">Tara does it</button>
      ${MODULES.filter(m => State.insights.some(i => i.module === m.id))
        .map(m => `<button class="f ${State.filter === m.id ? 'on' : ''}" data-f="${esc(m.id)}">${esc(m.label)}</button>`).join('')}
    </div>

    <div class="ins-grid" id="grid"></div>`;

  const bestGrid = $('#best-grid');
  if (best.length) {
    best.forEach(i => bestGrid.appendChild(insightCard(i)));
    wireCards(bestGrid);
  } else {
    document.querySelector('.best').remove();
  }

  const grid = $('#grid');
  if (!shown.length) {
    grid.innerHTML = `<div class="empty">
      <div class="empty-ic">💡</div>
      <h3>You're all caught up!</h3>
      <p>Check back later for new insights!</p>
    </div>`;
  } else {
    shown.forEach(i => grid.appendChild(insightCard(i)));
    wireCards(grid);
  }
  $('#filters').querySelectorAll('.f').forEach(b => b.onclick = () => { State.filter = b.dataset.f; render(); });
}

/* Sort a task set by the chosen key. Due sorts undated last; Priority sorts the
   engine's own ranking first; Added sorts most-recent first. */
function sortTasks(arr, key) {
  const a = arr.slice();
  if (key === 'priority') a.sort((x, y) => (x.priority || 5) - (y.priority || 5) || (x.due || '9') < (y.due || '9') ? -1 : 1);
  else if (key === 'added') a.sort((x, y) => (y.added || '') < (x.added || '') ? -1 : 1);
  else a.sort((x, y) => (x.due || '9999') < (y.due || '9999') ? -1 : (x.due || '9999') > (y.due || '9999') ? 1 : (x.priority || 5) - (y.priority || 5));
  return a;
}

/* Which modules actually have a task right now, so the module filter only offers
   real options and never a dead choice. */
function todoModules() {
  const ids = [...new Set(Store.items.filter(t => t.module).map(t => t.module))];
  return ids.map(id => MODULES.find(m => m.id === id)).filter(Boolean);
}

function viewTodo() {
  const v = $('#view');
  const tv = State.todoView;
  const q = tv.q.trim().toLowerCase();
  const modMatch = t => tv.module === 'all' || t.module === tv.module;
  const qMatch = t => !q || (t.text || '').toLowerCase().includes(q)
    || (t.why || '').toLowerCase().includes(q)
    || ((MODULES.find(m => m.id === t.module) || {}).label || '').toLowerCase().includes(q);
  const filtered = t => modMatch(t) && qMatch(t);

  const open = Store.open().filter(filtered);
  const done = Store.doneItems().filter(filtered);
  const archived = Store.archivedItems().filter(filtered);
  const overdue = open.filter(t => t.due && dayDiff(t.due) < 0);
  const isFiltering = q || tv.status !== 'all' || tv.module !== 'all';
  const counts = { open: open.length, done: done.length, archived: archived.length };

  /* The working set for the flat view depends on the status tab. */
  const setFor = { all: open, open: open, overdue: overdue, done: done, archived: archived }[tv.status] || open;

  const mods = todoModules();
  const statusTabs = [
    ['all', 'All open', counts.open],
    ['overdue', 'Overdue', overdue.length],
    ['done', 'Done', counts.done],
    ['archived', 'Archived', counts.archived],
  ];

  const listHtml = (() => {
    // Default view: open items grouped into urgency buckets, then Done + Archived.
    if (tv.status === 'all' && !q && tv.module === 'all') {
      if (!open.length) {
        return (done.length || archived.length) ? `
          <div class="empty empty-slim">
            <div class="empty-ic">✓</div>
            <h3>All done</h3>
            <p>You have cleared everything on your list. Nicely done.</p>
            <a class="btn btn-primary" href="#/insights">See your insights</a>
          </div>` + doneBlock(done) + archivedBlock(archived)
          : `
          <div class="empty">
            <div class="empty-ic">✓</div>
            <h3>Nothing to do yet</h3>
            <p>When an insight needs you to act, it lands here. Add one from Insights, or type your own above.</p>
            <a class="btn btn-primary" href="#/insights">See your insights</a>
          </div>`;
      }
      const buckets = BUCKETS.map(bk => {
        const rows = sortTasks(open.filter(bk.test), tv.sort);
        if (!rows.length) return '';
        return `<h4 class="todo-h ${bk.id === 'over' ? 'todo-h-over' : ''}">${bk.label} <span>${rows.length}</span></h4>
                <div>${rows.map(todoRow).join('')}</div>`;
      }).join('');
      return buckets + doneBlock(done) + archivedBlock(archived);
    }
    // Filtered / status view: a single flat, sorted list.
    const rows = sortTasks(setFor, tv.sort);
    if (!rows.length) {
      return `<div class="empty empty-slim"><div class="empty-ic">🔍</div><h3>No tasks match</h3>
        <p>${isFiltering ? 'Try a different filter or search.' : 'Nothing here yet.'}</p>
        <button class="btn btn-ghost" id="td-clear">Clear filters</button></div>`;
    }
    return `<div>${rows.map(todoRow).join('')}</div>`;
  })();

  v.innerHTML = `
    <div class="page-head">
      <h1>To-Do</h1>
      <span class="chip-beta">New</span>
    </div>
    <p class="page-sub">One list. Everything Tara cannot do for you lands here, from every part of the app.</p>

    <div class="todo-add">
      <input id="td-new" placeholder="Add something yourself" aria-label="Add a to-do">
      <button class="btn btn-primary" id="td-add">Add</button>
    </div>

    <div class="todo-tools">
      <div class="td-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input id="td-q" placeholder="Search your tasks" aria-label="Search tasks" value="${esc(tv.q)}">
        ${tv.q ? `<button class="td-q-x" id="td-q-x" aria-label="Clear search">✕</button>` : ''}
      </div>
      <div class="td-tabs" role="tablist">
        ${statusTabs.map(([id, label, n]) => `<button class="td-tab ${tv.status === id ? 'on' : ''}" data-status="${id}" role="tab">${label} <span>${n}</span></button>`).join('')}
      </div>
      <div class="td-selects">
        <label class="td-sel">Module
          <select id="td-mod-filter" aria-label="Filter by module">
            <option value="all">All modules</option>
            ${mods.map(m => `<option value="${m.id}" ${tv.module === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
          </select>
        </label>
        <label class="td-sel">Sort
          <select id="td-sort" aria-label="Sort tasks">
            <option value="due" ${tv.sort === 'due' ? 'selected' : ''}>Due date</option>
            <option value="priority" ${tv.sort === 'priority' ? 'selected' : ''}>Priority</option>
            <option value="added" ${tv.sort === 'added' ? 'selected' : ''}>Recently added</option>
          </select>
        </label>
      </div>
    </div>

    <div class="todo-wrap">${listHtml}</div>`;

  $('#td-add').onclick = () => {
    const val = $('#td-new').value;
    if (!val.trim()) { toast('Type something to add first'); $('#td-new').focus(); return; }
    Store.addManual(val); $('#td-new').value = ''; render();
  };
  $('#td-new').onkeydown = e => { if (e.key === 'Enter') $('#td-add').click(); };

  const qBox = $('#td-q');
  qBox.oninput = () => { State.todoView.q = qBox.value; renderTodoKeepFocus(); };
  if ($('#td-q-x')) $('#td-q-x').onclick = () => { State.todoView.q = ''; render(); };
  if ($('#td-clear')) $('#td-clear').onclick = () => { State.todoView = { q: '', status: 'all', module: 'all', sort: 'due' }; render(); };
  v.querySelectorAll('[data-status]').forEach(b => b.onclick = () => { State.todoView.status = b.dataset.status; render(); });
  $('#td-mod-filter').onchange = e => { State.todoView.module = e.target.value; render(); };
  $('#td-sort').onchange = e => { State.todoView.sort = e.target.value; render(); };
  wireTodo(v);
}

/* Re-render the list without losing the search box focus/caret. */
function renderTodoKeepFocus() {
  const active = document.activeElement === $('#td-q');
  const caret = active ? $('#td-q').selectionStart : null;
  viewTodo();
  if (active && $('#td-q')) { $('#td-q').focus(); try { $('#td-q').setSelectionRange(caret, caret); } catch (e) {} }
  paintBadges();
}

function doneBlock(done) {
  if (!done.length) return '';
  return `
    <details class="todo-done-wrap" ${done.length <= 3 ? 'open' : ''}>
      <summary class="todo-h todo-h-done">Done <span>${done.length}</span></summary>
      <div>${done.map(todoRow).join('')}</div>
    </details>`;
}
function archivedBlock(arch) {
  if (!arch.length) return '';
  return `
    <details class="todo-done-wrap todo-arch-wrap">
      <summary class="todo-h todo-h-arch">Dismissed <span>${arch.length}</span></summary>
      <div>${arch.map(todoRow).join('')}</div>
    </details>`;
}

function todoRow(t) {
  const mod = MODULES.find(m => m.id === t.module);
  const due = dueLabel(t.due);
  const pr = prMeta(t.priority);
  const modTag = mod
    ? `<a class="td-mod" href="#/${t.module}" title="Open ${esc(mod.label)}">${esc(mod.label)} ↗</a>`
    : `<span class="td-mod td-mod-own">Added by you</span>`;
  const stamp = t.archived
    ? `<span class="td-stamp">Dismissed ${fmtStamp(t.archivedAt)}</span>`
    : t.done && t.doneAt ? `<span class="td-stamp">Done ${fmtStamp(t.doneAt)}</span>` : '';

  const controls = t.archived
    ? `<button class="td-btn" data-restore="${t.id}" aria-label="Restore">↩ Restore</button>
       <button class="td-x" data-del="${t.id}" aria-label="Delete permanently">✕</button>`
    : `<label class="td-due ${due.cls}">
         <span>${due.text}</span>
         <input type="date" value="${t.due || ''}" data-due="${t.id}" aria-label="Due date">
       </label>
       <button class="td-icon" data-edit="${t.id}" aria-label="Edit task" title="Edit">✎</button>
       <button class="td-icon" data-arch="${t.id}" aria-label="Dismiss task" title="Dismiss">🗙</button>
       <button class="td-x" data-del="${t.id}" aria-label="Delete task" title="Delete">✕</button>`;

  const check = t.archived
    ? `<span class="td-check td-check-off" aria-hidden="true"></span>`
    : `<button class="td-check" data-toggle="${t.id}" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}">${t.done ? '✓' : ''}</button>`;
  return `
    <div class="td ${t.done ? 'td-done' : ''} ${t.archived ? 'td-arch' : ''}">
      ${check}
      <span class="td-pr ${pr.cls}" title="${pr.label}" aria-label="${pr.label}"></span>
      <div class="td-main">
        <p class="td-text" data-text="${t.id}">${esc(t.text)}</p>
        <p class="td-why">
          ${modTag}
          ${t.why ? esc(t.why) : ''}
          ${stamp}
        </p>
        ${t.evidence ? `<details class="td-ev"><summary>Why this is here</summary><p>${esc(t.evidence)}</p></details>` : ''}
      </div>
      <div class="td-controls">${controls}</div>
    </div>`;
}

function wireTodo(root) {
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { Store.toggle(b.dataset.toggle); render(); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Store.remove(b.dataset.del); toast('Task deleted'); render(); });
  root.querySelectorAll('[data-arch]').forEach(b => b.onclick = () => { Store.archive(b.dataset.arch); toast('Task dismissed. Find it under Dismissed.'); render(); });
  root.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => { Store.restore(b.dataset.restore); toast('Task restored'); render(); });
  root.querySelectorAll('[data-due]').forEach(inp => inp.onchange = () => { Store.setDue(inp.dataset.due, inp.value); render(); });
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => startEditTask(root, b.dataset.edit));
}

/* Inline edit: swap the task text for an input, commit on Enter or blur, cancel
   on Escape. Nothing leaves the page; the outcome is immediate. */
function startEditTask(root, id) {
  const p = root.querySelector(`[data-text="${id}"]`);
  if (!p || p.querySelector('input')) return;
  const current = Store.items.find(x => x.id === id);
  const val = current ? current.text : p.textContent;
  p.innerHTML = `<input class="td-edit-in" value="${esc(val)}" aria-label="Edit task text">`;
  const inp = p.querySelector('input');
  inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  let done = false;
  const commit = save => {
    if (done) return; done = true;
    if (save && inp.value.trim()) Store.edit(id, inp.value);
    render();
  };
  inp.onkeydown = e => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); };
  inp.onblur = () => commit(true);
}

/* Short, human stamp for completion/dismissal history, from local parts. */
function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

/* A module page: the same insights, in context, where the user already is.
   `chrome` is the module's own UI, rebuilt from the live app so the insights
   land inside the surface the customer already knows. */
function viewModule(id) {
  const mod = MODULES.find(m => m.id === id);
  const mine = State.insights.filter(i => i.module === id);
  const v = $('#view');
  const chrome = MODULE_CHROME[id] ? MODULE_CHROME[id]() : '';

  v.innerHTML = `
    <div class="page-head"><h1>${mod ? mod.label : id}</h1></div>
    ${chrome}
    <h3 class="sect-h">${MODULE_CHROME[id] ? 'What Tara found here' : 'Insights'}</h3>
    <div class="ins-grid" id="grid"></div>`;

  const grid = $('#grid');
  if (!mine.length) {
    grid.innerHTML = `<div class="empty"><div class="empty-ic">💡</div><h3>You're all caught up!</h3><p>Check back later for new insights!</p></div>`;
  } else {
    mine.forEach(i => grid.appendChild(insightCard(i)));
    wireCards(grid);
  }
  if (MODULE_WIRE[id]) MODULE_WIRE[id](v);
}

/* DEBT. The live page leads with stat tiles and a "Debt action centre" of next
   best actions. That action centre is where our insights belong: it already
   exists, so we feed it rather than build a second competing strip. */
MODULE_CHROME.debt = () => {
  const d = DATA.debts;
  const total = d.reduce((s, x) => s + x.balance, 0);
  const monthlyMin = d.reduce((s, x) => s + x.minPayment, 0);
  const highest = Math.max(...d.map(x => x.apr));
  const weighted = d.reduce((s, x) => s + x.apr * x.balance, 0) / total;
  const next = [...d].sort((a, b) => a.dueDay - b.dueDay)[0];

  return `
    <p class="page-sub">${money(total)} across ${d.length} debts. Highest rate ${highest}%.</p>

    <div class="stat-row">
      <div class="stat"><span class="stat-l">Total debt</span><span class="stat-n stat-red">${money(total)}</span></div>
      <div class="stat"><span class="stat-l">Monthly minimum</span><span class="stat-n stat-amber">${money(monthlyMin)}</span></div>
      <div class="stat"><span class="stat-l">Active</span><span class="stat-n">${d.length}</span></div>
      <div class="stat"><span class="stat-l">Highest rate</span><span class="stat-n stat-red">${highest}%</span></div>
      <div class="stat"><span class="stat-l">Weighted APR</span><span class="stat-n stat-blue">${weighted.toFixed(1)}%</span></div>
    </div>

    <div class="due-strip">
      <span class="due-strip-l">Next payment due</span>
      <strong>${next.name}, the ${ordinal(next.dueDay)}</strong>
      <span class="due-strip-amt">${money(next.minPayment)}</span>
    </div>

    <h3 class="sect-h">Your debts</h3>
    <div class="debt-grid">
      ${[...d].sort((a, b) => b.apr - a.apr).map(x => `
        <div class="debt-c ${x.apr >= 20 ? 'debt-c-hot' : ''}">
          <div class="debt-c-top">
            <span class="debt-c-nm">${x.name}</span>
            ${x.apr >= 20 ? '<span class="chip chip-blocked">High rate</span>' : ''}
          </div>
          <span class="debt-c-kind">${x.kind}</span>
          <div class="debt-c-nums">
            <div><span>Balance</span><strong class="stat-red">${money(x.balance)}</strong></div>
            <div><span>Interest rate</span><strong class="stat-amber">${x.apr}%</strong></div>
            <div><span>Minimum</span><strong>${money(x.minPayment)}</strong></div>
            <div><span>You pay</span><strong>${money(x.actualPayment)}</strong></div>
          </div>
          ${REVOLVING.includes(x.kind) && x.actualPayment <= x.minPayment
            ? '<p class="debt-c-note">You are paying the minimum only, so the balance barely moves.</p>' : ''}
          ${x.missedPayments ? `<p class="debt-c-note debt-c-warn">${x.missedPayments} missed payment on record.</p>` : ''}
        </div>`).join('')}
    </div>`;
};

/* Out-of-scope modules the live app has but this prototype does not build.
   Without this they silently fell back to Insights, which reads as broken. */
function viewPlaceholder(label) {
  $('#view').innerHTML = `
    <div class="page-head"><h1>${esc(label)}</h1></div>
    <div class="empty">
      <div class="empty-ic">🚧</div>
      <h3>Not part of this prototype</h3>
      <p>${esc(label)} lives in the live Vault22 app. This prototype covers Insights, the shared To-Do list, and the ten insight modules. Use the menu to get back to those.</p>
      <a class="btn btn-primary" href="#/insights">Back to Insights</a>
    </div>`;
}

/* ============================================================
   IN-APP ACTIONS. Every "Tara does it" card now leads to its real module
   surface and makes a visible change, the way the live app would. Because the
   engine is honest, mutating the data makes the insight naturally stop firing,
   which is the proof the action worked. Nothing here is a dead "done" toast.
   ============================================================ */
function go(route) { if (location.hash !== route) { navFromAction = true; location.hash = route; } }

/* A guided modal that performs a real change. onConfirm returns false to keep
   the modal open (validation), anything else closes it and re-renders the
   surface so the change is visible. */
function taraModal({ title, body, confirmLabel, onConfirm }) {
  openModal(title, `${body}<button class="btn btn-primary btn-block" id="tara-go">${confirmLabel}</button>`);
  $('#tara-go').onclick = () => { if (onConfirm() === false) return; closeModal(); refresh(); render(); };
}

/* The create-goal flow, shared by every "set a goal" card. Lands on Goals and
   the new goal appears in the list. */
function goalFlow(i, preset) {
  go('#/goals');
  taraModal({
    title: 'Create a goal',
    body: `
      <p class="wz-lead">${esc(preset.lead)}</p>
      <label class="tf"><span>What are you saving for?</span><input class="input" id="g-name" value="${esc(preset.name)}" placeholder="e.g. Emergency fund"></label>
      <label class="tf"><span>Target amount</span><input class="input" id="g-target" type="number" value="${preset.target}"></label>
      <label class="tf"><span>Target date</span><input class="input" id="g-date" type="month" value="2027-12"></label>
      <label class="tf"><span>Monthly installment</span><input class="input" id="g-monthly" type="number" value="${preset.monthly}"></label>`,
    confirmLabel: 'Create this goal',
    onConfirm: () => {
      const name = ($('#g-name').value || '').trim();
      const target = Math.round(+$('#g-target').value || 0);
      const monthly = Math.round(+$('#g-monthly').value || 0);
      const targetDate = $('#g-date').value || '';
      if (!name || target <= 0) { toast('Give the goal a name and a target'); return false; }
      DATA.goals.push({ id: 'g' + (DATA.goals.length + 1), name, target, saved: 0, pct: 0, monthly, targetDate });
      State.dismissed.push(i.id);
      toast(`Goal "${name}" created`);
    },
  });
}

/* An informational drawer that still lands you on the real surface, and offers
   the natural next step rather than dead-ending. */
function infoDrawer(i, title, inner, next) {
  go('#/' + i.module);
  openDrawer(title, `${inner}${next ? `<button class="btn btn-primary btn-block" id="dr-next">${next.label}</button>` : ''}
    <p class="dr-note">Tara does this on platform. Nothing goes on your to-do list.</p>`);
  if (next) $('#dr-next').onclick = () => { closeDrawer(); next.run(); };
}

function runInApp(i) {
  switch (i.id) {

    /* ---- set a goal (Financial Fitness, dashboard) ---- */
    case 'fit-2': return goalFlow(i, { lead: `Your weakest area is ${DATA.fitness.weakest.toLowerCase()}. One goal moves it the most.`, name: `Lift my ${DATA.fitness.weakest.toLowerCase()}`, target: 20000, monthly: 1000 });
    case 'fit-3': return goalFlow(i, { lead: 'A savings goal is what pushes your savings rate past 15%.', name: 'Build my savings', target: 30000, monthly: 1500 });
    case 'fit-5': return goalFlow(i, { lead: `Closing the ${DATA.fitness.peerAverage - DATA.fitness.score}-point gap to your peers starts here.`, name: 'Close the peer gap', target: 25000, monthly: 1200 });

    case 'fit-1': {
      const parts = Object.entries(DATA.fitness.components).sort((a, b) => a[1] - b[1]);
      return infoDrawer(i, 'The one thing that helps most',
        `<p class="dr-lead">Your weakest area is ${esc(DATA.fitness.weakest.toLowerCase())}. Fix it and the score moves the most.</p>
         <div class="dr-block"><h4>Your score, part by part</h4><p>${parts.map(([k, v]) => `${esc(k)}: ${v}/100`).join('<br>')}</p></div>`,
        { label: `Set a goal to fix ${esc(parts[0][0])}`, run: () => goalFlow(i, { lead: `A goal to lift your ${parts[0][0]} score.`, name: `Improve ${parts[0][0]}`, target: 20000, monthly: 1000 }) });
    }

    case 'dash-1': {
      const c = DATA.profile.netWorthChange;
      return infoDrawer(i, 'What changed this month',
        `<p class="dr-lead">Your net worth is up ${money(c.total)}.</p>
         <div class="dr-block"><h4>Where it came from</h4><p>${money(c.fromInvestments)} from your investments moving, ${money(c.fromSaving)} from what you put away.</p></div>`,
        { label: 'Turn this into a goal', run: () => goalFlow(i, { lead: 'Lock in the momentum with a goal.', name: 'Grow my net worth', target: 50000, monthly: 2000 }) });
    }

    case 'dash-4':
      return infoDrawer(i, 'Where your money is going',
        `<p class="dr-lead">${esc(i.body)}</p><div class="dr-block"><h4>The numbers</h4><p>${esc(i.evidence)}</p></div>`,
        { label: 'See how to close the gap', run: () => go('#/fitness') });

    case 'dash-3':
      go('#/dashboard');
      return taraModal({
        title: 'Complete your profile',
        body: `<p class="wz-lead">One detail is missing: a profile picture. Adding it unlocks the last insights.</p>
               <label class="tf"><span>Display name</span><input class="input" id="p-name" value="${esc(DATA.profile.name)}"></label>
               <p class="dr-note">In the live app this opens your device photo picker.</p>`,
        confirmLabel: 'Mark profile complete',
        onConfirm: () => { DATA.profile.profileComplete = 100; toast('Profile complete. New insights unlocked.'); },
      });

    /* ---- investments ---- */
    case 'inv-1': {
      go('#/investments');
      const src = DATA.accounts.filter(a => a.type === 'Bank' && a.active).sort((a, b) => b.balance - a.balance)[0];
      return taraModal({
        title: 'Open an investment account',
        body: `<p class="wz-lead">${money(DATA.investments.idleCash)} is sitting in everyday accounts earning nothing. Move some into an investment where it can grow.</p>
               <label class="tf"><span>How much to invest</span><input class="input" id="iv-amt" type="number" value="10000"></label>
               <label class="tf"><span>Into</span><select class="input" id="iv-fund"><option>Global Balanced Fund of Funds</option><option>Vault22 SA Savings</option><option>Conservative Portfolio</option></select></label>
               <label class="tf"><span>Repeat each month</span><input class="input" id="iv-mo" type="number" value="1000"></label>
               <p class="dr-note">Taken from your ${esc(src ? src.name : 'everyday account')}.</p>`,
        confirmLabel: 'Open the account',
        onConfirm: () => {
          const amt = Math.round(+$('#iv-amt').value || 0), mo = Math.round(+$('#iv-mo').value || 0), fund = $('#iv-fund').value;
          if (amt <= 0) { toast('Enter an amount to invest'); return false; }
          if (src) src.balance -= amt;
          const h = DATA.investments.holdings.find(x => x.name === fund);
          if (h) h.value += amt; else DATA.investments.holdings.push({ name: fund, value: amt, fee: 0.85, target: 0 });
          DATA.investments.totalValue += amt;
          DATA.investments.monthlyContribution = mo;
          DATA.investments.idleCash = DATA.accounts.filter(a => a.type === 'Bank' && a.active).reduce((s, a) => s + a.balance, 0);
          toast(`${money(amt)} invested into ${fund}`);
        },
      });
    }

    case 'inv-2':
    case 'inv-5': {
      go('#/investments');
      const total = DATA.investments.holdings.reduce((s, h) => s + h.value, 0);
      return taraModal({
        title: i.id === 'inv-5' ? 'Spread it out' : 'Rebalance to your target',
        body: `<p class="wz-lead">Your mix has drifted from the target you set. Bring it back so your risk stays where you meant it.</p>
               <div class="wz-list">${DATA.investments.holdings.map(h => `<div class="wz-row"><span>${esc(h.name)}</span><em>${Math.round(h.value / total * 100)}% now, target ${h.target}%</em></div>`).join('')}</div>`,
        confirmLabel: 'Rebalance now',
        onConfirm: () => {
          const tsum = DATA.investments.holdings.reduce((s, h) => s + (h.target || 0), 0) || 100;
          DATA.investments.holdings.forEach(h => { h.value = Math.round(total * ((h.target || 0) / tsum)); });
          toast('Portfolio rebalanced to your target');
        },
      });
    }

    case 'inv-4': {
      go('#/investments');
      const pricey = DATA.investments.holdings.filter(h => h.fee > 1.5).sort((a, b) => b.fee - a.fee)[0];
      const cheapest = [...DATA.investments.holdings].sort((a, b) => a.fee - b.fee)[0];
      return taraModal({
        title: 'Switch to a cheaper fund',
        body: `<p class="wz-lead">${esc(pricey.name)} charges ${pricey.fee}% a year. ${esc(cheapest.name)} charges ${cheapest.fee}%. Switching keeps more of your money working.</p>`,
        confirmLabel: `Switch to ${cheapest.fee}% fees`,
        onConfirm: () => { pricey.fee = cheapest.fee; toast(`${pricey.name} moved to ${cheapest.fee}% fees`); },
      });
    }

    /* ---- accounts and marketplace: move idle cash to a better rate ---- */
    case 'acc-1':
    case 'mkt-2': {
      go('#/' + i.module);
      const idle = DATA.accounts.filter(a => a.type === 'Savings' && a.interestRate < 1 && a.balance > 50000)[0];
      const better = DATA.marketplace.betterSavingsRate;
      if (!idle) { toast('That cash has already been moved'); State.dismissed.push(i.id); refresh(); return render(); }
      return taraModal({
        title: 'Move your cash to a better rate',
        body: `<p class="wz-lead">${esc(idle.name)} pays ${idle.interestRate}%. ${esc(better.name)} pays ${better.rate}%. Move it across and it earns more from day one.</p>
               <label class="tf"><span>How much to move</span><input class="input" id="mv-amt" type="number" value="${idle.balance}"></label>`,
        confirmLabel: 'Move the money',
        onConfirm: () => {
          const amt = Math.min(Math.round(+$('#mv-amt').value || 0), idle.balance);
          if (amt <= 0) { toast('Enter an amount to move'); return false; }
          idle.balance -= amt;
          let dest = DATA.accounts.find(a => a.name === better.name);
          if (dest) dest.balance += amt;
          else DATA.accounts.push({ id: 'a' + (DATA.accounts.length + 1), name: better.name, type: 'Savings', balance: amt, interestRate: better.rate, monthlyFee: 0, lastUpdated: '2026-07-14', active: true });
          toast(`${money(amt)} moved to ${better.name}`);
        },
      });
    }

    case 'acc-4': {
      go('#/accounts');
      const sav = DATA.accounts.filter(a => a.type === 'Savings');
      return taraModal({
        title: 'Bring your savings together',
        body: `<p class="wz-lead">Your savings are split across ${sav.length} accounts. Combine them into the best one so they earn more and are easier to see.</p>
               <div class="wz-list">${sav.map(a => `<div class="wz-row"><span>${esc(a.name)}</span><em>${money(a.balance)} at ${a.interestRate}%</em></div>`).join('')}</div>`,
        confirmLabel: 'Combine into the best one',
        onConfirm: () => {
          const best = sav.slice().sort((a, b) => b.interestRate - a.interestRate)[0];
          const totalBal = sav.reduce((s, a) => s + a.balance, 0);
          DATA.accounts = DATA.accounts.filter(a => a.type !== 'Savings' || a.id === best.id);
          best.balance = totalBal;
          toast(`Savings combined into ${best.name}`);
        },
      });
    }

    /* ---- family ---- */
    case 'fam-2': {
      go('#/family');
      const o = DATA.family.overspender;
      return taraModal({
        title: `Set a limit for ${esc(o.member)}`,
        body: `<p class="wz-lead">${esc(o.member)} spent ${money(o.thisMonth)} this month against a ${money(o.average)} average. A conversation is better than a limit, but you can set one.</p>
               <label class="tf"><span>Monthly limit</span><input class="input" id="lm-amt" type="number" value="${o.average}"></label>`,
        confirmLabel: 'Set the limit',
        onConfirm: () => { o.limit = Math.round(+$('#lm-amt').value || 0); State.dismissed.push(i.id); toast(`Limit of ${money(o.limit)} set for ${o.member}`); },
      });
    }

    case 'fam-3': {
      go('#/family');
      const g = DATA.family.sharedGoal;
      return taraModal({
        title: `Top up "${esc(g.name)}"`,
        body: `<p class="wz-lead">"${esc(g.name)}" is at ${g.pct}%. Add a bit to move it along.</p>
               <label class="tf"><span>Amount to add</span><input class="input" id="tu-amt" type="number" value="500"></label>`,
        confirmLabel: 'Top it up',
        onConfirm: () => { g.pct = Math.min(100, g.pct + Math.round((+$('#tu-amt').value || 0) / 100)); State.dismissed.push(i.id); toast(`"${g.name}" is now at ${g.pct}%`); },
      });
    }

    /* ---- transactions: label with Tara ---- */
    case 'tx-2': {
      go('#/transactions');
      const uncat = DATA.tx.filter(t => t.uncategorised);
      return taraModal({
        title: 'Label these with Tara',
        body: `<p class="wz-lead">${uncat.length} transaction${uncat.length > 1 ? 's' : ''} need a category. Pick one and Tara applies it, so your budget sees the spend.</p>
               <div class="wz-list">${uncat.map(t => `<div class="wz-row"><span>${esc(t.merchant)} ${money(t.amount)}</span><select class="input" data-tx="${t.id}"><option>Tech &amp; Appliances</option><option>General Purchases</option><option>Groceries</option><option>Entertainment</option></select></div>`).join('')}</div>`,
        confirmLabel: 'Apply categories',
        onConfirm: () => {
          $('#modal-bd').querySelectorAll('[data-tx]').forEach(sel => { const t = DATA.tx.find(x => x.id === sel.dataset.tx); if (t) { t.category = sel.value; t.uncategorised = false; } });
          toast('Categories applied');
        },
      });
    }

    /* ---- budgeting ---- */
    case 'budget-3': {
      go('#/budgeting');
      const left = DATA.budget.filter(c => c.budget > 0 && c.spent < c.budget).map(c => ({ ...c, remaining: c.budget - c.spent })).sort((a, b) => b.remaining - a.remaining)[0];
      return taraModal({
        title: `${esc(left.name)} has ${money(left.remaining)} left`,
        body: `<p class="wz-lead">Carry it into next month so the room is still there, or move it to a goal before the period closes.</p>`,
        confirmLabel: 'Carry it into next month',
        onConfirm: () => { const c = DATA.budget.find(x => x.id === left.id); if (c) c.rollover = true; State.dismissed.push(i.id); toast(`${left.name} will carry ${money(left.remaining)} forward`); },
      });
    }

    case 'budget-4': {
      go('#/goals');
      const stalled = DATA.goals.filter(g => g.monthly === 0)[0];
      const wants = DATA.budget.filter(c => c.type === 'Want');
      const trimmable = wants.filter(c => c.spent > c.average).sort((a, b) => (b.spent - b.average) - (a.spent - a.average))[0];
      const trim = trimmable ? Math.round(trimmable.spent - trimmable.average) : 0;
      if (!stalled || !trimmable) { toast('Nothing to move right now'); State.dismissed.push(i.id); refresh(); return render(); }
      return taraModal({
        title: `Fund "${esc(stalled.name)}"`,
        body: `<p class="wz-lead">Move ${money(trim)} a month from ${esc(trimmable.name)} into "${esc(stalled.name)}" and adjust the budget to match.</p>`,
        confirmLabel: 'Move the money',
        onConfirm: () => { stalled.monthly = trim; const c = DATA.budget.find(x => x.id === trimmable.id); if (c) c.budget = Math.max(0, c.budget - trim); toast(`${money(trim)} a month now funding "${stalled.name}"`); },
      });
    }
  }

  /* Any in-app card without a bespoke flow still lands on its real module and
     performs, rather than dead-ending. */
  go('#/' + i.module);
  openDrawer(i.title, `
    <p class="dr-lead">${esc(i.inApp)}</p>
    <div class="dr-block"><h4>What Tara read</h4><p>${esc(i.evidence)}</p></div>
    <button class="btn btn-primary btn-block" id="dr-do">${esc(i.cta || 'Do it')}</button>
    <p class="dr-note">Tara does this on platform. Nothing goes on your to-do list.</p>`);
  $('#dr-do').onclick = () => { closeDrawer(); State.dismissed.push(i.id); refresh(); render(); toast('Done. Tara handled it.'); };
}

/* ---- module surfaces rebuilt to match the live Vault22 app (reference/shots),
   so in-app changes land in the surface the customer already knows. Home,
   Investments and My Wealth reuse the live "Total value / Total invested /
   Total profit + mini cards" pattern; Transactions the live date-grouped rows;
   Marketplace the live "Browse by category" grid. ---- */
MODULE_CHROME.dashboard = () => {
  const p = DATA.profile, inv = DATA.investments, fit = DATA.fitness;
  const savings = DATA.accounts.filter(a => a.type === 'Savings').reduce((s, a) => s + a.balance, 0);
  return `
    <div class="nw-card">
      <span class="nw-l">Net worth</span>
      <div class="nw-big">${money(p.netWorth)}</div>
      <div class="nw-split">
        <span><span class="nw-l">Savings</span><strong>${money(savings)}</strong></span>
        <span><span class="nw-l">Investments</span><strong>${money(inv.totalValue)}</strong></span>
        <span><span class="nw-l">Up, 30 days</span><strong>${money(p.netWorthChange.total)}</strong></span>
      </div>
    </div>
    <div class="two-col">
      <div class="v-card">
        <div class="v-card-hd"><h3>Profile</h3><span class="v-see">${p.profileComplete >= 100 ? 'Complete' : p.profileComplete + '% completed'}</span></div>
        <div class="pbar"><i style="width:${p.profileComplete}%"></i></div>
        ${p.profileComplete < 100 ? '<p class="v-note">Remaining: add a profile picture, 5 pts.</p>' : ''}
      </div>
      <div class="v-card">
        <div class="v-card-hd"><h3>Financial Fitness</h3><span class="v-see">${esc(fit.level)}</span></div>
        <div class="metric"><span class="m-v">${fit.score} <span class="m-l">/ ${fit.max}</span></span></div>
        <div class="pbar"><i style="width:${Math.round(fit.score / fit.max * 100)}%"></i></div>
      </div>
    </div>
    <div class="v-card">
      <div class="v-card-hd"><h3>My Investments</h3><a class="v-see" href="#/investments">See all</a></div>
      <div class="metric-row">
        <div class="metric"><span class="m-l">Total value</span><span class="m-v">${money(inv.totalValue)}</span></div>
        <div class="metric"><span class="m-l">Total invested</span><span class="m-v">${money(inv.invested)}</span></div>
        <div class="metric"><span class="m-l">Total profit</span><span class="m-v pos">${money(inv.profit)}</span></div>
      </div>
    </div>
    <div class="v-card">
      <div class="v-card-hd"><h3>Debt Overview</h3><span class="v-see">${DATA.debts.length} active</span></div>
      <div class="metric-row">
        <div class="metric"><span class="m-l">Total debt</span><span class="m-v" style="color:var(--red)">${money(DATA.debts.reduce((s, x) => s + x.balance, 0))}</span></div>
        <div class="metric"><span class="m-l">Monthly payment</span><span class="m-v">${money(DATA.debts.reduce((s, x) => s + x.actualPayment, 0))}</span></div>
      </div>
    </div>`;
};

MODULE_CHROME.investments = () => {
  const inv = DATA.investments, total = inv.holdings.reduce((s, h) => s + h.value, 0) || 1;
  return `
    <div class="v-card">
      <div class="v-card-hd"><h3>My Investments</h3><span class="v-see">${money(inv.monthlyContribution)} a month in</span></div>
      <div class="metric-row">
        <div class="metric"><span class="m-l">Total value</span><span class="m-v">${money(total)}</span></div>
        <div class="metric"><span class="m-l">Total invested</span><span class="m-v">${money(inv.invested)}</span></div>
        <div class="metric"><span class="m-l">Total profit</span><span class="m-v pos">${money(inv.profit)}</span></div>
        <div class="metric"><span class="m-l">Idle cash</span><span class="m-v" style="color:var(--amber-700)">${money(inv.idleCash)}</span></div>
      </div>
      <div class="mini-grid">
        ${inv.holdings.map(h => `<div class="mini"><div class="mini-nm">${esc(h.name)}${h.fee > 1.5 ? ' <span class="chip chip-blocked">High fee</span>' : ''}</div><div class="mini-row"><span>Total value</span><strong>${money(h.value)}</strong></div><div class="mini-row"><span>Share</span><strong>${Math.round(h.value / total * 100)}% of ${h.target}%</strong></div><div class="mini-row"><span>Fee</span><strong>${h.fee}%</strong></div></div>`).join('')}
      </div>
    </div>`;
};

MODULE_CHROME.accounts = () => {
  const a = DATA.accounts;
  const savings = a.filter(x => x.type === 'Savings').reduce((s, x) => s + x.balance, 0);
  const everyday = a.filter(x => x.type === 'Bank').reduce((s, x) => s + x.balance, 0);
  return `
    <div class="v-card">
      <div class="v-card-hd"><h3>My Wealth</h3><span class="v-see">${a.length} accounts</span></div>
      <div class="metric-row">
        <div class="metric"><span class="m-l">Total balance</span><span class="m-v">${money(a.reduce((s, x) => s + Math.max(0, x.balance), 0))}</span></div>
        <div class="metric"><span class="m-l">Savings</span><span class="m-v">${money(savings)}</span></div>
        <div class="metric"><span class="m-l">Everyday</span><span class="m-v">${money(everyday)}</span></div>
      </div>
      <div class="mini-grid">
        ${a.map(x => `<div class="mini"><div class="mini-nm">${esc(x.name)}${x.active ? '' : ' <span class="chip chip-blocked">Dormant</span>'}</div><div class="mini-row"><span>Balance</span><strong class="${x.balance < 0 ? '' : 'pos'}">${money(x.balance)}</strong></div><div class="mini-row"><span>Type</span><strong>${esc(x.type)}${x.interestRate != null ? ', ' + x.interestRate + '%' : ''}</strong></div>${x.monthlyFee ? `<div class="mini-row"><span>Fee</span><strong>${money(x.monthlyFee)} a month</strong></div>` : ''}</div>`).join('')}
      </div>
    </div>`;
};

MODULE_CHROME.marketplace = () => {
  const m = DATA.marketplace;
  const cats = [
    { t: 'Credit Cards', d: 'Find the best rewards, cashback and rates.' },
    { t: 'Savings', d: 'High-yield savings accounts to grow your money faster.' },
    { t: 'Loans', d: 'Personal and home loans with competitive rates.' },
    { t: 'Insurance', d: 'Protect what matters with the right cover.' },
    { t: 'Investments', d: 'Products to build long-term wealth.' },
    { t: 'Banking', d: 'Everyday banking and transaction accounts.' },
  ];
  /* Each recommendation is tagged with the category it belongs to and is DERIVED
     from what Tara actually found. Categories with nothing real behind them
     (Insurance, Investments) honestly show an empty state instead of inventing a
     product catalogue. */
  const recs = [
    { cat: 'Savings', nm: m.betterSavingsRate.name, rows: [['Savings rate', m.betterSavingsRate.rate + '%', true]] },
    { cat: 'Banking', nm: m.cheaperAccount.name, rows: [['Monthly fee', money(m.cheaperAccount.monthlyFee), false], ['Saves', money(m.cheaperAccount.saves) + ' a month', true]] },
    { cat: 'Loans', nm: 'Refinance ' + m.refinance.availableFor, rows: [['Rate from', m.refinance.newApr + '%', false]] },
    { cat: 'Credit Cards', nm: m.rewardsCard.name, rows: [['Back a year', money(m.rewardsCard.estimatedAnnual), true]] },
  ];
  const sel = State.mktCat;
  const shown = sel ? recs.filter(r => r.cat === sel) : recs;
  const recCards = shown.length
    ? `<div class="mini-grid">${shown.map(r => `<div class="mini"><div class="mini-nm">${esc(r.nm)}</div>${r.rows.map(([l, v, pos]) => `<div class="mini-row"><span>${esc(l)}</span><strong class="${pos ? 'pos' : ''}">${esc(v)}</strong></div>`).join('')}</div>`).join('')}</div>`
    : `<p class="tx-empty">Nothing here for you right now.</p>`;
  return `
    <div class="mkt-hd"><h2>Financial Product Marketplace</h2><p>Compare and discover financial products across all regions.</p></div>
    <div class="v-card mkt-rec">
      <div class="v-card-hd"><h3>Recommended for you${sel ? ': ' + esc(sel) : ''}</h3><span class="v-see">${sel ? '<button class="txf" id="mkt-clear">Clear filter</button>' : 'from what Tara found'}</span></div>
      ${recCards}
    </div>
    <h3 class="sect-h">Browse by category</h3>
    <div class="cat-grid">${cats.map(c => `<button class="cat-card ${c.t === sel ? 'on' : ''}" data-cat="${esc(c.t)}" aria-pressed="${c.t === sel}"><h4>${esc(c.t)}</h4><p>${esc(c.d)}</p><span class="cc-n">${c.t === sel ? 'Showing' : 'View products'}</span></button>`).join('')}</div>`;
};
MODULE_WIRE.marketplace = v => {
  v.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    State.mktCat = State.mktCat === b.dataset.cat ? null : b.dataset.cat;
    render();
  });
  const clr = v.querySelector('#mkt-clear');
  if (clr) clr.onclick = () => { State.mktCat = null; render(); };
};

MODULE_CHROME.family = () => {
  const f = DATA.family;
  return `
    <div class="v-card">
      <div class="v-card-hd"><h3>Family Circle</h3><span class="v-see">${f.members} members</span></div>
      <div class="metric-row">
        <div class="metric"><span class="m-l">Shared goal</span><span class="m-v">${f.sharedGoal.pct}%</span></div>
        <div class="metric"><span class="m-l">Will</span><span class="m-v" style="${f.hasWill ? '' : 'color:var(--amber-700)'}">${f.hasWill ? 'In place' : 'None'}</span></div>
        <div class="metric"><span class="m-l">${esc(f.overspender.member)} limit</span><span class="m-v">${f.overspender.limit ? money(f.overspender.limit) : 'None'}</span></div>
      </div>
    </div>
    <div class="v-card">
      <div class="v-card-hd"><h3>Shared spending this month</h3></div>
      <div class="mini-grid">${f.sharedSpend.map(s => `<div class="mini"><div class="mini-nm">${esc(s.member)}</div><div class="mini-row"><span>Spent</span><strong>${money(s.amount)}</strong></div></div>`).join('')}</div>
    </div>`;
};

MODULE_CHROME.transactions = () => {
  const active = State.txFilter;
  const susp = suspiciousTxIds();
  const rows = active ? DATA.tx.filter(t => TX_FILTERS[active](t, susp)) : DATA.tx.slice();
  const groups = {};
  rows.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort().reverse();
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  const chips = Object.keys(TX_FILTERS).map(f =>
    `<button class="txf ${f === active ? 'on' : ''}" data-txf="${esc(f)}" aria-pressed="${f === active}">${f}</button>`).join('');
  const list = rows.length
    ? dates.map(d => `
        <div class="tx-group">${fmt(d)}</div>
        ${groups[d].map(t => `
          <div class="tx-row">
            <span class="tx-ic"></span>
            <div class="tx-main"><div class="tx-m">${esc(t.merchant)}</div><div class="tx-tags">${esc(t.group)}${t.category ? ' &middot; ' + esc(t.category) : ''}${t.uncategorised ? ' &middot; needs a category' : ''}${t.pending ? ' &middot; pending' : ''}</div></div>
            <span class="tx-amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : '-'}${money(t.amount)}</span>
          </div>`).join('')}`).join('')
    : `<p class="tx-empty">No transactions match this filter.</p>`;
  return `<div class="tx-filters">${chips}</div>${list}`;
};
MODULE_WIRE.transactions = v => {
  v.querySelectorAll('[data-txf]').forEach(b => b.onclick = () => {
    State.txFilter = State.txFilter === b.dataset.txf ? null : b.dataset.txf;
    render();
  });
};

/* ---------------- router ---------------- */
const ROUTES = {
  '#/insights': { leaf: 'Insights', view: viewInsights },
  '#/todo': { leaf: 'To-Do', view: viewTodo },
  '#/crypto': { leaf: 'Crypto Portfolio', view: () => viewPlaceholder('Crypto Portfolio') },
  '#/updates': { leaf: 'Product Updates', view: () => viewPlaceholder('Product Updates') },
};
MODULES.forEach(m => { ROUTES['#/' + m.id] = { leaf: m.label, view: () => viewModule(m.id) }; });

function render() {
  const hash = location.hash || '#/insights';
  /* Clear any overlay on navigation, unless this navigation is an in-app action
     that is about to open its own modal/drawer. Stops a modal from being stuck
     over a page you navigated to. */
  if (!navFromAction) { closeDrawer(); closeModal(); }
  navFromAction = false;
  const r = ROUTES[hash] || ROUTES['#/insights'];
  $('#crumb-leaf').textContent = r.leaf;
  r.view();
  paintBadges();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
$('#drawer-x').onclick = closeDrawer;
$('#scrim').onclick = () => { closeDrawer(); closeModal(); };
$('#modal-x').onclick = closeModal;
$('#modal-wrap').onclick = e => { if (e.target === $('#modal-wrap')) closeModal(); };
$('#tara-fab').onclick = openTara;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeModal(); } });

refresh();
render();
