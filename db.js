const sql = require('mssql');

let poolPromise;

function getConfig() {
  return {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE || 'GCO',
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: Number(process.env.SQL_PORT || 1433),
    options: {
      encrypt: process.env.SQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
  };
}

function isConfigured() {
  return Boolean(process.env.SQL_SERVER && process.env.SQL_USER && process.env.SQL_PASSWORD);
}

async function getPool() {
  if (!isConfigured()) throw new Error('SQL Server is not configured. Add SQL_SERVER, SQL_USER, and SQL_PASSWORD to .env.');
  if (!poolPromise) poolPromise = sql.connect(getConfig());
  return poolPromise;
}

/* ============================================================
   DATABASE INITIALISATION — creates all tables if missing
============================================================ */
async function initialiseDatabase() {
  const pool = await getPool();
  await pool.request().batch(`

    /* ---------- MEMBERS ---------- */
    IF OBJECT_ID('dbo.Members', 'U') IS NULL
    CREATE TABLE dbo.Members (
      Id NVARCHAR(32) NOT NULL PRIMARY KEY,
      Email NVARCHAR(320) NOT NULL UNIQUE,
      FullName NVARCHAR(160) NOT NULL,
      Instrument NVARCHAR(120) NOT NULL,
      Signature NVARCHAR(MAX) NOT NULL,
      Phone NVARCHAR(40) NULL,
      NationalId NVARCHAR(80) NULL UNIQUE,
      DateOfBirth DATE NULL,
      Nationality NVARCHAR(80) NULL,
      Address NVARCHAR(300) NULL,
      EmergencyName NVARCHAR(160) NULL,
      EmergencyPhone NVARCHAR(40) NULL,
      PhotoData NVARCHAR(MAX) NULL,
      PasswordHash NVARCHAR(300) NOT NULL,
      Consent BIT NOT NULL,
      Status NVARCHAR(32) NOT NULL DEFAULT 'pending',
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      ApprovedAt DATETIME2 NULL
    );
    IF COL_LENGTH('dbo.Members', 'Signature') IS NOT NULL ALTER TABLE dbo.Members ALTER COLUMN Signature NVARCHAR(MAX) NOT NULL;
    IF COL_LENGTH('dbo.Members', 'Phone') IS NULL ALTER TABLE dbo.Members ADD Phone NVARCHAR(40) NULL;
    IF COL_LENGTH('dbo.Members', 'NationalId') IS NULL ALTER TABLE dbo.Members ADD NationalId NVARCHAR(80) NULL;
    IF COL_LENGTH('dbo.Members', 'DateOfBirth') IS NULL ALTER TABLE dbo.Members ADD DateOfBirth DATE NULL;
    IF COL_LENGTH('dbo.Members', 'Nationality') IS NULL ALTER TABLE dbo.Members ADD Nationality NVARCHAR(80) NULL;
    IF COL_LENGTH('dbo.Members', 'Address') IS NULL ALTER TABLE dbo.Members ADD Address NVARCHAR(300) NULL;
    IF COL_LENGTH('dbo.Members', 'EmergencyName') IS NULL ALTER TABLE dbo.Members ADD EmergencyName NVARCHAR(160) NULL;
    IF COL_LENGTH('dbo.Members', 'EmergencyPhone') IS NULL ALTER TABLE dbo.Members ADD EmergencyPhone NVARCHAR(40) NULL;
    IF COL_LENGTH('dbo.Members', 'PhotoData') IS NULL ALTER TABLE dbo.Members ADD PhotoData NVARCHAR(MAX) NULL;

    /* ---------- PASSWORD RESETS ---------- */
    IF OBJECT_ID('dbo.PasswordResets', 'U') IS NULL
    CREATE TABLE dbo.PasswordResets (
      TokenHash NVARCHAR(64) NOT NULL PRIMARY KEY,
      Email NVARCHAR(320) NOT NULL,
      ExpiresAt DATETIME2 NOT NULL,
      UsedAt DATETIME2 NULL
    );

    /* ---------- ADMINS (extended) ---------- */
    IF OBJECT_ID('dbo.Admins', 'U') IS NULL
    CREATE TABLE dbo.Admins (
      Id NVARCHAR(32) NOT NULL PRIMARY KEY,
      Username NVARCHAR(80) NOT NULL UNIQUE,
      Email NVARCHAR(320) NOT NULL UNIQUE,
      FullName NVARCHAR(160) NOT NULL,
      PasswordHash NVARCHAR(300) NOT NULL,
      Role NVARCHAR(60) NOT NULL DEFAULT 'Read Only',
      Permissions NVARCHAR(MAX) NOT NULL DEFAULT '[]',
      Photo NVARCHAR(500) NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    IF COL_LENGTH('dbo.Admins', 'Id') IS NULL ALTER TABLE dbo.Admins ADD Id NVARCHAR(32) NULL;
    IF COL_LENGTH('dbo.Admins', 'FullName') IS NULL ALTER TABLE dbo.Admins ADD FullName NVARCHAR(160) NULL;
    IF COL_LENGTH('dbo.Admins', 'Role') IS NULL ALTER TABLE dbo.Admins ADD Role NVARCHAR(60) NOT NULL DEFAULT 'Read Only';
    IF COL_LENGTH('dbo.Admins', 'Permissions') IS NULL ALTER TABLE dbo.Admins ADD Permissions NVARCHAR(MAX) NOT NULL DEFAULT '[]';
    IF COL_LENGTH('dbo.Admins', 'Photo') IS NULL ALTER TABLE dbo.Admins ADD Photo NVARCHAR(500) NULL;

    /* ---------- EVENTS ---------- */
    IF OBJECT_ID('dbo.Events', 'U') IS NULL
    CREATE TABLE dbo.Events (
      Id NVARCHAR(32) NOT NULL PRIMARY KEY,
      Title NVARCHAR(200) NOT NULL,
      EventDate DATE NOT NULL,
      Venue NVARCHAR(200) NOT NULL,
      Capacity INT NOT NULL DEFAULT 100,
      Price DECIMAL(10,2) NOT NULL DEFAULT 0,
      Sold INT NOT NULL DEFAULT 0,
      Poster NVARCHAR(500) NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    /* ---------- TICKETS ---------- */
    IF OBJECT_ID('dbo.Tickets', 'U') IS NULL
    CREATE TABLE dbo.Tickets (
      Id NVARCHAR(64) NOT NULL PRIMARY KEY,
      EventId NVARCHAR(32) NOT NULL,
      MemberId NVARCHAR(32) NULL,
      IssuedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      FOREIGN KEY (EventId) REFERENCES dbo.Events(Id)
    );

    /* ---------- CONTENT ---------- */
    IF OBJECT_ID('dbo.Content', 'U') IS NULL
    CREATE TABLE dbo.Content (
      Id NVARCHAR(32) NOT NULL PRIMARY KEY,
      ContentType NVARCHAR(60) NOT NULL,
      Title NVARCHAR(300) NOT NULL,
      Body NVARCHAR(MAX) NULL,
      Tags NVARCHAR(300) NULL,
      Status NVARCHAR(32) NOT NULL DEFAULT 'draft',
      MediaUrl NVARCHAR(500) NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    /* ---------- ANNOUNCEMENTS ---------- */
    IF OBJECT_ID('dbo.Announcements', 'U') IS NULL
    CREATE TABLE dbo.Announcements (
      Id NVARCHAR(32) NOT NULL PRIMARY KEY,
      Audience NVARCHAR(80) NOT NULL,
      Priority NVARCHAR(32) NOT NULL DEFAULT 'Normal',
      Subject NVARCHAR(300) NOT NULL,
      Message NVARCHAR(MAX) NOT NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    /* ---------- ACTIVITY LOG ---------- */
    IF OBJECT_ID('dbo.ActivityLog', 'U') IS NULL
    CREATE TABLE dbo.ActivityLog (
      Id NVARCHAR(32) NOT NULL PRIMARY KEY,
      LogType NVARCHAR(32) NOT NULL,
      Actor NVARCHAR(160) NOT NULL,
      Action NVARCHAR(500) NOT NULL,
      Icon NVARCHAR(20) NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    /* ---------- MESSAGES ---------- */
    IF OBJECT_ID('dbo.Messages', 'U') IS NULL
    CREATE TABLE dbo.Messages (
      Id NVARCHAR(32) NOT NULL PRIMARY KEY,
      SenderName NVARCHAR(160) NOT NULL,
      SenderEmail NVARCHAR(320) NOT NULL,
      RecipientEmail NVARCHAR(320) NULL,
      Subject NVARCHAR(300) NOT NULL,
      Body NVARCHAR(MAX) NOT NULL,
      Direction NVARCHAR(20) NOT NULL DEFAULT 'to_admin',
      IsRead BIT NOT NULL DEFAULT 0,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);
}

/* ============================================================
   ADMIN ACCOUNT MANAGEMENT
============================================================ */
async function ensureAdmin(admin) {
  const pool = await getPool();
  await pool.request()
    .input('id',        sql.NVarChar(32),  admin.id        || 'ADM-DEFAULT')
    .input('username',  sql.NVarChar(80),  admin.username)
    .input('email',     sql.NVarChar(320), admin.email)
    .input('fullName',  sql.NVarChar(160), admin.fullName  || admin.username || 'Administrator')
    .input('passwordHash', sql.NVarChar(300), admin.passwordHash)
    .input('role',      sql.NVarChar(60),  admin.role      || 'Super Admin')
    .input('perms',     sql.NVarChar(sql.MAX), JSON.stringify(admin.perms || ['all']))
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.Admins WHERE Username = @username OR Email = @email)
      INSERT INTO dbo.Admins (Id, Username, Email, FullName, PasswordHash, Role, Permissions)
      VALUES (@id, @username, @email, @fullName, @passwordHash, @role, @perms)
    `);
}

async function getAdmin(identifier) {
  const pool = await getPool();
  const result = await pool.request()
    .input('identifier', sql.NVarChar(320), identifier.trim())
    .query(`SELECT Id AS id, Username AS username, Email AS email, FullName AS name,
                   PasswordHash AS passwordHash, Role AS role, Permissions AS perms,
                   Photo AS photo
            FROM dbo.Admins
            WHERE LOWER(Username) = LOWER(@identifier) OR LOWER(Email) = LOWER(@identifier)`);
  if (!result.recordset[0]) return null;
  const row = result.recordset[0];
  try { row.perms = JSON.parse(row.perms || '[]'); } catch { row.perms = []; }
  return row;
}

async function listAdmins() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`SELECT Id AS id, Username AS username, Email AS email, FullName AS name,
                   Role AS role, Permissions AS perms, Photo AS photo,
                   CreatedAt AS createdAt
            FROM dbo.Admins ORDER BY CreatedAt ASC`);
  return result.recordset.map(r => ({
    ...r,
    perms: (() => { try { return JSON.parse(r.perms || '[]'); } catch { return []; } })()
  }));
}

