/* Pulse Analytics
 * Frontend application: authentication, CSV validation, persistence, reporting and insights.
 * Supabase handles authentication and PostgreSQL persistence.
 */

const CONFIG = window.PULSE_CONFIG || {};
const SUPABASE_URL = CONFIG.SUPABASE_URL || '';
const SUPABASE_KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || '';

const supabaseReady = SUPABASE_URL.startsWith('http') &&
  SUPABASE_KEY &&
  !SUPABASE_URL.includes('YOUR_SUPABASE') &&
  !SUPABASE_KEY.includes('YOUR_SUPABASE');

const db = supabaseReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const REQUIRED_COLUMNS = ['Date', 'Leads', 'Calls', 'Visits', 'Revenue', 'Conversions'];
const MAX_CSV_BYTES = 5 * 1024 * 1024;

let currentUser = null;
let currentData = null;
let previousData = null;
let currentRows = [];
let previousRows = [];
let chartInstance = null;
let pendingSignupEmail = '';
let pendingResetEmail = '';

const $ = id => document.getElementById(id);

function getAuthRedirectUrl() {
  if (window.location.protocol === 'file:') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

function getRecoveryRedirectUrl() {
  const base = getAuthRedirectUrl();
  return base ? `${base}?auth=recovery` : '';
}

function getAuthUrlParams() {
  const query = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const hashParams = new URLSearchParams(hash);
  return { query, hashParams };
}

function isAuthErrorInUrl() {
  const { query, hashParams } = getAuthUrlParams();
  return {
    error: query.get('error') || hashParams.get('error'),
    errorCode: query.get('error_code') || hashParams.get('error_code'),
    description: query.get('error_description') || hashParams.get('error_description')
  };
}

function isRecoveryCallback() {
  const { query, hashParams } = getAuthUrlParams();
  return query.get('auth') === 'recovery' || query.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
}

function showAuthUrlError() {
  const { errorCode, description } = isAuthErrorInUrl();
  if (!errorCode && !description) return false;

  const message = errorCode === 'otp_expired'
    ? 'This email link has expired or was already used. Request a new email and use the newest link.'
    : (description ? decodeURIComponent(description.replace(/\+/g, ' ')) : 'Authentication could not be completed. Please request a new email and try again.');

  showLogin();
  setError('login-error', message);
  return true;
}

async function handleAuthCallback() {
  if (!supabaseReady) return false;
  if (showAuthUrlError()) return true;

  const { query } = getAuthUrlParams();
  const code = query.get('code');
  const tokenHash = query.get('token_hash');
  const tokenType = query.get('type') || 'email';

  // Support Supabase's PKCE callback links as well as the normal hosted confirmation link.
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) {
      showLogin();
      setError('login-error', friendlyAuthError(error));
      return true;
    }
  }

  // Also support custom Supabase templates that send a token_hash directly to the app.
  if (tokenHash) {
    const { data, error } = await db.auth.verifyOtp({ token_hash: tokenHash, type: tokenType });
    if (error) {
      showLogin();
      setError('login-error', friendlyAuthError(error));
      return true;
    }
    if (tokenType === 'recovery' && data.session) {
      currentUser = data.session.user;
      showAuthPanel('new-password-panel', 'Set a new password', 'Choose a new password for your account');
      $('login-screen').style.display = 'flex';
      $('app-screen').style.display = 'none';
      return true;
    }
  }

  return false;
}

function showAuthPanel(panelId, title, subtitle) {
  document.querySelectorAll('.auth-panel').forEach(el => el.classList.remove('active'));
  const panel = $(panelId);
  if (panel) panel.classList.add('active');

  // Keep the selected authentication tab visually in sync with the active form.
  $('tab-login')?.classList.toggle('active', panelId === 'login-panel');
  $('tab-signup')?.classList.toggle('active', panelId === 'signup-panel');

  if ($('auth-title')) $('auth-title').textContent = title;
  if ($('auth-subtitle')) $('auth-subtitle').textContent = subtitle;
  const tabs = $('auth-tabs');
  if (tabs) tabs.style.display = ['login-panel', 'signup-panel'].includes(panelId) ? 'flex' : 'none';
}

