// FinSentry AI — frontend SPA (no build step, vanilla JS + fetch)

const appEl = document.getElementById('app');
const toastHost = document.getElementById('toastHost');
const aiPill = document.getElementById('aiStatusPill');

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------
function fmtINR(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'Not configured';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  let body;
  try { body = await res.json(); } catch { body = {}; }
  if (!res.ok) {
    throw new Error(body.error || 'Something went wrong. Please try again.');
  }
  return body;
}

function badge(text, cls) {
  return `<span class="badge badge-${cls}">${escapeHtml(text)}</span>`;
}

function riskBadge(level) {
  return badge(level, level);
}

function statusBadge(status) {
  const map = { APPROVED: 'APPROVED', HOLD: 'HOLD', ESCALATE: 'ESCALATE' };
  return badge(status, map[status] || 'info');
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------
const routes = {};
function route(name, handler) { routes[name] = handler; }

async function render() {
  const hash = window.location.hash.replace('#/', '') || 'dashboard';
  const [routeName, param] = hash.split('/');
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === routeName);
  });
  const handler = routes[routeName] || routes.dashboard;
  appEl.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
  try {
    await handler(param);
  } catch (err) {
    appEl.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  refreshAiPill();
  render();
});

async function refreshAiPill() {
  try {
    const health = await api('/api/health');
    aiPill.textContent = 'AI reasoning: ' + (health.aiConfigured ? 'on' : 'off');
    aiPill.classList.toggle('ai-pill--on', health.aiConfigured);
    aiPill.classList.toggle('ai-pill--off', !health.aiConfigured);
  } catch { /* non-blocking */ }
}

// ---------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------
route('dashboard', async () => {
  const data = await api('/api/dashboard');
  const s = data.settings;

  appEl.innerHTML = `
    <div class="view-header">
      <p class="view-eyebrow">Financial Intelligence Dashboard</p>
      <h1 class="view-title">FinSentry AI</h1>
      <p class="view-sub">Safer payment decisions with explainable financial intelligence.</p>
    </div>

    <div class="grid-4" style="margin-bottom:16px;">
      <div class="stat-block">
        <p class="stat-label">Current Available Cash</p>
        <p class="stat-value ${s && s.currentCash !== null ? '' : 'muted'}">${s && s.currentCash !== null ? fmtINR(s.currentCash) : 'Not configured'}</p>
      </div>
      <div class="stat-block">
        <p class="stat-label">Minimum Operating Reserve</p>
        <p class="stat-value ${s && s.minReserve !== null ? '' : 'muted'}">${s && s.minReserve !== null ? fmtINR(s.minReserve) : 'Not configured'}</p>
      </div>
      <div class="stat-block">
        <p class="stat-label">Total Invoices</p>
        <p class="stat-value">${data.counts.total}</p>
      </div>
      <div class="stat-block">
        <p class="stat-label">Held / Escalated</p>
        <p class="stat-value">${data.counts.heldOrEscalated}</p>
      </div>
    </div>

    ${!s ? `
      <div class="panel" style="margin-bottom:16px;">
        <p style="margin:0 0 12px;color:var(--ink-soft);font-size:14px;">Financial data not configured. Configure cash and reserve to enable liquidity impact analysis.</p>
        <a href="#/settings" class="btn btn-primary">Configure Financial Settings</a>
      </div>
    ` : ''}

    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <p class="panel-title" style="margin:0;">Recent Invoices</p>
        <a href="#/add-invoice" class="btn btn-primary" style="padding:8px 14px;font-size:13px;">+ Add New Invoice</a>
      </div>
      ${data.recentInvoices.length === 0 ? `
        <div class="empty-state"><p>No invoices yet.</p></div>
      ` : `
        <div class="invoice-row head">
          <div>Vendor</div><div>Invoice</div><div>Amount</div><div>Risk</div><div>Status</div>
        </div>
        ${data.recentInvoices.map((inv) => `
          <div class="invoice-row row-link" onclick="window.location.hash='#/invoice/${inv.id}'">
            <div class="invoice-vendor">${escapeHtml(inv.vendorName)}</div>
            <div class="invoice-number">${escapeHtml(inv.invoiceNumber)}</div>
            <div class="invoice-amount">${fmtINR(inv.amount)}</div>
            <div>${inv.analysis ? riskBadge(inv.analysis.riskLevel) : '—'}</div>
            <div>${statusBadge(inv.status)}</div>
          </div>
        `).join('')}
      `}
    </div>

    <div class="panel">
      <p class="panel-title">Payment Requests</p>
      <div class="empty-state"><p>No payment requests yet.</p></div>
    </div>

    <div class="panel">
      <p class="panel-title">Approval Cases</p>
      ${data.approvalCases.length === 0 ? `
        <div class="empty-state"><p>No approval cases yet.</p></div>
      ` : `
        ${data.approvalCases.slice(0, 5).map((c) => `
          <div class="invoice-row row-link" onclick="window.location.hash='#/invoice/${c.invoiceId}'">
            <div class="invoice-vendor">${escapeHtml(c.vendorName)}</div>
            <div class="invoice-number">${escapeHtml(c.invoiceNumber)}</div>
            <div class="invoice-amount">${fmtINR(c.amount)}</div>
            <div>${riskBadge(c.riskLevel)}</div>
            <div>${statusBadge(c.status)}</div>
          </div>
        `).join('')}
        <div style="margin-top:12px;"><a href="#/cases" class="btn btn-secondary" style="padding:8px 14px;font-size:13px;">View all cases</a></div>
      `}
    </div>
  `;
});

