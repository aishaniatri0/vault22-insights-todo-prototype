/* ============================================================
   Mock data for the Insights + To-Do prototype.
   Shapes, groups and category names are the LIVE ones, read off
   global-website.dev.vault22.com (account ngandev0309) on 14 Jul 2026.

   Every insight in engine.js is DERIVED from this data. Nothing is
   hardcoded prose. If a situation is not in here, the card does not fire.
   ============================================================ */

const TODAY = new Date('2026-07-14T00:00:00');

/* Live transaction groups, exactly as the app shows them. */
const GROUPS = ['Day-to-day', 'Recurring', 'Invest-save-repay', 'Income', 'Transfers', 'Exceptions'];

/* Patrick's official Needs / Wants / Savings mapping (email 10 Jul 2026).
   "Not labelled" = money coming in, or moving between your own accounts. */
const NWS = {
  need: ['Groceries', 'Transport & Fuel', 'Rent', 'Home Loan', 'Bond', 'Electricity', 'Water',
    'Security', 'Alarm', 'Housekeeping', 'Medical', 'Medical Aid', 'Car Insurance',
    'Home & Contents Insurance', 'Life Insurance', 'Income Protection', 'Funeral Cover',
    'Other Insurance', 'Education', 'Children', 'Airtime & Data', 'Cellphone',
    'Mobile Phone Contract', 'Internet & Fibre', 'Tax', 'Personal Care', 'Account Fees',
    'ATM Fees', 'EFT Fees', 'Card Replacement Fee', 'Interest Paid', 'Bank Charges',
    'Late Payment Fees', 'Credit Card Repayment', 'Personal Loan', 'Vehicle Loan',
    'Student Loan', 'Overdraft', 'Store Account', 'Buy Now Pay Later'],
  want: ['Eating Out & Takeaways', 'Coffee', 'Alcohol', 'Cigarettes', 'Entertainment', 'Clothing',
    'Holidays & Travel', 'Travel Insurance', 'Hobbies', 'Sport & Fitness', 'Subscriptions',
    'TV', 'Software & Services', 'Pets', 'Gifts', 'Donations', 'Lotto & Gambling',
    'Tech & Appliances', 'Home & Garden', 'Books & Stationery', 'General Purchases'],
  savings: ['Emergency Fund', 'Investments', 'Retirement Contributions', 'Other Savings',
    'Stokvel', 'Burial Society', 'Pension'],
  none: ['Salaries & Wages', 'Other Income (In)', 'Dividends', 'Interest', 'Grants', 'Rewards',
    'Refunds (In)', 'Reimbursements (In)', 'Internal Transfer', 'Private Sales', 'Business'],
};

function classify(category) {
  if (NWS.need.includes(category)) return 'Need';
  if (NWS.want.includes(category)) return 'Want';
  if (NWS.savings.includes(category)) return 'Savings & Investments';
  return null; // not labelled
}

/* ---------------- accounts (live: 35 accounts, net worth R35,255,361) ------------- */
const ACCOUNTS = [
  { id: 'a1', name: 'Capitec Everyday', type: 'Bank', balance: 48210, monthlyFee: 7, lastUpdated: '2026-07-14', active: true },
  { id: 'a2', name: 'FNB Cheque (Gold)', type: 'Bank', balance: 132480, monthlyFee: 115, lastUpdated: '2026-07-14', active: true },
  { id: 'a3', name: 'Standard Bank Savings', type: 'Savings', balance: 412000, interestRate: 0.4, monthlyFee: 0, lastUpdated: '2026-07-13', active: true },
  { id: 'a4', name: 'Absa Money Market', type: 'Savings', balance: 571979, interestRate: 7.1, monthlyFee: 0, lastUpdated: '2026-07-14', active: true },
  { id: 'a5', name: 'Nedbank Cheque (old)', type: 'Bank', balance: 302, monthlyFee: 99, lastUpdated: '2026-01-08', active: false },
  /* The same card as debt d1, seen from the account side. It carries debtId so the
     net worth maths can count the R84,300 once: it used to appear here AND in
     DEBTS under a different name, which put the balance into liabilities twice and
     left the Debt page and the net worth card disagreeing by exactly that amount. */
  { id: 'a6', name: 'Capitec Credit Card', type: 'Credit', balance: -84300, debtId: 'd1', lastUpdated: '2026-05-02', active: true, stale: true },
  { id: 'a7', name: 'Vault22 Wallet', type: 'Investment', balance: 119402, lastUpdated: '2026-07-14', active: true },
];