function setLoading(id, loadingText, normalText, loading) {
  const button = $(id);
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}

function setError(id, message) { if ($(id)) $(id).textContent = message || ''; }
function setSuccess(id, message) { if ($(id)) $(id).textContent = message || ''; }

function friendlyAuthError(error) {
  const message = String(error?.message || error || '');
  if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(message)) return 'Please verify your email before signing in.';
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists.';
  if (/password/i.test(message) && /weak|short|least/i.test(message)) return 'Choose a stronger password with at least 8 characters.';
  if (/rate limit|too many requests/i.test(message)) return 'Too many requests. Please wait a moment and try again.';
  return message || 'Something went wrong. Please try again.';
}

function showApp(user) {
  currentUser = user;
  $('login-screen').style.display = 'none';
  $('app-screen').style.display = 'flex';
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account';
  $('user-label').textContent = name;
  $('profile-name').value = user?.user_metadata?.full_name || '';
  $('profile-email').value = user?.email || '';
  loadReports();
}

function showLogin() {
  currentUser = null;
  $('app-screen').style.display = 'none';
  $('login-screen').style.display = 'flex';
  showAuthPanel('login-panel', 'Sign in', 'Business performance insights');
}

function ensureConfigured() {
  if (supabaseReady) {
    setError('login-error', '');
    setError('signup-error', '');
    if ($('auth-config-hint')) $('auth-config-hint').style.display = 'none';
    return true;
  }
  if ($('auth-config-hint')) $('auth-config-hint').style.display = 'block';
  setError('login-error', 'Supabase is not configured. Check config.js.');
  return false;
}

async function initAuth() {
  if (!supabaseReady) {
    showLogin();
    setError('login-error', 'Supabase is not configured yet. Add your project URL and publishable key to config.js.');
    return;
  }

  // Register the listener before getSession() so PASSWORD_RECOVERY is not missed.
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      showLogin();
      return;
    }

    if (event === 'PASSWORD_RECOVERY' && session?.user) {
      currentUser = session.user;
      $('login-screen').style.display = 'flex';
      $('app-screen').style.display = 'none';
      showAuthPanel('new-password-panel', 'Set a new password', 'Choose a new password for your account');
      return;
    }

    if (event === 'SIGNED_IN' && session?.user) {
      // A recovery link creates a session, but the user must set a new password first.
      if (isRecoveryCallback()) {
        currentUser = session.user;
        $('login-screen').style.display = 'flex';
        $('app-screen').style.display = 'none';
        showAuthPanel('new-password-panel', 'Set a new password', 'Choose a new password for your account');
        return;
      }
      showApp(session.user);
    }
  });

  const callbackHandled = await handleAuthCallback();
  if (callbackHandled) return;

  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    if (isRecoveryCallback()) {
      currentUser = session.user;
      $('login-screen').style.display = 'flex';
      $('app-screen').style.display = 'none';
      showAuthPanel('new-password-panel', 'Set a new password', 'Choose a new password for your account');
    } else {
      showApp(session.user);
    }
  } else showLogin();
}


/* ---------- Authentication ---------- */

$('tab-login').addEventListener('click', () => showAuthPanel('login-panel', 'Sign in', 'Business performance insights'));
$('tab-signup').addEventListener('click', () => showAuthPanel('signup-panel', 'Create your account', 'Start tracking your business performance'));