// ---------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------
route('settings', async () => {
  const { settings } = await api('/api/settings');

  appEl.innerHTML = `
    <div class="view-header">
      <p class="view-eyebrow">Configuration</p>
      <h1 class="view-title">Financial Settings</h1>
      <p class="view-sub">These values power liquidity impact analysis and the "What if I pay?" simulation. Nothing here is invented — leave a field blank if you don't want to configure it yet.</p>
    </div>

    <div class="panel" style="max-width:520px;">
      <div id="settingsError"></div>
      <div class="field">
        <label for="currentCash">Current Available Cash (₹)</label>
        <input type="number" id="currentCash" min="0" step="0.01" value="${settings && settings.currentCash !== null ? settings.currentCash : ''}" placeholder="e.g. 1000000" />
      </div>
      <div class="field">
        <label for="minReserve">Minimum Operating Reserve (₹)</label>
        <input type="number" id="minReserve" min="0" step="0.01" value="${settings && settings.minReserve !== null ? settings.minReserve : ''}" placeholder="e.g. 600000" />
      </div>
      <div class="field">
        <label for="upcomingObligations">Upcoming Obligations / Payments (₹) <span class="hint">— optional</span></label>
        <input type="number" id="upcomingObligations" min="0" step="0.01" value="${settings && settings.upcomingObligations !== null && settings.upcomingObligations !== undefined ? settings.upcomingObligations : ''}" placeholder="Optional" />
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="saveSettingsBtn">Save Financial Settings</button>
        <a href="#/dashboard" class="btn btn-secondary">Skip for Now</a>
      </div>
      ${settings ? `<p class="hint" style="margin-top:14px;">Last updated ${fmtDate(settings.updatedAt)}.</p>` : ''}
    </div>
  `;

  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const currentCash = document.getElementById('currentCash').value;
    const minReserve = document.getElementById('minReserve').value;
    const upcomingObligations = document.getElementById('upcomingObligations').value;
    try {
      await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ currentCash, minReserve, upcomingObligations })
      });
      toast('Financial settings saved.');
      window.location.hash = '#/dashboard';
    } catch (err) {
      document.getElementById('settingsError').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  });
});

