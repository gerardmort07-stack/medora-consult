# Medora Consult

A production-ready telehealth monolith for **guest-only booking**: patients never create an account. They book a service, pay by Mobile Money (MoMo) directly to the clinic, an admin manually verifies and authorizes the payment, and the patient's only credential from then on is a phone number + 6-digit PIN. **Express serves both the API and the built React app from one process, one port, zero CORS.**

---

## 1. Architecture at a glance

- **Single Express monolith.** `server/src/server.js` serves the Vite-built React app as static files AND every `/api/*` route from the same process/port. No cross-origin requests exist, so there is no CORS configuration anywhere in this codebase.
- **No patient accounts, no payment gateway.** There is no Paystack (or any other) integration. `POST /api/appointments` is a fully public endpoint — anyone can book without logging in. Payment is a real-world MoMo transfer the admin verifies by eye (checking their own MoMo SMS) and then manually authorizes in the Admin Console.
- **The PIN *is* the patient's account.** Generated the moment a booking is created (`utils/pinGenerator.js`), stored as `consultationPin` + `pinStatus: "active"`. Unlike a one-time gate, this is a *recurring* credential — the patient re-enters phone + PIN at the Access Portal (`/access`) every time they come back, since there's no session/cookie for a guest. `POST /api/appointments/access` validates it and mints a short-lived (6h), appointment-scoped JWT (`middleware/guestAuth.js`) — structurally distinct from a normal user session token — used for everything else the patient does (polling status, joining video, submitting a rating).
- **Doctor and admin accounts are unaffected.** They still register/log in normally through Firebase Auth + the server-issued JWT, exactly as before. Only the patient side changed.
- **Server-side unified auth (doctors/admins).** `POST /api/auth/register` only allows `role: "doctor"` now (admin is bootstrapped from `.env`, never self-registered). Registration is still atomic: if the Firestore profile write fails after the Firebase Auth user is created, the Auth user is automatically deleted.
- **Bootstrapped master admin.** On every server boot, `bootstrapMasterAdmin()` checks Firebase for `MASTER_ADMIN_EMAIL`. If it doesn't exist, it's created automatically.
- **Dual-method Firebase Admin loading, lazily initialized.** `server/src/config/firebaseAdmin.js` looks for a real `server/firebase-service-account.json` first, falling back to `FIREBASE_*` env vars. Initialization happens on first actual database use (not at `require()` time), so a missing/misconfigured Firebase setup fails loudly and clearly at the exact call site that needed it — never a silent mock, and never a startup crash that takes down unrelated routes like `/api/health`.
- **Real-time doctor dashboard, polling-based patient status.** Doctors sign into the Firebase client SDK with a custom token for a live `onSnapshot` queue listener. Patients have no Firebase Auth identity at all — the Access Portal instead polls `GET /api/appointments/:id` (via their guest token) every 5 seconds while a booking is pending. Simpler, and appropriate for a one-off guest visit rather than a power-user dashboard.

## 2. Project structure

```
medora-consult/
├── server/
│   ├── src/
│   │   ├── config/       firebaseAdmin.js, agora.js, arkesel.js, email.js
│   │   ├── controllers/  authController.js, appointmentController.js, serviceController.js, userController.js
│   │   ├── middleware/   auth.js (doctor/admin JWT), guestAuth.js (guest token), rateLimit.js
│   │   ├── routes/       authRoutes.js, appointmentRoutes.js, serviceRoutes.js, userRoutes.js
│   │   ├── utils/        idGenerator.js, pinGenerator.js, notifications.js (SMS + email dispatch)
│   │   └── server.js
│   └── firebase-service-account.json   (placeholder — replace or delete)
├── client/                              Vite + React + Tailwind
│   └── src/
│       ├── components/   Navbar, Footer, DisclaimerBanner, StatusBadge, ProtectedRoute, Spinner
│       ├── context/       AuthContext.jsx (doctor/admin only)
│       ├── lib/           api.js (axios), firebaseClient.js, guestSession.js (guest token + calls)
│       └── pages/         Home, Login, Register (doctor-only), GuestBooking, AccessPortal,
│                          DoctorDashboard, AdminDashboard, ConsultationRoom
├── firestore.rules
├── .env.example
├── package.json           (root orchestrator)
└── README.md
```

## 3. Setup

```bash
# 1. Install everything (root, server, client)
npm run install:all

# 2. Configure environment
cp .env.example .env
# then fill in every value in .env — see the comments in that file

# 3. EITHER drop a real Firebase service account file here:
#    server/firebase-service-account.json
#    OR just fill in FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env

# 4. Deploy Firestore security rules (needed for the doctor real-time dashboard)
firebase deploy --only firestore:rules

# 5. Build the React app
npm run build

# 6. Start the monolith
npm start
# Server + API + built frontend all on http://localhost:5000
```