document.querySelectorAll('.pw-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const input = $(button.dataset.target);
    if (!input) return;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Show' : 'Hide';
  });
});

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  setError('login-error', '');
  if (!ensureConfigured()) return;

  const email = $('login-email').value.trim().toLowerCase();
  const password = $('login-password').value;
  if (!email || !password) return setError('login-error', 'Enter your email and password.');

  setLoading('login-submit', 'Signing in…', 'Sign in', true);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  setLoading('login-submit', '', 'Sign in', false);

  if (error) {
    if (/email not confirmed/i.test(error.message || '')) {
      pendingSignupEmail = email;
      $('verify-email-label').textContent = email;
      setError('login-error', 'Please confirm your email address before signing in.');
      return;
    }
    return setError('login-error', friendlyAuthError(error));
  }
  showApp(data.user);
});

$('signup-form').addEventListener('submit', async e => {
  e.preventDefault();
  setError('signup-error', '');
  if (!ensureConfigured()) return;

  const name = $('signup-name').value.trim();
  const email = $('signup-email').value.trim().toLowerCase();
  const password = $('signup-password').value;
  const confirm = $('signup-confirm').value;

  if (name.length < 2) return setError('signup-error', 'Enter your full name.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('signup-error', 'Enter a valid email address.');
  if (password.length < 8) return setError('signup-error', 'Password must be at least 8 characters.');
  if (password !== confirm) return setError('signup-error', 'Passwords do not match.');

  setLoading('signup-submit', 'Creating…', 'Create account', true);
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: getAuthRedirectUrl()
    }
  });
  setLoading('signup-submit', '', 'Create account', false);

  if (error) return setError('signup-error', friendlyAuthError(error));

  if (data.session && data.user?.email_confirmed_at) {
    showApp(data.user);
    return;
  }

  pendingSignupEmail = email;
  $('verify-email-label').textContent = email;
  setSuccess('verify-success', 'Confirmation email sent successfully.');
  showAuthPanel('verify-panel', 'Check your email', 'One quick step before you start using Pulse Analytics');
});

$('open-gmail').addEventListener('click', () => {
  const email = (pendingSignupEmail || '').toLowerCase();
  if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')) {
    window.open('https://mail.google.com/mail/u/0/#inbox', '_blank', 'noopener,noreferrer');
  } else {
    setError('verify-error', 'This button opens Gmail. Please open your email provider to find the confirmation message.');
  }
});

$('check-verification').addEventListener('click', async () => {
  setError('verify-error', '');
  if (!ensureConfigured()) return;

  const { data: { user }, error } = await db.auth.getUser();
  if (error) return setError('verify-error', friendlyAuthError(error));

  if (user?.email_confirmed_at) {
    showApp(user);
    return;
  }

  setError('verify-error', 'Your email is not verified yet. Open Gmail, click the confirmation link, then return here.');
});

$('resend-signup-email').addEventListener('click', async () => {
  setError('verify-error', '');
  setSuccess('verify-success', '');
  if (!pendingSignupEmail || !ensureConfigured()) return;

  const { error } = await db.auth.resend({
    type: 'signup',
    email: pendingSignupEmail,
    options: { emailRedirectTo: getAuthRedirectUrl() }
  });
  if (error) setError('verify-error', friendlyAuthError(error));
  else setSuccess('verify-success', 'A new confirmation email has been sent.');
});

$('back-to-login').addEventListener('click', e => {
  e.preventDefault();
  showAuthPanel('login-panel', 'Sign in', 'Business performance insights');
});

$('forgot-password-link').addEventListener('click', e => {
  e.preventDefault();
  $('forgot-email').value = $('login-email').value.trim();
  showAuthPanel('forgot-panel', 'Reset your password', 'We will send a secure recovery email');
});

$('forgot-back-login').addEventListener('click', e => {
  e.preventDefault();
  showAuthPanel('login-panel', 'Sign in', 'Business performance insights');
});