// ---------------------------------------------------------------------
// ADD INVOICE
// ---------------------------------------------------------------------
route('add-invoice', async () => {
  appEl.innerHTML = `
    <div class="view-header">
      <p class="view-eyebrow">New Invoice</p>
      <h1 class="view-title">Add New Invoice</h1>
      <p class="view-sub">Enter the invoice details below. FinSentry will calculate risk from this and any previously stored invoices — nothing is pre-filled.</p>
    </div>

    <div class="panel" style="max-width:560px;">
      <div id="invoiceFormError"></div>
      <div class="grid-2">
        <div class="field">
          <label for="vendorName">Vendor Name</label>
          <input type="text" id="vendorName" placeholder="e.g. ABC Supplies" />
        </div>
        <div class="field">
          <label for="invoiceNumber">Invoice Number</label>
          <input type="text" id="invoiceNumber" placeholder="e.g. INV-1042" />
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="amount">Invoice Amount (₹)</label>
          <input type="number" id="amount" min="0" step="0.01" placeholder="e.g. 480000" />
        </div>
        <div class="field">
          <label for="invoiceDate">Invoice Date</label>
          <input type="date" id="invoiceDate" />
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="poNumber">Purchase Order Number <span class="hint">— optional</span></label>
          <input type="text" id="poNumber" placeholder="e.g. PO-8831" />
        </div>
        <div class="field">
          <label for="poAmount">PO Amount (₹) <span class="hint">— optional, if known</span></label>
          <input type="number" id="poAmount" min="0" step="0.01" placeholder="Only if you know the PO amount" />
        </div>
      </div>
      <div class="field">
        <label for="bankAccountNumber">Bank Account Number <span class="hint">— optional</span></label>
        <input type="text" id="bankAccountNumber" placeholder="Vendor's payout account" />
      </div>

      <div class="btn-row">
        <a href="#/dashboard" class="btn btn-secondary">Cancel</a>
        <button class="btn btn-secondary" id="demoBtn" type="button">Use Demo Invoice</button>
        <button class="btn btn-primary" id="analyzeBtn" type="button">Analyze Invoice</button>
      </div>
    </div>
  `;

  document.getElementById('demoBtn').addEventListener('click', async () => {
    try {
      const { invoice } = await api('/api/demo-invoice');
      document.getElementById('vendorName').value = invoice.vendorName;
      document.getElementById('invoiceNumber').value = invoice.invoiceNumber;
      document.getElementById('amount').value = invoice.amount;
      document.getElementById('invoiceDate').value = invoice.invoiceDate;
      document.getElementById('poNumber').value = invoice.poNumber || '';
      document.getElementById('bankAccountNumber').value = invoice.bankAccountNumber || '';
      toast('Demo invoice loaded — this is for demonstration only.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const payload = {
      vendorName: document.getElementById('vendorName').value.trim(),
      invoiceNumber: document.getElementById('invoiceNumber').value.trim(),
      amount: document.getElementById('amount').value,
      invoiceDate: document.getElementById('invoiceDate').value,
      poNumber: document.getElementById('poNumber').value.trim(),
      poAmount: document.getElementById('poAmount').value,
      bankAccountNumber: document.getElementById('bankAccountNumber').value.trim()
    };
    const btn = document.getElementById('analyzeBtn');
    btn.disabled = true;
    btn.textContent = 'Analyzing…';
    try {
      const { invoice } = await api('/api/invoices/analyze', { method: 'POST', body: JSON.stringify(payload) });
      window.location.hash = `#/invoice/${invoice.id}`;
    } catch (err) {
      document.getElementById('invoiceFormError').innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'Analyze Invoice';
    }
  });
});

// ---------------------------------------------------------------------
// INVOICE / RISK ANALYSIS DETAIL
// ---------------------------------------------------------------------
route('invoice', async (id) => {
  const { invoice } = await api(`/api/invoices/${id}`);
  const a = invoice.analysis;

  if (!a) {
    appEl.innerHTML = `<div class="empty-state"><p>This invoice has not been analyzed yet.</p></div>`;
    return;
  }

  const severityIcon = { critical: '!', warning: '!', ok: '✓', info: 'i' };

  appEl.innerHTML = `
    <div class="view-header">
      <p class="view-eyebrow">Risk Analysis</p>
      <h1 class="view-title">Invoice ${escapeHtml(invoice.invoiceNumber)}</h1>
      <p class="view-sub">${escapeHtml(invoice.vendorName)} · ${fmtINR(invoice.amount)} · ${fmtDate(invoice.invoiceDate)}</p>
    </div>

    <div class="panel">
      <div class="risk-score-row">
        <div>
          <span class="risk-score-number">${a.riskScore}</span><span class="risk-score-max"> / 100</span>
        </div>
        <div>${riskBadge(a.riskLevel)}</div>
      </div>
      <div class="risk-track"><div class="risk-fill ${a.riskLevel}" style="width:${a.riskScore}%;"></div></div>
    </div>

    <div class="panel">
      <p class="panel-title">Detected Findings</p>
      ${a.findings.map((f) => `
        <div class="finding">
          <div class="finding-icon ${f.severity}">${severityIcon[f.severity] || 'i'}</div>
          <div>
            <p class="finding-title">${escapeHtml(f.title)}</p>
            <p class="finding-detail">${escapeHtml(f.detail)}</p>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="panel">
      <p class="panel-title">Business Impact</p>
      <p style="margin:0;font-size:14.5px;color:var(--ink);">${escapeHtml(a.explanation.businessImpact)}</p>
    </div>

    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <p class="panel-title" style="margin-bottom:4px;">Recommended Action</p>
          <div style="font-family:var(--font-display);font-size:20px;font-weight:600;color:var(--brand-strong);">${a.recommendation}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary" id="whyBtn">Why This Decision?</button>
          <button class="btn btn-secondary" id="whatIfBtn">What If I Pay?</button>
        </div>
      </div>

      <hr class="divider" />

      <p class="section-label">Update status</p>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-approve" data-status="APPROVE">Approve</button>
        <button class="btn btn-hold" data-status="HOLD">Hold</button>
        <button class="btn btn-escalate" data-status="ESCALATE">Escalate</button>
      </div>
      <p class="hint" style="margin-top:10px;">Current status: ${statusBadge(invoice.status)}</p>
    </div>
  `;

  document.getElementById('whyBtn').addEventListener('click', () => openWhyModal(invoice));
  document.getElementById('whatIfBtn').addEventListener('click', () => openWhatIfModal(invoice));
  document.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/invoices/${invoice.id}/status`, { method: 'POST', body: JSON.stringify({ status: btn.dataset.status }) });
        toast(`Invoice marked ${btn.dataset.status === 'APPROVE' ? 'APPROVED' : btn.dataset.status}.`);
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
});

