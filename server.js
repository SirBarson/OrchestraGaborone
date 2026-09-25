const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const database = require('./db');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const dataFile        = path.join(__dirname, 'data', 'accounts.json');
const activityFile    = path.join(__dirname, 'data', 'activity.json');
const eventsFile      = path.join(__dirname, 'data', 'events.json');
const contentFile     = path.join(__dirname, 'data', 'content.json');
const announceFile    = path.join(__dirname, 'data', 'announcements.json');
const messagesFile    = path.join(__dirname, 'data', 'messages.json');
const adminsFile      = path.join(__dirname, 'data', 'admins.json');
const settingsFile    = path.join(__dirname, 'data', 'settings.json');
const practicesFile   = path.join(__dirname, 'data', 'practices.json');
const apologiesFile   = path.join(__dirname, 'data', 'apologies.json');
const suggestionsFile = path.join(__dirname, 'data', 'suggestions.json');

/* ══════════════════════════════════════════════════════════════
   PHASE 4 — CHAT SYSTEM FILES
   ══════════════════════════════════════════════════════════════ */
const chatMessagesFile = path.join(__dirname, 'data', 'chat-messages.json');
const chatPresenceFile = path.join(__dirname, 'data', 'chat-presence.json');
const friendsFile      = path.join(__dirname, 'data', 'friends.json');

const HEARTBEAT_TTL_MS = 60 * 1000;

const otpStore           = new Map();
const verificationTokens = new Map();
const sessions           = new Map();

const OTP_TTL_MS         = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS       = 5;
const RESET_TTL_MS       = 30 * 60 * 1000;
const SESSION_TTL_MS     = 8 * 60 * 60 * 1000;
const ACTIVITY_MAX       = 1000;

const ADMIN_EMAIL    = normaliseEmail(process.env.ADMIN_EMAIL || 'valentinebarson@gmail.com');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Valentine';

/* ============================================================
   MIDDLEWARE
============================================================ */
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(__dirname));

/* ============================================================
   HELPERS
============================================================ */
function normaliseEmail(v){ return typeof v === 'string' ? v.trim().toLowerCase() : ''; }
function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isStrongPassword(v){ return typeof v === 'string' && v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v); }
function hash(v){ return crypto.createHash('sha256').update(v).digest('hex'); }
function createOtp(){ return String(crypto.randomInt(100000, 1000000)); }
function createId(prefix){ return `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }
function nowISO(){ return new Date().toISOString(); }
function todayDisplay(){
  return new Date().toLocaleString('en-GB', { hour12:false }).replace(',','');
}

function passwordHash(password){
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, stored){
  const [salt, digest] = String(stored).split(':');
  if (!salt || !digest) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(digest, 'hex'));
}
function publicMember(member){
  const { passwordHash: ignored, ...safe } = member;
  return safe;
}

/* ============================================================
   FILE STORE HELPERS
============================================================ */
function readJSON(file, fallback){
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err){ if (err.code !== 'ENOENT') throw err; return fallback; }
}
function writeJSON(file, data){
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ============================================================
   ACCOUNTS
============================================================ */
function loadAccounts(){
  try {
    const accounts = readJSON(dataFile, null) || { members: [], admins: [] };
    accounts.members = Array.isArray(accounts.members) ? accounts.members : [];
    accounts.admins  = Array.isArray(accounts.admins)  ? accounts.admins  : [];
    if (!accounts.admins.some(item =>
        item.email === ADMIN_EMAIL ||
        item.username?.toLowerCase() === ADMIN_USERNAME.toLowerCase())) {
      accounts.admins.push({
        id: createId('ADM'),
        email: ADMIN_EMAIL,
        username: ADMIN_USERNAME,
        name: 'Valentine Barson',
        role: 'Super Admin',
        perms: ['all'],
        passwordHash: passwordHash(process.env.ADMIN_PASSWORD || 'Tadiwa@2763')
      });
      saveAccounts(accounts);
    }
    return accounts;
  } catch (error){
    if (error.code !== 'ENOENT') throw error;
    return {
      members: [],
      admins: [{
        id: createId('ADM'),
        email: ADMIN_EMAIL,
        username: ADMIN_USERNAME,
        name: 'Valentine Barson',
        role: 'Super Admin',
        perms: ['all'],
        passwordHash: passwordHash(process.env.ADMIN_PASSWORD || 'Tadiwa@2763')
      }]
    };
  }
}
function saveAccounts(accounts){ writeJSON(dataFile, accounts); }

/* ============================================================
   ADMINS STORE
============================================================ */
function loadAdmins(){
  const seed = [{
    id: createId('ADM'),
    name: 'Valentine Barson',
    email: ADMIN_EMAIL,
    username: ADMIN_USERNAME,
    role: 'Super Admin',
    perms: ['all'],
    photo: '',
    createdAt: nowISO()
  }];
  const list = readJSON(adminsFile, seed);
  return Array.isArray(list) && list.length ? list : seed;
}
function saveAdmins(list){ writeJSON(adminsFile, list); }

/* ============================================================
   ACTIVITY LOG
============================================================ */
function loadActivity(){ const l = readJSON(activityFile, []); return Array.isArray(l) ? l : []; }
function saveActivity(l){ writeJSON(activityFile, l.slice(0, ACTIVITY_MAX)); }

function logActivity(action, opts = {}){
  const entry = {
    id: createId('LOG'),
    type: opts.type || 'admin',
    icon: opts.icon || ({ admin:'🛡️', member:'🎻', system:'⚙️', success:'✅', danger:'🚨' }[opts.type] || '•'),
    who: opts.who || (opts.req?.session?.email) || 'System',
    action,
    at: todayDisplay()
  };
  const list = loadActivity();
  list.unshift(entry);
  saveActivity(list);
  return entry;
}

/* ============================================================
   OTHER STORES
============================================================ */
function loadEvents(){ const l = readJSON(eventsFile, []); return Array.isArray(l) ? l : []; }
function saveEvents(l){ writeJSON(eventsFile, l); }

function loadContent(){ const l = readJSON(contentFile, []); return Array.isArray(l) ? l : []; }
function saveContent(l){ writeJSON(contentFile, l); }

function loadAnnouncements(){ const l = readJSON(announceFile, []); return Array.isArray(l) ? l : []; }
function saveAnnouncements(l){ writeJSON(announceFile, l); }

function loadMessages(){ const l = readJSON(messagesFile, []); return Array.isArray(l) ? l : []; }
function saveMessages(l){ writeJSON(messagesFile, l); }

function loadSettings(){ return readJSON(settingsFile, {}); }
function saveSettings(s){ writeJSON(settingsFile, s); }

/* ══════════════════════════════════════════════════════════════
   PHASE 2: PRACTICES + APOLOGIES STORES
   ══════════════════════════════════════════════════════════════ */
function loadPractices(){
  const l = readJSON(practicesFile, []);
  return Array.isArray(l) ? l : [];
}
function savePractices(l){ writeJSON(practicesFile, l); }

function loadApologies(){
  const l = readJSON(apologiesFile, []);
  return Array.isArray(l) ? l : [];
}
function saveApologies(l){ writeJSON(apologiesFile, l); }

/* ══════════════════════════════════════════════════════════════
   PHASE 3: SUGGESTIONS STORE
   ══════════════════════════════════════════════════════════════ */
function loadSuggestions(){
  const l = readJSON(suggestionsFile, []);
  return Array.isArray(l) ? l : [];
}
function saveSuggestions(l){ writeJSON(suggestionsFile, l); }

/* ══════════════════════════════════════════════════════════════
   PHASE 4: CHAT STORES
   ══════════════════════════════════════════════════════════════ */

/* ── Chat Messages ── */
function loadChatMessages(){
  const l = readJSON(chatMessagesFile, []);
  return Array.isArray(l) ? l : [];
}
function saveChatMessages(l){
  writeJSON(chatMessagesFile, l.slice(-5000));
}

/* ── Presence (online status) ── */
function loadPresence(){
  const l = readJSON(chatPresenceFile, {});
  return (l && typeof l === 'object' && !Array.isArray(l)) ? l : {};
}
function savePresence(p){ writeJSON(chatPresenceFile, p); }

function updateHeartbeat(memberId, email, name, role){
  const presence = loadPresence();
  presence[memberId] = {
    memberId,
    email,
    name,
    role,
    lastSeen: Date.now()
  };
  const cutoff = Date.now() - (10 * 60 * 1000);
  Object.keys(presence).forEach(k => {
    if (presence[k].lastSeen < cutoff) delete presence[k];
  });
  savePresence(presence);
}

function getOnlineMembers(){
  const presence = loadPresence();
  const cutoff = Date.now() - HEARTBEAT_TTL_MS;
  return Object.values(presence).filter(p => p.lastSeen >= cutoff);
}

function isOnline(memberId){
  const presence = loadPresence();
  const entry = presence[memberId];
  return entry && (Date.now() - entry.lastSeen) < HEARTBEAT_TTL_MS;
}

/* ── Friends ── */
function loadFriends(){
  const l = readJSON(friendsFile, {});
  return (l && typeof l === 'object' && !Array.isArray(l)) ? l : {};
}
function saveFriends(f){ writeJSON(friendsFile, f); }

function getFriendsOf(memberId){
  const friends = loadFriends();
  return Array.isArray(friends[memberId]) ? friends[memberId] : [];
}

function addFriend(memberId, friendId){
  const friends = loadFriends();
  if (!Array.isArray(friends[memberId])) friends[memberId] = [];
  if (!Array.isArray(friends[friendId])) friends[friendId] = [];
  if (!friends[memberId].includes(friendId)) friends[memberId].push(friendId);
  if (!friends[friendId].includes(memberId)) friends[friendId].push(memberId);
  saveFriends(friends);
}

function removeFriend(memberId, friendId){
  const friends = loadFriends();
  if (Array.isArray(friends[memberId])){
    friends[memberId] = friends[memberId].filter(id => id !== friendId);
  }
  if (Array.isArray(friends[friendId])){
    friends[friendId] = friends[friendId].filter(id => id !== memberId);
  }
  saveFriends(friends);
}

/* ============================================================
   EMAIL
============================================================ */
function createTransporter(){
  const required = ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM'];
  if (required.some(name => !process.env[name])) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
}

/* ============================================================
   SESSION MIDDLEWARE
============================================================ */
function requireSession(req, res, next){
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return res.status(401).json({ error: 'Please sign in again.' });
  req.session = session;
  req.token = token;
  next();
}
function requireAdmin(req, res, next){
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

/* ============================================================
   HEALTH
============================================================ */
app.get('/api/health', async (req, res) => {
  if (!database.isConfigured()) return res.status(503).json({ database: 'not_configured' });
  try { await database.healthCheck(); res.json({ database: 'connected' }); }
  catch (error) { console.error('SQL Server health check failed:', error.message);
    res.status(503).json({ database: 'unavailable' }); }
});

/* ============================================================
   AUTH
============================================================ */
app.post('/api/auth/send-otp', async (req, res) => {
  const email = normaliseEmail(req.body.email);
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const previous = otpStore.get(email);
  if (previous && Date.now() - previous.sentAt < RESEND_COOLDOWN_MS)
    return res.status(429).json({ error: 'Please wait before requesting another code.' });
  const transporter = createTransporter();
  if (!transporter) return res.status(503).json({ error: 'Email delivery is not configured. Add SMTP settings to .env.' });
  const otp = createOtp();
  otpStore.set(email, { otpHash: hash(otp), sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to: email,
      subject: 'Your GCO verification code',
      text: `Your GCO verification code is ${otp}. It expires in 10 minutes.` });
    logActivity(`OTP sent to ${email}`, { type:'system', icon:'📧', who:'System' });
    res.json({ message: 'A verification code was sent.' });
  } catch (error) {
    otpStore.delete(email);
    console.error('OTP email delivery failed:', error.message);
    logActivity(`OTP delivery FAILED for ${email}`, { type:'danger', icon:'🚨', who:'System' });
    res.status(502).json({ error: 'The verification email could not be sent.' });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  const email = normaliseEmail(req.body.email);
  const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
  const record = otpStore.get(email);
  if (!record || Date.now() > record.expiresAt){ otpStore.delete(email);
    return res.status(400).json({ error: 'This code has expired.' }); }
  record.attempts += 1;
  if (record.attempts > MAX_ATTEMPTS){ otpStore.delete(email);
    return res.status(429).json({ error: 'Too many attempts. Request a new code.' }); }
  if (!/^\d{6}$/.test(otp) || hash(otp) !== record.otpHash)
    return res.status(400).json({ error: 'Incorrect verification code.' });
  otpStore.delete(email);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  verificationTokens.set(verificationToken, { email, expiresAt: Date.now() + 30 * 60 * 1000 });
  logActivity(`Email verified for ${email}`, { type:'system', icon:'✅', who:'System' });
  res.json({ verified: true, verificationToken });
});

app.post('/api/auth/request-password-reset', async (req, res) => {
  const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
  const accounts = loadAccounts();
  const account = accounts.admins.find(item =>
      item.email === normaliseEmail(identifier) ||
      item.username?.toLowerCase() === identifier.toLowerCase())
    || accounts.members.find(item => item.email === normaliseEmail(identifier));
  if (!account) return res.json({ message: 'If the account exists, a password-reset link has been sent.' });
  const transporter = createTransporter();
  if (!transporter) return res.status(503).json({ error: 'Email delivery is not configured. Add SMTP settings to .env.' });
  const resetToken = crypto.randomBytes(32).toString('hex');
  verificationTokens.set(`reset:${resetToken}`, { email: account.email, purpose:'password-reset', expiresAt: Date.now() + RESET_TTL_MS });
  const baseUrl = process.env.APP_ORIGIN || `http://localhost:${port}`;
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to: account.email,
      subject: 'Reset your GCO password',
      text: `Reset your password here: ${baseUrl}/reset-password.html?token=${resetToken}\nThis link expires in 30 minutes.` });
    logActivity(`Password reset requested for ${account.email}`, { type:'system', icon:'🔑', who:'System' });
    res.json({ message: 'If the account exists, a password-reset link has been sent.' });
  } catch (error) {
    verificationTokens.delete(`reset:${resetToken}`);
    console.error('Password reset email delivery failed:', error.message);
    res.status(502).json({ error: 'The password-reset email could not be sent.' });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const reset = verificationTokens.get(`reset:${token}`);
  if (!reset || reset.purpose !== 'password-reset' || reset.expiresAt < Date.now()){
    verificationTokens.delete(`reset:${token}`);
    return res.status(400).json({ error: 'This password-reset link is invalid or expired.' });
  }
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters and include a number.' });
  const accounts = loadAccounts();
  const account = accounts.admins.find(item => item.email === reset.email)
               || accounts.members.find(item => item.email === reset.email);
  if (!account) return res.status(400).json({ error: 'Account not found.' });
  account.passwordHash = passwordHash(password);
  saveAccounts(accounts);
  verificationTokens.delete(`reset:${token}`);
  logActivity(`Password reset completed for ${account.email}`, { type:'system', icon:'🔓', who:'System' });
  res.json({ message: 'Password updated. You can now sign in.' });
});

