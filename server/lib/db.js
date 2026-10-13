// Simple, dependency-free persistent JSON storage.
// This is intentionally not a "real" database — for a hackathon-scale
// finance decision-support tool, a durable JSON file that is written
// atomically on every change is enough to satisfy the "data must persist
// through normal application use" requirement without extra infra.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'finsentry-data.json');

const EMPTY_STATE = {
  financialSettings: null, // { currentCash, minReserve, upcomingObligations, updatedAt }
  invoices: [],            // stored invoices (with analysis attached once analyzed)
  approvalCases: [],       // created only when HOLD / ESCALATE happens
  nextInvoiceSeq: 1,
  nextCaseSeq: 1
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_STATE, null, 2), 'utf-8');
  }
}

function readState() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // guard against a corrupted/partial file
    return { ...EMPTY_STATE, ...parsed };
  } catch (err) {
    console.error('[db] Failed to read data file, reinitializing empty state:', err.message);
    return { ...EMPTY_STATE };
  }
}

function writeState(state) {
  ensureDataFile();
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE); // atomic on same filesystem
}

// Very small mutex so concurrent requests don't clobber each other's writes.
let queue = Promise.resolve();
function withState(mutator) {
  queue = queue.then(async () => {
    const state = readState();
    const result = await mutator(state);
    writeState(state);
    return result;
  });
  return queue;
}

function resetAll() {
  writeState({ ...EMPTY_STATE });
}

module.exports = { readState, writeState, withState, resetAll, DATA_FILE };
