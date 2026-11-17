# Khronos frontend

React app for the [Khronos API](../khronos-demo). Owners of small venues use it to set up zones, schedule staff shifts, create events and put people on them. Staff use it to see their own week.

The interface is in **Spanish (Spain) by default**, with English as an option.

## Running locally

1. Start the API (`khronos-demo`) on `http://localhost:8080`. This version of the app needs an API that includes the endpoints listed in [API endpoints this app needs](#api-endpoints-this-app-needs).
2. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:5173 and sign in with an API user.

The API has no CORS config, so in development Vite proxies every `/api` call to the backend. Point the proxy elsewhere with `KHRONOS_API_URL=http://host:port npm run dev`. For a production build served from another origin, set `VITE_API_URL` at build time and enable CORS on the API, exposing the `Retry-After` header. Both variables are documented in `.env.example`; copy it to `.env.local` to set them.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with the API proxy |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run typecheck` | Type-check only |
| `npm run lint` | ESLint, with no warnings allowed |
| `npm test` | Unit and component tests (Vitest, jsdom, Testing Library) |

`.github/workflows/ci.yml` runs `npm ci`, lint, typecheck, test and build on pushes to `main` and `dev` and on pull requests.

**Lint and TypeScript 7.** typescript-eslint does not support TypeScript 7 yet, so ESLint parses TS/TSX with Babel's TypeScript syntax plugin. It runs the core recommended rules and the React hooks rules; types, unused variables and undefined names are left to `tsc`. When typescript-eslint supports TypeScript 7, swap the parser in `eslint.config.js`.

## What each role sees

| Role | Screens |
|---|---|
| Owner | **Schedule**: a day board per zone with the week strip, add shifts in batches, copy last week, and an event panel to assign people. **Events**: upcoming and past events with who is on them. **Team**: add people (creates the login and links it to the venue in one step), edit, reset a password, deactivate. **Venue and zones**. |
| Worker | **My schedule**: upcoming shifts by day, with the events they are on during each shift. |
| Platform admin | **Owners and venues**: create owner accounts and their venues, reset an owner's password. |

All roles have **Account**, for profile, password and language.

## Languages

Strings live in `src/lib/i18n/`: `es.ts` (the default, and the shape every dictionary must have) and `en.ts`. Components read them with `useT()` and format dates with `useFmt()`:

```tsx
const t = useT()
const fmt = useFmt()
return <PageHead title={t.schedule.title} sub={`${fmt.long(date)} · ${t.common.shifts(count)}`} />
```

- To add a string, add the key to `es.ts` and then to `en.ts`. The type check fails if a language is missing a key, and a test checks both have the same keys.
- Strings that take numbers or names are functions, so each language handles its own plurals and word order: `shifts: (n: number) => ...`.
- Dates use the language's locale (`es-ES` or `en-GB`), a 24-hour clock and weeks that start on Monday.
- The language is picked on the Account page and remembered in `localStorage`.
- Messages written by the API are still in English and are shown as they come. Errors the app detects itself (no connection, server down, too many attempts, wrong password at sign-in) are translated.

## How it maps to the API rules

- **Coverage line.** On the board, each event draws a line at its start time across its zone. The shift bars it crosses belong to the people who can be assigned. This matches the API rule: a shift in the same zone, on the same date, with `start ≤ event time < end`. The event panel lists those people first. For anyone not on shift, it offers "Add a shift" with the event's zone, date and time already filled in, ending four hours later or at 23:59.
- **Batches are all or nothing.** Shifts, events and assignments are sent as one list. When the API answers `Shift [2]: ...`, the app highlights that row and shows the message. When "Assign all" fails, the panel names the person it stopped at and offers to assign the rest.
- **Automatic unassignment.** After a shift or event is changed, the app refetches assignments, because the API may have removed people whose shift no longer covers the event.
- **Inactive people** can't get new shifts or sign in, so they are left out of the pickers.
- **Only the range on screen is fetched.** Schedule asks for the week shown (shifts include the week before, for "Copy last week"), Events for upcoming or past, Team for this week, and My schedule from this Monday on.

## Auth

The app signs in with `POST /api/auth/login` and gets a JWT that is **valid for one hour**. It sends that token as `Authorization: Bearer ...` on every other call. The login request itself never carries a token.

- The token and its expiry time are kept in `sessionStorage`, so they are gone when the tab closes. The password is never stored.
- Five minutes before the hour is up, a banner shows the end time and offers **Stay signed in**: the password gets a new token in place, so the screen and any unsaved input are kept. If nobody acts, a timer signs the user out when the hour is up.
- A 401 from the API also signs out, for example when the token was revoked. When the API says the account is disabled, the login screen says so instead of "session ended".
- If the stored session can't be checked because the server is unreachable or answers 5xx, the session is kept and a retry screen shows.
- After too many sign-in attempts (429), the login button stays locked for as long as `Retry-After` says.
- The Account page shows when the current session ends.
- Changing the password revokes every earlier token on the server, this one included. The app signs in again with the new password right away, so the person stays signed in and other devices are signed out.

There is no refresh token yet. The code that would change for one lives in `src/api/client.ts` and `src/auth/AuthContext.tsx`.

## Structure

```
src/
├── api/          fetch client, DTO types, one function per endpoint
├── auth/         session handling
├── components/   Board, shift and event dialogs, shared UI, layout, error boundary
├── lib/          queries (TanStack Query), venue selection, date helpers, i18n/
├── pages/        owner/, worker/, admin/, Login, Account
└── styles/       app.css (tokens, light and dark)
```

Tests sit next to the code they cover (`*.test.ts`, `*.test.tsx`).

## API endpoints this app needs

On top of the original API, this version uses:

| Endpoint | Used for |
|---|---|
| `POST /api/workers/with-user` `{ establishmentId, user: { username, password, firstName, lastName, phoneNumber, email } }` → `{ user, worker }` | Adding a person on Team in one transaction |
| `PUT /api/workers/{userId}/active` `{ active }` → `WorkerResponse` | Deactivate and reactivate |
| `PUT /api/users/{id}/password/reset` `{ newPassword }` → 204 | Reset password on Team and on the admin page |
| `GET /api/users/establishment/{establishmentId}` → `UserResponse[]` | Names of the venue's staff, in one request |
| `GET /api/worker-events/establishment/{establishmentId}?from&to` → `WorkerEventResponse[]` | Assignments for the Schedule and Events pages, in one request |
| `?from=YYYY-MM-DD&to=YYYY-MM-DD` (optional, inclusive) on `GET /api/worker-shifts/owner/{id}`, `/worker/{id}`, `/zone/{id}`, `GET /api/events/establishment/{id}` and `/zone/{id}` | Fetching only the dates on screen |

`EstablishmentResponse.ownerEmail` and `ownerPhone` can be `null` for workers.

Shifts are still listed per owner, and the app narrows them to the zones of the current venue.