/* ============================================================
   MEMBER REGISTRATION
============================================================ */
app.post('/api/members/register', async (req, res) => {
  const accounts = loadAccounts();
  const email = normaliseEmail(req.body.email);
  const verification = verificationTokens.get(req.body.verificationToken);
  const required = ['name','instrument','password','consent','signature','phone','nationalId',
                    'dateOfBirth','nationality','address','emergencyName','emergencyPhone','photoData'];
  if (!required.every(field => typeof req.body[field] === 'string' && req.body[field].trim()) || !isEmail(email))
    return res.status(400).json({ error: 'Complete every required registration field.' });
  if (!isStrongPassword(req.body.password))
    return res.status(400).json({ error: 'Password must be at least 8 characters and include a number.' });
  if (req.body.consent !== 'accepted')
    return res.status(400).json({ error: 'You must accept the member consent.' });
  if (!verification || verification.email !== email || verification.expiresAt < Date.now())
    return res.status(403).json({ error: 'Verify your email with OTP first.' });
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(req.body.photoData) ||
      req.body.photoData.length > 2800000)
    return res.status(400).json({ error: 'Upload a valid JPG, PNG, or WebP profile picture under 2 MB.' });
  if (accounts.members.some(m =>
      m.email === email ||
      m.nationalId?.toLowerCase() === req.body.nationalId.trim().toLowerCase()))
    return res.status(409).json({ error: 'An account already exists for this email or ID number.' });

  const member = {
    id: createId('GCO'), email,
    name: req.body.name.trim(),
    instrument: req.body.instrument.trim(),
    phone: req.body.phone.trim(),
    nationalId: req.body.nationalId.trim(),
    dateOfBirth: req.body.dateOfBirth.trim(),
    nationality: req.body.nationality.trim(),
    address: req.body.address.trim(),
    emergencyName: req.body.emergencyName.trim(),
    emergencyPhone: req.body.emergencyPhone.trim(),
    photoData: req.body.photoData,
    signature: req.body.signature.trim(),
    consent: true,
    passwordHash: passwordHash(req.body.password),
    status: 'pending',
    createdAt: nowISO()
  };

  if (database.isConfigured()){
    try { await database.saveMember(member); }
    catch (error){
      console.error('SQL member registration failed:', error.message);
      return res.status(503).json({ error: 'The member database is unavailable. Please try again.' });
    }
  }
  accounts.members.push(member);
  saveAccounts(accounts);
  verificationTokens.delete(req.body.verificationToken);

  logActivity(`New member registered: ${member.name}`, { type:'member', icon:'🎻', who: member.name });
  logActivity(`Registration pending approval for ${member.name}`, { type:'system', icon:'⏳', who:'System' });

  res.status(201).json({ message: 'Registration submitted for admin approval.', memberId: member.id, status: member.status });
});

