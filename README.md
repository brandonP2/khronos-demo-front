# Khronos frontend

React app for the [Khronos API](../khronos-demo). Owners of small venues use it to set up zones, schedule staff shifts, create events and put people on them. Staff use it to see their own week.

## Running locally

1. Start the API (`khronos-demo`) on `http://localhost:8080`.
2. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:5173 and sign in with an API user.

The API has no CORS config, so in development Vite proxies every `/api` call to the backend. Point the proxy elsewhere with `KHRONOS_API_URL=http://host:port npm run dev`. For a production build served from another origin, set `VITE_API_URL` at build time and enable CORS on the API.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with the API proxy |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run typecheck` | Type-check only |

## What each role sees

| Role | Screens |
|---|---|
| Owner | **Schedule**: a day board per zone with the week strip, add shifts in batches, copy last week, and an event panel to assign people. **Events**: upcoming and past events with who is on them. **Team**: add people (creates the login and links it to the venue), edit, deactivate. **Venue and zones**. |
| Worker | **My schedule**: upcoming shifts by day, with the events they are on during each shift. |
| Platform admin | **Owners and venues**: create owner accounts and their venues. |

All roles have **Account**, for profile and password.

## How it maps to the API rules

- **Coverage line.** On the board, each event draws a line at its start time across its zone. The shift bars it crosses belong to the people who can be assigned. This matches the API rule: a shift in the same zone, on the same date, with `start ≤ event time < end`. The event panel lists those people first. For anyone not on shift, it offers "Add a shift" with the event's zone, date and time already filled in.
- **Batches are all or nothing.** Shifts, events and assignments are sent as one list. When the API answers `Shift [2]: ...`, the app highlights that row and shows the message.
- **Automatic unassignment.** After a shift or event is changed, the app refetches assignments, because the API may have removed people whose shift no longer covers the event.
- **Inactive people** can't get new shifts, so they are left out of the pickers.

## Auth

The app signs in with `POST /api/auth/login` and gets a JWT that is **valid for one hour**. It sends that token as `Authorization: Bearer ...` on every other call. The login request itself never carries a token.

- The token and its expiry time are kept in `sessionStorage`, so they are gone when the tab closes. The password is never stored.
- A timer signs the user out when the hour is up. Any 401 from the API does the same, for example when the token was revoked or the account was deactivated. The login screen then explains that the session ended.
- The Account page shows when the current session ends.
- Changing the password revokes every earlier token on the server, this one included. The app signs in again with the new password right away, so the person stays signed in and other devices are signed out.

There is no refresh token yet, so a session always ends after one hour. The code that would change for one lives in `src/api/client.ts` and `src/auth/AuthContext.tsx`.

## Structure

```
src/
├── api/          fetch client, DTO types, one function per endpoint
├── auth/         session handling
├── components/   Board, shift and event dialogs, shared UI, layout
├── lib/          queries (TanStack Query), venue selection, date helpers
├── pages/        owner/, worker/, admin/, Login, Account
└── styles/       app.css (tokens, light and dark)
```

## Known API gaps the UI works around

- `GET /workers/...` returns only ids, so the Team and Schedule screens call `GET /users/{id}` for each person.
- Assignments can only be listed per event or per worker, so the board fetches them for the events of the day shown.
- Shifts are listed per owner, and the app narrows them to the zones of the current venue.

Adding names to `WorkerResponseDTO`, plus an assignments-by-establishment endpoint, would remove most of these extra requests.
