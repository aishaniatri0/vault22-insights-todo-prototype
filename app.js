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
    if (this.items.some(i => i.insightId === insight.id && !i.done)) return false;
    this.items.unshift({
      id: 'todo-' + Date.now() + '-' + Math.round(performance.now()),
      insightId: insight.id,
      module: insight.module,
      text: insight.todo,
      why: insight.title,
      evidence: insight.evidence,
      due: insight.dueInDays != null ? isoPlus(insight.dueInDays) : null,
      done: false,
      added: new Date().toISOString(),
    });
    this.save();
    return true;
  },
  addManual(text) {
    if (!text.trim()) return;
    this.items.unshift({ id: 'todo-' + Date.now(), module: null, text: text.trim(), due: null, done: false, added: new Date().toISOString(), manual: true });
    this.save();
  },
  setDue(id, iso) { const i = this.items.find(x => x.id === id); if (i) { i.due = iso || null; this.save(); } },
  toggle(id) { const i = this.items.find(x => x.id === id); if (i) { i.done = !i.done; i.doneAt = i.done ? new Date().toISOString() : null; this.save(); } },
  remove(id) { this.items = this.items.filter(x => x.id !== id); this.save(); },
  open() { return this.items.filter(i => !i.done); },
  doneItems() { return this.items.filter(i => i.done); },
  hasFor(insightId) { return this.items.some(i => i.insightId === insightId && !i.done); },
};