async function saveAdmin(admin) {
  const pool = await getPool();
  await pool.request()
    .input('id',       sql.NVarChar(32),  admin.id)
    .input('username', sql.NVarChar(80),  admin.username || admin.email.split('@')[0])
    .input('email',    sql.NVarChar(320), admin.email)
    .input('name',     sql.NVarChar(160), admin.name)
    .input('hash',     sql.NVarChar(300), admin.passwordHash || '')
    .input('role',     sql.NVarChar(60),  admin.role)
    .input('perms',    sql.NVarChar(sql.MAX), JSON.stringify(admin.perms || []))
    .input('photo',    sql.NVarChar(500), admin.photo || null)
    .query(`INSERT INTO dbo.Admins (Id, Username, Email, FullName, PasswordHash, Role, Permissions, Photo)
            VALUES (@id, @username, @email, @name, @hash, @role, @perms, @photo)`);
}

async function updateAdmin(id, values) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id',    sql.NVarChar(32),  id)
    .input('name',  sql.NVarChar(160), values.name)
    .input('email', sql.NVarChar(320), values.email)
    .input('role',  sql.NVarChar(60),  values.role)
    .input('perms', sql.NVarChar(sql.MAX), JSON.stringify(values.perms || []))
    .query(`UPDATE dbo.Admins SET FullName = @name, Email = @email, Role = @role, Permissions = @perms
            WHERE Id = @id; SELECT @@ROWCOUNT AS changed;`);
  return result.recordset[0].changed === 1;
}

