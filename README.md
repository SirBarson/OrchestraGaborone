# Gaborone Community Orchestra — Website

## Quick start

This project includes a public website, member registration, one direct sign-in form,
member sign-in, and a protected admin portal.

### Start the website on Windows

1. Open this project folder:

   `C:\Users\USER\OneDrive - Powergate Botswana PTY LTD\Desktop\OrchestraGaborone\OrchestraGaborone`

2. Double-click `start-gco.bat`.
3. Wait for the black server window to start. The first run installs the required Node.js
   packages automatically.
4. Keep the server window open.
5. Open the portal:

   `http://localhost:3000/portal.html`

Do not double-click the HTML files directly. Pages opened with `file://` cannot connect to
the GCO server or authenticate users.

### Offline HTML demo

If Node.js is not installed, opening `portal.html` directly still allows the interface to
be previewed. This is **demo mode only** and does not check SQL Server or the account database.

```text
Admin demo:  Valentine / Tadiwa@2763
Member demo: member@example.com / Member@123
```

The demo redirects to the appropriate HTML dashboard, but database records, admin actions,
registration, OTP email, and real credential validation require the Node server. Never use
the offline demo for production authentication.

### Start without using the BAT file

You can start the website directly from VS Code or Windows Terminal:

```powershell
cd "C:\Users\USER\OneDrive - Powergate Botswana PTY LTD\Desktop\OrchestraGaborone\OrchestraGaborone"
npm install
npm start
```

Leave that terminal open, then visit:

`http://localhost:3000/portal.html`

### Start from Command Prompt

If the batch file does not open, click the project folder address bar, type `cmd`, and press
Enter. Then run:

```bat
npm install
npm start
```

Open `http://localhost:3000/portal.html` in your browser. The sign-in page accepts either
the admin username/email or an approved member email and automatically opens the correct
dashboard. You can also use `node server.js` instead of `npm start`.

### Sign-in

Open the single sign-in page:

`http://localhost:3000/portal.html`

Enter a username/email and password. The account type is detected automatically. An
administrator is sent to `admin-portal.html`; an approved member is sent to
`member-portal.html`. There is no extra portal-choice page.

### Admin sign-in

Enter the admin details on the single sign-in page:

```text
Username: Valentine
Email: valentinebarson@gmail.com
Password: Tadiwa@2763
```

After successful sign-in, the admin member-record dashboard opens. Keep the server window
running while using the dashboard.

The browser must not connect directly to SQL Server because that would expose the database
password. The small Node endpoint performs the login check safely. If SQL Server variables
are not configured, the free local JSON account store is used instead; the login form and
redirect work the same way.

### Donations

The donation button validates the amount, asks for the receipt email, and then continues to
payment or displays the selected bank/mobile-money instructions. It does not show a
thank-you message before payment. A thank-you toast is shown only when a payment provider
returns to the site with `?donation=success`. Add verified hosted checkout URLs in
`js/script.js` before enabling card or PayPal payments.

### Stop the server

Return to the black server window and press `Ctrl+C`.

### Common problems

- **Cannot reach the GCO server:** start `start-gco.bat` and use the `http://localhost:3000`
  address. If you open a local HTML file directly, the sign-in page uses
  `http://127.0.0.1:3000` and the server now permits local browser requests. Restart the
  batch file after changing `server.js`.
- **`npm` is not recognised:** reinstall Node.js, then restart Command Prompt.
- **Admin database unavailable:** configure the SQL Server values in `.env`, make sure SQL
  Server is running, and initialise the database using `schema.sql`.
- **Google Map is not visible:** check the internet connection. The map uses a free Google
  Maps embed and the directions button opens Google Maps in a new tab.
- **Tawk.to chat is missing:** use the HTTP website URL and check that the browser has an
  internet connection. Local `file://` pages can block the widget.

### Testing the admin portal

1. Start the site with `start-gco.bat`.
2. Open `http://localhost:3000/portal.html`.
3. Sign in with the admin account shown above.
4. Confirm the Member Records dashboard opens.
5. Submit a test member application from `register.html` using a test email, a JPG/PNG/WebP
   picture under 2 MB, a typed signature, ID/passport number, phone, address, date of birth,
   nationality, and emergency contact.
6. Approve the pending record, edit its instrument/status, refresh the page, and confirm the
   changes remain. Delete only test records.

Member data includes sensitive identity and contact information. Use HTTPS, restrict admin
accounts, do not use real ID documents while testing, and obtain consent before storing
photos or identity numbers.

Registration sends the email OTP automatically when the main submit button is clicked.
Enter the OTP and click the same button again to finish. A member can draw a signature on
the signature pad or upload a signature image, and can take a profile photo directly from a
mobile camera where the browser supports camera capture.

## Folder structure
```
OrchestraGaborone/
├── index.html          Main page
├── css/
│   └── style.css       All styles
├── js/
│   └── script.js       Navigation, forms, donations, OTP workflow, and member filters
├── assets/
│   ├── video/
│   │   ├── background.mp4          Hero background video (replace with your own)
│   │   └── YOUR_FEATURED_VIDEO.mp4 Featured/media-section video
│   └── images/
│       ├── YOUR_ABOUT_PHOTO.jpg    About section photo
│       ├── YOUR_PHOTO_<name>.jpg   Member photos (tina, valentine, leburu, denzel, michelle,
│       │                           tshepiso, brandon, thero, julia, obakeng, barson)
│       ├── YOUR_THUMB_<n>.jpg      Gallery thumbnails
│       └── YOUR_BLOG_<n>.jpg       Blog/news post images
```

