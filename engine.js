/* ============================================================
   THE INSIGHT ENGINE

   One entry per insight from Patrick's library (email 10 Jul 2026),
   with Stephen's annotations (10 Jul 17:25) applied as first-class states.

   Every insight declares:
     module     which of the 10 modules it belongs to
     what       what the insight tells the user
     reads      what data it reads (Stephen's schema)
     test(d)    derives it from the data. Returns null if it does not fire.
     action     'in-app'  Tara does it on platform
                'todo'    it lands in the shared To-Do list to tick off
                'wizard'  opens a guided setup (Stephen's ask for budgeting 1 and 2)
     status     'live'    demonstrable today
                'blocked' needs rails we do not have (declares why)
                'dropped' Stephen removed it
                'moved'   Stephen relocated it to another module

   Nothing here is a hardcoded string dressed up as an insight. If the
   situation is not in the data, the card does not appear.
   ============================================================ */

/* A figure we cannot compute must never reach the customer as "RNaN" or
   "Infinity%". R() refuses to render a number that is not finite, and the callers
   below check before they build a sentence around one. */
const R = n => Number.isFinite(n) ? 'R' + Math.round(Math.abs(n)).toLocaleString('en-ZA') : 'an amount we cannot read yet';
/* R() drops the sign, which is right for amounts where the direction is already
   in the sentence ("R84 300 owed"). It is wrong for any figure that can legitimately
   be negative: a net worth of minus R265 259 printed as "R265 259" tells the
   customer the opposite of the truth. Signed figures must use Rs(). */
const Rs = n => Number.isFinite(n)
  ? (n < 0 ? '-R' + Math.round(Math.abs(n)).toLocaleString('en-ZA') : 'R' + Math.round(n).toLocaleString('en-ZA'))
  : 'an amount we cannot read yet';
const isNum = n => Number.isFinite(n);
/* Returns null rather than NaN/Infinity when the share cannot be expressed. */
const pctOf = (part, whole) => (isNum(part) && isNum(whole) && whole !== 0)
  ? Math.round((part / whole) * 100) : null;

/* Dates arrive as bare 'YYYY-MM-DD', which Date parses as UTC midnight, while
   d.today is a local-midnight Date. Differencing the two directly drifts by a day
   east of Greenwich, which flips insights that sit on a 30 or 90 day threshold.
   Compare calendar days in local terms instead. app.js fixes this for its own
   date helpers; the engine needs the same treatment. */
const _localMidnight = v => {
  const d = v instanceof Date ? v : new Date(String(v).length <= 10 ? String(v) + 'T00:00:00' : v);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const daysBetween = (a, b) => {
  const x = _localMidnight(a), y = _localMidnight(b);
  if (!x || !y) return NaN;
  return Math.round((y - x) / 86400000);
};
const ord = n => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };

/* Real amortisation, replacing balance-divided-by-payment. Interest compounds
   monthly at apr/12 and the payment is applied after it. Returns null when the
   payment cannot cover the interest, because in that case the balance grows and
   there is no payoff date to quote: the old maths returned a comfortable-looking
   number of years for debts that in fact never clear.

   Returns { months, totalInterest } or null. */
function amortise(balance, apr, payment, capMonths = 1200) {
  if (!isNum(balance) || !isNum(apr) || !isNum(payment)) return null;
  if (balance <= 0) return { months: 0, totalInterest: 0 };
  if (payment <= 0) return null;
  const r = (apr / 100) / 12;
  if (balance * r >= payment) return null; // interest outruns the payment
  let bal = balance, interest = 0, m = 0;
  while (bal > 0 && m < capMonths) {
    const i = bal * r;
    interest += i;
    bal = bal + i - payment;
    m++;
  }
  return bal > 0 ? null : { months: m, totalInterest: interest };
}

/* The month a given number of months from d.today, e.g. "December 2039". Derived
   from the app's own today rather than a hardcoded July 2026 base. */