async function deleteAdmin(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.NVarChar(32), id)
    .query('DELETE FROM dbo.Admins WHERE Id = @id; SELECT @@ROWCOUNT AS changed;');
  return result.recordset[0].changed === 1;
}

/* ============================================================
   MEMBERS
============================================================ */
async function saveMember(member) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.NVarChar(32), member.id)
    .input('email', sql.NVarChar(320), member.email)
    .input('name', sql.NVarChar(160), member.name)
    .input('instrument', sql.NVarChar(120), member.instrument)
    .input('signature', sql.NVarChar(sql.MAX), member.signature)
    .input('phone', sql.NVarChar(40), member.phone)
    .input('nationalId', sql.NVarChar(80), member.nationalId)
    .input('dateOfBirth', sql.Date, member.dateOfBirth)
    .input('nationality', sql.NVarChar(80), member.nationality)
    .input('address', sql.NVarChar(300), member.address)
    .input('emergencyName', sql.NVarChar(160), member.emergencyName)
    .input('emergencyPhone', sql.NVarChar(40), member.emergencyPhone)
    .input('photoData', sql.NVarChar(sql.MAX), member.photoData)
    .input('passwordHash', sql.NVarChar(300), member.passwordHash)
    .input('consent', sql.Bit, member.consent)
    .query(`INSERT INTO dbo.Members (Id, Email, FullName, Instrument, Signature, Phone, NationalId, DateOfBirth, Nationality, Address, EmergencyName, EmergencyPhone, PhotoData, PasswordHash, Consent, Status)
            VALUES (@id, @email, @name, @instrument, @signature, @phone, @nationalId, @dateOfBirth, @nationality, @address, @emergencyName, @emergencyPhone, @photoData, @passwordHash, @consent, 'pending')`);
}