## Setup
Drop your real media into `assets/video/` and `assets/images/` using the filenames already
referenced in `index.html` (or rename the files and update the `src=` paths to match).
The current hero and featured video both use `assets/video/background.mp4`. If that file fails to load, the hero automatically falls back to a
gradient background — no page breakage either way.

Replace `assets/images/logo-placeholder.svg` with your real logo file (keep the same filename)
to update the top-left navigation logo. Update the bank details and connect verified Orange Money, Visa/Card,
MyZaka, or PayPal merchant links in the donation panel before accepting live payments.
Add the founder portrait as `assets/images/founder-darious-kamwi.jpg` to display Darious
Kamwi's photo in the About section. The About section includes his founder note and profile
details alongside the replaceable portrait.
The Members section includes remote Unsplash portrait placeholders, colored instrument
icons, and section filters. Replace those remote image URLs with approved local member
portraits before publishing if you have consented photos.
Member registration and audition applications currently submit as front-end demo forms; connect
the submit handler to your email or backend service for production use.

Member access now uses separate `member-portal.html`, `admin-portal.html`, and `register.html`
pages. New members verify their email with OTP, submit a password, instrument, member consent,
and typed signature, then wait for admin approval. Approved members can sign in to view their
member ID and account details. Admins sign in separately and approve pending registrations.
The backend persists accounts in `data/accounts.json` for local development.

Donate opens a method-first dialog for bank transfer, Orange Money, MyZaka, Visa/Mastercard,
and PayPal. Bank and mobile-money instructions are displayed in the dialog; card and PayPal
payments require verified hosted checkout URLs in `js/script.js` (`donationCheckoutUrls`).
Free-to-start providers such as PayPal or a local payment aggregator may still require merchant
approval and transaction fees. Do not put provider secret keys in this static JavaScript file:
create a server-side checkout endpoint and return a short-lived hosted checkout URL instead.

The default local admin accepts either username `Valentine` or
`valentinebarson@gmail.com`, with the password supplied during setup; set `ADMIN_EMAIL`,
`ADMIN_USERNAME`, and `ADMIN_PASSWORD` in `.env` before production. Passwords are hashed with Node scrypt and sessions expire
after eight hours. Add HTTPS, a database, CSRF protection, persistent rate limiting, secure
cookie sessions, audit logging, and a real admin provisioning process before production.

For the email OTP and application approval flow, run the Node server instead of opening the
HTML file directly:

1. Double-click `start-gco.bat` in the project folder. It installs dependencies the first
   time, starts the server, and opens the portal automatically. Keep the GCO Server window
   open while using the site.
2. Copy `.env.example` to `.env` and fill in the SMTP credentials for the mailbox that will
   send verification messages.
3. If you prefer the command line, run `npm install`, then `npm start`, and open
   `http://localhost:3000/portal.html`.

The server exposes `/api/auth/send-otp`, `/api/auth/verify-otp`, and
`/api/membership/applications`. OTPs expire after 10 minutes, are stored as hashes, have a
five-attempt limit, and verified applications are marked `pending_admin_approval`. The
in-memory store is suitable for local development only; use a database, HTTPS, CSRF
protection, authentication, and a persistent rate limiter before production.

Both the member and admin sign-in pages include **Forgot password?**. The reset request
accepts a member email, admin email, or admin username, sends a single-use link through the
configured SMTP account, and updates the password after validating the link. Do not open the
HTML files directly for login or password reset; run `npm start` and use the local server URL
so the `/api` endpoints are available.

SQL Server is supported with the simple `db.js` adapter. Copy
`.env.sqlserver.example` into `.env`, create the database/login using `schema.sql`, run
`npm install`, and start the server. On startup it creates the `Members` and
`PasswordResets`, and `Admins` tables. The configured admin account is inserted into
`Admins` if it does not already exist. Admin username/password validation then runs
against SQL Server, and a successful admin login opens the protected member-record
dashboard. Registration and admin approval are written to SQL Server, and
`GET /api/health` validates the connection. Keep the SQL login limited to the application
database; never commit `.env` or real passwords.

The admin portal now provides CRUD actions for member records: list/read, edit/update,
approve, and delete. These actions use the protected `/api/admin/members` endpoints and
write to SQL Server when it is configured. SQL access cannot be performed directly from
HTML; the server API is required to protect credentials and prevent exposing the database.
To access it, open `http://localhost:3000/portal.html`, choose **Admin Sign In**, and sign
in with `Valentine` (or `valentinebarson@gmail.com`) and the configured admin password.
After a successful login, the same admin page reloads directly into the Member Records
dashboard. Do not open `admin-portal.html` with a `file://` URL.

The Tawk.to support widget is included once on the public site, portal, member, admin,
registration, and password-reset pages. Each page calls `showWidget()` after Tawk loads
and calls it again if the widget reports that it was hidden, so the launcher stays
available. It loads from the configured Tawk property and requires an internet
connection; browser privacy settings or local `file://` pages may prevent the widget
from loading until the site is served over HTTP.

## Frameworks
- **Bootstrap 5** (CDN) — used only for grid/utility plumbing; all visual styling stays in
  `css/style.css`, loaded after Bootstrap so the custom red/black/white identity always wins.
- **Leaflet + OpenStreetMap** (CDN, no API key needed) — powers the "Find Us" map in the
  Contact section. The map is set to Thornhill Primary School, Pilane Road, Badiri,
  Gaborone, Botswana as the rehearsal location.

## Signature touch
A recurring five-line "staff" divider (with a treble clef) replaces plain `<hr>` rules
between major sections — a small motif tying the page back to the orchestra itself.
