const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { withState, readState } = require('./lib/db');
const { analyzeInvoice, maskAccountNumber } = require('./lib/analysis');
const { generateExplanation, isConfigured } = require('./lib/aiProvider');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function genId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function validateInvoiceInput(body) {
  const errors = [];
  if (!body.vendorName || !String(body.vendorName).trim()) errors.push('Vendor name is required.');
  if (!body.invoiceNumber || !String(body.invoiceNumber).trim()) errors.push('Invoice number is required.');
  const amount = parseFloat(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Invoice amount must be a positive number.');
  if (body.invoiceDate && Number.isNaN(Date.parse(body.invoiceDate))) errors.push('Invoice date is invalid.');
  return { errors, amount };
}

function publicInvoice(inv) {
  return {
    ...inv,
    bankAccountNumber: inv.bankAccountNumber || null,
    bankAccountMasked: maskAccountNumber(inv.bankAccountNumber)
  };
}

// ---------------------------------------------------------------------
// Financial Settings
// ---------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const state = readState();
  res.json({ settings: state.financialSettings });
});

app.post('/api/settings', async (req, res) => {
  try {
    const { currentCash, minReserve, upcomingObligations } = req.body;
    const cash = currentCash === '' || currentCash === undefined || currentCash === null ? null : parseFloat(currentCash);
    const reserve = minReserve === '' || minReserve === undefined || minReserve === null ? null : parseFloat(minReserve);
    const obligations = upcomingObligations === '' || upcomingObligations === undefined || upcomingObligations === null
      ? null
      : parseFloat(upcomingObligations);

    if (cash !== null && !Number.isFinite(cash)) return res.status(400).json({ error: 'Current Available Cash must be a number.' });
    if (reserve !== null && !Number.isFinite(reserve)) return res.status(400).json({ error: 'Minimum Operating Reserve must be a number.' });
    if (obligations !== null && !Number.isFinite(obligations)) return res.status(400).json({ error: 'Upcoming Obligations must be a number.' });

    const settings = {
      currentCash: cash,
      minReserve: reserve,
      upcomingObligations: obligations,
      updatedAt: new Date().toISOString()
    };

    await withState((state) => {
      state.financialSettings = settings;
    });

    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save financial settings.' });
  }
});

// ---------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------
app.get('/api/dashboard', (req, res) => {
  const state = readState();
  const invoices = state.invoices;
  const total = invoices.length;
  const pending = invoices.filter((i) => !i.analysis).length;
  const approved = invoices.filter((i) => i.status === 'APPROVED').length;
  const heldOrEscalated = invoices.filter((i) => i.status === 'HOLD' || i.status === 'ESCALATE').length;

  res.json({
    settings: state.financialSettings,
    counts: { total, pending, approved, heldOrEscalated },
    recentInvoices: invoices
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8)
      .map(publicInvoice),
    approvalCases: state.approvalCases.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    aiConfigured: isConfigured()
  });
});

// ---------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------
app.get('/api/invoices', (req, res) => {
  const state = readState();
  res.json({ invoices: state.invoices.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(publicInvoice) });
});

app.get('/api/invoices/:id', (req, res) => {
  const state = readState();
  const inv = state.invoices.find((i) => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ invoice: publicInvoice(inv) });
});