async function listMembers() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT Id AS id, Email AS email, FullName AS name, Instrument AS instrument, Signature AS signature, Phone AS phone, NationalId AS nationalId, DateOfBirth AS dateOfBirth, Nationality AS nationality, Address AS address, EmergencyName AS emergencyName, EmergencyPhone AS emergencyPhone, PhotoData AS photoData, Consent AS consent, Status AS status, CreatedAt AS createdAt, ApprovedAt AS approvedAt FROM dbo.Members ORDER BY CreatedAt DESC');
  return result.recordset;
}

async function getMemberByEmail(email) {
  const pool = await getPool();
  const result = await pool.request().input('email', sql.NVarChar(320), email)
    .query('SELECT Id AS id, Email AS email, FullName AS name, Instrument AS instrument, Signature AS signature, Phone AS phone, NationalId AS nationalId, DateOfBirth AS dateOfBirth, Nationality AS nationality, Address AS address, EmergencyName AS emergencyName, EmergencyPhone AS emergencyPhone, PhotoData AS photoData, PasswordHash AS passwordHash, Consent AS consent, Status AS status, CreatedAt AS createdAt, ApprovedAt AS approvedAt FROM dbo.Members WHERE Email = @email');
  return result.recordset[0] || null;
}

async function getMemberById(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.NVarChar(32), id)
    .query('SELECT Id AS id, Email AS email, FullName AS name, Instrument AS instrument, Signature AS signature, Phone AS phone, NationalId AS nationalId, DateOfBirth AS dateOfBirth, Nationality AS nationality, Address AS address, EmergencyName AS emergencyName, EmergencyPhone AS emergencyPhone, PhotoData AS photoData, PasswordHash AS passwordHash, Consent AS consent, Status AS status, CreatedAt AS createdAt, ApprovedAt AS approvedAt FROM dbo.Members WHERE Id = @id');
  return result.recordset[0] || null;
}

async function approveMember(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.NVarChar(32), id)
    .query(`UPDATE dbo.Members SET Status = 'approved', ApprovedAt = SYSUTCDATETIME() WHERE Id = @id; SELECT @@ROWCOUNT AS changed;`);
  return result.recordset[0].changed === 1;
}

async function updateMember(id, values) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.NVarChar(32), id)
    .input('name', sql.NVarChar(160), values.name)
    .input('instrument', sql.NVarChar(120), values.instrument)
    .input('signature', sql.NVarChar(sql.MAX), values.signature)
    .input('status', sql.NVarChar(32), values.status)
    .query(`UPDATE dbo.Members SET FullName=@name, Instrument=@instrument, Signature=@signature, Status=@status
            WHERE Id=@id; SELECT @@ROWCOUNT AS changed;`);
  return result.recordset[0].changed === 1;
}

async function deleteMember(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.NVarChar(32), id)
    .query('DELETE FROM dbo.Members WHERE Id=@id; SELECT @@ROWCOUNT AS changed;');
  return result.recordset[0].changed === 1;
}

/* ============================================================
   EVENTS + TICKETS
============================================================ */
async function listEvents() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`SELECT Id AS id, Title AS title, EventDate AS date, Venue AS venue,
                   Capacity AS capacity, Price AS price, Sold AS sold,
                   Poster AS poster, CreatedAt AS createdAt
            FROM dbo.Events ORDER BY EventDate ASC`);
  return result.recordset;
}