/* ============================================================
   AUTH LOGIN
============================================================ */
app.post('/api/auth/login', async (req, res) => {
  const login = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const email = normaliseEmail(login);
  const accounts = loadAccounts();
  let admin = null;
  if (database.isConfigured()){
    try { admin = await database.getAdmin(email || login.toLowerCase()); }
    catch (error){
      console.error('SQL admin login lookup failed:', error.message);
      logActivity(`Admin login SQL error for ${login}`, { type:'danger', icon:'🚨', who:'System' });
      return res.status(503).json({ error: 'The admin database is unavailable. Check SQL Server and try again.' });
    }
  } else {
    admin = accounts.admins.find(item =>
      item.email === email || item.username?.toLowerCase() === login.toLowerCase());
  }
  let member = accounts.members.find(item => item.email === email);
  if (!admin && database.isConfigured()){
    try { member = await database.getMemberByEmail(email) || member; }
    catch (error){
      console.error('SQL member login lookup failed:', error.message);
      return res.status(503).json({ error: 'The member database is unavailable.' });
    }
  }
  const account = admin || member;
  if (!account || !passwordMatches(req.body.password, account.passwordHash)){
    logActivity(`Failed login attempt for "${login}"`, { type:'danger', icon:'🚨', who:'System' });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (member && member.status !== 'approved'){
    logActivity(`Blocked login (pending approval) for ${login}`, { type:'danger', icon:'⛔', who:'System' });
    return res.status(403).json({ error: 'Your account is awaiting admin approval.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    email: account.email,
    role: admin ? 'admin' : 'member',
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  logActivity(`Signed in as ${admin ? 'Admin' : 'Member'} (${account.email})`,
    { type: admin ? 'admin' : 'member', icon: '🔓', who: account.email });
  res.json({ token, role: admin ? 'admin' : 'member',
             redirect: admin ? '/admin-portal.html' : '/member-portal.html' });
});

app.get('/api/auth/me', requireSession, async (req, res) => {
  const accounts = loadAccounts();
  let account = req.session.role === 'admin'
    ? accounts.admins.find(item => item.email === req.session.email)
    : accounts.members.find(item => item.email === req.session.email);
  if (!account && req.session.role === 'member' && database.isConfigured()){
    try { account = await database.getMemberByEmail(req.session.email); }
    catch (error){
      console.error('SQL member profile lookup failed:', error.message);
      return res.status(503).json({ error: 'The member database is unavailable.' });
    }
  }
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  res.json({ role: req.session.role,
             account: req.session.role === 'member'
               ? publicMember(account)
               : { email: account.email, role: 'admin' } });
});

app.post('/api/auth/logout', requireSession, (req, res) => {
  logActivity(`Signed out (${req.session.email})`, { type: req.session.role, icon: '🚪', who: req.session.email });
  sessions.delete(req.token);
  res.status(204).end();
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — MEMBERS (CRUD)
   ══════════════════════════════════════════════════════════════ */

app.get('/api/admin/members', requireSession, requireAdmin, async (req, res) => {
  if (database.isConfigured()){
    try { return res.json({ members: (await database.listMembers()).map(publicMember) }); }
    catch (error){
      console.error('SQL member list failed:', error.message);
      return res.status(503).json({ error: 'The member database is unavailable.' });
    }
  }
  res.json({ members: loadAccounts().members.map(publicMember) });
});

app.post('/api/admin/members', requireSession, requireAdmin, async (req, res) => {
  try {
    const accounts = loadAccounts();
    const email = normaliseEmail(req.body.email);
    if (!email || !isEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
    if (!req.body.name || !req.body.name.trim()) return res.status(400).json({ error: 'Full name is required.' });
    if (!req.body.instrument || !req.body.instrument.trim()) return res.status(400).json({ error: 'Instrument is required.' });
    if (accounts.members.some(m => m.email === email))
      return res.status(409).json({ error: 'A member with this email already exists.' });

    const generated = 'GCO-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '!';
    const rawPassword = (req.body.password && isStrongPassword(req.body.password))
      ? req.body.password
      : generated;

    const member = {
      id: createId('GCO'),
      email,
      name: String(req.body.name).trim(),
      instrument: String(req.body.instrument).trim(),
      phone: (req.body.phone || '').trim(),
      nationalId: (req.body.nationalId || '').trim(),
      dateOfBirth: req.body.dateOfBirth || null,
      nationality: (req.body.nationality || 'Motswana').trim(),
      address: (req.body.address || '').trim(),
      emergencyName: (req.body.emergencyName || '').trim(),
      emergencyPhone: (req.body.emergencyPhone || '').trim(),
      signature: (req.body.signature || 'admin-created').trim(),
      photoData: req.body.photoData || '',
      consent: true,
      passwordHash: passwordHash(rawPassword),
      status: req.body.status === 'pending' ? 'pending' : 'approved',
      createdAt: nowISO(),
      createdBy: req.session.email,
      temporaryPassword: rawPassword
    };

    if (database.isConfigured()){
      try { await database.saveMember(member); }
      catch (e){ console.error('SQL saveMember failed:', e.message); }
    }
    accounts.members.push(member);
    saveAccounts(accounts);

    logActivity(`Admin created member: ${member.name}`, { type:'admin', icon:'➕', req });

    const safe = publicMember(member);
    res.status(201).json({ member: safe, temporaryPassword: rawPassword });
  } catch (e) {
    console.error('Create member failed:', e);
    res.status(500).json({ error: 'Could not create member.' });
  }
});

app.post('/api/admin/members/:id/approve', requireSession, requireAdmin, async (req, res) => {
  if (database.isConfigured()){
    try {
      await database.approveMember(req.params.id).catch(() => {});
      const accounts = loadAccounts();
      const localMember = accounts.members.find(item => item.id === req.params.id);
      if (localMember){
        localMember.status = 'approved';
        localMember.approvedAt = nowISO();
        saveAccounts(accounts);
      }
      logActivity(`Approved member ${req.params.id}`, { type:'success', icon:'✅', req });
      return res.json({ status: 'approved' });
    } catch (error){
      console.error('SQL member approval failed:', error.message);
      return res.status(503).json({ error: 'The member database is unavailable.' });
    }
  }
  const accounts = loadAccounts();
  const member = accounts.members.find(item => item.id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  member.status = 'approved';
  member.approvedAt = nowISO();
  saveAccounts(accounts);
  logActivity(`Approved member ${member.name}`, { type:'success', icon:'✅', req });
  res.json({ member: publicMember(member) });
});

app.put('/api/admin/members/:id', requireSession, async (req, res) => {
  const accounts = loadAccounts();
  const member = accounts.members.find(item => item.id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const isAdmin = req.session.role === 'admin';
  const isSelf  = req.session.role === 'member' && req.session.email === member.email;

  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: 'You can only edit your own profile.' });
  }

  const pick = (k) => typeof req.body[k] === 'string' ? req.body[k].trim() : undefined;
  const name           = pick('name');
  const instrument     = pick('instrument');
  const email          = typeof req.body.email === 'string' ? normaliseEmail(req.body.email) : undefined;
  const phone          = pick('phone');
  const address        = pick('address');
  const signature      = typeof req.body.signature === 'string' ? req.body.signature : undefined;
  const status         = ['pending','approved','rejected'].includes(req.body.status) ? req.body.status : undefined;
  const nationalId     = pick('nationalId');
  const dateOfBirth    = req.body.dateOfBirth;
  const nationality    = pick('nationality');
  const emergencyName  = pick('emergencyName');
  const emergencyPhone = pick('emergencyPhone');

  if (!isAdmin && email && email !== member.email) {
    return res.status(403).json({ error: 'Email cannot be changed. Contact an admin.' });
  }
  if (!isAdmin && signature !== undefined && signature !== member.signature) {
    return res.status(403).json({ error: 'Signature cannot be changed. Contact an admin.' });
  }
  if (!isAdmin && status !== undefined && status !== member.status) {
    return res.status(403).json({ error: 'Status cannot be changed. Contact an admin.' });
  }

  if (isAdmin && email && email !== member.email) {
    if (accounts.members.some(m => m.id !== member.id && m.email === email)) {
      return res.status(409).json({ error: 'Another member already uses this email.' });
    }
  }

  if (name !== undefined && name)                   member.name = name;
  if (instrument !== undefined && instrument)       member.instrument = instrument;
  if (isAdmin && email !== undefined)               member.email = email;
  if (phone !== undefined)                          member.phone = phone;
  if (address !== undefined)                        member.address = address;
  if (isAdmin && signature !== undefined)           member.signature = signature;
  if (isAdmin && status !== undefined)              member.status = status;
  if (nationalId !== undefined)                     member.nationalId = nationalId;
  if (dateOfBirth !== undefined)                    member.dateOfBirth = dateOfBirth;
  if (nationality !== undefined)                    member.nationality = nationality;
  if (emergencyName !== undefined)                  member.emergencyName = emergencyName;
  if (emergencyPhone !== undefined)                 member.emergencyPhone = emergencyPhone;

  member.updatedAt = nowISO();
  saveAccounts(accounts);

  if (database.isConfigured()) {
    try {
      await database.updateMember(req.params.id, {
        name: member.name,
        instrument: member.instrument,
        signature: member.signature,
        status: member.status
      });
    } catch (e) { console.error('SQL updateMember failed:', e.message); }
  }

  logActivity(`${isAdmin ? 'Admin' : 'Member'} updated ${member.name}'s profile`,
    { type: isAdmin ? 'admin' : 'member', icon:'✏️', req });

  res.json({ member: publicMember(member) });
});

app.delete('/api/admin/members/:id', requireSession, requireAdmin, async (req, res) => {
  const accounts = loadAccounts();
  const removed = accounts.members.find(m => m.id === req.params.id);
  const before = accounts.members.length;
  accounts.members = accounts.members.filter(m => m.id !== req.params.id);
  if (accounts.members.length === before) return res.status(404).json({ error: 'Member not found.' });
  saveAccounts(accounts);

  if (database.isConfigured()){
    try { await database.deleteMember(req.params.id); }
    catch (e){ console.error('SQL deleteMember failed:', e.message); }
  }

  logActivity(`Deleted member ${removed ? removed.name : req.params.id}`,
    { type:'danger', icon:'🗑️', req });
  res.status(204).end();
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — ADMINS & ROLES
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/admins', requireSession, requireAdmin, (req, res) => {
  res.json({ admins: loadAdmins() });
});

app.post('/api/admin/admins', requireSession, requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  const email = normaliseEmail(req.body.email);
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const role = (req.body.role || 'Read Only').trim();
  const perms = Array.isArray(req.body.perms) ? req.body.perms : [];

  if (!name) return res.status(400).json({ error: 'Full name is required.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Valid email is required.' });
  if (!username || username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  if (!isStrongPassword(password))
    return res.status(400).json({ error: 'Password must be at least 8 characters and include a letter and a number.' });

  const adminsList = loadAdmins();
  if (adminsList.some(a => a.email === email))
    return res.status(409).json({ error: 'An admin with this email already exists.' });
  if (adminsList.some(a => a.username?.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ error: 'This username is already taken.' });

  const accounts = loadAccounts();
  if (accounts.admins.some(a => a.email === email || a.username?.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ error: 'This email or username already belongs to an admin account.' });

  const admin = {
    id: createId('ADM'),
    name,
    email,
    username,
    role,
    perms,
    photo: '',
    createdAt: nowISO(),
    createdBy: req.session.email
  };
  adminsList.push(admin);
  saveAdmins(adminsList);

  accounts.admins.push({
    id: admin.id,
    email,
    username,
    name,
    role,
    perms,
    passwordHash: passwordHash(password),
    createdAt: nowISO()
  });
  saveAccounts(accounts);

  if (database.isConfigured() && typeof database.saveAdmin === 'function'){
    database.saveAdmin({
      id: admin.id,
      username,
      email,
      name,
      passwordHash: passwordHash(password),
      role,
      perms,
      photo: ''
    }).catch(e => console.error('SQL saveAdmin failed:', e.message));
  }

  logActivity(`Added new admin ${name} (${role})`, { type:'admin', icon:'➕', req });
  res.status(201).json({ admin });
});

app.put('/api/admin/admins/:id', requireSession, requireAdmin, (req, res) => {
  const list = loadAdmins();
  const i = list.findIndex(a => a.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Admin not found.' });

  const before = { ...list[i] };
  const newEmail = req.body.email ? normaliseEmail(req.body.email) : list[i].email;
  const newUsername = req.body.username ? req.body.username.trim() : list[i].username;

  if (newEmail && newEmail !== list[i].email &&
      list.some(a => a.id !== list[i].id && a.email === newEmail))
    return res.status(409).json({ error: 'Another admin already uses this email.' });

  if (newUsername && newUsername !== list[i].username &&
      list.some(a => a.id !== list[i].id && a.username?.toLowerCase() === newUsername.toLowerCase()))
    return res.status(409).json({ error: 'Another admin already uses this username.' });

  if (req.body.name)     list[i].name = req.body.name.trim();
  if (req.body.email)    list[i].email = newEmail;
  if (req.body.username) list[i].username = newUsername;
  if (req.body.role)     list[i].role = req.body.role;
  if (Array.isArray(req.body.perms)) list[i].perms = req.body.perms;
  if (req.body.photo != null) list[i].photo = req.body.photo;
  list[i].updatedAt = nowISO();
  saveAdmins(list);

  const accounts = loadAccounts();
  const ai = accounts.admins.findIndex(a =>
    a.id === req.params.id ||
    a.email === before.email ||
    a.username?.toLowerCase() === before.username?.toLowerCase()
  );
  if (ai >= 0){
    accounts.admins[ai].name = list[i].name;
    accounts.admins[ai].email = list[i].email;
    accounts.admins[ai].username = list[i].username;
    accounts.admins[ai].role = list[i].role;
    accounts.admins[ai].perms = list[i].perms;

    if (req.body.password && isStrongPassword(req.body.password)){
      accounts.admins[ai].passwordHash = passwordHash(req.body.password);
    }
    saveAccounts(accounts);
  }

  if (database.isConfigured() && typeof database.updateAdmin === 'function'){
    database.updateAdmin(req.params.id, {
      name: list[i].name,
      email: list[i].email,
      role: list[i].role,
      perms: list[i].perms
    }).catch(e => console.error('SQL updateAdmin failed:', e.message));
  }

  const roleChanged = before.role !== list[i].role;
  logActivity(`Updated admin ${list[i].name}${roleChanged ? ` (role → ${list[i].role})` : ''}`,
    { type:'admin', icon:'✏️', req });
  res.json({ admin: list[i] });
});

app.delete('/api/admin/admins/:id', requireSession, requireAdmin, (req, res) => {
  const list = loadAdmins();
  const removed = list.find(a => a.id === req.params.id);
  if (!removed) return res.status(404).json({ error: 'Admin not found.' });

  if (removed.email === req.session.email)
    return res.status(400).json({ error: 'You cannot remove your own admin account.' });

  const next = list.filter(a => a.id !== req.params.id);
  saveAdmins(next);

  const accounts = loadAccounts();
  const beforeLen = accounts.admins.length;
  accounts.admins = accounts.admins.filter(a =>
    a.id !== req.params.id &&
    a.email !== removed.email &&
    a.username?.toLowerCase() !== removed.username?.toLowerCase()
  );
  if (accounts.admins.length !== beforeLen) saveAccounts(accounts);

  if (database.isConfigured() && typeof database.deleteAdmin === 'function'){
    database.deleteAdmin(req.params.id).catch(e => console.error('SQL deleteAdmin failed:', e.message));
  }

  logActivity(`Removed admin ${removed.name}`, { type:'danger', icon:'🗑️', req });
  res.status(204).end();
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — DATABASE VIEWER
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/database/:table', requireSession, requireAdmin, (req, res) => {
  const table = req.params.table;
  const accounts = loadAccounts();
  let rows = [];
  switch(table){
    case 'members':       rows = accounts.members.map(publicMember); break;
    case 'admins':        rows = accounts.admins.map(a => { const { passwordHash, ...safe } = a; return safe; }); break;
    case 'events':        rows = loadEvents(); break;
    case 'content':       rows = loadContent(); break;
    case 'announcements': rows = loadAnnouncements(); break;
    case 'messages':      rows = loadMessages(); break;
    case 'activity':      rows = loadActivity(); break;
    case 'practices':     rows = loadPractices(); break;
    case 'apologies':     rows = loadApologies(); break;
    case 'suggestions':   rows = loadSuggestions(); break;
    case 'settings':      rows = [loadSettings()]; break;
    case 'chat-messages': rows = loadChatMessages(); break;
    case 'chat-presence': rows = Object.values(loadPresence()); break;
    case 'friends':       rows = Object.entries(loadFriends()).map(([id, list]) => ({ memberId: id, friends: list })); break;
    default: return res.status(400).json({ error: 'Unknown table.' });
  }
  res.json({ table, count: rows.length, rows });
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — ACTIVITY LOG
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/activity', requireSession, requireAdmin, (req, res) => {
  res.json({ activity: loadActivity() });
});

app.post('/api/admin/activity', requireSession, requireAdmin, (req, res) => {
  const entry = logActivity(req.body.action || 'Manual log entry', {
    type: req.body.type || 'admin',
    icon: req.body.icon,
    req
  });
  res.status(201).json({ entry });
});

app.delete('/api/admin/activity', requireSession, requireAdmin, (req, res) => {
  saveActivity([]);
  logActivity('Cleared the activity log', { type:'danger', icon:'🗑️', req });
  res.status(204).end();
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — EVENTS
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/events', requireSession, requireAdmin, (req, res) => {
  res.json({ events: loadEvents() });
});

app.post('/api/admin/events', requireSession, requireAdmin, (req, res) => {
  const { title, date, venue, capacity, price } = req.body;
  if (!title || !date || !venue) return res.status(400).json({ error: 'Title, date, and venue are required.' });
  const list = loadEvents();
  const event = {
    id: createId('EVT'),
    title: String(title).trim(),
    date,
    venue: String(venue).trim(),
    capacity: Number(capacity) || 100,
    price: Number(price) || 0,
    sold: 0,
    createdAt: nowISO()
  };
  list.push(event);
  saveEvents(list);
  logActivity(`Created event "${event.title}"`, { type:'admin', icon:'🎉', req });
  res.status(201).json({ event });
});

app.put('/api/admin/events/:id', requireSession, requireAdmin, (req, res) => {
  const list = loadEvents();
  const i = list.findIndex(e => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Event not found.' });
  const before = list[i].title;
  Object.assign(list[i], {
    title: req.body.title ?? list[i].title,
    date: req.body.date ?? list[i].date,
    venue: req.body.venue ?? list[i].venue,
    capacity: req.body.capacity != null ? Number(req.body.capacity) : list[i].capacity,
    price: req.body.price != null ? Number(req.body.price) : list[i].price,
    sold: req.body.sold != null ? Number(req.body.sold) : list[i].sold
  });
  saveEvents(list);
  logActivity(`Edited event "${before}"`, { type:'admin', icon:'✏️', req });
  res.json({ event: list[i] });
});

app.delete('/api/admin/events/:id', requireSession, requireAdmin, (req, res) => {
  const list = loadEvents();
  const removed = list.find(e => e.id === req.params.id);
  const next = list.filter(e => e.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'Event not found.' });
  saveEvents(next);
  logActivity(`Deleted event "${removed ? removed.title : req.params.id}"`, { type:'danger', icon:'🗑️', req });
  res.status(204).end();
});

app.post('/api/admin/events/:id/ticket', requireSession, requireAdmin, (req, res) => {
  const list = loadEvents();
  const i = list.findIndex(e => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Event not found.' });
  const ticketId = 'GCO-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  list[i].sold = (list[i].sold || 0) + 1;
  saveEvents(list);
  logActivity(`Generated QR ticket ${ticketId} for "${list[i].title}"`,
    { type:'success', icon:'🎟️', req });
  res.json({
    ticketId,
    payload: { ticket: ticketId, event: list[i].title, date: list[i].date, venue: list[i].venue },
    event: list[i]
  });
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — CONTENT
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/content', requireSession, requireAdmin, (req, res) => {
  res.json({ content: loadContent() });
});

app.post('/api/admin/content', requireSession, requireAdmin, (req, res) => {
  const { type, title, body, tags, status } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'Content type and title are required.' });
  const list = loadContent();
  const item = {
    id: createId('CNT'),
    type,
    title: String(title).trim(),
    body: body || '',
    tags: tags || '',
    status: status === 'published' ? 'published' : 'draft',
    date: nowISO().slice(0,10),
    createdAt: nowISO()
  };
  list.unshift(item);
  saveContent(list);
  logActivity(`Published ${type}: "${item.title}" (${item.status})`,
    { type:'admin', icon:'📝', req });
  res.status(201).json({ item });
});

app.delete('/api/admin/content/:id', requireSession, requireAdmin, (req, res) => {
  const list = loadContent();
  const removed = list.find(c => c.id === req.params.id);
  const next = list.filter(c => c.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'Content not found.' });
  saveContent(next);
  logActivity(`Deleted content "${removed ? removed.title : req.params.id}"`,
    { type:'danger', icon:'🗑️', req });
  res.status(204).end();
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — ANNOUNCEMENTS
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/announcements', requireSession, requireAdmin, (req, res) => {
  res.json({ announcements: loadAnnouncements() });
});

app.post('/api/admin/announcements', requireSession, requireAdmin, (req, res) => {
  const { audience, priority, subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required.' });
  const list = loadAnnouncements();
  const item = {
    id: createId('ANN'),
    audience: audience || 'All members',
    priority: priority || 'Normal',
    subject: String(subject).trim(),
    message: String(message).trim(),
    at: todayDisplay(),
    createdAt: nowISO()
  };
  list.unshift(item);
  saveAnnouncements(list);
  logActivity(`Sent announcement "${item.subject}" to ${item.audience}`,
    { type:'admin', icon:'📢', req });
  res.status(201).json({ announcement: item });
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — MESSAGES
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/messages', requireSession, requireAdmin, (req, res) => {
  res.json({ messages: loadMessages() });
});

app.put('/api/admin/messages/:id/read', requireSession, requireAdmin, (req, res) => {
  const list = loadMessages();
  const i = list.findIndex(m => m.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Message not found.' });
  list[i].read = true;
  saveMessages(list);
  logActivity(`Marked message from ${list[i].from} as read`, { type:'admin', icon:'✉️', req });
  res.json({ message: list[i] });
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — REPORTS
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/reports/:type', requireSession, requireAdmin, (req, res) => {
  const type = req.params.type;
  const accounts = loadAccounts();
  const events   = loadEvents();
  const admins   = loadAdmins();
  const activity = loadActivity();
  const practices = loadPractices();
  const apologies = loadApologies();
  const suggestions = loadSuggestions();

  let data;
  switch(type){
    case 'members':     data = accounts.members.map(publicMember); break;
    case 'events':      data = events; break;
    case 'tickets':     data = events.map(e => ({ ...e, revenue: (e.sold||0) * (e.price||0) })); break;
    case 'admins':      data = admins; break;
    case 'activity':    data = activity; break;
    case 'financial':   data = events.map(e => ({ title: e.title, revenue: (e.sold||0) * (e.price||0) })); break;
    case 'practices':   data = practices; break;
    case 'apologies':   data = apologies; break;
    case 'suggestions': data = suggestions; break;
    default: return res.status(400).json({ error: 'Unknown report type.' });
  }
  logActivity(`Downloaded ${type} report`, { type:'admin', icon:'⬇️', req });
  res.json({ type, generatedAt: nowISO(), rows: data });
});

/* ══════════════════════════════════════════════════════════════
   ADMIN — SETTINGS
   ══════════════════════════════════════════════════════════════ */
app.get('/api/admin/settings', requireSession, requireAdmin, (req, res) => {
  const settings = loadSettings();
  const me = settings[req.session.email] || {
    name: 'Administrator', email: req.session.email, role: 'Super Admin', avatar: ''
  };
  res.json({ me });
});

app.put('/api/admin/settings', requireSession, requireAdmin, (req, res) => {
  const settings = loadSettings();
  const current = settings[req.session.email] || { email: req.session.email };
  const updated = {
    ...current,
    name:   req.body.name   || current.name,
    avatar: req.body.avatar != null ? req.body.avatar : current.avatar,
    role:   req.body.role   || current.role || 'Super Admin'
  };
  settings[req.session.email] = updated;
  saveSettings(settings);
  logActivity('Updated admin profile', { type:'admin', icon:'⚙️', req });
  res.json({ me: updated });
});

/* ══════════════════════════════════════════════════════════════
   ███████╗ PHASE 2 — PRACTICES + ATTENDANCE + APOLOGIES ████████
   ══════════════════════════════════════════════════════════════ */

/* ── LIST practices (both admin and member can see) ── */
app.get('/api/practices', requireSession, (req, res) => {
  const practices = loadPractices();
  const sorted = [...practices].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ practices: sorted });
});

/* ── CREATE practice (admin) ── */
app.post('/api/admin/practices', requireSession, requireAdmin, (req, res) => {
  const { title, date, time, venue, section, notes } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Title and date are required.' });

  const practices = loadPractices();
  const members = loadAccounts().members.filter(m => m.status === 'approved');

  const attendance = members.map(m => ({
    memberId: m.id,
    memberName: m.name,
    memberEmail: m.email,
    instrument: m.instrument || '',
    section: m.instrument || '',
    status: 'unmarked',
    note: ''
  }));

  const practice = {
    id: createId('PRC'),
    title: String(title).trim(),
    date,
    time: time || '',
    venue: (venue || '').trim(),
    section: (section || 'All').trim(),
    notes: (notes || '').trim(),
    attendance,
    createdBy: req.session.email,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };

  practices.push(practice);
  savePractices(practices);

  logActivity(`Created practice "${practice.title}" (${practice.date})`,
    { type:'admin', icon:'📅', req });

  res.status(201).json({ practice });
});

/* ── UPDATE practice (admin) ── */
app.put('/api/admin/practices/:id', requireSession, requireAdmin, (req, res) => {
  const practices = loadPractices();
  const i = practices.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Practice not found.' });

  const before = practices[i].title;
  const p = practices[i];

  if (typeof req.body.title === 'string')   p.title = req.body.title.trim();
  if (typeof req.body.date === 'string')    p.date = req.body.date;
  if (typeof req.body.time === 'string')    p.time = req.body.time;
  if (typeof req.body.venue === 'string')   p.venue = req.body.venue.trim();
  if (typeof req.body.section === 'string') p.section = req.body.section.trim();
  if (typeof req.body.notes === 'string')   p.notes = req.body.notes.trim();

  p.updatedAt = nowISO();
  savePractices(practices);

  logActivity(`Updated practice "${before}"`, { type:'admin', icon:'✏️', req });
  res.json({ practice: p });
});

/* ── DELETE practice (admin) ── */
app.delete('/api/admin/practices/:id', requireSession, requireAdmin, (req, res) => {
  const practices = loadPractices();
  const removed = practices.find(p => p.id === req.params.id);
  const next = practices.filter(p => p.id !== req.params.id);
  if (next.length === practices.length) return res.status(404).json({ error: 'Practice not found.' });

  savePractices(next);
  logActivity(`Deleted practice "${removed ? removed.title : req.params.id}"`,
    { type:'danger', icon:'🗑️', req });
  res.status(204).end();
});

/* ── GET attendance for a specific practice (admin) ── */
app.get('/api/admin/practices/:id/attendance', requireSession, requireAdmin, (req, res) => {
  const practices = loadPractices();
  const practice = practices.find(p => p.id === req.params.id);
  if (!practice) return res.status(404).json({ error: 'Practice not found.' });

  res.json({
    practiceId: practice.id,
    practiceTitle: practice.title,
    date: practice.date,
    attendance: practice.attendance || []
  });
});

/* ── SAVE attendance for a practice (bulk — admin) ── */
app.post('/api/admin/practices/:id/attendance', requireSession, requireAdmin, (req, res) => {
  const practices = loadPractices();
  const i = practices.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Practice not found.' });

  const updates = Array.isArray(req.body.attendance) ? req.body.attendance : [];
  const VALID = ['present','absent','apology','late','unmarked'];

  practices[i].attendance = practices[i].attendance.map(a => {
    const u = updates.find(x => x.memberId === a.memberId);
    if (!u) return a;
    return {
      ...a,
      status: VALID.includes(u.status) ? u.status : a.status,
      note:   typeof u.note === 'string' ? u.note : a.note
    };
  });

  practices[i].updatedAt = nowISO();
  savePractices(practices);

  const marked = updates.length;
  logActivity(`Marked attendance for "${practices[i].title}" (${marked} member${marked === 1 ? '' : 's'})`,
    { type:'admin', icon:'✅', req });

  res.json({ practice: practices[i] });
});

/* ── ADD members to an existing practice (when new members join) ── */
app.post('/api/admin/practices/:id/sync-members', requireSession, requireAdmin, (req, res) => {
  const practices = loadPractices();
  const i = practices.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Practice not found.' });

  const members = loadAccounts().members.filter(m => m.status === 'approved');
  const existing = new Set((practices[i].attendance || []).map(a => a.memberId));

  let added = 0;
  members.forEach(m => {
    if (!existing.has(m.id)) {
      practices[i].attendance.push({
        memberId: m.id,
        memberName: m.name,
        memberEmail: m.email,
        instrument: m.instrument || '',
        section: m.instrument || '',
        status: 'unmarked',
        note: ''
      });
      added++;
    }
  });

  savePractices(practices);
  logActivity(`Synced ${added} new member${added === 1 ? '' : 's'} into "${practices[i].title}"`,
    { type:'admin', icon:'🔄', req });

  res.json({ added, practice: practices[i] });
});

/* ── MEMBER: view own attendance across all practices ── */
app.get('/api/member/attendance', requireSession, (req, res) => {
  if (req.session.role !== 'member') return res.status(403).json({ error: 'Member access required.' });

  const accounts = loadAccounts();
  const member = accounts.members.find(m => m.email === req.session.email);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const practices = loadPractices();
  const records = [];

  practices.forEach(p => {
    const myEntry = (p.attendance || []).find(a => a.memberId === member.id);
    if (myEntry) {
      records.push({
        practiceId: p.id,
        practiceTitle: p.title,
        date: p.date,
        time: p.time,
        venue: p.venue,
        section: p.section,
        status: myEntry.status,
        note: myEntry.note
      });
    }
  });

  records.sort((a, b) => new Date(b.date) - new Date(a.date));

  const total    = records.filter(r => r.status !== 'unmarked').length;
  const attended = records.filter(r => r.status === 'present' || r.status === 'late').length;
  const missed   = records.filter(r => r.status === 'absent').length;
  const apologies = records.filter(r => r.status === 'apology').length;
  const rate     = total ? Math.round((attended / total) * 100) : 0;

  res.json({
    attendance: records,
    total,
    attended,
    missed,
    apologies,
    rate
  });
});

/* ── MEMBER: upcoming + past practices ── */
app.get('/api/member/practices', requireSession, (req, res) => {
  if (req.session.role !== 'member') return res.status(403).json({ error: 'Member access required.' });

  const accounts = loadAccounts();
  const member = accounts.members.find(m => m.email === req.session.email);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const practices = loadPractices();
  const now = new Date();

  const list = practices.map(p => {
    const myEntry = (p.attendance || []).find(a => a.memberId === member.id);
    return {
      id: p.id,
      title: p.title,
      date: p.date,
      time: p.time,
      venue: p.venue,
      section: p.section,
      notes: p.notes,
      myStatus: myEntry ? myEntry.status : 'unmarked',
      isUpcoming: new Date(p.date) >= now
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ practices: list });
});

/* ══════════════════════════════════════════════════════════════
   APOLOGIES — MEMBER submit + list, ADMIN review
   ══════════════════════════════════════════════════════════════ */

/* ── MEMBER: submit apology for a practice ── */
app.post('/api/member/apologies', requireSession, (req, res) => {
  if (req.session.role !== 'member') return res.status(403).json({ error: 'Member access required.' });

  const accounts = loadAccounts();
  const member = accounts.members.find(m => m.email === req.session.email);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const practiceId = String(req.body.practiceId || '').trim();
  const reason = String(req.body.reason || '').trim();

  if (!practiceId) return res.status(400).json({ error: 'Select a practice.' });
  if (!reason)     return res.status(400).json({ error: 'Please provide a reason for your apology.' });

  const practices = loadPractices();
  const practice = practices.find(p => p.id === practiceId);
  if (!practice) return res.status(404).json({ error: 'Practice not found.' });

  const apologies = loadApologies();

  if (apologies.some(a => a.memberId === member.id && a.practiceId === practiceId && a.status === 'pending')) {
    return res.status(409).json({ error: 'You already have a pending apology for this practice.' });
  }

  const apology = {
    id: createId('APL'),
    memberId: member.id,
    memberName: member.name,
    memberEmail: member.email,
    practiceId,
    practiceTitle: practice.title,
    practiceDate: practice.date,
    reason,
    status: 'pending',
    submittedAt: nowISO()
  };

  apologies.unshift(apology);
  saveApologies(apologies);

  const pi = practices.findIndex(p => p.id === practiceId);
  if (pi >= 0) {
    const ai = (practices[pi].attendance || []).findIndex(a => a.memberId === member.id);
    if (ai >= 0) {
      practices[pi].attendance[ai].status = 'apology';
      practices[pi].attendance[ai].note = reason.slice(0, 100);
      savePractices(practices);
    }
  }

  logActivity(`${member.name} submitted an apology for "${practice.title}"`,
    { type:'member', icon:'🙏', who: member.name });

  res.status(201).json({ apology });
});

/* ── MEMBER: view own apologies ── */
app.get('/api/member/apologies', requireSession, (req, res) => {
  if (req.session.role !== 'member') return res.status(403).json({ error: 'Member access required.' });

  const accounts = loadAccounts();
  const member = accounts.members.find(m => m.email === req.session.email);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const list = loadApologies().filter(a => a.memberId === member.id);
  res.json({ apologies: list });
});

/* ── ADMIN: view all apologies ── */
app.get('/api/admin/apologies', requireSession, requireAdmin, (req, res) => {
  res.json({ apologies: loadApologies() });
});

/* ── ADMIN: accept / reject an apology ── */
app.put('/api/admin/apologies/:id', requireSession, requireAdmin, (req, res) => {
  const status = ['pending','accepted','rejected'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Invalid status.' });

  const list = loadApologies();
  const i = list.findIndex(a => a.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Apology not found.' });

  list[i].status = status;
  list[i].reviewedBy = req.session.email;
  list[i].reviewedAt = nowISO();
  saveApologies(list);

  if (status === 'rejected') {
    const practices = loadPractices();
    const pi = practices.findIndex(p => p.id === list[i].practiceId);
    if (pi >= 0) {
      const ai = (practices[pi].attendance || []).findIndex(a => a.memberId === list[i].memberId);
      if (ai >= 0) {
        practices[pi].attendance[ai].status = 'absent';
        practices[pi].attendance[ai].note = 'Apology rejected';
        savePractices(practices);
      }
    }
  }

  logActivity(`${status === 'accepted' ? 'Accepted' : 'Rejected'} apology from ${list[i].memberName}`,
    { type:'admin', icon: status === 'accepted' ? '✅' : '❌', req });

  res.json({ apology: list[i] });
});

/* ══════════════════════════════════════════════════════════════
   ███████╗ PHASE 3 — SUGGESTIONS BOX ███████████████████████████
   ══════════════════════════════════════════════════════════════ */

/* ── MEMBER: submit a suggestion ── */
app.post('/api/member/suggestions', requireSession, (req, res) => {
  if (req.session.role !== 'member') return res.status(403).json({ error: 'Member access required.' });

  const accounts = loadAccounts();
  const member = accounts.members.find(m => m.email === req.session.email);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const title = String(req.body.title || '').trim();
  const body  = String(req.body.body || req.body.message || '').trim();
  const category = String(req.body.category || 'General').trim();
  const anonymous = req.body.anonymous === true || req.body.anonymous === 'true';

  if (!title) return res.status(400).json({ error: 'Please add a short title.' });
  if (!body)  return res.status(400).json({ error: 'Please describe your suggestion.' });
  if (title.length > 120) return res.status(400).json({ error: 'Title must be under 120 characters.' });
  if (body.length > 2000) return res.status(400).json({ error: 'Suggestion must be under 2000 characters.' });

  const suggestions = loadSuggestions();

  const item = {
    id: createId('SUG'),
    memberId: member.id,
    memberName: anonymous ? 'Anonymous' : member.name,
    memberEmail: anonymous ? '' : member.email,
    anonymous,
    category,
    title,
    body,
    status: 'new',
    adminResponse: '',
    respondedBy: '',
    respondedAt: '',
    submittedAt: nowISO(),
    updatedAt: nowISO()
  };

  suggestions.unshift(item);
  saveSuggestions(suggestions);

  logActivity(`${anonymous ? 'Anonymous member' : member.name} submitted a suggestion: "${title}"`,
    { type: 'member', icon: '💡', who: anonymous ? 'Anonymous' : member.name });

  res.status(201).json({ suggestion: item });
});

/* ── MEMBER: view own suggestions ── */
app.get('/api/member/suggestions', requireSession, (req, res) => {
  if (req.session.role !== 'member') return res.status(403).json({ error: 'Member access required.' });

  const accounts = loadAccounts();
  const member = accounts.members.find(m => m.email === req.session.email);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const list = loadSuggestions().filter(s => s.memberId === member.id);
  res.json({ suggestions: list });
});

/* ── ADMIN: view all suggestions ── */
app.get('/api/admin/suggestions', requireSession, requireAdmin, (req, res) => {
  res.json({ suggestions: loadSuggestions() });
});

/* ── ADMIN: update suggestion status + add response ── */
app.put('/api/admin/suggestions/:id', requireSession, requireAdmin, (req, res) => {
  const VALID = ['new','reviewed','planned','done','declined'];
  const status = VALID.includes(req.body.status) ? req.body.status : null;
  const response = typeof req.body.adminResponse === 'string' ? req.body.adminResponse.trim() : undefined;

  const list = loadSuggestions();
  const i = list.findIndex(s => s.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Suggestion not found.' });

  if (status)   list[i].status = status;
  if (response !== undefined){
    list[i].adminResponse = response;
    list[i].respondedBy = req.session.email;
    list[i].respondedAt = nowISO();
  }
  list[i].updatedAt = nowISO();
  saveSuggestions(list);

  logActivity(`Updated suggestion "${list[i].title}"${status ? ' → ' + status : ''}`,
    { type: 'admin', icon: '💡', req });

  res.json({ suggestion: list[i] });
});

/* ── ADMIN: delete a suggestion ── */
app.delete('/api/admin/suggestions/:id', requireSession, requireAdmin, (req, res) => {
  const list = loadSuggestions();
  const removed = list.find(s => s.id === req.params.id);
  if (!removed) return res.status(404).json({ error: 'Suggestion not found.' });

  saveSuggestions(list.filter(s => s.id !== req.params.id));

  logActivity(`Deleted suggestion "${removed.title}"`,
    { type: 'danger', icon: '🗑️', req });

  res.status(204).end();
});

/* ══════════════════════════════════════════════════════════════
   ███████╗ PHASE 4 — FULL CHAT SYSTEM ███████████████████████████
   ══════════════════════════════════════════════════════════════ */

/* ── Helper: identify current user (admin or member) ── */
async function resolveCurrentUser(req){
  const accounts = loadAccounts();
  if (req.session.role === 'admin'){
    const admin = accounts.admins.find(a => a.email === req.session.email)
      || loadAdmins().find(a => a.email === req.session.email);
    if (admin) return { id: admin.id, name: admin.name || 'Admin', email: admin.email, role: 'admin' };
    return { id: 'ADM-' + hash(req.session.email).slice(0,8).toUpperCase(), name: 'Admin', email: req.session.email, role: 'admin' };
  }
  let member = accounts.members.find(m => m.email === req.session.email);
  if (!member && database.isConfigured()){
    try { member = await database.getMemberByEmail(req.session.email); } catch(_){}
  }
  if (member) return { id: member.id, name: member.name, email: member.email, role: 'member' };
  return null;
}

/* ── Helper: resolve target user by memberId (member or admin) ── */
function resolveUserById(memberId){
  const accounts = loadAccounts();
  const admin = accounts.admins.find(a => a.id === memberId)
    || loadAdmins().find(a => a.id === memberId);
  if (admin) return { id: admin.id, name: admin.name || 'Admin', email: admin.email, role: 'admin' };
  const member = accounts.members.find(m => m.id === memberId);
  if (member) return { id: member.id, name: member.name, email: member.email, role: 'member' };
  return null;
}

/* ── 1. POST /api/chat/heartbeat — update my "last seen" ── */
app.post('/api/chat/heartbeat', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });
  updateHeartbeat(me.id, me.email, me.name, me.role);
  res.json({ ok: true, online: true, at: Date.now() });
});

/* ── 2. GET /api/chat/online — list currently online members ── */
app.get('/api/chat/online', requireSession, async (req, res) => {
  const online = getOnlineMembers();
  res.json({ online, count: online.length, ttlMs: HEARTBEAT_TTL_MS });
});

/* ── 3. GET /api/chat/group — fetch group chat messages ── */
app.get('/api/chat/group', requireSession, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const messages = loadChatMessages()
    .filter(m => m.type === 'group')
    .slice(-limit);
  res.json({ messages });
});

/* ── 4. POST /api/chat/group — send to group (with @mentions) ── */
app.post('/api/chat/group', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars).' });

  const mentions = [];
  const mentionRegex = /@([A-Za-z][A-Za-z0-9 .'-]{0,40})/g;
  let match;
  const accounts = loadAccounts();
  while ((match = mentionRegex.exec(text)) !== null){
    const nameQuery = match[1].trim().toLowerCase();
    const member = accounts.members.find(m =>
      m.status === 'approved' && m.name.toLowerCase().startsWith(nameQuery));
    if (member && !mentions.includes(member.id)) mentions.push(member.id);
    const admin = accounts.admins.find(a =>
      (a.name || '').toLowerCase().startsWith(nameQuery));
    if (admin && !mentions.includes(admin.id)) mentions.push(admin.id);
  }

  const message = {
    id: createId('MSG'),
    type: 'group',
    from: me.id,
    fromName: me.name,
    fromRole: me.role,
    text,
    mentions,
    at: nowISO(),
    timestamp: Date.now()
  };

  const all = loadChatMessages();
  all.push(message);
  saveChatMessages(all);
  updateHeartbeat(me.id, me.email, me.name, me.role);

  res.status(201).json({ message });
});

/* ── 5. GET /api/chat/direct/:memberId — fetch DM with a member ── */
app.get('/api/chat/direct/:memberId', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  const other = req.params.memberId;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const messages = loadChatMessages()
    .filter(m => m.type === 'direct' &&
      ((m.from === me.id && m.to === other) || (m.from === other && m.to === me.id)))
    .slice(-limit);

  res.json({ messages, with: other });
});

/* ── 6. POST /api/chat/direct/:memberId — send a DM ── */
app.post('/api/chat/direct/:memberId', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  const toId = req.params.memberId;
  const target = resolveUserById(toId);
  if (!target) return res.status(404).json({ error: 'Recipient not found.' });

  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars).' });

  const message = {
    id: createId('MSG'),
    type: 'direct',
    from: me.id,
    fromName: me.name,
    fromRole: me.role,
    to: toId,
    toName: target.name,
    text,
    read: false,
    at: nowISO(),
    timestamp: Date.now()
  };

  const all = loadChatMessages();
  all.push(message);
  saveChatMessages(all);
  updateHeartbeat(me.id, me.email, me.name, me.role);

  res.status(201).json({ message });
});

/* ── 7. GET /api/chat/unread — count unread messages ── */
app.get('/api/chat/unread', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  const all = loadChatMessages();
  const directUnread = all.filter(m =>
    m.type === 'direct' && m.to === me.id && !m.read
  );

  const bySender = {};
  directUnread.forEach(m => {
    if (!bySender[m.from]) bySender[m.from] = { from: m.from, fromName: m.fromName, count: 0 };
    bySender[m.from].count++;
  });

  const mentionUnread = all.filter(m =>
    m.type === 'group' && Array.isArray(m.mentions) &&
    m.mentions.includes(me.id) && m.from !== me.id
  ).length;

  res.json({
    direct: Object.values(bySender),
    directTotal: directUnread.length,
    mentions: mentionUnread,
    total: directUnread.length + mentionUnread
  });
});

/* ── 8. POST /api/chat/read/:memberId — mark DM as read ── */
app.post('/api/chat/read/:memberId', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  const fromId = req.params.memberId;
  const all = loadChatMessages();
  let changed = 0;
  all.forEach(m => {
    if (m.type === 'direct' && m.from === fromId && m.to === me.id && !m.read){
      m.read = true;
      m.readAt = nowISO();
      changed++;
    }
  });
  if (changed) saveChatMessages(all);
  res.json({ marked: changed });
});