/* ---------------- debts (live: 6 active, R1,549,632.35, max APR 24.5%) ------------ */
const DEBTS = [
  { id: 'd1', name: 'Capitec Credit Card', kind: 'Credit Card Repayment', balance: 84300, apr: 24.5, minPayment: 500, actualPayment: 500, dueDay: 1, missedPayments: 1, statementMinOnly: true },
  { id: 'd2', name: 'Woolworths Store Account', kind: 'Store Account', balance: 12400, apr: 21.0, minPayment: 130, actualPayment: 130, dueDay: 2, missedPayments: 0, statementMinOnly: true },
  { id: 'd3', name: 'Personal Loan (African Bank)', kind: 'Personal Loan', balance: 96000, apr: 19.5, minPayment: 900, actualPayment: 900, dueDay: 25, missedPayments: 0 },
  { id: 'd4', name: 'Vehicle Loan (WesBank)', kind: 'Vehicle Loan', balance: 268932, apr: 12.75, minPayment: 1900, actualPayment: 1900, dueDay: 28, missedPayments: 0 },
  { id: 'd5', name: 'Student Loan', kind: 'Student Loan', balance: 41000, apr: 9.5, minPayment: 250, actualPayment: 250, dueDay: 5, missedPayments: 0 },
  { id: 'd6', name: 'Home Loan', kind: 'Home Loan', balance: 1047000, apr: 11.25, minPayment: 6000, actualPayment: 6000, dueDay: 7, missedPayments: 0 },
];

/* ---------------- budget (July 2026, ZAR, live category names) -------------------- */
const INCOME = { expected: 20000, received: 20000, salaryDay: 3 };

const BUDGET = [
  { id: 'c1', name: 'Rent', group: 'Recurring', budget: 7000, spent: 7000, average: 7000 },
  { id: 'c2', name: 'Groceries', group: 'Day-to-day', budget: 4000, spent: 2500, average: 1050 },
  { id: 'c3', name: 'Coffee', group: 'Day-to-day', budget: 1000, spent: 1200, average: 980 },
  { id: 'c4', name: 'Eating Out & Takeaways', group: 'Day-to-day', budget: 1200, spent: 2360, average: 2100 },
  { id: 'c5', name: 'Subscriptions', group: 'Recurring', budget: 900, spent: 900, average: 640 },
  { id: 'c6', name: 'Electricity', group: 'Utilities', budget: 1500, spent: 1560, average: 1250 },
  { id: 'c7', name: 'Other Savings', group: 'Invest-save-repay', budget: 6000, spent: 1000, average: 0 },
  { id: 'c8', name: 'Bank Charges', group: 'Bank Fees', budget: 200, spent: 221, average: 205 },
  { id: 'c9', name: 'Transport & Fuel', group: 'Day-to-day', budget: 2200, spent: 1180, average: 2050 },
  { id: 'c10', name: 'Emergency Fund', group: 'Invest-save-repay', budget: 3000, spent: 0, average: 0 },
].map(c => ({ ...c, type: classify(c.name), alerts: [], rollover: false, trackAverage: false }));

/* six-month averages, used by the "budget is not realistic" insight */
BUDGET.forEach(c => { c.sixMonthAverage = c.average; });

/* ---------------- transactions (live groups + category names) --------------------- */
/* Deliberately contains: a double charge, a refund miscounted as income, an internal
   transfer counted as spending, two forgotten subscriptions, and heavy bank fees. */