$('forgot-form').addEventListener('submit', async e => {
  e.preventDefault();
  setError('forgot-error', '');
  setSuccess('forgot-success', '');
  if (!ensureConfigured()) return;

  const email = $('forgot-email').value.trim().toLowerCase();
  if (!email) return setError('forgot-error', 'Enter your account email.');

  setLoading('forgot-submit', 'Sending…', 'Send recovery email', true);
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: getRecoveryRedirectUrl()
  });
  setLoading('forgot-submit', '', 'Send recovery email', false);

  if (error) return setError('forgot-error', friendlyAuthError(error));
  setSuccess('forgot-success', 'If an account exists for this email, a secure recovery email has been sent.');
});

async function handleRecoverySession() {
  // PASSWORD_RECOVERY is handled by onAuthStateChange in initAuth().
  return;
}


$('new-password-form').addEventListener('submit', async e => {
  e.preventDefault();
  setError('new-password-error', '');
  setSuccess('new-password-success', '');
  if (!ensureConfigured()) return;

  const password = $('new-password').value;
  const confirm = $('new-password-confirm').value;
  if (password.length < 8) return setError('new-password-error', 'Password must be at least 8 characters.');
  if (password !== confirm) return setError('new-password-error', 'Passwords do not match.');

  setLoading('new-password-submit', 'Updating…', 'Set new password', true);
  const { error } = await db.auth.updateUser({ password });
  setLoading('new-password-submit', '', 'Set new password', false);

  if (error) return setError('new-password-error', friendlyAuthError(error));
  setSuccess('new-password-success', 'Password updated successfully.');

  setTimeout(() => {
    history.replaceState({}, '', getAuthRedirectUrl());
    showApp(currentUser);
  }, 700);
});

$('logout-btn').addEventListener('click', async () => {
  if (db) await db.auth.signOut();
  showLogin();
});

/* ---------- Navigation ---------- */

document.querySelectorAll('.nav-link').forEach(button => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});