/* ── 9. GET /api/friends — my friends list ── */
app.get('/api/friends', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  const friendIds = getFriendsOf(me.id);
  const accounts = loadAccounts();
  const admins = loadAdmins();

  const friends = friendIds.map(id => {
    const member = accounts.members.find(m => m.id === id);
    if (member) {
      return {
        id: member.id,
        name: member.name,
        email: member.email,
        instrument: member.instrument || '',
        role: 'member',
        online: isOnline(member.id)
      };
    }
    const admin = admins.find(a => a.id === id) || accounts.admins.find(a => a.id === id);
    if (admin) {
      return {
        id: admin.id,
        name: admin.name || 'Admin',
        email: admin.email,
        role: 'admin',
        online: isOnline(admin.id)
      };
    }
    return null;
  }).filter(Boolean);

  res.json({ friends });
});

/* ── 10. POST /api/friends/:memberId — add friend ── */
app.post('/api/friends/:memberId', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  const friendId = req.params.memberId;
  if (friendId === me.id) return res.status(400).json({ error: 'You cannot add yourself.' });

  const target = resolveUserById(friendId);
  if (!target) return res.status(404).json({ error: 'Member not found.' });

  addFriend(me.id, friendId);
  res.status(201).json({ ok: true, friend: target });
});

/* ── 11. DELETE /api/friends/:memberId — remove friend ── */
app.delete('/api/friends/:memberId', requireSession, async (req, res) => {
  const me = await resolveCurrentUser(req);
  if (!me) return res.status(404).json({ error: 'Account not found.' });

  removeFriend(me.id, req.params.memberId);
  res.status(204).end();
});