const TX = [
  { id: 't1', date: '2026-07-12', merchant: 'Netflix', amount: -199, group: 'Recurring', category: 'Subscriptions', recurring: true, lastUsed: '2026-02-01', seen: false },
  { id: 't2', date: '2026-07-12', merchant: 'Showmax', amount: -99, group: 'Recurring', category: 'Subscriptions', recurring: true, lastUsed: '2025-11-14', seen: false },
  { id: 't3', date: '2026-07-11', merchant: 'Spotify', amount: -119, group: 'Recurring', category: 'Subscriptions', recurring: true, lastUsed: '2026-07-10' },
  { id: 't4', date: '2026-07-10', merchant: 'Adobe Creative Cloud', amount: -483, group: 'Recurring', category: 'Software & Services', recurring: true, lastUsed: '2025-12-02' },
  { id: 't5', date: '2026-07-09', merchant: 'Woolworths', amount: -1240, group: 'Day-to-day', category: 'Groceries' },
  { id: 't6', date: '2026-07-08', merchant: 'Uber Eats', amount: -430, group: 'Day-to-day', category: 'Eating Out & Takeaways' },
  { id: 't7', date: '2026-07-08', merchant: 'Uber Eats', amount: -430, group: 'Day-to-day', category: 'Eating Out & Takeaways' }, // double charge
  { id: 't8', date: '2026-07-07', merchant: 'Takealot Refund', amount: 899, group: 'Income', category: 'Refunds (In)', shouldBeRefundOf: 'Tech & Appliances' },
  { id: 't9', date: '2026-07-06', merchant: 'Transfer to Absa Money Market', amount: -15000, group: 'Day-to-day', category: 'Other Savings', isInternalTransfer: true, counterAccount: 'a4' },
  { id: 't10', date: '2026-07-05', merchant: 'FNB Monthly Account Fee', amount: -115, group: 'Recurring', category: 'Account Fees' },
  { id: 't11', date: '2026-07-05', merchant: 'Nedbank Monthly Fee', amount: -99, group: 'Recurring', category: 'Account Fees' },
  { id: 't12', date: '2026-07-04', merchant: 'ATM Withdrawal Fee', amount: -7, group: 'Recurring', category: 'ATM Fees' },
  { id: 't13', date: '2026-07-03', merchant: 'Salary', amount: 20000, group: 'Income', category: 'Salaries & Wages' },
  { id: 't14', date: '2026-07-02', merchant: 'Vida e Caffe', amount: -52, group: 'Day-to-day', category: 'Coffee' },
  { id: 't15', date: '2026-07-01', merchant: 'Sportsman Warehouse', amount: -2400, group: 'Day-to-day', category: 'Tech & Appliances', uncategorised: true },
  { id: 't16', date: '2026-07-13', merchant: 'PAYFAST*UNKNOWN-MERCH', amount: -3750, group: 'Exceptions', category: 'General Purchases', firstTimeMerchant: true, farAboveTypical: true, seen: false, pending: true },
];

/* ---------------- goals (live) ---------------------------------------------------- */
const GOALS = [
  { id: 'g1', name: 'A holiday', target: 40000, saved: 24400, pct: 61, monthly: 1200 },
  { id: 'g2', name: 'Emergency fund', target: 60000, saved: 6600, pct: 11, monthly: 0 },
  { id: 'g3', name: 'SA to Global', target: 100000, saved: 10000, pct: 10, monthly: 500 },
];

/* ---------------- insurance ------------------------------------------------------- */
const INSURANCE = {
  policies: [
    { id: 'p1', type: 'Funeral Cover', insurer: 'Old Mutual', premium: 320, cover: 50000, since: '2021-03-01' },
    { id: 'p2', type: 'Funeral Cover', insurer: 'Sanlam', premium: 285, cover: 40000, since: '2023-08-01' }, // duplicate
    { id: 'p3', type: 'Car Insurance', insurer: 'Discovery', premium: 1450, cover: 180000, since: '2022-01-01', premiumLastYear: 1180 },
  ],
  hasLifeCover: false,
  hasIncomeProtection: false,
  /* Not asked yet. The precursor card must ask before any cover advice fires. */
  ownsCar: null,
  ownsHome: null,
  dependants: 2,
};

/* ---------------- financial fitness (live: 660/1000, "Expert") -------------------- */
const FITNESS = { score: 660, max: 1000, level: 'Expert', peerAverage: 705, weakest: 'Savings rate', components: { savings: 38, debt: 52, protection: 44, growth: 71 } };

/* ---------------- investments ----------------------------------------------------- */
const INVESTMENTS = {
  /* profit is inception-to-date (totalValue less invested). monthProfit is what the
     book actually moved THIS month, and it is the only one of the two that may be
     described as a monthly change. They were previously conflated, which reported
     lifetime profit as "up this month". */
  totalValue: 119402, invested: 113759, profit: 5643, monthProfit: 1240, monthlyContribution: 0,
  holdings: [
    { name: 'Conservative Portfolio', value: 101955, fee: 1.75, target: 60 },
    { name: 'Global Balanced Fund of Funds', value: 4844, fee: 0.85, target: 40 },
    { name: 'Vault22 SA Savings', value: 12603, fee: 0.45, target: 0 },
  ],
  /* Cash that is genuinely doing nothing: the everyday transactional accounts,
     which pay no interest. NOT the Absa Money Market (7.1%), which is already
     working, and NOT the Standard Bank savings pot the accounts/marketplace
     cards flag separately. Three different pots, so no double counting. */
  idleCash: ACCOUNTS.filter(a => a.type === 'Bank' && a.active).reduce((s, a) => s + a.balance, 0),
};