async function saveEvent(event) {
  const pool = await getPool();
  await pool.request()
    .input('id',       sql.NVarChar(32),  event.id)
    .input('title',    sql.NVarChar(200), event.title)
    .input('date',     sql.Date,          event.date)
    .input('venue',    sql.NVarChar(200), event.venue)
    .input('capacity', sql.Int,           event.capacity)
    .input('price',    sql.Decimal(10,2), event.price)
    .query(`INSERT INTO dbo.Events (Id, Title, EventDate, Venue, Capacity, Price, Sold)
            VALUES (@id, @title, @date, @venue, @capacity, @price, 0)`);
}

async function updateEvent(id, values) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id',       sql.NVarChar(32),  id)
    .input('title',    sql.NVarChar(200), values.title)
    .input('date',     sql.Date,          values.date)
    .input('venue',    sql.NVarChar(200), values.venue)
    .input('capacity', sql.Int,           values.capacity)
    .input('price',    sql.Decimal(10,2), values.price)
    .query(`UPDATE dbo.Events SET Title=@title, EventDate=@date, Venue=@venue,
              Capacity=@capacity, Price=@price
            WHERE Id=@id; SELECT @@ROWCOUNT AS changed;`);
  return result.recordset[0].changed === 1;
}

async function deleteEvent(id) {
  const pool = await getPool();
  await pool.request().input('eventId', sql.NVarChar(32), id)
    .query('DELETE FROM dbo.Tickets WHERE EventId=@eventId');
  const result = await pool.request().input('id', sql.NVarChar(32), id)
    .query('DELETE FROM dbo.Events WHERE Id=@id; SELECT @@ROWCOUNT AS changed;');
  return result.recordset[0].changed === 1;
}

async function incrementEventSold(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.NVarChar(32), id)
    .query(`UPDATE dbo.Events SET Sold = Sold + 1 WHERE Id = @id;
            SELECT Sold AS sold FROM dbo.Events WHERE Id = @id;`);
  return result.recordset[0]?.sold || 0;
}

async function saveTicket(ticket) {
  const pool = await getPool();
  await pool.request()
    .input('id',       sql.NVarChar(64), ticket.id)
    .input('eventId',  sql.NVarChar(32), ticket.eventId)
    .input('memberId', sql.NVarChar(32), ticket.memberId || null)
    .query(`INSERT INTO dbo.Tickets (Id, EventId, MemberId) VALUES (@id, @eventId, @memberId)`);
}

/* ============================================================
   CONTENT
============================================================ */
async function listContent() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`SELECT Id AS id, ContentType AS type, Title AS title, Body AS body,
                   Tags AS tags, Status AS status, MediaUrl AS mediaUrl,
                   CreatedAt AS createdAt
            FROM dbo.Content ORDER BY CreatedAt DESC`);
  return result.recordset;
}

async function saveContent(item) {
  const pool = await getPool();
  await pool.request()
    .input('id',    sql.NVarChar(32),  item.id)
    .input('type',  sql.NVarChar(60),  item.type)
    .input('title', sql.NVarChar(300), item.title)
    .input('body',  sql.NVarChar(sql.MAX), item.body || '')
    .input('tags',  sql.NVarChar(300), item.tags || '')
    .input('status', sql.NVarChar(32), item.status || 'draft')
    .input('media', sql.NVarChar(500), item.mediaUrl || null)
    .query(`INSERT INTO dbo.Content (Id, ContentType, Title, Body, Tags, Status, MediaUrl)
            VALUES (@id, @type, @title, @body, @tags, @status, @media)`);
}

async function deleteContent(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.NVarChar(32), id)
    .query('DELETE FROM dbo.Content WHERE Id=@id; SELECT @@ROWCOUNT AS changed;');
  return result.recordset[0].changed === 1;
}

/* ============================================================
   ANNOUNCEMENTS
============================================================ */
async function listAnnouncements() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`SELECT Id AS id, Audience AS audience, Priority AS priority,
                   Subject AS subject, Message AS message, CreatedAt AS createdAt
            FROM dbo.Announcements ORDER BY CreatedAt DESC`);
  return result.recordset;
}

async function saveAnnouncement(item) {
  const pool = await getPool();
  await pool.request()
    .input('id',      sql.NVarChar(32),  item.id)
    .input('audience', sql.NVarChar(80), item.audience)
    .input('priority', sql.NVarChar(32), item.priority)
    .input('subject',  sql.NVarChar(300), item.subject)
    .input('message',  sql.NVarChar(sql.MAX), item.message)
    .query(`INSERT INTO dbo.Announcements (Id, Audience, Priority, Subject, Message)
            VALUES (@id, @audience, @priority, @subject, @message)`);
}

