// AI provider abstraction.
//
// Deterministic logic (risk scoring, thresholds, matching) never lives here.
// This module is only responsible for turning an already-computed analysis
// result into finance-friendly natural language: a "why this decision"
// explanation and a business-impact statement.
//
// If no provider is configured, or the call fails for any reason, we fall
// back to a deterministic template built from the same analysis data. The
// UI is told explicitly (`source: "ai" | "deterministic"`) so the app never
// claims "AI analyzed this" unless a model call actually happened.

const https = require('https');

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildPrompt(invoice, analysis) {
  const findingsList = analysis.findings
    .map((f) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.detail}`)
    .join('\n');

  return `You are a finance operations assistant. Based ONLY on the structured findings below (do not invent any new facts, numbers, or evidence), write a concise, finance-friendly explanation.

Invoice: ${invoice.invoiceNumber || 'N/A'} | Vendor: ${invoice.vendorName || 'N/A'} | Amount: INR ${invoice.amount}
Risk Score: ${analysis.riskScore}/100 (${analysis.riskLevel})
Recommendation: ${analysis.recommendation}

Findings:
${findingsList}

Respond with a strict JSON object (no markdown, no code fences) with exactly two keys:
{
  "whyThisDecision": "2-4 sentences explaining why this recommendation was reached, referencing the actual findings above and being explicit when data was insufficient rather than treating it as suspicious.",
  "businessImpact": "1-3 sentences describing the practical business impact of paying this invoice, grounded only in the findings above."
}`;
}

function callAnthropic(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 15000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Anthropic API returned ${res.statusCode}: ${data}`));
          }
          try {
            const parsed = JSON.parse(data);
            const textBlock = (parsed.content || []).find((b) => b.type === 'text');
            if (!textBlock) return reject(new Error('No text content in AI response'));
            resolve(textBlock.text);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AI request timed out'));
    });
    req.write(body);
    req.end();
  });
}

function deterministicExplanation(invoice, analysis) {
  const notable = analysis.findings.filter((f) => f.severity === 'critical' || f.severity === 'warning');
  const insufficient = analysis.findings.filter((f) => f.severity === 'info');

  let whyThisDecision;
  if (notable.length === 0) {
    whyThisDecision = `FinSentry recommends ${analysis.recommendation} because no risk signals were detected in the available data.`;
    if (insufficient.length > 0) {
      whyThisDecision += ` Some checks (${insufficient.map((f) => f.title.toLowerCase()).join(', ')}) could not be completed due to insufficient historical data, but this is not treated as evidence of risk.`;
    }
  } else {
    const signalText = notable.map((f) => f.title.toLowerCase()).join(', and ');
    whyThisDecision = `FinSentry recommends ${analysis.recommendation} because the invoice has ${notable.length} significant risk signal${notable.length > 1 ? 's' : ''}: ${signalText}.`;
    if (insufficient.length > 0) {
      whyThisDecision += ` Vendor/transaction history is limited for some checks, so missing history is not treated as evidence of fraud.`;
    }
  }

  let businessImpact;
  if (analysis.liquidity && analysis.liquidity.status !== 'safe') {
    businessImpact = `Payment would reduce available cash to ₹${analysis.liquidity.cashAfterPayment.toLocaleString('en-IN')}, ${
      analysis.liquidity.status === 'below_reserve' ? 'below' : 'close to'
    } the configured operating reserve of ₹${analysis.liquidity.minReserve.toLocaleString('en-IN')}, which may create short-term liquidity pressure.`;
  } else if (notable.length > 0) {
    businessImpact = 'Paying this invoice without further verification risks overpayment, duplicate payment, or payment to an incorrect account based on the findings above.';
  } else {
    businessImpact = 'Paying this invoice is not expected to create liquidity pressure or duplicate/mismatch risk based on the available data.';
  }

  return { whyThisDecision, businessImpact };
}

/**
 * Returns { whyThisDecision, businessImpact, source: 'ai' | 'deterministic', error? }
 */
async function generateExplanation(invoice, analysis) {
  if (!isConfigured()) {
    return { ...deterministicExplanation(invoice, analysis), source: 'deterministic' };
  }
  try {
    const prompt = buildPrompt(invoice, analysis);
    const raw = await callAnthropic(prompt);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.whyThisDecision || !parsed.businessImpact) {
      throw new Error('AI response missing required fields');
    }
    return { whyThisDecision: parsed.whyThisDecision, businessImpact: parsed.businessImpact, source: 'ai' };
  } catch (err) {
    console.error('[aiProvider] Falling back to deterministic explanation:', err.message);
    return { ...deterministicExplanation(invoice, analysis), source: 'deterministic', error: err.message };
  }
}

module.exports = { generateExplanation, isConfigured };