/* ---------------- family circle --------------------------------------------------- */
const FAMILY = {
  exists: true, members: 3,
  sharedSpend: [{ member: 'You', amount: 12400 }, { member: 'Partner', amount: 3100 }],
  sharedGoal: { name: 'Family holiday', pct: 48, onTrack: true },
  hasWill: false,
  allowanceSetUp: false,
  overspender: { member: 'Partner', thisMonth: 3100, average: 1400 },
};

/* ---------------- marketplace ----------------------------------------------------- */
const MARKETPLACE = {
  cheaperAccount: { name: 'Capitec Global One', monthlyFee: 7, saves: 108 },
  betterSavingsRate: { name: 'Vault22 SA Savings', rate: 8.25 },
  refinance: { availableFor: 'Personal Loan (African Bank)', newApr: 14.5 },
  rewardsCard: { name: 'Old Mutual Rewards', estimatedAnnual: 1800 },
  hasLoanSuppliers: false, // Stephen: "we don't have enough loan suppliers yet"
};

/* Net worth is DERIVED, not asserted. A hardcoded R35m against seven accounts
   that sum to R1.2m is the kind of impossible number the engine exists to avoid.

   One number here is NOT derived, and the app now says so wherever it appears.
   The home loan implies a home, but no linked account can tell us what that home
   is worth, so PROPERTY_VALUE is the customer's own estimate. It is far too big
   to bury: it is more than half the asset side, and without it this customer's
   linked accounts alone come to a NEGATIVE net worth. Presenting it as fact would
   be exactly the thing this engine exists to refuse, so it is carried as an
   estimate, labelled as one, and the linked-accounts-only figure is carried
   alongside it so the two can always be compared. */
const PROPERTY_VALUE = 1850000; // customer estimate for the home the R1,047,000 bond is against
const PROPERTY_ESTIMATED = true;

/* A credit account that mirrors a debt row (a6 <-> d1) must not be counted on both
   sides. DEBTS is the authority for what is owed; linked accounts are the view. */
const _linkedAccountLiabilities = ACCOUNTS.filter(a => !a.debtId)
  .reduce((s, a) => s + Math.max(0, -a.balance), 0);

const _linkedAssets = ACCOUNTS.reduce((s, a) => s + Math.max(0, a.balance), 0);
const _assets = _linkedAssets + PROPERTY_VALUE;
const _liabilities = _linkedAccountLiabilities + DEBTS.reduce((s, x) => s + x.balance, 0);
const NET_WORTH = _assets - _liabilities;
/* What the linked accounts alone support, with nothing estimated. */
const NET_WORTH_LINKED = _linkedAssets - _liabilities;

/* The monthly change is tied to what actually moved. INVESTMENTS.profit is
   inception-to-date, not a monthly delta, so it cannot be presented as "this
   month": the month's movement is the investment book's move for the month plus
   what was actually saved into a savings account this month. */
const _savedThisMonth = TX
  .filter(t => t.category === 'Other Savings' || t.category === 'Emergency Fund')
  .reduce((s, t) => s + Math.abs(Math.min(0, t.amount)), 0);
const NET_WORTH_CHANGE = {
  total: INVESTMENTS.monthProfit + _savedThisMonth,
  fromInvestments: INVESTMENTS.monthProfit,
  fromSaving: _savedThisMonth,
};

const DATA = {
  today: TODAY, groups: GROUPS, nws: NWS, classify,
  profile: { name: 'ngandev0309', netWorth: NET_WORTH, netWorthLinked: NET_WORTH_LINKED,
    propertyValue: PROPERTY_VALUE, propertyEstimated: PROPERTY_ESTIMATED,
    linkedAssets: _linkedAssets,
    assets: _assets, liabilities: _liabilities, profileComplete: 97,
    netWorthChange: NET_WORTH_CHANGE },
  accounts: ACCOUNTS, debts: DEBTS, budget: BUDGET, income: INCOME, tx: TX,
  goals: GOALS, insurance: INSURANCE, fitness: FITNESS, investments: INVESTMENTS,
  family: FAMILY, marketplace: MARKETPLACE,
};