/* ============================================================
   ACTIVITY LOG
============================================================ */
async function listActivity(limit = 500) {
  const pool = await getPool();
  const result = await pool.request()
    .input('lim', sql.Int, limit)
    .query(`SELECT TOP (@lim) Id AS id, LogType AS type, Actor AS who,
                   Action AS action, Icon AS icon, CreatedAt AS at
            FROM dbo.ActivityLog ORDER BY CreatedAt DESC`);
  return result.recordset;
}

async function saveActivity(entry) {
  const pool = await getPool();
  await pool.request()
    .input('id',    sql.NVarChar(32),  entry.id)
    .input('type',  sql.NVarChar(32),  entry.type)
    .input('who',   sql.NVarChar(160), entry.who)
    .input('action', sql.NVarChar(500), entry.action)
    .input('icon',  sql.NVarChar(20),  entry.icon || '•')
    .query(`INSERT INTO dbo.ActivityLog (Id, LogType, Actor, Action, Icon)
            VALUES (@id, @type, @who, @action, @icon)`);
}

async function clearActivity() {
  const pool = await getPool();
  await pool.request().query('DELETE FROM dbo.ActivityLog');
}

/* ============================================================
   MESSAGES
============================================================ */
async function listMessages() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`SELECT Id AS id, SenderName AS [from], SenderEmail AS email,
                   RecipientEmail AS [to], Subject AS subject, Body AS body,
                   Direction AS direction, IsRead AS [read], CreatedAt AS date
            FROM dbo.Messages ORDER BY CreatedAt DESC`);
  return result.recordset;
}

async function listMessagesForMember(email) {
  const pool = await getPool();
  const result = await pool.request()
    .input('email', sql.NVarChar(320), email)
    .query(`SELECT Id AS id, SenderName AS [from], Subject AS subject, Body AS body,
                   Direction AS direction, IsRead AS [read], CreatedAt AS date
            FROM dbo.Messages
            WHERE (RecipientEmail = @email AND Direction = 'to_member')
               OR (SenderEmail = @email AND Direction = 'to_admin')
            ORDER BY CreatedAt DESC`);
  return result.recordset;
}

async function saveMessage(msg) {
  const pool = await getPool();
  await pool.request()
    .input('id',      sql.NVarChar(32),  msg.id)
    .input('from',    sql.NVarChar(160), msg.from)
    .input('email',   sql.NVarChar(320), msg.email)
    .input('to',      sql.NVarChar(320), msg.to || null)
    .input('subject', sql.NVarChar(300), msg.subject)
    .input('body',    sql.NVarChar(sql.MAX), msg.body)
    .input('direction', sql.NVarChar(20), msg.direction || 'to_admin')
    .query(`INSERT INTO dbo.Messages (Id, SenderName, SenderEmail, RecipientEmail, Subject, Body, Direction)
            VALUES (@id, @from, @email, @to, @subject, @body, @direction)`);
}

async function markMessageRead(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.NVarChar(32), id)
    .query('UPDATE dbo.Messages SET IsRead = 1 WHERE Id = @id; SELECT @@ROWCOUNT AS changed;');
  return result.recordset[0].changed === 1;
}

/* ============================================================
   HEALTH
============================================================ */
async function healthCheck() {
  const pool = await getPool();
  await pool.request().query('SELECT 1 AS ok');
  return true;
}

module.exports = {
  isConfigured,
  initialiseDatabase,
  healthCheck,

  // Admins
  ensureAdmin,
  getAdmin,
  listAdmins,
  saveAdmin,
  updateAdmin,
  deleteAdmin,

  // Members
  saveMember,
  listMembers,
  getMemberByEmail,
  getMemberById,
  approveMember,
  updateMember,
  deleteMember,

  // Events + Tickets
  listEvents,
  saveEvent,
  updateEvent,
  deleteEvent,
  incrementEventSold,
  saveTicket,

  // Content
  listContent,
  saveContent,
  deleteContent,

  // Announcements
  listAnnouncements,
  saveAnnouncement,

  // Activity log
  listActivity,
  saveActivity,
  clearActivity,

  // Messages
  listMessages,
  listMessagesForMember,
  saveMessage,
  markMessageRead
};