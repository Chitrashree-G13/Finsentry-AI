// Deterministic invoice risk analysis engine.
//
// Every finding here is derived ONLY from data that actually exists in
// storage (prior invoices for the vendor, configured financial settings).
// If a comparison cannot be made because the data doesn't exist, we say so
// explicitly instead of fabricating a value. Missing data is never treated
// as evidence of risk — only detected anomalies are.

const RISK_WEIGHTS = {
  amountAnomaly: 28,
  poMismatch: 24,
  duplicate: 30,
  bankAccountChange: 26,
  vendorBehaviorAnomaly: 14,
  liquidityBelowReserve: 22,
  liquidityApproachingReserve: 10
};

const MAX_POSSIBLE_SCORE = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);

function maskAccountNumber(acct) {
  if (!acct) return null;
  const digits = String(acct).replace(/\s+/g, '');
  if (digits.length <= 4) return digits;
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
}

function toNumber(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} invoice - the invoice currently being analyzed (not yet saved)
 * @param {object[]} priorInvoices - previously stored invoices (any vendor)
 * @param {object|null} financialSettings
 */
function analyzeInvoice(invoice, priorInvoices, financialSettings) {
  const findings = [];
  const evidence = {};
  let score = 0;

  const invoiceAmount = toNumber(invoice.amount);
  const vendorNameNormalized = (invoice.vendorName || '').trim().toLowerCase();

  const vendorHistory = priorInvoices.filter(
    (inv) => (inv.vendorName || '').trim().toLowerCase() === vendorNameNormalized && vendorNameNormalized !== ''
  );

  // ---------------------------------------------------------------
  // A. AMOUNT ANOMALY (vs vendor's own history)
  // ---------------------------------------------------------------
  if (vendorHistory.length >= 2) {
    const amounts = vendorHistory.map((inv) => toNumber(inv.amount)).filter((n) => n !== null);
    if (amounts.length >= 2) {
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const max = Math.max(...amounts);
      const min = Math.min(...amounts);
      evidence.amountAnomaly = {
        vendorHistoricalAverage: round2(avg),
        vendorHistoricalMin: round2(min),
        vendorHistoricalMax: round2(max),
        historicalInvoiceCount: amounts.length,
        currentAmount: invoiceAmount
      };
      if (invoiceAmount !== null && avg > 0) {
        const ratio = invoiceAmount / avg;
        if (ratio >= 1.75 || ratio <= 0.4) {
          findings.push({
            key: 'amountAnomaly',
            severity: 'warning',
            title: 'Unusual invoice amount',
            detail: `Invoice amount is ${ratio >= 1 ? `${ratio.toFixed(2)}x higher` : `${(1 / ratio).toFixed(2)}x lower`} than this vendor's average of the last ${amounts.length} invoices (avg ₹${formatINR(avg)}).`
          });
          score += RISK_WEIGHTS.amountAnomaly;
        }
      }
    } else {
      findings.push({
        key: 'amountAnomaly',
        severity: 'info',
        title: 'Vendor amount history unavailable',
        detail: 'Vendor amount history unavailable — insufficient historical data.'
      });
    }
  } else {
    findings.push({
      key: 'amountAnomaly',
      severity: 'info',
      title: 'Vendor amount history unavailable',
      detail: 'Vendor amount history unavailable — insufficient historical data.'
    });
  }

  // ---------------------------------------------------------------
  // B. PURCHASE ORDER CHECK
  // ---------------------------------------------------------------
  const poNumber = (invoice.poNumber || '').trim();
  if (poNumber) {
    // Look for a prior invoice that referenced the same PO and recorded a PO amount.
    const poReference = priorInvoices.find(
      (inv) => (inv.poNumber || '').trim() === poNumber && inv.poAmount !== undefined && inv.poAmount !== null
    );
    if (poReference) {
      const poAmount = toNumber(poReference.poAmount);
      evidence.poCheck = { poNumber, poAmount, invoiceAmount };
      if (poAmount !== null && invoiceAmount !== null && Math.abs(poAmount - invoiceAmount) > 0.01) {
        findings.push({
          key: 'poMismatch',
          severity: 'warning',
          title: 'PO mismatch',
          detail: `Invoice amount (₹${formatINR(invoiceAmount)}) differs from the recorded purchase order amount for ${poNumber} (₹${formatINR(poAmount)}).`
        });
        score += RISK_WEIGHTS.poMismatch;
      } else {
        findings.push({
          key: 'poMismatch',
          severity: 'ok',
          title: 'PO amount matches',
          detail: `Invoice amount matches the recorded purchase order amount for ${poNumber}.`
        });
      }
    } else {
      findings.push({
        key: 'poMismatch',
        severity: 'info',
        title: 'PO comparison unavailable',
        detail: 'PO comparison unavailable — no stored purchase order amount to compare against.'
      });
    }
  } else {
    findings.push({
      key: 'poMismatch',
      severity: 'info',
      title: 'No purchase order provided',
      detail: 'No purchase order number was entered for this invoice.'
    });
  }

  // ---------------------------------------------------------------
  // C. DUPLICATE CHECK
  // ---------------------------------------------------------------
  if (priorInvoices.length > 0) {
    const exactMatch = priorInvoices.find(
      (inv) => (inv.invoiceNumber || '').trim().toLowerCase() === (invoice.invoiceNumber || '').trim().toLowerCase()
        && (inv.vendorName || '').trim().toLowerCase() === vendorNameNormalized
        && (invoice.invoiceNumber || '').trim() !== ''
    );
    const closeMatch = !exactMatch && priorInvoices.find((inv) => {
      const sameVendor = (inv.vendorName || '').trim().toLowerCase() === vendorNameNormalized && vendorNameNormalized !== '';
      const amt = toNumber(inv.amount);
      const sameAmount = amt !== null && invoiceAmount !== null && Math.abs(amt - invoiceAmount) < 0.01;
      const sameDate = inv.invoiceDate && invoice.invoiceDate && inv.invoiceDate === invoice.invoiceDate;
      return sameVendor && sameAmount && sameDate;
    });

    if (exactMatch) {
      evidence.duplicateCheck = {
        matchedInvoiceNumber: exactMatch.invoiceNumber,
        matchedVendor: exactMatch.vendorName,
        matchedAmount: toNumber(exactMatch.amount),
        matchedDate: exactMatch.invoiceDate
      };
      findings.push({
        key: 'duplicate',
        severity: 'critical',
        title: 'Possible duplicate invoice',
        detail: `An invoice with the same invoice number and vendor already exists in storage (₹${formatINR(toNumber(exactMatch.amount))}, dated ${exactMatch.invoiceDate || 'unknown'}).`
      });
      score += RISK_WEIGHTS.duplicate;
    } else if (closeMatch) {
      evidence.duplicateCheck = {
        matchedInvoiceNumber: closeMatch.invoiceNumber,
        matchedVendor: closeMatch.vendorName,
        matchedAmount: toNumber(closeMatch.amount),
        matchedDate: closeMatch.invoiceDate
      };
      findings.push({
        key: 'duplicate',
        severity: 'warning',
        title: 'Possible duplicate invoice',
        detail: `A previously stored invoice from the same vendor has the same amount and date (invoice ${closeMatch.invoiceNumber || 'unknown'}).`
      });
      score += RISK_WEIGHTS.duplicate * 0.7;
    } else {
      findings.push({
        key: 'duplicate',
        severity: 'ok',
        title: 'No duplicate invoice found',
        detail: 'No matching invoice number, vendor, amount and date combination was found in stored invoices.'
      });
    }
  } else {
    findings.push({
      key: 'duplicate',
      severity: 'info',
      title: 'Duplicate check limited',
      detail: 'Duplicate check limited — no historical invoices available.'
    });
  }

  // ---------------------------------------------------------------
  // D. VENDOR BEHAVIOR
  // ---------------------------------------------------------------
  if (vendorHistory.length > 0) {
    evidence.vendorBehavior = {
      priorInvoiceCount: vendorHistory.length,
      priorAmounts: vendorHistory.map((inv) => toNumber(inv.amount))
    };
    // Simple heuristic: flag if the vendor has had a HIGH-risk invoice before.
    const priorHighRisk = vendorHistory.filter((inv) => inv.analysis && inv.analysis.riskLevel === 'HIGH').length;
    if (priorHighRisk > 0) {
      findings.push({
        key: 'vendorBehaviorAnomaly',
        severity: 'warning',
        title: 'Vendor has prior high-risk invoices',
        detail: `${priorHighRisk} of this vendor's ${vendorHistory.length} previous invoice(s) were flagged HIGH risk.`
      });
      score += RISK_WEIGHTS.vendorBehaviorAnomaly;
    } else {
      findings.push({
        key: 'vendorBehaviorAnomaly',
        severity: 'ok',
        title: 'No unusual vendor behavior detected',
        detail: `Based on ${vendorHistory.length} prior invoice(s) from this vendor, no unusual pattern was detected.`
      });
    }
  } else {
    findings.push({
      key: 'vendorBehaviorAnomaly',
      severity: 'info',
      title: 'Vendor history unavailable',
      detail: 'Vendor history unavailable — insufficient historical data.'
    });
  }

  // ---------------------------------------------------------------
  // E. BANK ACCOUNT CHANGE
  // ---------------------------------------------------------------
  const priorWithBank = vendorHistory.filter((inv) => inv.bankAccountNumber);
  if (priorWithBank.length > 0) {
    const mostRecent = priorWithBank[priorWithBank.length - 1];
    const prevAcct = String(mostRecent.bankAccountNumber || '').replace(/\s+/g, '');
    const currAcct = String(invoice.bankAccountNumber || '').replace(/\s+/g, '');
    evidence.bankAccount = {
      previousAccountMasked: maskAccountNumber(prevAcct),
      currentAccountMasked: maskAccountNumber(currAcct)
    };
    if (currAcct && prevAcct && currAcct !== prevAcct) {
      findings.push({
        key: 'bankAccountChange',
        severity: 'critical',
        title: 'Bank account changed',
        detail: `Bank account differs from the vendor's previous record (was ${maskAccountNumber(prevAcct)}, now ${maskAccountNumber(currAcct)}).`
      });
      score += RISK_WEIGHTS.bankAccountChange;
    } else if (currAcct && prevAcct) {
      findings.push({
        key: 'bankAccountChange',
        severity: 'ok',
        title: 'Bank account matches prior record',
        detail: 'Bank account matches the vendor\'s previously stored account.'
      });
    }
  } else {
    findings.push({
      key: 'bankAccountChange',
      severity: 'info',
      title: 'Bank account history unavailable',
      detail: 'Bank account history unavailable — no prior bank account on file for this vendor.'
    });
  }

  // ---------------------------------------------------------------
  // F. LIQUIDITY IMPACT
  // ---------------------------------------------------------------
  let liquidity = null;
  if (financialSettings && financialSettings.currentCash !== undefined && financialSettings.currentCash !== null
      && financialSettings.minReserve !== undefined && financialSettings.minReserve !== null
      && invoiceAmount !== null) {
    const currentCash = toNumber(financialSettings.currentCash);
    const minReserve = toNumber(financialSettings.minReserve);
    const cashAfterPayment = round2(currentCash - invoiceAmount);
    const bufferAfterPayment = round2(cashAfterPayment - minReserve);
    let status;
    if (cashAfterPayment < minReserve) {
      status = 'below_reserve';
      findings.push({
        key: 'liquidityBelowReserve',
        severity: 'critical',
        title: 'Liquidity pressure',
        detail: `Payment would reduce available cash to ₹${formatINR(cashAfterPayment)}, below the configured reserve of ₹${formatINR(minReserve)}.`
      });
      score += RISK_WEIGHTS.liquidityBelowReserve;
    } else if (bufferAfterPayment <= minReserve * 0.15) {
      status = 'approaching_reserve';
      findings.push({
        key: 'liquidityApproachingReserve',
        severity: 'warning',
        title: 'Approaching reserve threshold',
        detail: `Payment would leave only ₹${formatINR(bufferAfterPayment)} above the configured reserve.`
      });
      score += RISK_WEIGHTS.liquidityApproachingReserve;
    } else {
      status = 'safe';
      findings.push({
        key: 'liquiditySafe',
        severity: 'ok',
        title: 'Liquidity impact is safe',
        detail: `Payment keeps available cash comfortably above the configured reserve.`
      });
    }
    liquidity = { currentCash, invoiceAmount, cashAfterPayment, minReserve, status };
    evidence.liquidity = liquidity;
  } else {
    findings.push({
      key: 'liquidityUnavailable',
      severity: 'info',
      title: 'Cash-flow impact unavailable',
      detail: 'Cash-flow impact unavailable — financial settings are not configured.'
    });
  }

  const riskScore = Math.max(0, Math.min(100, Math.round((score / MAX_POSSIBLE_SCORE) * 100)));
  const riskLevel = riskScore >= 55 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW';

  const blockingFindings = findings.filter((f) => f.severity === 'critical');
  const warningFindings = findings.filter((f) => f.severity === 'warning');

  let recommendation;
  if (riskLevel === 'HIGH' || blockingFindings.length >= 1) {
    recommendation = blockingFindings.length >= 2 || riskScore >= 70 ? 'ESCALATE' : 'HOLD';
  } else if (riskLevel === 'MEDIUM' || warningFindings.length >= 1) {
    recommendation = 'HOLD';
  } else {
    recommendation = 'APPROVE';
  }
  // Multiple serious findings always escalate regardless of score banding.
  if (blockingFindings.length >= 2) {
    recommendation = 'ESCALATE';
  }

  return {
    analyzedAt: new Date().toISOString(),
    riskScore,
    riskLevel,
    recommendation,
    findings,
    evidence,
    liquidity
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatINR(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

module.exports = { analyzeInvoice, maskAccountNumber, formatINR, RISK_WEIGHTS, MAX_POSSIBLE_SCORE };