### Local development (hot reload)

```bash
npm run dev:server   # nodemon on the Express API, port 5000
npm run dev:client   # Vite dev server, port 5173, proxies /api to :5000
```

## 4. Required third-party accounts

| Service | Used for | Env vars |
|---|---|---|
| Firebase (Auth + Firestore) | Doctor/admin accounts, appointments, doctor real-time listener | `FIREBASE_*`, `VITE_FIREBASE_*`, or `server/firebase-service-account.json` |
| Agora | Video consultations | `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` |
| Arkesel | SMS to patients (PIN, confirmations) and doctors (new request broadcast) | `ARKESEL_API_KEY`, `ARKESEL_SENDER_ID` |
| SMTP (any provider) | Booking confirmation email with the PIN | `EMAIL_SMTP_*`, `EMAIL_FROM` |

There is no payment gateway to configure. `MOMO_NUMBER` / `MOMO_NAME` in `.env` control what's shown on the guest booking confirmation screen.

## 5. Roles & flows

- **Guest (patient)**: no account. Visits `/book` → picks a **service** and immediate/scheduled timing → fills in name, phone, email, symptoms → submits. A 6-digit PIN is generated immediately and shown on-screen alongside MoMo transfer instructions (`GuestBooking.jsx`). The patient later returns to `/access`, enters phone + PIN (`AccessPortal.jsx`), and watches their status update (polling) through payment verification → doctor claim → an in-session "Join Video" button → a post-call star rating.
- **Admin**: the bootstrapped master admin manages the **Services** price list, approves/suspends doctors, and — new in this workflow — the **Payment Authorization** tab: checks their own phone for the incoming MoMo SMS, and clicks "Authorize Payment" once confirmed. That single action moves the booking into the doctor queue and fires the patient's SMS + email.
- **Doctor**: registers (`/register`, doctor-only now) → pending until admin-approved → sees a live **Incoming Requests** queue of admin-authorized bookings. **Claim Consultation** atomically claims it (a Firestore transaction guarantees only one doctor wins a race) and immediately opens the video room. Ending the call as the doctor marks the booking completed, which is what unlocks the patient's rating prompt.

### Appointment lifecycle

```
pending_payment_verification → awaiting_doctor_claim → in_session → completed
                                                                   \→ cancelled
```
- `pending_payment_verification`: booking created, PIN generated, MoMo instructions shown. Invisible to doctors.
- `awaiting_doctor_claim`: an admin has manually authorized the MoMo payment — this is the broadcast/claim stage.
- `in_session`: a doctor has claimed it; claiming and opening the video room happen together.

### The PIN, end to end

1. **Booking** (`bookAppointment`): PIN generated immediately, shown on-screen. No SMS/email yet — payment isn't verified.
2. **Admin authorizes payment** (`authorizePayment`): fires the patient's SMS + email (`utils/notifications.js`, using the exact template requested) with the PIN and the Access Portal link, and broadcasts a separate (PIN-free) SMS to every active doctor.
3. **Access Portal** (`guestAccess`): phone + PIN → looked up by PIN first (avoids needing a Firestore composite index), phone match confirmed in code → issues a 6-hour guest JWT scoped to that one appointment ID.
4. **Brute-force protection**: since a PIN guess that matches nothing has no appointment document to attach a failure count to, protection here is an IP-based rate limiter (`middleware/rateLimit.js`, 15 attempts / 15 min) rather than a per-document lockout. A PIN that *is* found can still be explicitly locked (`pinStatus: "locked"`) and reset by an admin (`POST /:id/reset-pin`).
5. **Video + rating**: the guest token authorizes `POST /:id/video-token` and `POST /:id/rating` — both go through the same backend-write pattern as everything else in this app (Firestore rules deny all client writes), so the guest never talks to Firestore directly.

### Forgot / reset password (doctor/admin only)

Unchanged from before — Firebase's `sendPasswordResetEmail` / `confirmPasswordReset`, since doctor/admin accounts are still real Firebase Auth users.

## 6. Medical disclaimer

Rendered in the global footer (`Footer.jsx`) and the guest booking form (`DisclaimerBanner.jsx` inside `GuestBooking.jsx`).

## 7. Notes on the two token types

`middleware/auth.js` (`requireAuth`) verifies normal doctor/admin session JWTs. `middleware/guestAuth.js` verifies a structurally distinct guest JWT (`type: "guest"`) scoped to exactly one appointment ID — the two can never be confused, since each middleware checks `decoded.type` explicitly. `POST /:id/video-token` and `GET /:id` accept *either*, via `requireDoctorOrGuest`, which normalizes both into a single `req.actor` shape for the controller.