function openWhyModal(invoice) {
  const a = invoice.analysis;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-wrap">
      <button class="modal-close">&times;</button>
      <h2 class="modal-title">Why This Decision?</h2>
      <p style="font-size:14.5px;line-height:1.6;margin:0 0 16px;">${escapeHtml(a.explanation.whyThisDecision)}</p>
      <hr class="divider" />
      <p class="section-label">Overall risk</p>
      <p style="margin:0 0 14px;font-size:14px;">${a.riskScore}/100 — ${a.riskLevel} risk. Recommended action: <strong>${a.recommendation}</strong>.</p>
      <p class="section-label">Main findings</p>
      ${a.findings.filter((f) => f.severity !== 'info').map((f) => `<p style="margin:0 0 6px;font-size:13.5px;">${escapeHtml(f.title)} — ${escapeHtml(f.detail)}</p>`).join('') || '<p style="font-size:13.5px;color:var(--ink-soft);">No notable findings.</p>'}
      <p class="explanation-source">${a.explanation.source === 'ai' ? 'Generated by the configured AI model from these findings.' : 'Generated deterministically from these findings (AI provider not used).'}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.classList.contains('modal-close')) overlay.remove(); });
}

async function openWhatIfModal(invoice) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal-wrap"><button class="modal-close">&times;</button><h2 class="modal-title">What If I Pay?</h2><p>Loading…</p></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.classList.contains('modal-close')) overlay.remove(); });

  try {
    const sim = await api(`/api/invoices/${invoice.id}/what-if`);
    const modal = overlay.querySelector('.modal');
    if (!sim.available) {
      modal.innerHTML = `
        <button class="modal-close">&times;</button>
        <h2 class="modal-title">What If I Pay?</h2>
        <p style="font-size:14px;color:var(--ink-soft);margin-bottom:18px;">${escapeHtml(sim.message)}</p>
        <a href="#/settings" class="btn btn-primary">Configure Financial Settings</a>
      `;
    } else {
      const statusText = {
        safe: '✓ Payment remains above reserve',
        approaching_reserve: '⚠ Payment approaches reserve',
        below_reserve: '⚠ Payment falls below reserve'
      }[sim.status];

      modal.innerHTML = `
        <button class="modal-close">&times;</button>
        <h2 class="modal-title">What If I Pay?</h2>
        <div class="whatif-line"><span>Current Available Cash</span><span class="whatif-amount">${fmtINR(sim.currentCash)}</span></div>
        <div class="whatif-line"><span>Invoice Amount</span><span class="whatif-amount whatif-negative">− ${fmtINR(sim.invoiceAmount)}</span></div>
        <div class="whatif-line total"><span>Cash After Payment</span><span class="whatif-amount">${fmtINR(sim.cashAfterPayment)}</span></div>
        <div class="whatif-line" style="margin-top:10px;"><span>Minimum Operating Reserve</span><span class="whatif-amount">${fmtINR(sim.minReserve)}</span></div>
        <div class="whatif-status ${sim.status}">${statusText}</div>
        ${sim.recommendation ? `<p class="hint" style="margin-top:14px;">Recommendation: <strong>${sim.recommendation}</strong></p>` : ''}
      `;
    }
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  } catch (err) {
    overlay.querySelector('.modal').innerHTML = `<button class="modal-close">&times;</button><div class="error-banner">${escapeHtml(err.message)}</div>`;
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  }
}

// ---------------------------------------------------------------------
// APPROVAL CASES
// ---------------------------------------------------------------------
route('cases', async () => {
  const { cases } = await api('/api/cases');
  appEl.innerHTML = `
    <div class="view-header">
      <p class="view-eyebrow">Workflow</p>
      <h1 class="view-title">Approval Cases</h1>
      <p class="view-sub">Cases are created automatically when an invoice is recommended for HOLD or ESCALATE.</p>
    </div>
    <div class="panel">
      ${cases.length === 0 ? `<div class="empty-state"><p>No approval cases yet.</p></div>` : `
        <div class="invoice-row head"><div>Vendor</div><div>Invoice</div><div>Amount</div><div>Risk</div><div>Status</div></div>
        ${cases.map((c) => `
          <div class="invoice-row row-link" onclick="window.location.hash='#/invoice/${c.invoiceId}'">
            <div class="invoice-vendor">${escapeHtml(c.vendorName)}</div>
            <div class="invoice-number">${escapeHtml(c.invoiceNumber)}</div>
            <div class="invoice-amount">${fmtINR(c.amount)}</div>
            <div>${riskBadge(c.riskLevel)}</div>
            <div>${statusBadge(c.status)}</div>
          </div>
        `).join('')}
      `}
    </div>
  `;
});