function switchView(view) {
  document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${view}-view`));
  if (view === 'reports') loadReports();
}

$('new-report-btn').addEventListener('click', () => {
  switchView('overview');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('clear-report-btn').addEventListener('click', resetReportBuilder);

/* ---------- CSV ---------- */

function setStatus(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('err', isError);
}

function showAlert(message, type = 'error') {
  const el = $('alert-banner');
  el.textContent = message;
  el.className = `alert-banner ${type === 'warn' ? 'warn' : ''}`;
  el.style.display = 'block';
}

function clearAlert() {
  const el = $('alert-banner');
  el.style.display = 'none';
  el.textContent = '';
}

function numeric(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/[₹$€£]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) ? date : null;
}

function aggregateRows(rows) {
  const totals = { Leads: 0, Calls: 0, Visits: 0, Revenue: 0, Conversions: 0 };
  const validRows = [];

  rows.forEach((row, index) => {
    const missing = REQUIRED_COLUMNS.filter(column => row[column] === undefined);
    if (missing.length) return;

    const date = parseDate(row.Date);
    const values = {};
    for (const column of REQUIRED_COLUMNS.slice(1)) values[column] = numeric(row[column]);

    if (!date || Object.values(values).some(v => v === null || v < 0)) return;

    validRows.push({
      Date: date.toISOString().slice(0, 10),
      Leads: values.Leads,
      Calls: values.Calls,
      Visits: values.Visits,
      Revenue: values.Revenue,
      Conversions: values.Conversions
    });

    totals.Leads += values.Leads;
    totals.Calls += values.Calls;
    totals.Visits += values.Visits;
    totals.Revenue += values.Revenue;
    totals.Conversions += values.Conversions;
  });

  if (!validRows.length) throw new Error('No valid data rows were found. Check the CSV values and required columns.');
  totals.ConversionRate = totals.Leads > 0 ? (totals.Conversions / totals.Leads) * 100 : 0;
  return { totals, validRows, skipped: rows.length - validRows.length };
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Choose a CSV file.'));
    if (file.size === 0) return reject(new Error('The uploaded file is empty.'));
    if (file.size > MAX_CSV_BYTES) return reject(new Error('CSV files must be 5 MB or smaller.'));
    if (!/\.csv$/i.test(file.name)) return reject(new Error('Please upload a CSV file.'));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: header => String(header).trim(),
      complete(results) {
        try {
          const headers = results.meta.fields || [];
          const missing = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
          if (missing.length) throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
          const parsed = aggregateRows(results.data || []);
          resolve({ ...parsed, fileName: file.name });
        } catch (error) { reject(error); }
      },
      error(error) { reject(error); }
    });
  });
}

$('file-current').addEventListener('change', async e => {
  clearAlert();
  try {
    const result = await parseCsvFile(e.target.files[0]);
    currentData = result.totals;
    currentRows = result.validRows;
    setStatus('status-current', `${result.fileName} · ${result.validRows.length} valid rows${result.skipped ? ` · ${result.skipped} skipped` : ''}`);
    renderDashboard();
  } catch (error) {
    currentData = null; currentRows = [];
    setStatus('status-current', error.message, true);
    showAlert(error.message);
    renderDashboard();
  }
});

$('file-previous').addEventListener('change', async e => {
  clearAlert();
  try {
    const result = await parseCsvFile(e.target.files[0]);
    previousData = result.totals;
    previousRows = result.validRows;
    setStatus('status-previous', `${result.fileName} · ${result.validRows.length} valid rows${result.skipped ? ` · ${result.skipped} skipped` : ''}`);
    renderDashboard();
  } catch (error) {
    previousData = null; previousRows = [];
    setStatus('status-previous', error.message, true);
    showAlert(error.message);
    renderDashboard();
  }
});

function resetReportBuilder() {
  currentData = null; previousData = null; currentRows = []; previousRows = [];
  $('report-name').value = '';
  $('file-current').value = '';
  $('file-previous').value = '';
  setStatus('status-current', '');
  setStatus('status-previous', '');
  clearAlert();
  renderDashboard();
}

function renderDashboard() {
  renderMetrics();
  renderComparison();
  renderChart();
  renderInsights();
}

function formatNumber(value) { return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function formatCurrency(value) { return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
function formatPct(value) { return `${Number(value || 0).toFixed(1)}%`; }
function pctChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function deltaClass(change) {
  if (change === null) return 'neutral';
  return change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
}
function deltaLabel(change) {
  if (change === null) return 'n/a';
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
}

function renderMetrics() {
  const grid = $('metrics-grid');
  const empty = $('metrics-empty');
  if (!currentData) {
    grid.style.display = 'none'; empty.style.display = 'block'; return;
  }
  empty.style.display = 'none'; grid.style.display = 'grid';
  const cards = [
    ['Total Leads', formatNumber(currentData.Leads), 'Leads'],
    ['Total Calls', formatNumber(currentData.Calls), 'Calls'],
    ['Website Visits', formatNumber(currentData.Visits), 'Visits'],
    ['Revenue', formatCurrency(currentData.Revenue), 'Revenue'],
    ['Conversion Rate', formatPct(currentData.ConversionRate), 'ConversionRate']
  ];
  grid.innerHTML = cards.map(([label, value, key]) => {
    const change = previousData ? pctChange(currentData[key], previousData[key]) : null;
    const delta = previousData ? `<div class="delta ${deltaClass(change)}">${deltaLabel(change)}</div>` : '';
    return `<div class="metric-card"><div class="label">${label}</div><div class="value">${value}</div>${delta}</div>`;
  }).join('');
}

function renderComparison() {
  const panel = $('compare-panel');
  if (!currentData || !previousData) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const rows = [
    ['Leads', 'Leads', formatNumber],
    ['Calls', 'Calls', formatNumber],
    ['Website Visits', 'Visits', formatNumber],
    ['Revenue', 'Revenue', formatCurrency],
    ['Conversion Rate', 'ConversionRate', formatPct]
  ];
  $('compare-body').innerHTML = rows.map(([label, key, fmt]) => {
    const change = pctChange(currentData[key], previousData[key]);
    return `<tr><td>${label}</td><td class="mono">${fmt(previousData[key])}</td><td class="mono">${fmt(currentData[key])}</td><td class="mono delta ${deltaClass(change)}">${deltaLabel(change)}</td></tr>`;
  }).join('');
  const rate = Math.max(0, Math.min(100, currentData.ConversionRate));
  $('gauge-ring').setAttribute('stroke-dashoffset', 314 - (314 * rate / 100));
  $('gauge-text').textContent = `${rate.toFixed(1)}%`;
}

function renderChart() {
  const panel = $('chart-panel');
  if (!currentData || !previousData) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const metrics = [
    ['Leads', 'Leads'], ['Calls', 'Calls'], ['Website Visits', 'Visits'],
    ['Revenue', 'Revenue'], ['Conversion Rate', 'ConversionRate']
  ];
  const values = metrics.map(([label, key]) => pctChange(currentData[key], previousData[key]) ?? 0);
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart($('chart'), {
    type: 'bar',
    data: {
      labels: metrics.map(x => x[0]),
      datasets: [{ label: 'Change vs previous period', data: values, borderRadius: 6 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: value => `${value}%` } }
      }
    }
  });
}

function renderInsights() {
  const panel = $('insights-panel');
  const list = $('insight-list');
  if (!currentData) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const insights = [];
  if (previousData) {
    const leadChange = pctChange(currentData.Leads, previousData.Leads);
    const revenueChange = pctChange(currentData.Revenue, previousData.Revenue);
    const conversionDelta = currentData.ConversionRate - previousData.ConversionRate;
    if (leadChange !== null) insights.push({
      type: leadChange >= 0 ? 'positive' : 'negative',
      text: `Leads ${leadChange >= 0 ? 'increased' : 'decreased'} ${Math.abs(leadChange).toFixed(1)}% compared with the previous period.`
    });
    if (leadChange > 0 && conversionDelta < 0) insights.push({
      type: 'negative',
      text: `Lead volume grew, but conversion rate fell by ${Math.abs(conversionDelta).toFixed(1)} percentage points.`
    });
    if (revenueChange !== null && leadChange !== null && revenueChange > leadChange) insights.push({
      type: 'positive',
      text: `Revenue grew faster than lead volume, indicating improved revenue efficiency.`
    });
    if (conversionDelta > 0) insights.push({
      type: 'positive',
      text: `Conversion rate improved by ${conversionDelta.toFixed(1)} percentage points.`
    });
  }
  const trafficToLead = currentData.Visits > 0 ? (currentData.Leads / currentData.Visits) * 100 : 0;
  insights.push({
    type: trafficToLead >= 5 ? 'positive' : 'neutral',
    text: `Current traffic-to-lead rate is ${trafficToLead.toFixed(1)}%, based on ${formatNumber(currentData.Visits)} visits and ${formatNumber(currentData.Leads)} leads.`
  });
  insights.push({
    type: currentData.ConversionRate >= 15 ? 'positive' : 'neutral',
    text: `Current conversion rate is ${currentData.ConversionRate.toFixed(1)}%, from ${formatNumber(currentData.Conversions)} conversions.`
  });
  list.innerHTML = insights.slice(0, 5).map(item => `<li class="${item.type}">${item.text}</li>`).join('');
}

/* ---------- Reports / PostgreSQL ---------- */

async function saveReport() {
  clearAlert();
  if (!currentUser) return showAlert('Please sign in again before saving a report.');
  if (!currentData || !currentRows.length) return showAlert('Upload a valid current-period CSV first.');

  const name = $('report-name').value.trim() || `Performance report · ${new Date().toLocaleDateString('en-IN')}`;
  const dates = currentRows.map(r => r.Date).sort();
  const previousDates = previousRows.map(r => r.Date).sort();

  const payload = {
    user_id: currentUser.id,
    name,
    period_start: dates[0],
    period_end: dates[dates.length - 1],
    leads: currentData.Leads,
    calls: currentData.Calls,
    website_visits: currentData.Visits,
    revenue: currentData.Revenue,
    conversions: currentData.Conversions,
    conversion_rate: currentData.ConversionRate,
    previous_period_start: previousDates[0] || null,
    previous_period_end: previousDates[previousDates.length - 1] || null
  };

  setLoading('save-report-btn', 'Saving…', 'Save report', true);
  const { data: report, error } = await db.from('reports').insert(payload).select().single();
  if (error) {
    setLoading('save-report-btn', '', 'Save report', false);
    showAlert(error.message);
    return;
  }

  const rowPayload = currentRows.map(row => ({
    report_id: report.id,
    user_id: currentUser.id,
    period: 'current',
    report_date: row.Date,
    leads: row.Leads,
    calls: row.Calls,
    website_visits: row.Visits,
    revenue: row.Revenue,
    conversions: row.Conversions
  }));

  if (previousRows.length) {
    previousRows.forEach(row => rowPayload.push({
      report_id: report.id,
      user_id: currentUser.id,
      period: 'previous',
      report_date: row.Date,
      leads: row.Leads,
      calls: row.Calls,
      website_visits: row.Visits,
      revenue: row.Revenue,
      conversions: row.Conversions
    }));
  }

  const { error: rowError } = await db.from('report_rows').insert(rowPayload);
  setLoading('save-report-btn', '', 'Save report', false);

  if (rowError) {
    await db.from('reports').delete().eq('id', report.id);
    showAlert(rowError.message);
    return;
  }

  showAlert('Report saved successfully.', 'warn');
  await loadReports();
  switchView('reports');
}

$('save-report-btn').addEventListener('click', saveReport);

async function loadReports() {
  if (!db || !currentUser) return;
  const { data, error } = await db
    .from('reports')
    .select('id,name,period_start,period_end,leads,revenue,created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    $('reports-empty').textContent = 'Unable to load reports right now.';
    $('reports-empty').style.display = 'block';
    $('reports-table-wrap').style.display = 'none';
    return;
  }

  const empty = $('reports-empty');
  const wrap = $('reports-table-wrap');
  if (!data?.length) {
    empty.textContent = "You haven't saved any reports yet.";
    empty.style.display = 'block';
    wrap.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  wrap.style.display = 'block';
  $('reports-body').innerHTML = data.map(report => `
    <tr>
      <td><strong>${escapeHtml(report.name)}</strong></td>
      <td>${formatDate(report.period_start)} – ${formatDate(report.period_end)}</td>
      <td class="mono">${formatNumber(report.leads)}</td>
      <td class="mono">${formatCurrency(report.revenue)}</td>
      <td>${formatDate(report.created_at)}</td>
      <td><button class="table-action" data-delete-report="${report.id}">Delete</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-delete-report]').forEach(button => {
    button.addEventListener('click', () => deleteReport(button.dataset.deleteReport));
  });
}

async function deleteReport(id) {
  if (!confirm('Delete this report? This cannot be undone.')) return;
  const { error } = await db.from('reports').delete().eq('id', id);
  if (error) return showAlert(error.message);
  loadReports();
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

/* ---------- Profile ---------- */

$('profile-form').addEventListener('submit', async e => {
  e.preventDefault();
  setError('profile-error', '');
  setSuccess('profile-success', '');
  if (!db || !currentUser) return;

  const name = $('profile-name').value.trim();
  if (name.length < 2) return setError('profile-error', 'Enter your full name.');

  const { error } = await db.auth.updateUser({ data: { full_name: name } });
  if (error) return setError('profile-error', friendlyAuthError(error));

  currentUser.user_metadata.full_name = name;
  $('user-label').textContent = name;
  setSuccess('profile-success', 'Profile updated.');
});

/* ---------- Boot ---------- */
(async function boot() {
  await initAuth();
})();