/* ── 12. GET /api/admin/chat/list — list all member chats ── */
app.get('/api/admin/chat/list', requireSession, requireAdmin, async (req, res) => {
  const accounts = loadAccounts();
  const all = loadChatMessages();

  const members = accounts.members.map(m => {
    const dm = all.filter(x =>
      x.type === 'direct' && (x.from === m.id || x.to === m.id)
    );
    const last = dm[dm.length - 1];
    const unread = dm.filter(x => x.to === m.id && !x.read).length;
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      instrument: m.instrument || '',
      status: m.status,
      online: isOnline(m.id),
      messageCount: dm.length,
      unread,
      lastMessage: last ? { text: last.text, at: last.at, fromName: last.fromName } : null
    };
  });

  const admins = loadAdmins().map(a => {
    const dm = all.filter(x =>
      x.type === 'direct' && (x.from === a.id || x.to === a.id)
    );
    return {
      id: a.id,
      name: a.name || 'Admin',
      email: a.email,
      role: 'admin',
      online: isOnline(a.id),
      messageCount: dm.length,
      unread: 0,
      lastMessage: dm.length ? { text: dm[dm.length-1].text, at: dm[dm.length-1].at, fromName: dm[dm.length-1].fromName } : null
    };
  });

  const groupMsgs = all.filter(x => x.type === 'group');

  res.json({
    members,
    admins,
    group: {
      messageCount: groupMsgs.length,
      lastMessage: groupMsgs.length ? {
        text: groupMsgs[groupMsgs.length-1].text,
        at: groupMsgs[groupMsgs.length-1].at,
        fromName: groupMsgs[groupMsgs.length-1].fromName
      } : null
    }
  });
});