function monthsFrom(today, months) {
  if (!isNum(months)) return null;
  const d = new Date(today.getFullYear(), today.getMonth() + months, 1);
  return d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

const INSIGHTS = [

  /* ================= DEBT MANAGEMENT =================
     Stephen: "4 of these require the to-do list module". */
  {
    id: 'debt-1', dueInDays: 17, priority: 2, module: 'debt', status: 'live', action: 'todo',
    what: 'Pay off your most expensive debt first.',
    reads: 'Your debt balances and their interest rates.',
    test: d => {
      const worst = [...d.debts].sort((a, b) => b.apr - a.apr)[0];
      if (!worst || worst.apr < 15) return null;
      return {
        title: `${worst.name} is your most expensive debt`,
        body: `At ${worst.apr}% APR it costs you more than everything else you owe. Paying it down first saves the most money.`,
        evidence: `${worst.name} - ${R(worst.balance)} at ${worst.apr}% APR, the highest of your ${d.debts.length} debts.`,
        inApp: 'Puts your highest-rate debt at the top of the payoff plan.',
        todo: `Pay a bit extra to your ${worst.name} this month.`,
        dedupeKey: `pay-down-${worst.id}`,
      };
    },
  },
  {
    id: 'debt-2', dueInDays: 21, priority: 4, module: 'debt', status: 'blocked', action: 'todo',
    blockedBy: 'Stephen: we do not have enough loan suppliers yet. Needs the marketplace to hold real refinance rates, a saving-per-year calculation, and referral recording in admin before it can prompt anyone to apply.',
    what: 'One loan could replace several.',
    reads: 'Your debt balances and rates, and marketplace consolidation rates.',
    test: d => {
      const consolidatable = d.debts.filter(x => x.apr > 15);
      if (consolidatable.length < 2) return null;
      const total = consolidatable.reduce((s, x) => s + x.balance, 0);
      return {
        title: 'One loan could replace several',
        body: `You have ${consolidatable.length} debts above 15% APR. A single consolidation loan could cut what you pay in interest.`,
        evidence: consolidatable.map(x => `${x.name} ${R(x.balance)} at ${x.apr}%`).join(', ') + `. Total ${R(total)}.`,
        inApp: 'Starts an application for a single loan to replace them.',
        todo: 'Compare consolidation options.',
      };
    },
  },
  {
    id: 'debt-3', dueInDays: 21, priority: 5, module: 'debt', status: 'live', action: 'todo',
    what: 'When you will be debt-free.',
    reads: 'Your balances, rates and repayments.',
    test: d => {
      if (!d.debts.length) return null; // debt-free: there is nothing to say
      const totalDebt = d.debts.reduce((s, x) => s + x.balance, 0);
      const totalPay = d.debts.reduce((s, x) => s + x.actualPayment, 0);

      /* Each debt is amortised at its own rate against its own payment. Dividing
         the total by the total ignores interest entirely, and at these rates that
         is not a rounding difference: it turns debts that never clear into a
         confident date. */
      const runs = d.debts.map(x => ({ x, run: amortise(x.balance, x.apr, x.actualPayment) }));
      const growing = runs.filter(r => !r.run).map(r => r.x);

      if (growing.length) {
        /* At least one debt is going backwards, so there is no debt-free date to
           give. Say what is actually happening instead of inventing one. */
        const worst = growing.slice().sort((a, b) =>
          (b.balance * b.apr / 1200 - b.actualPayment) - (a.balance * a.apr / 1200 - a.actualPayment))[0];
        const growth = worst.balance * (worst.apr / 100) / 12 - worst.actualPayment;
        const all = growing.length === d.debts.length;
        return {
          title: all
            ? 'At these repayments, your debt is growing, not clearing'
            : `${growing.length} of your debts are growing, not clearing`,
          body: `Interest is running faster than what you pay. ${worst.name} costs ${R(worst.balance * (worst.apr / 100) / 12)} a month in interest and you pay ${R(worst.actualPayment)}, so it rises by about ${R(growth)} a month. There is no payoff date until the payment covers the interest.`,
          evidence: `${R(totalDebt)} owed across ${d.debts.length} debts, ${R(totalPay)} a month going out. ${growing.length === 1 ? 'One debt' : growing.length + ' debts'} where the monthly interest is more than the monthly payment: ${growing.map(g => `${g.name} (${g.apr}%, pays ${R(g.actualPayment)}, interest ${R(g.balance * (g.apr / 100) / 12)})`).join('; ')}.`,
          inApp: 'Shows what payment each debt needs before it starts to fall.',
          todo: 'Raise your repayment above the monthly interest on each debt.',
        };
      }

      /* Every debt clears. The debt-free month is the longest single run. */
      const months = Math.max(...runs.map(r => r.run.months));
      const when = monthsFrom(d.today, months);
      const interest = runs.reduce((s, r) => s + r.run.totalInterest, 0);
      return {
        title: `You are ${months} months from debt-free`,
        body: `At your current repayments you clear ${R(totalDebt)}${when ? ` by around ${when}` : ''}, paying about ${R(interest)} in interest along the way. Paying more each month brings that forward.`,
        evidence: `${R(totalDebt)} owed across ${d.debts.length} debts, ${R(totalPay)} a month going out. Each debt run forward at its own rate; the last to clear takes ${months} months.`,
        inApp: 'Sets a faster target in the plan.',
        todo: 'Increase your monthly repayment.',
      };
    },
  },
  {
    id: 'debt-4', dueInDays: 1, priority: 1, module: 'debt', status: 'live', action: 'todo',
    what: 'Risk of a missed payment.',
    reads: 'Your payment history and payment dates.',
    test: d => {
      const risky = d.debts.filter(x => x.missedPayments > 0);
      if (!risky.length) return null;
      const x = risky[0];
      const salaryDay = d.income.salaryDay;
      const beforePayday = x.dueDay < salaryDay;
      return {
        title: `${x.name} is at risk of another missed payment`,
        body: beforePayday
          ? `You have missed a payment on this before, and it comes off on the ${ord(x.dueDay)}, before your salary lands on the ${ord(salaryDay)}. That is the whole problem.`
          : `You have missed a payment on this before. It comes off on the ${ord(x.dueDay)}, so the money needs to still be there by then.`,
        evidence: `${x.missedPayments} missed payment on record. Comes off the ${ord(x.dueDay)}. Salary arrives the ${ord(salaryDay)}.`,
        inApp: null,
        todo: beforePayday
          ? `Move the payment date on ${x.name} to after payday, or top up before it comes off.`
          : `Keep enough in the account for ${x.name} before the ${ord(x.dueDay)}.`,
      };
    },
  },
  {
    id: 'debt-5', dueInDays: 17, priority: 3, module: 'debt', status: 'live', action: 'todo',
    what: 'You are only paying the minimum.',
    reads: 'Your credit-card statements.',
    test: d => {
      const mins = d.debts.filter(x => x.statementMinOnly && x.actualPayment <= x.minPayment);
      if (!mins.length) return null;
      const x = mins[0];
      const monthlyInterest = x.balance * (x.apr / 100) / 12;
      const run = amortise(x.balance, x.apr, x.actualPayment);

      /* The old figure was balance / (payment x 12), scaled by the rate. On this
         card that returned "about 17 years" for a balance where the interest is
         more than three times the payment, so it never clears at all. When the
         payment cannot cover the interest we now say so, and say what payment
         would actually start bringing the balance down. */
      if (!run) {
        const growth = monthlyInterest - x.actualPayment;
        return {
          title: `The minimum on ${x.name} does not cover the interest`,
          body: `Paying ${R(x.actualPayment)} against ${R(monthlyInterest)} of monthly interest means the balance grows by about ${R(growth)} every month, not down. Anything above ${R(monthlyInterest)} a month starts to clear it.`,
          evidence: `Minimum ${R(x.minPayment)}, you are paying ${R(x.actualPayment)}, balance ${R(x.balance)} at ${x.apr}%. Monthly interest ${R(monthlyInterest)}.`,
          inApp: 'Shows what payment turns the balance around.',
          todo: `Raise your payment on ${x.name} above ${R(monthlyInterest)} a month.`,
          dedupeKey: `pay-down-${x.id}`,
        };
      }

      const years = Math.round(run.months / 12);
      return {
        title: `You are only paying the minimum on ${x.name}`,
        body: `Minimum payments barely cover the interest. At this rate it takes about ${years === 0 ? 'under a year' : years + ' year' + (years === 1 ? '' : 's')} to clear, and costs ${R(run.totalInterest)} in interest.`,
        evidence: `Minimum ${R(x.minPayment)}, you are paying ${R(x.actualPayment)}, balance ${R(x.balance)} at ${x.apr}%. Monthly interest ${R(monthlyInterest)}; run forward, it clears in ${run.months} months.`,
        inApp: 'Shows a payoff plan.',
        todo: `Pay more than the minimum on ${x.name} this month.`,
        dedupeKey: `pay-down-${x.id}`,
      };
    },
  },

  /* ================= BUDGETING =================
     Stephen: 1 and 2 become wizards. 4 moves to Goals. 5 is dropped. */
  {
    id: 'budget-1', priority: 3, cta: 'Set up alerts', module: 'budgeting', status: 'live', action: 'wizard', wizard: 'alerts',
    what: 'A category is running hot.',
    reads: 'Your budget against what you have spent so far.',
    stephen: 'We already have spending alerts. Change this to a wizard prompting the user to set up spending alerts if they have not already.',
    test: d => {
      const dayOfMonth = 14, daysInMonth = 31;
      const hot = d.budget
        .filter(c => c.budget > 0 && !c.alerts.length)
        .map(c => ({ ...c, pace: (c.spent / c.budget) / (dayOfMonth / daysInMonth) }))
        .filter(c => c.pace > 1.3)
        .sort((a, b) => b.pace - a.pace)[0];
      if (!hot) return null;
      const projected = Math.round(hot.spent / (dayOfMonth / daysInMonth));
      return {
        title: `${hot.name} is running hot`,
        body: `You are spending faster than this budget allows, and you have no alert set on it. An alert warns you before you go over, not after.`,
        evidence: `${R(hot.spent)} of ${R(hot.budget)} spent by day ${dayOfMonth}. On this pace it finishes the month at about ${R(projected)}.`,
        inApp: 'Opens the alert wizard so you can set 50, 80 and 100% warnings.',
        todo: null,
      };
    },
  },
  {
    id: 'budget-2', priority: 3, cta: 'Fix these budgets', module: 'budgeting', status: 'live', action: 'wizard', wizard: 'budget',
    what: 'Your budget is not realistic.',
    reads: 'Your budget against your six-month average.',
    stephen: 'This one is ok, but I would separate it into a budget wizard prompting the user to set their budget limits for categories they have not already.',
    test: d => {
      const unrealistic = d.budget
        .filter(c => c.sixMonthAverage > 0 && c.budget > 0)
        .map(c => ({ ...c, gap: (c.sixMonthAverage - c.budget) / c.budget }))
        .filter(c => c.gap > 0.4)
        .sort((a, b) => b.gap - a.gap)[0];
      if (!unrealistic) return null;
      return {
        title: `Your ${unrealistic.name} budget is not realistic`,
        body: `You have set a budget well below what you actually spend, month after month. A budget you break every month stops being useful.`,
        evidence: `Budget ${R(unrealistic.budget)}, six-month average ${R(unrealistic.sixMonthAverage)}. You are over by ${R(unrealistic.sixMonthAverage - unrealistic.budget)} on a typical month.`,
        inApp: 'Opens the budget wizard to set your budget to your real average.',
        todo: null,
      };
    },
  },
  {
    id: 'budget-3', priority: 5, cta: 'Carry it forward', module: 'budgeting', status: 'live', action: 'in-app',
    what: 'Money left in a category.',
    reads: 'What you did not spend.',
    test: d => {
      const left = d.budget
        .filter(c => c.budget > 0 && c.spent < c.budget)
        .map(c => ({ ...c, remaining: c.budget - c.spent }))
        .sort((a, b) => b.remaining - a.remaining)[0];
      if (!left || left.remaining < 500) return null;
      return {
        title: `${left.name} has ${R(left.remaining)} left`,
        body: `You can carry this into next month, or move it to a goal before the period closes.`,
        evidence: `${R(left.spent)} spent of ${R(left.budget)} budgeted. ${R(left.remaining)} unspent.`,
        inApp: 'Carry it into next month, or move it to a goal.',
        todo: null,
      };
    },
  },
  {
    id: 'budget-4', priority: 4, cta: 'Move the money', module: 'goals', status: 'moved', action: 'in-app',
    movedFrom: 'budgeting',
    stephen: 'This needs a purpose. Suggest this insight sits in the Goals section, when they are setting a goal and need to find some savings (they can trim from Wants). The agent should be able to adjust budget for a category based on user choice.',
    what: 'Your Needs / Wants / Savings balance.',
    reads: 'The Needs / Wants / Savings labels and your spending.',
    test: d => {
      const stalled = d.goals.filter(g => g.monthly === 0);
      if (!stalled.length) return null;
      const wants = d.budget.filter(c => c.type === 'Want');
      const wantsSpend = wants.reduce((s, c) => s + c.spent, 0);
      const trimmable = wants.filter(c => c.spent > c.average).sort((a, b) => (b.spent - b.average) - (a.spent - a.average))[0];
      if (!trimmable) return null;
      const g = stalled[0];
      const trim = Math.round(trimmable.spent - trimmable.average);
      return {
        title: `Fund "${g.name}" by trimming a Want`,
        body: `This goal has nothing going into it. Your Wants are where the money is: trimming ${trimmable.name} back to what you normally spend would free up ${R(trim)} a month.`,
        evidence: `Wants total ${R(wantsSpend)} this month. ${trimmable.name}: ${R(trimmable.spent)} spent against a ${R(trimmable.average)} average. "${g.name}" is at ${g.pct}% with ${R(0)} a month going in.`,
        inApp: `Move ${R(trim)} a month from ${trimmable.name} into "${g.name}" and adjust the budget.`,
        todo: null,
      };
    },
  },
  {
    id: 'budget-5', module: 'budgeting', status: 'dropped', action: null,
    what: 'A budgeting style that suits you.',
    reads: 'How regular your income is.',
    stephen: 'Do not get how this is an insight with an associated action.',
    test: () => null,
  },

  /* ================= INSURANCE =================
     Stephen: needs a precursor card asking what the user owns, real quote
     rails, and an industry framework rather than LLM advice. */
  {
    id: 'ins-0', priority: 3, cta: 'Answer two questions', module: 'insurance', status: 'live', action: 'in-app', precursor: true,
    what: 'What do you actually own? (asked before any cover advice)',
    reads: 'Your profile. Nothing about cover is inferred until you answer.',
    stephen: 'Before this step we need an insight card prompting the user to tell us if they have a car or home before you can do this stage.',
    test: d => {
      if (d.insurance.ownsCar !== null && d.insurance.ownsHome !== null) return null;
      return {
        title: 'Tell us what you own',
        body: 'We will not guess at your cover. Tell us whether you own a car or a home and we can tell you where you are exposed. Until then, we say nothing about it.',
        evidence: 'Not yet answered: do you own a car? do you own a home?',
        inApp: 'Answer two questions.',
        todo: null,
      };
    },
  },
  {
    id: 'ins-1', dueInDays: 30, priority: 4, module: 'insurance', status: 'blocked', action: 'todo',
    blockedBy: 'Stephen: this is complicated and needs validation for the customer so they trust the recommendation. Needs research into the framework the industry actually uses, not LLM advice.',
    what: 'A gap in your cover.',
    reads: 'Your policies and your profile.',
    test: d => {
      if (d.insurance.hasLifeCover || d.insurance.dependants === 0) return null;
      return {
        title: 'You have people depending on you and no life cover',
        body: `You have ${d.insurance.dependants} dependants and no life policy. We are not going to tell you how much cover to buy until we can show you the framework behind the number.`,
        evidence: `Policies on file: ${d.insurance.policies.map(p => p.type).join(', ')}. No life cover. ${d.insurance.dependants} dependants.`,
        inApp: 'Shows cover options.',
        todo: 'Compare life cover quotes.',
      };
    },
  },
  {
    id: 'ins-2', dueInDays: 7, priority: 3, module: 'insurance', status: 'live', action: 'todo',
    what: 'You might be paying twice.',
    reads: 'Your policies.',
    test: d => {
      const byType = {};
      d.insurance.policies.forEach(p => { (byType[p.type] = byType[p.type] || []).push(p); });
      const dupType = Object.keys(byType).find(t => byType[t].length > 1);
      if (!dupType) return null;
      const dups = byType[dupType];
      const monthly = dups.reduce((s, p) => s + p.premium, 0);
      return {
        title: `You have two ${dupType} policies`,
        body: `You are paying two insurers for the same thing. One of them is probably redundant.`,
        evidence: dups.map(p => `${p.insurer} ${R(p.premium)}/mo for ${R(p.cover)} cover`).join(', ') + `. ${R(monthly)} a month in total.`,
        inApp: null,
        todo: `Check the double ${dupType.toLowerCase()} with your insurer.`,
      };
    },
  },
  {
    id: 'ins-3', dueInDays: 14, priority: 4, module: 'insurance', status: 'live', action: 'todo',
    what: 'Your premium went up.',
    reads: 'Your insurance payments over time.',
    test: d => {
      const risen = d.insurance.policies.filter(p => p.premiumLastYear && p.premium > p.premiumLastYear * 1.1)[0];
      if (!risen) return null;
      const pct = Math.round(((risen.premium - risen.premiumLastYear) / risen.premiumLastYear) * 100);
      return {
        title: `Your ${risen.type} premium went up ${pct}%`,
        body: `${risen.insurer} has raised what you pay well above inflation. This is the moment to test the market.`,
        evidence: `${R(risen.premiumLastYear)} a year ago, ${R(risen.premium)} now. Up ${pct}%.`,
        inApp: null,
        todo: `Get a fresh quote for your ${risen.type.toLowerCase()}.`,
      };
    },
  },
  {
    id: 'ins-4', dueInDays: 30, priority: 5, module: 'insurance', status: 'blocked', action: 'todo',
    blockedBy: 'Gated behind the precursor card, and needs a quote API to value cover against the asset.',
    dependsOn: 'ins-0',
    what: 'You may be over- or under-covered.',
    reads: 'What your car or home is worth against the amount you are covered for.',
    test: d => {
      if (d.insurance.ownsCar !== true) return null; // will not fire until the user answers
      const car = d.insurance.policies.find(p => p.type === 'Car Insurance');
      if (!car) return null;
      return {
        title: 'Your car cover may not match what the car is worth',
        body: 'Cover that is too high costs you every month. Cover that is too low costs you once, badly.',
        evidence: `Covered for ${R(car.cover)} at ${R(car.premium)}/mo.`,
        inApp: null,
        todo: 'Adjust the amount you are covered for.',
      };
    },
  },
  {
    id: 'ins-5', dueInDays: 30, priority: 4, module: 'insurance', status: 'blocked', action: 'todo',
    blockedBy: 'Same as the cover gap: needs the industry framework and a quote API.',
    what: 'Your income is not protected.',
    reads: 'Your profile, income and family.',
    test: d => {
      if (d.insurance.hasIncomeProtection) return null;
      return {
        title: 'Nothing replaces your income if you cannot work',
        body: `Your household runs on one salary and there is no income protection behind it.`,
        evidence: `Income ${R(d.income.expected)}/mo. ${d.insurance.dependants} dependants. No income protection policy on file.`,
        inApp: 'Shows income-protection options.',
        todo: 'Get an income-protection quote.',
      };
    },
  },

  /* ================= MARKETPLACE ================= */
  {
    id: 'mkt-1', dueInDays: 14, priority: 3, module: 'marketplace', status: 'live', action: 'todo',
    what: 'You are paying too much in bank fees.',
    reads: 'Your bank-fee payments.',
    test: d => {
      const fees = d.tx.filter(t => ['Account Fees', 'ATM Fees', 'Bank Charges', 'EFT Fees'].includes(t.category));
      const total = fees.reduce((s, t) => s + Math.abs(t.amount), 0);
      if (total < 100) return null;
      const cheaper = d.marketplace.cheaperAccount;
      return {
        title: `You paid ${R(total)} in bank fees this month`,
        body: `That is money for nothing. ${cheaper.name} charges ${R(cheaper.monthlyFee)} a month and would save you about ${R(cheaper.saves)} a month.`,
        evidence: fees.map(t => `${t.merchant} ${R(t.amount)}`).join(', ') + `. Total ${R(total)}.`,
        inApp: 'Shows a cheaper account.',
        todo: 'Switch account.',
      };
    },
  },
  {
    id: 'mkt-2', dedupeKey: 'idle-cash', priority: 4, cta: 'Move the money across', module: 'marketplace', status: 'live', action: 'in-app',
    what: 'Spare cash could earn more.',
    reads: 'Money sitting in low-interest accounts.',
    test: d => {
      const lazy = d.accounts.filter(a => a.type === 'Savings' && a.interestRate < 1 && a.balance > 50000)[0];
      if (!lazy) return null;
      const better = d.marketplace.betterSavingsRate;
      const gain = Math.round(lazy.balance * ((better.rate - lazy.interestRate) / 100));
      return {
        title: `${R(lazy.balance)} is earning almost nothing`,
        body: `Your ${lazy.name} pays ${lazy.interestRate}%. Moving it to ${better.name} at ${better.rate}% earns roughly ${R(gain)} more a year.`,
        evidence: `${lazy.name}: ${R(lazy.balance)} at ${lazy.interestRate}%. ${better.name} pays ${better.rate}%.`,
        inApp: 'Opens a savings account and moves the money across.',
        todo: null,
      };
    },
  },
  {
    id: 'mkt-3', dueInDays: 21, priority: 4, module: 'marketplace', status: 'blocked', action: 'todo',
    blockedBy: 'Stephen: we do not have enough loan suppliers yet. Needs marketplace rates, a saving-per-year calculation, and referral recording in admin.',
    what: 'A cheaper loan.',
    reads: 'The rates on your current loans.',
    test: d => {
      const r = d.marketplace.refinance;
      const loan = d.debts.find(x => x.name === r.availableFor);
      if (!loan || !r.newApr || loan.apr <= r.newApr) return null;
      const saving = Math.round(loan.balance * ((loan.apr - r.newApr) / 100));
      return {
        title: `Your ${loan.name} could be cheaper`,
        body: `You are paying ${loan.apr}%. Rates near ${r.newApr}% exist for your profile, worth about ${R(saving)} a year.`,
        evidence: `${loan.name}: ${R(loan.balance)} at ${loan.apr}%. Comparable rate ${r.newApr}%.`,
        inApp: 'Starts the application.',
        todo: 'Compare refinance options.',
      };
    },
  },
  {
    id: 'mkt-4', dedupeKey: 'sportsman-tx', dueInDays: 14, priority: 6, module: 'marketplace', status: 'live', action: 'todo',
    what: 'The right product at the right time.',
    reads: 'A purchase that just happened.',
    test: d => {
      const big = d.tx.filter(t => t.category === 'Tech & Appliances' && Math.abs(t.amount) > 2000)[0];
      if (!big) return null;
      return {
        title: `You bought something worth insuring`,
        body: `A purchase this size is usually worth adding to your contents cover, or nothing replaces it if it walks.`,
        evidence: `${big.merchant}, ${R(big.amount)} on ${big.date}.`,
        inApp: 'Shows options.',
        todo: 'Get a quote to cover it.',
      };
    },
  },
  {
    id: 'mkt-5', dueInDays: 21, priority: 6, module: 'marketplace', status: 'live', action: 'todo',
    what: 'Rewards you are missing.',
    reads: 'How you spend.',
    test: d => {
      const rw = d.marketplace.rewardsCard;
      const spend = d.tx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
      if (spend < 1000) return null;
      return {
        title: `You are leaving about ${R(rw.estimatedAnnual)} a year on the table`,
        body: `On the way you already spend, ${rw.name} would pay you back. You are not linked to it.`,
        evidence: `${R(spend)} spent this month across ${d.tx.filter(t => t.amount < 0).length} transactions. No rewards account linked.`,
        inApp: null,
        todo: `Apply for ${rw.name}.`,
      };
    },
  },

  /* ================= MAIN DASHBOARD ================= */
  {
    id: 'dash-1', priority: 6, cta: 'See what changed', module: 'dashboard', status: 'live', action: 'in-app',
    what: 'Your net worth is changing.',
    reads: 'All your accounts.',
    test: d => {
      const c = d.profile.netWorthChange;
      if (!c || !c.total) return null;
      const p = d.profile;
      const pct = pctOf(c.fromInvestments, c.total);
      /* Only the accounts that actually hold a positive balance contribute to the
         asset side, so quoting the full account count overstates the working. */
      const contributing = d.accounts.filter(a => a.balance > 0).length;
      /* The estimated home is more than half the asset side, so it is named as an
         estimate every time this number is shown, and the linked-accounts-only
         figure is given alongside it rather than left for someone to work out. */
      const homeNote = p.propertyEstimated
        ? `an estimated ${R(p.propertyValue)} home you told us about, which we cannot verify`
        : `a ${R(p.propertyValue)} home`;
      return {
        title: `Your net worth is up ${R(c.total)} this month`,
        body: pct != null
          ? `${pct}% of that came from your investments moving, the rest from money you put away. Markets give it and markets take it back.`
          : 'Some came from your investments moving and some from money you put away.',
        evidence: `Net worth ${Rs(p.netWorth)}: ${R(p.assets)} in assets (${contributing} linked accounts worth ${R(p.linkedAssets)}, plus ${homeNote}) less ${R(p.liabilities)} owed. On linked accounts alone, without the estimated home, it is ${Rs(p.netWorthLinked)}. Up ${R(c.total)} this month: ${R(c.fromInvestments)} from investments, ${R(c.fromSaving)} from saving.`,
        inApp: 'Shows what caused the change, and lets you set a goal.',
        todo: null,
      };
    },
  },
  {
    id: 'dash-2', dueInDays: 2, priority: 2, module: 'dashboard', status: 'live', action: 'todo',
    what: 'Some accounts are out of date.',
    reads: 'When each account last updated.',
    test: d => {
      const stale = d.accounts.filter(a => daysBetween(new Date(a.lastUpdated), d.today) > 30);
      if (!stale.length) return null;
      return {
        title: `${stale.length} account${stale.length > 1 ? 's have' : ' has'} stopped updating`,
        body: `Everything we tell you is only as good as the data behind it. These accounts are stale, so your net worth and your budget are both slightly wrong.`,
        evidence: stale.map(a => `${a.name}, last updated ${a.lastUpdated}`).join('. '),
        inApp: null,
        todo: `Reconnect ${stale[0].name}.`,
      };
    },
  },
  {
    id: 'dash-3', priority: 6, cta: 'Complete my profile', module: 'dashboard', status: 'live', action: 'in-app',
    what: 'Turn on more insights.',
    reads: 'How complete your profile is.',
    test: d => {
      if (d.profile.profileComplete >= 100) return null;
      return {
        title: `Your profile is ${d.profile.profileComplete}% complete`,
        body: 'The last few details unlock the insights we cannot give you yet.',
        evidence: `${d.profile.profileComplete}% complete. Missing: profile picture.`,
        inApp: 'Fill in the missing details.',
        todo: null,
      };
    },
  },
  {
    id: 'dash-4', priority: 5, cta: 'See my safe-to-spend', module: 'dashboard', status: 'live', action: 'in-app',
    what: 'What is safe to spend.',
    reads: 'Your income, your regular bills and your balance.',
    test: d => {
      const committed = d.budget.filter(c => c.type === 'Need').reduce((s, c) => s + c.budget, 0);
      const debtService = d.debts.reduce((s, x) => s + x.actualPayment, 0);
      const safe = d.income.expected - committed - debtService;
      const daysLeft = 17;
      if (safe <= 0) {
        return {
          title: `There is nothing safe to spend this month`,
          body: `Your Needs and debt repayments come to more than your income this month, so there is no free cash until that gap closes. Paying down debt is what frees it up.`,
          evidence: `Income ${R(d.income.expected)}, committed Needs ${R(committed)}, debt repayments ${R(debtService)}. That is ${R(committed + debtService - d.income.expected)} more than you bring in.`,
          inApp: 'Shows the shortfall, and where it is going.',
          todo: null,
        };
      }
      return {
        title: `${R(Math.round(safe / daysLeft))} a day is safe to spend`,
        body: `After your bills, your debt repayments and what you have already spent, this is what is actually free between now and month end.`,
        evidence: `Income ${R(d.income.expected)}, committed Needs ${R(committed)}, debt repayments ${R(debtService)}, ${daysLeft} days left.`,
        inApp: 'Shows the amount, and feeds the budget.',
        todo: null,
      };
    },
  },
  {
    id: 'dash-5', dueInDays: 0, priority: 1, module: 'dashboard', status: 'live', action: 'todo',
    what: 'An unusual payment.',
    reads: 'Your payments.',
    test: d => {
      /* Uncategorised is NOT the same as unusual. A payment is only worth
         alarming someone about if it is both from a merchant they have never
         paid before AND far larger than their normal spending. Anything less
         and we are frightening people about their own shopping. */
      const odd = d.tx.filter(t => t.firstTimeMerchant && t.farAboveTypical && t.amount < 0)[0];
      if (!odd) return null;
      const spends = d.tx.filter(t => t.amount < 0).map(t => Math.abs(t.amount)).sort((a, b) => a - b);
      const typical = spends[Math.floor(spends.length / 2)];
      return {
        title: 'One payment does not look like you',
        /* The copy used to say "if you recognise it, label it and we will leave
           you alone". There is nowhere to label a transaction, so it pointed at a
           control that does not exist. It now asks only for what the customer can
           actually act on: recognise it, or call the bank. */
        body: `A merchant you have never paid before, for far more than you usually spend. If you recognise it, there is nothing to do. If you do not, your bank needs to hear from you today.`,
        evidence: `${odd.merchant}, ${R(odd.amount)} on ${odd.date}. First time at this merchant. Your typical payment is about ${R(typical)}.`,
        inApp: 'Flags the payment so Tara stops asking about it.',
        todo: 'Contact your bank if you do not recognise this payment.',
      };
    },
  },

  /* ================= FAMILY CIRCLE ================= */
  {
    id: 'fam-1', dueInDays: 7, priority: 5, module: 'family', status: 'live', action: 'todo',
    what: 'Shared costs are uneven.',
    reads: 'Your shared spending.',
    test: d => {
      const [a, b] = d.family.sharedSpend;
      if (!a || !b) return null;
      const gap = a.amount - b.amount;
      if (Math.abs(gap) < 1000) return null;
      return {
        title: 'You are carrying more of the shared costs',
        body: `The split is uneven this month. It is easier to say so now than to let it build up.`,
        evidence: `${a.member} ${R(a.amount)}, ${b.member} ${R(b.amount)}. Difference ${R(gap)}.`,
        inApp: 'Shows the split.',
        todo: 'Ask them to settle up.',
      };
    },
  },
  {
    id: 'fam-2', priority: 5, cta: 'Set a limit', module: 'family', status: 'live', action: 'in-app',
    what: 'A family member is spending more.',
    reads: 'Their linked accounts.',
    test: d => {
      const o = d.family.overspender;
      if (!o || o.thisMonth <= o.average * 1.5) return null;
      return {
        title: `${o.member} is spending more than usual`,
        body: 'Worth a conversation rather than a limit, but you can set a limit if you want one.',
        evidence: `${R(o.thisMonth)} this month against a ${R(o.average)} average.`,
        inApp: 'Set a limit.',
        todo: null,
      };
    },
  },
  {
    id: 'fam-3', priority: 6, cta: 'Top it up', module: 'family', status: 'live', action: 'in-app',
    what: 'A family goal is on track.',
    reads: 'The shared goal.',
    test: d => {
      const g = d.family.sharedGoal;
      if (!g || !g.onTrack) return null;
      return {
        title: `"${g.name}" is on track at ${g.pct}%`,
        body: 'This one is going well. Top it up or leave it alone.',
        evidence: `Shared goal "${g.name}" at ${g.pct}%.`,
        inApp: 'Top it up, or adjust it.',
        todo: null,
      };
    },
  },
  {
    id: 'fam-4', dueInDays: 30, priority: 2, module: 'family', status: 'live', action: 'todo',
    what: 'Your family is not protected.',
    reads: 'Your profile and family.',
    test: d => {
      if (d.family.hasWill) return null;
      return {
        title: 'You have no will',
        body: `You have ${d.family.members} people in your circle and nothing written down about what happens to any of this.`,
        evidence: `${d.family.members} family members. No will on file.`,
        inApp: null,
        todo: 'Set up a will, or name who inherits.',
      };
    },
  },
  {
    id: 'fam-5', dueInDays: 14, priority: 6, module: 'family', status: 'live', action: 'todo',
    what: 'Set up an allowance.',
    reads: 'Money you send to family.',
    test: d => {
      if (d.family.allowanceSetUp) return null;
      return {
        title: 'You send money to family, one transfer at a time',
        body: 'A standing allowance is one decision instead of twelve.',
        evidence: 'No recurring allowance set up.',
        inApp: 'Set a reminder.',
        todo: 'Set up a monthly allowance.',
      };
    },
  },

  /* ================= FINANCIAL FITNESS ================= */
  {
    id: 'fit-1', dedupeKey: 'weakest-area', priority: 5, cta: 'Show me the one thing', module: 'fitness', status: 'live', action: 'in-app',
    what: 'Your score and level.',
    reads: 'The things that make up your fitness score.',
    test: d => ({
      title: `You are at ${d.fitness.score} out of ${d.fitness.max}`,
      body: `Your weakest area is ${d.fitness.weakest.toLowerCase()}. That is the one thing that would move the score most.`,
      evidence: `Score ${d.fitness.score}/${d.fitness.max}, level ${d.fitness.level}. Weakest component: ${d.fitness.weakest}.`,
      inApp: 'Shows the one thing that would help most.',
      todo: null,
    }),
  },
  {
    id: 'fit-2', dedupeKey: 'weakest-area', priority: 4, cta: 'Set a goal', module: 'fitness', status: 'live', action: 'in-app',
    what: 'Your weakest area.',
    reads: 'The parts of your score.',
    test: d => {
      const parts = Object.entries(d.fitness.components).sort((a, b) => a[1] - b[1]);
      const [name, val] = parts[0];
      return {
        title: `Your ${name} score is the one holding you back`,
        body: 'Fix this one and the rest follows. Everything else is already ahead of it.',
        evidence: Object.entries(d.fitness.components).map(([k, v]) => `${k} ${v}/100`).join(', ') + `. Weakest: ${name} at ${val}.`,
        inApp: 'Set a goal.',
        todo: null,
      };
    },
  },
  {
    id: 'fit-3', priority: 5, cta: 'Set a savings goal', module: 'fitness', status: 'live', action: 'in-app',
    what: 'How much you are saving.',
    reads: 'Your income against what you save.',
    test: d => {
      const saved = d.budget.filter(c => c.type === 'Savings & Investments').reduce((s, c) => s + c.spent, 0);
      /* With no income on file there is no savings rate to state. Dividing anyway
         put "You are saving NaN% of what you earn" on screen. */
      const rate = pctOf(saved, d.income.expected);
      if (rate == null || rate >= 15) return null;
      return {
        title: `You are saving ${rate}% of what you earn`,
        body: 'Below 15% and the score will not move, whatever else you do.',
        evidence: `${R(saved)} saved of ${R(d.income.expected)} income. ${rate}%.`,
        inApp: 'Set a savings goal.',
        todo: null,
      };
    },
  },
  {
    id: 'fit-4', dueInDays: 17, priority: 4, module: 'fitness', status: 'live', action: 'todo',
    what: 'Your debt is high for your income.',
    reads: 'Your repayments against your income.',
    test: d => {
      const pay = d.debts.reduce((s, x) => s + x.actualPayment, 0);
      /* No income on file gave "Infinity% of your income goes to debt". */
      const ratio = pctOf(pay, d.income.expected);
      if (ratio == null || ratio < 36) return null;
      return {
        title: `${ratio}% of your income goes to debt`,
        body: `Anything above 36% is where lenders start saying no. Moving money from Wants to debt is the fastest way down.`,
        evidence: `${R(pay)} in repayments against ${R(d.income.expected)} income. ${ratio}%.`,
        inApp: 'Builds a payoff plan.',
        todo: 'Move some money from Wants to debt.',
      };
    },
  },
  {
    id: 'fit-5', priority: 6, cta: 'Set the goal that closes it', module: 'fitness', status: 'live', action: 'in-app',
    what: 'How you compare.',
    reads: 'Your score against people on a similar income.',
    test: d => {
      const gap = d.fitness.peerAverage - d.fitness.score;
      if (gap <= 0) return null;
      return {
        title: `You are ${gap} points behind people who earn what you earn`,
        body: 'Not a judgement, just a gap. One goal closes most of it.',
        evidence: `You ${d.fitness.score}, peers on a similar income ${d.fitness.peerAverage}.`,
        inApp: 'Set the goal that closes the gap.',
        todo: null,
      };
    },
  },

  /* ================= MY ACCOUNTS ================= */
  {
    id: 'acc-1', dedupeKey: 'idle-cash', priority: 4, cta: 'Show me a savings option', module: 'accounts', status: 'live', action: 'in-app',
    what: 'Spare cash sitting idle.',
    reads: 'Your balances.',
    test: d => {
      const idle = d.accounts.filter(a => a.type === 'Savings' && a.interestRate < 1 && a.balance > 50000)[0];
      if (!idle) return null;
      return {
        title: `${R(idle.balance)} is sitting idle`,
        body: `In ${idle.name}, earning ${idle.interestRate}%. Inflation is eating it.`,
        evidence: `${idle.name}: ${R(idle.balance)} at ${idle.interestRate}%.`,
        inApp: 'Shows a savings option.',
        todo: null,
      };
    },
  },
  {
    id: 'acc-2', dueInDays: 14, priority: 4, module: 'accounts', status: 'live', action: 'todo',
    what: 'This account is costing you.',
    reads: 'The fees on each account.',
    test: d => {
      const pricey = d.accounts.filter(a => a.monthlyFee > 50).sort((a, b) => b.monthlyFee - a.monthlyFee)[0];
      if (!pricey) return null;
      return {
        title: `${pricey.name} costs you ${R(pricey.monthlyFee * 12)} a year`,
        body: `${R(pricey.monthlyFee)} a month in fees. Cheaper accounts do the same job.`,
        evidence: `${pricey.name}: ${R(pricey.monthlyFee)}/mo fee, balance ${R(pricey.balance)}.`,
        inApp: 'Compare accounts.',
        todo: `Switch or downgrade ${pricey.name}.`,
      };
    },
  },
  {
    id: 'acc-3', dueInDays: 14, priority: 3, module: 'accounts', status: 'live', action: 'todo',
    what: 'An account you are not using.',
    reads: 'Account activity.',
    test: d => {
      const dormant = d.accounts.filter(a => !a.active)[0];
      if (!dormant) return null;
      return {
        title: `${dormant.name} is dormant and still charging you`,
        body: `Nothing has moved through it in months, but the fee comes off every month regardless.`,
        evidence: `${dormant.name}: balance ${R(dormant.balance)}, fee ${R(dormant.monthlyFee)}/mo, last activity ${dormant.lastUpdated}.`,
        inApp: null,
        todo: `Close ${dormant.name}, or move the money.`,
      };
    },
  },
  {
    id: 'acc-4', priority: 6, cta: 'Bring them together', module: 'accounts', status: 'live', action: 'in-app',
    what: 'Too many accounts.',
    reads: 'Your list of accounts.',
    test: d => {
      const savings = d.accounts.filter(a => a.type === 'Savings');
      if (savings.length < 2) return null;
      return {
        title: `Your savings are split across ${savings.length} accounts`,
        body: 'Split savings earn less and are easier to forget. Together they are worth more.',
        evidence: savings.map(a => `${a.name} ${R(a.balance)} at ${a.interestRate}%`).join(', '),
        inApp: 'Bring your savings together.',
        todo: null,
      };
    },
  },
  {
    id: 'acc-5', dueInDays: 2, priority: 2, module: 'accounts', status: 'live', action: 'todo',
    what: 'A connection about to expire.',
    reads: 'When each account last updated.',
    test: d => {
      const s = d.accounts.filter(a => a.stale)[0];
      if (!s) return null;
      return {
        title: `${s.name} is about to disconnect`,
        body: 'Bank connections expire. When this one goes, your balances go quietly out of date.',
        evidence: `${s.name}: last updated ${s.lastUpdated}, ${daysBetween(new Date(s.lastUpdated), d.today)} days ago.`,
        inApp: null,
        todo: `Reconnect ${s.name}.`,
      };
    },
  },

  /* ================= INVESTMENTS ================= */
  {
    id: 'inv-1', priority: 4, cta: 'Open an investment account', module: 'investments', status: 'live', action: 'in-app',
    what: 'Cash that could be growing.',
    reads: 'Your savings when you have no investments.',
    test: d => {
      if (d.investments.idleCash < 50000) return null;
      return {
        title: `${R(d.investments.idleCash)} is sitting in everyday accounts`,
        body: 'Cash in a transactional account earns nothing while inflation eats it. Some of this belongs somewhere it can grow.',
        evidence: `${R(d.investments.idleCash)} across your everyday accounts, earning no interest. ${R(d.investments.totalValue)} currently invested.`,
        inApp: 'Open an investment account.',
        todo: null,
      };
    },
  },
  {
    id: 'inv-2', dedupeKey: 'concentration', priority: 4, cta: 'Rebalance', module: 'investments', status: 'live', action: 'in-app',
    what: 'Time to rebalance.',
    reads: 'What you hold.',
    test: d => {
      const total = d.investments.holdings.reduce((s, h) => s + h.value, 0);
      const drifted = d.investments.holdings
        .map(h => ({ ...h, actual: Math.round((h.value / total) * 100) }))
        .filter(h => h.target > 0 && Math.abs(h.actual - h.target) > 15)[0];
      if (!drifted) return null;
      return {
        title: `${drifted.name} has drifted to ${drifted.actual}% of your portfolio`,
        body: `You meant it to be ${drifted.target}%. Drift like this quietly changes how much risk you are taking.`,
        evidence: `${drifted.name}: ${R(drifted.value)}, ${drifted.actual}% actual against ${drifted.target}% target.`,
        inApp: 'Bring the mix back to your target.',
        todo: null,
      };
    },
  },
  {
    id: 'inv-3', dueInDays: 21, priority: 4, module: 'investments', status: 'live', action: 'todo',
    what: 'Keep it going.',
    reads: 'Your past contributions.',
    test: d => {
      if (d.investments.monthlyContribution > 0) return null;
      return {
        title: 'Nothing is going in each month',
        body: 'You invested once and stopped. A small monthly amount beats a big one you never make.',
        evidence: `${R(d.investments.totalValue)} invested. ${R(0)} a month going in.`,
        inApp: 'Set up a monthly investment.',
        todo: 'Set up the monthly payment.',
      };
    },
  },
  {
    id: 'inv-4', priority: 5, cta: 'Switch to a cheaper one', module: 'investments', status: 'live', action: 'in-app',
    what: 'A high-fee investment.',
    reads: 'What you hold and the fees.',
    test: d => {
      const pricey = d.investments.holdings.filter(h => h.fee > 1.5).sort((a, b) => b.fee - a.fee)[0];
      if (!pricey) return null;
      const cheapest = [...d.investments.holdings].sort((a, b) => a.fee - b.fee)[0];
      const cost = Math.round(pricey.value * ((pricey.fee - cheapest.fee) / 100));
      return {
        title: `${pricey.name} charges ${pricey.fee}% a year`,
        body: `That is ${R(cost)} a year more than your cheapest holding, every year, whether it goes up or down.`,
        evidence: `${pricey.name}: ${R(pricey.value)} at ${pricey.fee}%. ${cheapest.name} charges ${cheapest.fee}%.`,
        inApp: 'Switch to a cheaper one.',
        todo: null,
      };
    },
  },
  {
    id: 'inv-5', dedupeKey: 'concentration', priority: 5, cta: 'Spread it out', module: 'investments', status: 'live', action: 'in-app',
    what: 'Too much in one place.',
    reads: 'What you hold.',
    test: d => {
      const total = d.investments.holdings.reduce((s, h) => s + h.value, 0);
      const big = d.investments.holdings.map(h => ({ ...h, pct: Math.round((h.value / total) * 100) })).filter(h => h.pct > 70)[0];
      if (!big) return null;
      return {
        title: `${big.pct}% of your portfolio is in one fund`,
        body: 'If that one fund has a bad year, so do you. Spreading it out costs nothing.',
        evidence: `${big.name}: ${R(big.value)}, ${big.pct}% of ${R(total)}.`,
        inApp: 'Spread it across more investments.',
        todo: null,
      };
    },
  },

  /* ================= TRANSACTIONS =================
     Patrick: refunds, transfers and forgotten subscriptions "need transaction
     work that is still being done, so those should come in alongside that work,
     not before it". Flagged, not faked. */
  {
    id: 'tx-1', dueInDays: 7, priority: 3, module: 'transactions', status: 'live', action: 'todo',
    what: 'Subscriptions you forgot.',
    reads: 'Payments that repeat.',
    test: d => {
      const forgotten = d.tx.filter(t => t.recurring && t.lastUsed && daysBetween(new Date(t.lastUsed), d.today) > 90);
      if (!forgotten.length) return null;
      const monthly = forgotten.reduce((s, t) => s + Math.abs(t.amount), 0);
      return {
        title: `${forgotten.length} subscriptions you have stopped using`,
        body: `${R(monthly)} a month, ${R(monthly * 12)} a year, for things you have not opened in months.`,
        evidence: forgotten.map(t => `${t.merchant} ${R(t.amount)}/mo, last used ${t.lastUsed}`).join('. '),
        inApp: null,
        todo: `Cancel the subscriptions you no longer use (${forgotten.map(t => t.merchant).join(', ')}).`,
      };
    },
  },
  {
    id: 'tx-2', dedupeKey: 'sportsman-tx', priority: 4, cta: 'Label them with Tara', module: 'transactions', status: 'live', action: 'in-app',
    what: 'Some payments need a category.',
    reads: 'Payments the app is unsure about.',
    test: d => {
      const uncat = d.tx.filter(t => t.uncategorised);
      if (!uncat.length) return null;
      return {
        title: `${uncat.length} transaction${uncat.length > 1 ? 's need' : ' needs'} a category`,
        body: 'Uncategorised spending is invisible to your budget. It is spending you never see.',
        evidence: uncat.map(t => `${t.merchant} ${R(t.amount)}`).join(', '),
        inApp: 'Label them with Tara\'s help.',
        todo: null,
      };
    },
  },
  {
    id: 'tx-3', priority: 5, cta: 'Label it as a refund', module: 'transactions', status: 'blocked', action: 'in-app',
    blockedBy: 'Patrick: needs the transaction work that is still in progress. It should ship alongside that, not before it.',
    what: 'That is a refund, not income.',
    reads: 'Money coming in.',
    test: d => {
      const refunds = d.tx.filter(t => t.group === 'Income' && t.category === 'Refunds (In)' && t.shouldBeRefundOf);
      if (!refunds.length) return null;
      const t = refunds[0];
      return {
        title: 'A refund is being counted as income',
        body: `This inflates what you look like you earn, and it hides the fact that your original spend came back. It should reduce the ${t.shouldBeRefundOf} spend, not top up your salary.`,
        evidence: `${t.merchant}, ${R(t.amount)} on ${t.date}, currently labelled Income / Refunds (In).`,
        inApp: `Label it as a refund so it lowers the original ${t.shouldBeRefundOf} spend.`,
        todo: null,
      };
    },
  },
  {
    id: 'tx-4', dueInDays: 3, priority: 1, module: 'transactions', status: 'live', action: 'todo',
    what: 'A double charge.',
    reads: 'Your payments.',
    test: d => {
      const seen = {}, dups = [];
      d.tx.filter(t => t.amount < 0).forEach(t => {
        const k = `${t.merchant}|${t.amount}|${t.date}`;
        if (seen[k]) dups.push(t); else seen[k] = t;
      });
      if (!dups.length) return null;
      const t = dups[0];
      return {
        title: `${t.merchant} charged you twice`,
        body: 'Same merchant, same amount, same day. That is usually a mistake, and it is usually refundable if you ask.',
        evidence: `${t.merchant}, ${R(t.amount)}, twice on ${t.date}.`,
        inApp: null,
        todo: `Query the double charge from ${t.merchant}.`,
      };
    },
  },
  {
    id: 'tx-5', priority: 5, cta: 'Label it as a transfer', module: 'transactions', status: 'blocked', action: 'in-app',
    blockedBy: 'Patrick: needs the transaction work that is still in progress. It should ship alongside that, not before it.',
    what: 'That is a transfer, not spending.',
    reads: 'Money leaving one of your accounts and arriving in another.',
    test: d => {
      const t = d.tx.filter(x => x.isInternalTransfer && x.group !== 'Transfers')[0];
      if (!t) return null;
      const to = d.accounts.find(a => a.id === t.counterAccount);
      return {
        title: 'Money you moved to yourself is counted as spending',
        body: `You did not spend this, you saved it. Counting it as spending makes your budget look worse than it is and your savings invisible.`,
        evidence: `${t.merchant}, ${R(t.amount)} on ${t.date}, currently in ${t.group} / ${t.category}. It landed in ${to ? to.name : 'another of your accounts'}.`,
        inApp: 'Label it as a transfer so it is left out of the budget.',
        todo: null,
      };
    },
  },
];

/* ---------------- run the engine ---------------- */
function runEngine(d) {
  let out = [];
  INSIGHTS.forEach(def => {
    if (def.status === 'dropped') return;
    let res = null;
    try { res = def.test(d); } catch (e) { console.error('insight failed', def.id, e); }
    if (!res) return;
    out.push({ ...def, ...res, priority: def.priority || 5, dedupeKey: res.dedupeKey || def.dedupeKey || null });
  });

  /* Patrick's library reports the same idle cash from three modules. Telling a
     customer the same thing three times is noise, not insight. Keep the
     highest-priority one and record the rest so the duplication stays visible
     to us rather than to them. */
  const suppressed = [];
  const byKey = {};
  out.forEach(i => { if (i.dedupeKey) (byKey[i.dedupeKey] = byKey[i.dedupeKey] || []).push(i); });
  Object.values(byKey).forEach(group => {
    if (group.length < 2) return;
    group.sort((a, b) => a.priority - b.priority);
    group.slice(1).forEach(dup => suppressed.push(dup));
  });
  out = out.filter(i => !suppressed.includes(i));
  out.sort((a, b) => a.priority - b.priority);
  out.suppressed = suppressed;
  return out;
}

const MODULES = [
  { id: 'debt', label: 'Debt management', icon: 'Goals.svg' },
  { id: 'budgeting', label: 'Budgeting', icon: 'Budget.png' },
  { id: 'insurance', label: 'Insurance', icon: 'FinancialFitness.svg' },
  { id: 'marketplace', label: 'Marketplace', icon: 'Marketplace.svg' },
  { id: 'dashboard', label: 'Main dashboard', icon: 'Home.png' },
  { id: 'family', label: 'Family circle', icon: 'Family.svg' },
  { id: 'fitness', label: 'Financial fitness', icon: 'FinancialFitness.svg' },
  { id: 'accounts', label: 'My accounts', icon: 'MyWealth.svg' },
  { id: 'investments', label: 'Investments', icon: 'Investments.png' },
  { id: 'transactions', label: 'Transactions', icon: 'Transactions.svg' },
  { id: 'goals', label: 'Goals', icon: 'Goals.svg' },
];