// Analyze + store an invoice in one step (matches the "Analyze Invoice" button).
app.post('/api/invoices/analyze', async (req, res) => {
  try {
    const { errors, amount } = validateInvoiceInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const invoiceDraft = {
      vendorName: String(req.body.vendorName).trim(),
      invoiceNumber: String(req.body.invoiceNumber).trim(),
      amount,
      poNumber: req.body.poNumber ? String(req.body.poNumber).trim() : '',
      poAmount: req.body.poAmount !== undefined && req.body.poAmount !== '' ? parseFloat(req.body.poAmount) : undefined,
      invoiceDate: req.body.invoiceDate || '',
      bankAccountNumber: req.body.bankAccountNumber ? String(req.body.bankAccountNumber).trim() : ''
    };

    const state = readState();
    const analysis = analyzeInvoice(invoiceDraft, state.invoices, state.financialSettings);
    const explanation = await generateExplanation(invoiceDraft, analysis);

    const invoiceId = genId('INV');
    const record = {
      id: invoiceId,
      displayNumber: invoiceDraft.invoiceNumber,
      ...invoiceDraft,
      status: analysis.recommendation, // APPROVE / HOLD / ESCALATE — no separate manual step needed to set initial status
      createdAt: new Date().toISOString(),
      analysis: { ...analysis, explanation }
    };

    let approvalCase = null;
    await withState((s) => {
      s.invoices.push(record);
      if (analysis.recommendation === 'HOLD' || analysis.recommendation === 'ESCALATE') {
        approvalCase = {
          id: genId('CASE'),
          invoiceId,
          invoiceNumber: record.invoiceNumber,
          vendorName: record.vendorName,
          amount: record.amount,
          riskLevel: analysis.riskLevel,
          recommendation: analysis.recommendation,
          reason: analysis.findings.filter((f) => f.severity === 'critical' || f.severity === 'warning').map((f) => f.title).join(', ') || 'Risk review required.',
          status: analysis.recommendation, // starts matching the recommendation, user can change it
          createdAt: new Date().toISOString(),
          history: [{ status: analysis.recommendation, at: new Date().toISOString(), note: 'Case created from invoice analysis.' }]
        };
        s.approvalCases.push(approvalCase);
      }
    });

    res.json({ invoice: publicInvoice(record), approvalCase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Invoice analysis failed. Please try again.' });
  }
});

// What-if payment simulation for an already-analyzed invoice
app.get('/api/invoices/:id/what-if', (req, res) => {
  const state = readState();
  const inv = state.invoices.find((i) => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found.' });

  const settings = state.financialSettings;
  if (!settings || settings.currentCash === null || settings.minReserve === null) {
    return res.json({ available: false, message: 'Cash-flow simulation requires financial settings.' });
  }

  const currentCash = settings.currentCash;
  const minReserve = settings.minReserve;
  const cashAfterPayment = Math.round((currentCash - inv.amount) * 100) / 100;
  let status;
  if (cashAfterPayment < minReserve) status = 'below_reserve';
  else if (cashAfterPayment - minReserve <= minReserve * 0.15) status = 'approaching_reserve';
  else status = 'safe';

  res.json({
    available: true,
    currentCash,
    invoiceAmount: inv.amount,
    cashAfterPayment,
    minReserve,
    upcomingObligations: settings.upcomingObligations,
    status,
    recommendation: inv.analysis ? inv.analysis.recommendation : null
  });
});

// Manually update an invoice's status (Approve / Hold / Escalate buttons)
app.post('/api/invoices/:id/status', async (req, res) => {
  const { status, note } = req.body;
  if (!['APPROVE', 'APPROVED', 'HOLD', 'ESCALATE'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const normalized = status === 'APPROVE' ? 'APPROVED' : status;

  let updated = null;
  await withState((state) => {
    const inv = state.invoices.find((i) => i.id === req.params.id);
    if (!inv) return;
    inv.status = normalized;
    updated = inv;

    const linkedCase = state.approvalCases.find((c) => c.invoiceId === inv.id);
    if (linkedCase) {
      linkedCase.status = normalized;
      linkedCase.history.push({ status: normalized, at: new Date().toISOString(), note: note || '' });
    } else if (normalized === 'HOLD' || normalized === 'ESCALATE') {
      state.approvalCases.push({
        id: genId('CASE'),
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        vendorName: inv.vendorName,
        amount: inv.amount,
        riskLevel: inv.analysis ? inv.analysis.riskLevel : 'UNKNOWN',
        recommendation: normalized,
        reason: 'Manually updated by user.',
        status: normalized,
        createdAt: new Date().toISOString(),
        history: [{ status: normalized, at: new Date().toISOString(), note: note || 'Case created from manual status change.' }]
      });
    }
  });

  if (!updated) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ invoice: publicInvoice(updated) });
});

// ---------------------------------------------------------------------
// Approval Cases
// ---------------------------------------------------------------------
app.get('/api/cases', (req, res) => {
  const state = readState();
  res.json({ cases: state.approvalCases.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

app.post('/api/cases/:id/status', async (req, res) => {
  const { status, note } = req.body;
  if (!['APPROVED', 'HOLD', 'ESCALATE'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  let updatedCase = null;
  await withState((state) => {
    const c = state.approvalCases.find((c) => c.id === req.params.id);
    if (!c) return;
    c.status = status;
    c.history.push({ status, at: new Date().toISOString(), note: note || '' });
    updatedCase = c;
    const inv = state.invoices.find((i) => i.id === c.invoiceId);
    if (inv) inv.status = status;
  });
  if (!updatedCase) return res.status(404).json({ error: 'Case not found.' });
  res.json({ case: updatedCase });
});

// ---------------------------------------------------------------------
// Demo convenience (explicit, never auto-run)
// ---------------------------------------------------------------------
app.get('/api/demo-invoice', (req, res) => {
  const samples = [
    { vendorName: 'Bluepeak Office Supplies', invoiceNumber: `DEMO-${Date.now()}`, amount: 42500, poNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), bankAccountNumber: '1234567890123456' }
  ];
  res.json({ invoice: samples[0] });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: isConfigured() });
});

app.listen(PORT, () => {
  console.log(`FinSentry AI running at http://localhost:${PORT}`);
  console.log(`AI provider configured: ${isConfigured() ? 'yes' : 'no (using deterministic explanations)'}`);
});