/* ── 13. GET /api/admin/chat/with/:memberId — read any DM ── */
app.get('/api/admin/chat/with/:memberId', requireSession, requireAdmin, async (req, res) => {
  const otherId = req.params.memberId;
  const limit = Math.min(Number(req.query.limit) || 200, 500);

  const all = loadChatMessages();
  const messages = all.filter(m => {
    if (m.type === 'group') return false;
    return m.from === otherId || m.to === otherId;
  }).slice(-limit);

  const target = resolveUserById(otherId);
  res.json({ messages, with: otherId, participant: target });
});

/* ── 14. POST /api/admin/chat/with/:memberId — admin reply as "GCO Admin" ── */
app.post('/api/admin/chat/with/:memberId', requireSession, requireAdmin, async (req, res) => {
  const toId = req.params.memberId;
  const target = resolveUserById(toId);
  if (!target) return res.status(404).json({ error: 'Member not found.' });

  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });

  const asAdmin = req.body.asAdmin !== false;
  const senderId = asAdmin ? 'GCO-ADMIN' : req.session.email;
  const senderName = asAdmin ? 'GCO Admin' : (resolveUserById(senderId)?.name || 'Admin');

  const message = {
    id: createId('MSG'),
    type: 'direct',
    from: senderId,
    fromName: senderName,
    fromRole: 'admin',
    to: toId,
    toName: target.name,
    text,
    adminReply: true,
    read: false,
    at: nowISO(),
    timestamp: Date.now()
  };

  const all = loadChatMessages();
  all.push(message);
  saveChatMessages(all);

  logActivity(`Admin replied to ${target.name}${asAdmin ? ' as GCO Admin' : ''}`,
    { type: 'admin', icon: '💬', req });

  res.status(201).json({ message });
});

/* ============================================================
   START
============================================================ */
app.listen(port, async () => {
  if (database.isConfigured()){
    try {
      await database.initialiseDatabase();
      await database.ensureAdmin({
        id: createId('ADM'),
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        fullName: 'Valentine Barson',
        role: 'Super Admin',
        perms: ['all'],
        passwordHash: passwordHash(process.env.ADMIN_PASSWORD || 'Tadiwa@2763')
      });
      console.log('SQL Server database ready; admin account is available.');
    } catch (error){
      console.error('SQL Server initialisation failed:', error.message);
    }
  }
  if (!loadAdmins().some(a => a.email === ADMIN_EMAIL)){
    const list = loadAdmins();
    list.unshift({
      id: createId('ADM'),
      name: 'Valentine Barson',
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      role: 'Super Admin',
      perms: ['all'],
      photo: '',
      createdAt: nowISO()
    });
    saveAdmins(list);
  }
  console.log(`GCO website running at http://localhost:${port}`);
});