/* ---------------- state ---------------- */
const State = { insights: [], filter: 'all', dismissed: JSON.parse(localStorage.getItem('v22-dismissed') || '[]') };

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
  localStorage.setItem('v22-dismissed', JSON.stringify(State.dismissed));
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

  card.innerHTML = `
    <div class="ins-top">
      <span class="ins-mod">${esc(mod ? mod.label : i.module)}</span>
      ${actionChip(i)} ${statusChip(i)}
    </div>
    <h3>${esc(i.title)}</h3>
    <p class="ins-body">${esc(i.body)}</p>
    <details class="ins-ev">
      <summary>What Tara read</summary>
      <p class="ev-reads"><strong>Reads:</strong> ${esc(i.reads)}</p>
      <p class="ev-data">${esc(i.evidence)}</p>
    </details>
    <div class="ins-cta">
      ${cta}
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
  root.querySelectorAll('[data-why]').forEach(b => b.onclick = () => {
    const i = State.insights.find(x => x.id === b.dataset.why);
    openDrawer('Why this is blocked', `
      <p class="dr-lead">${esc(i.title)}</p>
      <div class="dr-block">
        <h4>What it needs before it can ship</h4>
        <p>${esc(customerBlockedReason(i.blockedBy))}</p>
      </div>
      <div class="dr-block">
        <h4>What it would read</h4>
        <p>${i.reads}</p>
      </div>
      <div class="dr-block">
        <h4>What it found in your data</h4>
        <p>${i.evidence}</p>
      </div>
      <p class="dr-note">We are showing this card so the shape is reviewable, but it will not act until the rails behind it are real.</p>`);
  });
  root.querySelectorAll('[data-inapp]').forEach(b => b.onclick = () => {
    const i = State.insights.find(x => x.id === b.dataset.inapp);

    /* The precursor. Stephen: ask before you advise. Answering it is what
       unlocks the cover insight that is gated behind it. */
    if (i.precursor) {
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
      return;
    }

    openDrawer(i.title, `
      <p class="dr-lead">${i.inApp}</p>
      <div class="dr-block"><h4>What Tara read</h4><p>${i.evidence}</p></div>
      <button class="btn btn-primary btn-block" id="dr-do">${i.inApp}</button>
      <p class="dr-note">Tara does this on platform. Nothing goes on your to-do list.</p>`);
    $('#dr-do').onclick = () => { closeDrawer(); toast('Done. Tara handled it.'); dismiss(i.id); };
  });
  root.querySelectorAll('[data-wizard]').forEach(b => b.onclick = () => openWizard(b.dataset.wizard));
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
MODULE_CHROME.goals = () => `
  <p class="page-sub">${DATA.goals.length} goals. The insight below is the one Stephen moved out of Budgeting: it funds a goal by trimming a Want.</p>
  <div class="goal-list">
    ${DATA.goals.map(g => `
      <div class="goal">
        <div class="goal-top">
          <span class="goal-nm">${g.name}</span>
          <span class="goal-pct">${g.pct}%</span>
        </div>
        <div class="cat-bar"><i style="width:${g.pct}%"></i></div>
        <div class="goal-foot">
          <span>${money(g.saved)} of ${money(g.target)}</span>
          <span class="${g.monthly ? '' : 'goal-stalled'}">${g.monthly ? money(g.monthly) + ' a month' : 'Nothing going in'}</span>
        </div>
      </div>`).join('')}
  </div>`;

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

function viewTodo() {
  const v = $('#view');
  const open = Store.open(), done = Store.doneItems();

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

    <div class="todo-wrap">
      ${open.length ? BUCKETS.map(bk => {
        const rows = open.filter(bk.test).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1);
        if (!rows.length) return '';
        return `<h4 class="todo-h ${bk.id === 'over' ? 'todo-h-over' : ''}">${bk.label} <span>${rows.length}</span></h4>
                <div>${rows.map(todoRow).join('')}</div>`;
      }).join('')
      : done.length ? `
        <div class="empty empty-slim">
          <div class="empty-ic">✓</div>
          <h3>All done</h3>
          <p>You have cleared everything on your list. Nicely done.</p>
          <a class="btn btn-primary" href="#/insights">See your insights</a>
        </div>`
      : `
        <div class="empty">
          <div class="empty-ic">✓</div>
          <h3>Nothing to do</h3>
          <p>When an insight needs you to act, it lands here.</p>
          <a class="btn btn-primary" href="#/insights">See your insights</a>
        </div>`}

      ${done.length ? `
        <details class="todo-done-wrap" ${done.length <= 3 ? 'open' : ''}>
          <summary class="todo-h todo-h-done">Done <span>${done.length}</span></summary>
          <div>${done.map(todoRow).join('')}</div>
        </details>` : ''}
    </div>`;

  $('#td-add').onclick = () => {
    const val = $('#td-new').value;
    if (!val.trim()) { toast('Type something to add first'); $('#td-new').focus(); return; }
    Store.addManual(val); $('#td-new').value = ''; render();
  };
  $('#td-new').onkeydown = e => { if (e.key === 'Enter') $('#td-add').click(); };
  wireTodo(v);
}

function todoRow(t) {
  const mod = MODULES.find(m => m.id === t.module);
  const due = dueLabel(t.due);
  return `
    <div class="td ${t.done ? 'td-done' : ''}">
      <button class="td-check" data-toggle="${t.id}" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}">
        ${t.done ? '✓' : ''}
      </button>
      <div class="td-main">
        <p class="td-text">${esc(t.text)}</p>
        <p class="td-why">
          ${mod ? `<span class="td-mod">${esc(mod.label)}</span>` : `<span class="td-mod td-mod-own">Added by you</span>`}
          ${t.why ? esc(t.why) : ''}
        </p>
        ${t.evidence ? `<details class="td-ev"><summary>Why this is here</summary><p>${esc(t.evidence)}</p></details>` : ''}
      </div>
      <label class="td-due ${due.cls}">
        <span>${due.text}</span>
        <input type="date" value="${t.due || ''}" data-due="${t.id}" aria-label="Due date">
      </label>
      <button class="td-x" data-del="${t.id}" aria-label="Remove">✕</button>
    </div>`;
}

function wireTodo(root) {
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { Store.toggle(b.dataset.toggle); render(); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Store.remove(b.dataset.del); render(); });
  root.querySelectorAll('[data-due]').forEach(inp => inp.onchange = () => { Store.setDue(inp.dataset.due, inp.value); render(); });
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
