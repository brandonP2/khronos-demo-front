# Khronos frontend

React app for the [Khronos API](../khronos-demo). Owners of small venues use it to set up zones, schedule staff shifts, create events and put people on them, and to see the work actually done: who clocked in and out, planned against worked hours, punctuality and staff cost. They also close the till at the end of each day, record expenses and see the business at a glance: sales, expenses, staff cost and margin against the period before, and keep the stock of drinks and supplies: what there is, what comes in and goes out, physical counts and orders to suppliers. Staff use it to see their own week, clock in and out from their phone and check their hours.

The interface is in **Spanish (Spain) by default**, with English as an option.

## Running locally

1. Start the API (`khronos-demo`) on `http://localhost:8080`. This version of the app needs an API that includes the endpoints listed in [API endpoints this app needs](#api-endpoints-this-app-needs).
2. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:5173 and sign in with an API user.

The API has no CORS config, so in development Vite proxies every `/api` call to the backend. Point the proxy elsewhere with `KHRONOS_API_URL=http://host:port npm run dev`. For a production build served from another origin, set `VITE_API_URL` at build time and enable CORS on the API, exposing the `Retry-After` and `Content-Disposition` headers. Both variables are documented in `.env.example`; copy it to `.env.local` to set them.

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
| Owner | **Summary** (`/`, the owner's home): for a period (this week, last week, this month, last month or a range), sales, expenses, staff cost, estimated margin and staff cost over sales, each against the period before; a chart of sales and total cost by day; expenses by category; what needs doing (days with activity and no cash closing, drafts, the cash difference of the closed days and, apart and provisional, that of the drafts, products low on stock) and who is clocked in now; CSV export. **Cash** (`/cash`, `?date=YYYY-MM-DD` for a day): the day's cash closing, made for the phone, with the figures worked out as amounts are typed, save as draft, close, reopen with a reason and the history; below, the closings of a period with the days that had activity and no closing; CSV export. **Expenses** (`/expenses`): by period and category with the filter's total, added and edited in a dialog, deleted after confirming; one created by receiving an order links to it and is deleted, never edited; CSV export; cards on phones. **Inventory** (`/inventory`, with tabs for Stock, Movements, Orders and Suppliers): see [Inventory](#inventory). **Schedule** (`/schedule`): a **Now** card with who is clocked in, since when, and quick actions to clock someone in or out; a day board per zone with the week strip, add shifts in batches, copy last week, and an event panel to assign people. **Hours** (`/hours`): planned against worked hours, punctuality and staff cost per person for a period, with CSV exports. **Events**: upcoming and past events with who is on them. **Team**: add people (creates the login and links it to the venue in one step), edit, reset a password, deactivate; each name opens the person's page. **Person** (`/team/:workerId`): details, hourly rate and its history, day by day for a period, and every time entry with add, correct, void and history. **Venue and zones**, including the venue's time zone. |
| Worker | **My schedule** (`/`): a **Clock in** card first (out, or in since HH:MM with the time ticking, today's shift, one big button), then upcoming shifts by day, with the events they are on during each shift. **My hours** (`/hours`): their entries by period, planned against worked, the status of each day, each entry's corrections, and their own record as CSV. |
| Platform admin | **Owners and venues**: create owner accounts and their venues (with the venue's time zone), reset an owner's password. |

Workers never see hourly rates or costs, theirs included, and the app never asks the API for them with a worker's session. Summary, Cash, Expenses and Inventory are for owners only: a worker gets neither the menu entries nor the routes (an address like `/cash` or `/inventory/count` takes them to their schedule) and the app never calls those endpoints with their session.

**The schedule moved.** It used to be the owner's `/`; it is now `/schedule`, and `/` is the summary. Workers and admins keep their `/`.

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
- Messages written by the API are in English. The ones a person meets while clocking in and out (already clocked in, overlaps, more than 24 hours, and so on) and a few of the cash closing and expenses are matched exactly in `src/lib/apiMessages.ts` and shown in the current language; any other API message is shown as it comes. The 409s that screens act on (a reason needed to close, a day already closed, a closed till for a cash expense) are told apart by the `code` the API sends with them, and by their message only when it sends none; a coded refusal whose message the app does not know is still worded by its code. Errors the app detects itself (no connection, server down, too many attempts, wrong password at sign-in) are translated.

## How it maps to the API rules

- **Coverage line.** On the board, each event draws a line at its start time across its zone. The shift bars it crosses belong to the people who can be assigned. This matches the API rule: a shift in the same zone whose real interval `[date + start, end)` holds the event's time. The event panel lists those people first. For anyone not on shift, it offers "Add a shift" with the event's zone, date and time already filled in, ending four hours later (the next day if that passes midnight).
- **Shifts that end the next day.** A shift's `date` is its service day, the day it starts. An end at or before the start is on the next day: 18:00–02:00 is 8 hours. The dialogs say so ("Ends the next day at 02:00. Lasts 8h.") and refuse the same time twice and more than 16 hours, like the API. The board draws a night shift whole on an axis that runs past 24:00, with "+1" on the hours of the next day and a dashed midnight line; the night shifts of the day before are carried into the small hours, so an event at 01:00 shows who covers it. Hours use `durationMinutes` from the API. My schedule keeps a shift under Upcoming until it ends on the venue's clock, so a night shift still running at 01:00 is the current shift, with its events, not a past one; Venue and zones counts it as ahead too.
- **Time zone.** Shifts and events are local times with no zone. Time entries are UTC instants and are always shown, and typed, on the venue's clock (`timeZone`, `Europe/Madrid` by default), whatever the device's zone. "Today", and so what is past or upcoming, is the venue's date on every screen, which near midnight can differ from the device's; My schedule uses the device's date only until the venue has loaded, and waits for it before showing the days. The conversion, including the nights the clocks change, lives in `src/lib/time.ts`.
- **Time entries are never deleted.** The owner adds a day that was not clocked, corrects or voids an entry, always with a reason (3 to 255 characters) that the API keeps in the entry's history. Corrected entries are marked, voided ones are struck through. As in the API, an entry lasts up to 24 hours: a clock-out at the clock-in's time is on the next day, and the clock-out is checked to be after the clock-in as an instant.
- **Clocking someone out.** The owner's "Clock out" on the Now card calls `POST /time-entries/{id}/clock-out` with the break and a reason; the server sets the time and the history shows a clock-out. An entry open for more than 24 hours can't be clocked out (the API answers 409): the dialog says so, before sending when it can tell from the clock-in, and opens the correction with the clock-out left empty for the real time. When someone else clocked the person out first (409 `The time entry is already clocked out`), the dialog says so and closes; after any failed clock-out the Now list is asked again. "Clock in now" sends the time cut to the minute, so a device clock a few seconds fast does not send a clock-in in the future.
- **Only workers clock themselves.** `me/open`, `clock-in` and `clock-out` are only called with a worker's session (owners and admins get 403 from them). A deactivated worker gets a 401 `ACCOUNT_DISABLED` on any call, clocking included, and is signed out with that reason.
- **A forgotten clock-out.** When the open entry is `isStale` (open for more than 16 hours), the worker's card says so and still offers to clock out, as the API allows until 24 hours, and to ask the manager to correct the time if they left earlier. From 24 hours on the button goes and the card sends them to their manager.
- **Voided entries** stop counting. The reports (Hours, the day by day of Person and My hours) leave them out; the entry list on the Person page asks for them (`includeVoided=true`) and strikes them through.
- **Rates** are never edited: a new one is added from a date. One from a date before the venue's today changes the cost of the days worked since then, so the Person page asks first.
- **Costs** are each day's minutes times the rate in force that day. When some minutes fall on a day with no rate, the API gives `null` instead of a sum that falls short, and the app shows "—" with "No rate for part of the period". Totals add up the known costs, and a notice says how many people are left out.
- **Venues with time entries are kept.** Deleting one answers 409 so the time record is not lost; the admin page says so and suggests deactivating the team instead.
- **Batches are all or nothing.** Shifts, events and assignments are sent as one list. When the API answers `Shift [2]: ...`, the app highlights that row and shows the message. When "Assign all" fails, the panel names the person it stopped at and offers to assign the rest.
- **Automatic unassignment.** After a shift or event is changed, the app refetches assignments, because the API may have removed people whose shift no longer covers the event.
- **Inactive people** can't get new shifts or sign in, so they are left out of the pickers.
- **Only the range on screen is fetched.** Schedule asks for the week shown (shifts include the week before, for "Copy last week" and last night's shifts), Events for upcoming or past (shifts from the day before, for cover in the small hours), Team for this week, My schedule from this Monday on (from yesterday on a Monday, for a night shift still running), and Hours, Person and My hours for the period picked (this week, last week, this month, last month, or a range of up to 366 days).
- **Who is in now** is refreshed every minute and whenever the tab comes back into view.
- **CSV exports** need the bearer token, so they are fetched with it and saved from a blob, not opened as links. The file name comes from `Content-Disposition`; a cross-origin API has to expose that header for the browser to read it, otherwise a name like `horas_2026-11-16_2026-11-22.csv` is used.

## Cash, expenses and the summary

- **A record for running the bar.** The cash closing is an internal management record of the day: it does not replace invoicing software or the accountant, and the app makes no claim about any tax or invoicing rule. There are no sales per employee and no point of sale.
- **Service day.** A closing and an expense belong to a service day, like shifts and time entries: a night that ends at 02:00 belongs to the day it started. Before 06:00 on the venue's clock, Cash suggests yesterday's service.
- **Amounts** are typed with the numeric keypad and a comma or a point (`1.234,50`, `1234,5` and `1234.50` all work; a lone separator followed by three digits groups thousands, though never after a leading 0, so `0,125` is refused rather than read as 125 €) and shown back as `1.234,50` when the field is left. Sums are done in cents. Money reads `1.234,50 €`.
- **The live figures** follow the API: total sales = cash + card + other; expected cash = opening float + cash sales − the day's cash expenses − cash withdrawals; difference = counted cash − expected cash, shown with its sign, in words (cash over, cash short, balanced) and in colour. Tips are recorded but are not sales. The day's cash expenses come from the API: the closing's own figure once it exists, else the day's expenses paid in cash.
- **Closing.** "Save draft" creates or updates the draft (only when something changed); "Close the till" saves and closes. A draft can be saved before the cash is counted: the count goes as `null`, never as 0 (which would show the whole till as missing), and the form and the list say "Not counted" with no difference. Counted cash is needed to close (the API answers 409 `CASH_NOT_COUNTED` otherwise), and a difference over 5,00 € needs a reason first. The limit is the API's default; whenever the API asks for a reason anyway (409 `DIFFERENCE_REASON_REQUIRED`, its own limit can be lower), the reason field comes up, and it goes away again when an amount the difference comes from is changed. A closed day is read only, with "Reopen" (a reason of 3 to 255 characters) and its history. When someone else saved or closed the day meanwhile (409 `CASH_CLOSING_EXISTS` or `CASH_CLOSING_CLOSED`), the form reloads it and says so. A draft can be discarded only if it was never closed; a day closed once stays on record (409 `CASH_CLOSING_WAS_CLOSED`: correct it and close it again).
- **Expenses paid in cash** count in that day's closing, so once the day is closed the API refuses to add, change or delete them (409 `CASH_DAY_CLOSED`). The dialog explains that the day's closing has to be reopened and links to it on Cash: the day in the error's `details.date`, else the one its message names. Expenses paid otherwise are never blocked.
- **Estimated margin** = sales − expenses other than payroll − staff cost of the hours clocked (hours × the rate in force, as on the Hours page). Payroll is not taken off twice. It is never called profit. When no one's cost from the hours is known (no hourly rates: `laborCostSource` is `PAYROLL_EXPENSES`), the API takes off the payroll expenses instead: the staff cost card shows them, "from payroll expenses: hourly rates are missing" with a link to Team, and the margin's help says so.
- **A partial staff cost.** When the cost from the hours leaves out people who worked with no rate (`laborCostPartial`), the staff cost card marks it "Partial" next to the figure and says how many people have no rate, with a link to Team; it is not compared with the period before, and the margin and the staff cost over sales say they rest on a partial cost. The Hours page already warns of the same; its report's `costPartial` and `workersWithoutCost` are typed but not shown.
- **Cash difference.** The summary's cash difference adds up the closed days only. The drafts' (`draftCashDifference`) is shown on its own line, marked provisional, when it is not 0; a draft not counted yet adds nothing to it.
- **Against the period before.** Each card shows the signed change, an arrow and words for screen readers; green or red only says whether it is good news (fewer expenses is). When the period before had nothing, it says so instead of comparing, and a change from 0 shows no percentage. Staff cost over sales changes in points.
- **Low stock on the summary.** The alerts say how many products are at or under their minimum, with a link to the stock filtered to them (`/inventory?low=1`). It reads the same product list as the stock screen, so a visit there and back asks for nothing new; if the list cannot be read, the alert is left out.
- **The chart** is plain HTML and CSS, no library: per day, sales next to total cost on one axis in euros, with a legend. The total cost is what the day's margin takes off its sales (sales − margin, from the API): expenses without payroll plus the staff cost from the hours, or every expense, payroll included, when there are no hourly rates and the payroll stands in for the staff cost. So payroll is never counted twice, and sales − cost is always the margin shown. A day with activity and no cash closing is hatched and named as such, never shown as a day with no data, and a staff cost it cannot work out reads "no rate" rather than 0. The days are one tab stop walked with the arrow keys (Home and End too). Each day is announced once, by its column's name, which carries all its figures; the readout line under the chart shows the same for the eye and is neither a live region nor a tooltip, so nothing is read twice. A table with every value sits behind it for screen readers. Long periods scroll sideways inside the card and start at the most recent days.

## Inventory

Drinks and supplies, for the owner. Every screen has its own address under `/inventory`.

| Screen | What it does |
|---|---|
| **Stock** (`/inventory`, `?low=1` for low stock) | The report's figures (stock value, active products, how many are low, how many are negative), then every product by category with its stock, minimum, cost per unit, value and usual supplier, a search by name and the filters "Low stock" and "Include inactive". Each product has four quick actions, one tap each on the phone: **Stock in** (a purchase, with an optional cost), **Waste** (a reason is required, with suggestions: breakage, expired, on the house, service mistake), **Usage** and **Adjustment** (add or take, with a reason). The name opens the product's card: edit, see its movements, deactivate or activate, delete. Below, what is under its minimum by usual supplier, each with "Prepare order", and the period's report: purchases, waste, count differences and top waste, with the same period picker as the summary. CSV export of the stock. |
| **Count** (`/inventory/count`) | The physical count, made for the phone: every active product by category with its expected stock, an empty field for what is really there and the difference worked out as it is typed. Only the products typed in are sent. A review shows how many products were counted, how many differ, the difference per unit and in value, and takes the day and notes before confirming. |
| **Movements** (`/inventory/movements`, `?productId=` for one product) | The history by period, product and type: signed quantity, value, reason, who and when, the stock left when it was recorded and a link to the order it came from. CSV export. |
| **Orders** (`/inventory/orders`, `/inventory/orders/new`, `/inventory/orders/:id`, `/inventory/orders/:id/receive`) | The list by status, of the orders created in the last year as the API lists them without dates (the screen says since which day), or of another period of up to 366 days ("See another period"). A draft is edited with its supplier, expected date, notes and lines (product, quantity, optional cost per unit) and the total worked out live; "Suggest from low stock" fills in the supplier's products at or under their minimum. It is then marked as ordered or cancelled; an ordered one is received on its own screen. `?supplierId=&propose=1` starts a new order with the proposal. |
| **Suppliers** (`/inventory/suppliers`) | Name, phone, email and notes, with how many products have each as their usual supplier; added, edited and deleted. |

- **The stock is never typed in.** It is the sum of the movements, which are never edited or deleted: the screens say so and a mistake is corrected with an adjustment. After a movement or a count the stock the API reports (`stockAfter`) is shown at once, then the lists are refetched; the value, the low mark and the cost are left to that refetch, so no API rule is worked out again in the app.
- **No point of sale.** Sales do not take anything off the stock on their own; usage is recorded by hand or comes out of a count, and the stock screen and the usage dialog say so.
- **Quantities** have up to three decimals and are typed with the numeric keypad and a comma or a point (`4,5`, `4.5`, `0,250`); a lone separator is always the decimal mark. They are shown with no trailing zeros and with their unit in the right plural: 1 botella, 4,5 botellas, 2 kg, 1 l, 3 cajas, 1 barril. Sums are done in thousandths, values in cents. As the API takes them, a quantity has at most 9 digits before the decimal mark (999.999.999,999) and a cost per unit at most 8 (99.999.999,99); the fields refuse more before sending. The API answers quantities with their three decimals (`2.500`) as JSON numbers, which read and show as 2,5.
- **Stock value and stock after.** The stock value (each product's and the report's) is at each product's cost per unit now. A movement's "stock after" is the stock when it was recorded: one recorded later with an earlier day does not change it for those recorded before. The screens say both.
- **Low and negative stock** are marked in words, not only colour. Low means at or under the minimum. Negative stock most often means a purchase was not recorded, and a note says so.
- **The unit** of a product is locked by the API once it has stock movements or is on a purchase order in any status (409 `PRODUCT_UNIT_LOCKED`), which the app cannot see: a stock of 0 may still have either. Some stock can only come from movements, so then the form locks it; otherwise the unit can be picked, its hint says when it is locked, and when the API answers 409 the form puts the unit back, locks it and says why. A product with movements or orders cannot be deleted (409 `PRODUCT_HAS_HISTORY`): the dialog recommends deactivating it.
- **The count** is kept in the tab (`sessionStorage`, `khronos.stockCount.<venueId>`) as it is typed, so leaving the page by mistake or reloading does not lose it; coming back offers to start again. Closing the tab with a count half typed asks first. 0 counts as counted; anything that is not a quantity stops the review. The draft is the person's who typed it: it stores their id and is thrown away for anyone else, and every draft the app keeps (`src/lib/drafts.ts`) is forgotten when the session ends. Typing re-renders only the row being typed in.
- **Order proposals**: for each of the supplier's active products at or under its minimum, the quantity that gets it back to the minimum, rounded up to whole bottles, units, boxes and kegs, or to the half kilo or litre, and at least 1. Products already on the order are kept as they are. The product's last cost fills an empty cost. Khronos does not send orders: they are placed by phone or email and marked as ordered.
- **New orders.** "Mark as ordered" on a new order first saves the draft: if marking it then fails, the form keeps that draft (its number shows), and trying again saves and orders the same one.
- **Receiving** starts from the ordered quantities; each cost starts as the line's or, without one, the product's, which is also the one the API uses when the field is left empty (it shows as the placeholder). Each line received above 0 comes in at that cost, which becomes the product's, and the line keeps it, so the line totals, the total and the expense agree; a line is left out of the total only when its product has no cost either. 0 is for what did not arrive: that line is marked "not arrived", its cost is disabled and sent as `null`. With every line at 0 there is nothing to receive (the API answers 409 `PURCHASE_ORDER_NOTHING_RECEIVED`): the screen says so before sending and offers to cancel the order. "Create the matching expense" (on by default, with bank transfer) records a "Stock and drinks" expense of the total received, dated the day it is received; it needs a total above 0. A cash expense on a day whose till is closed is refused by the API and nothing is received: the screen explains it and links to that day's till, as Expenses does. Once received, the page opens the order the API answered with, and the order links to that day's expenses.
- **The expense of a received order** is that order's record of what was paid: Expenses says which order it came from, with a link, and it cannot be edited (409 `EXPENSE_FROM_PURCHASE_ORDER`), only deleted and entered again by hand; the order stays received with its stock.

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
├── api/          fetch client (JSON calls and authenticated downloads), DTO types, one function per endpoint
├── auth/         session handling
├── components/   Board, shift, event and time entry dialogs, clock card, Now card, hours table, period picker, cash closing form, expense dialog, amount and quantity fields, summary chart, stock and supplier dialogs, inventory tabs and tags, shared UI, layout, error boundary
├── lib/          queries (TanStack Query), venue selection, date, time zone and period helpers, hours sorting, typed amounts, cash closing figures, summary comparisons, stock quantities, counts and order proposals, drafts kept in the tab, API messages, downloads, i18n/
├── pages/        owner/ (inventory/ holds the inventory's screens), worker/, admin/, Login, Account
├── styles/       app.css (tokens, light and dark), and a test that checks it for what would widen a phone's page
└── test/         helpers: a fake API answered by path, the app rendered with a stored session, inventory fixtures
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

### Staff at work: clocking, rates and reports

The screens for hours and clocking in follow the delivery 2 API contract. Instants are ISO-8601 in UTC (`2026-11-20T17:02:00Z`), durations are whole minutes, money is euros with two decimals. "Owner" below means the venue's owner or a platform admin.

| Endpoint | Who | Used for |
|---|---|---|
| `timeZone` (IANA, default `Europe/Madrid`) on `EstablishmentRequest` and `EstablishmentResponse` | | Venue page and the admin's new-venue dialog; every time entry is shown in it |
| `endsNextDay` and `durationMinutes` on `WorkerShiftResponse`; an `endTime` at or before `startTime` means the next day, 16 hours at most | | Board, shift dialogs, hours on Schedule, Team and My schedule |
| `GET /api/time-entries/me/open` → `TimeEntryResponse`, or 204 | Worker | Clock card |
| `POST /api/time-entries/clock-in` `{ note? }` → 201; 409 if already in | Worker | Clock in |
| `POST /api/time-entries/clock-out` `{ breakMinutes?, note? }` → 200; 409 if nothing open or open for more than 24 hours | Worker | Clock out |
| `POST /api/time-entries` `{ workerId, clockIn, clockOut?, breakMinutes?, reason }` → 201 | Owner | Clock someone in now (Now card), add a day (Person) |
| `POST /api/time-entries/{id}/clock-out` `{ breakMinutes? (0..600), reason (3..255) }` → 200, kept in the history as `CLOCKED_OUT`; 409 if open for more than 24 hours or already clocked out | Owner | Clock someone out now (Now card) |
| `PUT /api/time-entries/{id}` `{ clockIn, clockOut, breakMinutes, reason }`, `breakMinutes` and `reason` (3..255) required | Owner | Correct an entry (Person, and from the Now card for an entry open more than 24 hours) |
| `PUT /api/time-entries/{id}/void` `{ reason }` (3..255) | Owner | Void an entry (Person) |
| `GET /api/time-entries/{id}/history` → `TimeEntryChangeResponse[]` | Owner, or the worker on their own | History dialog |
| `GET /api/time-entries/worker/{workerId}?from&to&includeVoided=true` | Owner | Entries on the Person page |
| `GET /api/time-entries/establishment/{id}/open` | Owner | Now card |
| `GET /api/workers/{workerId}/rates`, `POST` `{ hourlyRate, effectiveFrom }` (409 on a repeated date), `DELETE /{rateId}` | Owner | Hourly rate on the Person page |
| `GET /api/reports/establishment/{id}/hours?from&to`; voided entries never count, a cost is `null` when a rate is missing for part of it | Owner | Hours page |
| `GET /api/reports/worker/{workerId}/days?from&to` | Owner, or the worker on their own (costs `null`) | Person page, My hours |
| `GET /api/reports/establishment/{id}/hours.csv?from&to` and `/time-entries.csv?from&to` | Owner | "Export hours (CSV)" and "Export time record (CSV)" on Hours |
| `GET /api/reports/worker/{workerId}/time-entries.csv?from&to` | Owner, or the worker on their own | "Download my record (CSV)" on My hours |

`GET /api/time-entries/establishment/{id}?from&to` is typed in `src/api/endpoints.ts` but not used by any screen yet.

A 401 with `code: "ACCOUNT_DISABLED"` on any call signs the person out with that reason. `DELETE /api/establishments/{id}` (and deleting a worker) answers 409 when there are time entries.

### Cash, expenses and the summary

The Summary, Cash and Expenses pages follow the delivery 3 API contract. Every endpoint is for the venue's owner or a platform admin; a worker gets 403 before anything else is checked. Amounts are euros with two decimals.

| Endpoint | Used for |
|---|---|
| `GET /api/reports/establishment/{id}/summary?from&to` → `{ from, to, currency, totals, days[], expensesByCategory[], previous }`; `totals` with `laborCostSource`, `laborCostPartial`, `workersWithoutCost`, `cashDifference` (closed days) and `draftCashDifference`, `previous` with `laborCostSource` | Summary: cards, chart, categories and alerts; the days with activity and no closing on Cash |
| `GET /api/reports/establishment/{id}/summary.csv?from&to`, `/cash-closings.csv?from&to`, `/expenses.csv?from&to` | "Export summary", "Export closings" and "Export expenses" (CSV); the file name comes from `Content-Disposition` |
| `GET /api/cash-closings/establishment/{id}?from&to` | The day's closing (`from` = `to` = the day) and the period's list. Without dates the API lists the last 366 days, and a longer range is a 400: the app always sends both, from a period of 366 days at most, as for expenses |
| `POST /api/cash-closings` `{ establishmentId, businessDate, openingFloat, cashSales, cardSales, otherSales, cashWithdrawals, countedCash, tips, notes }` → 201 draft; 409 if the day has one. `countedCash` is `null` until counted, and so is the `difference` in the answer | Save draft (first time) |
| `PUT /api/cash-closings/{id}` (same body) → 200; 409 once closed | Save draft |
| `PUT /api/cash-closings/{id}/close` `{ differenceReason? }` → 200; 409 when the cash is not counted, the difference is over the limit with no reason, or it is already closed | Close the till |
| `PUT /api/cash-closings/{id}/reopen` `{ reason }` (3..255) → 200 draft; 409 if not closed | Reopen |
| `DELETE /api/cash-closings/{id}` → 204, drafts only | Discard draft |
| `GET /api/cash-closings/{id}/history` → changes, oldest first | History |
| `GET /api/expenses/establishment/{id}?from&to&category` | Expenses list and its total; the day's cash expenses on Cash |
| `POST /api/expenses`, `PUT /api/expenses/{id}` `{ establishmentId, date, category, description, supplier, amount, paymentMethod, notes }`, `DELETE /api/expenses/{id}`; 409 for a cash expense of a closed day | Add, edit and delete an expense |

Their 409s carry a stable `code`, which the app reads before the message: `CASH_CLOSING_EXISTS` and `CASH_DAY_CLOSED` (both with `details: { date }`), `CASH_CLOSING_CLOSED`, `CASH_CLOSING_NOT_CLOSED`, `CASH_CLOSING_WAS_CLOSED`, `DIFFERENCE_REASON_REQUIRED`, `CASH_NOT_COUNTED` and `FUTURE_DATE`. Against an API without codes the same cases are read from the message.

`GET /api/cash-closings/{id}` is typed in `src/api/endpoints.ts` but not used by any screen yet.

### Inventory

The Inventory pages and the summary's low stock alert follow the delivery 4 API. Every endpoint is for the venue's owner or a platform admin; a worker gets 403 before anything else is checked. Quantities have up to three decimals (9 digits before the mark); money is euros with two decimals (8 before).

| Endpoint | Used for |
|---|---|
| `GET /api/suppliers/establishment/{id}`, `POST /api/suppliers`, `PUT /api/suppliers/{id}` `{ establishmentId (on create), name, phone, email, notes }`, `DELETE /api/suppliers/{id}` (409 `SUPPLIER_HAS_ORDERS`) | Suppliers tab, the product form's usual supplier, the order's supplier |
| `GET /api/products/establishment/{id}?includeInactive=false\|true` | Stock, count, orders and the summary's low stock alert (active ones, one shared list); "Include inactive", Movements' product filter and Suppliers' product counts (all) |
| `POST /api/products`, `PUT /api/products/{id}` `{ establishmentId (on create), name, category, unit, minStock, unitCost, supplierId }`, `PUT /api/products/{id}/active` `{ active }`, `DELETE /api/products/{id}`; 409 `PRODUCT_UNIT_LOCKED` for another unit once it has movements or order lines, `PRODUCT_HAS_HISTORY` on deleting such a product | Add, edit, deactivate, activate and delete a product |
| `POST /api/stock-movements` `{ productId, type, quantity, unitCost, reason, date }` → the movement with `stockAfter`; `unitCost` only with `PURCHASE` (always `null` otherwise, as the API refuses it) | The four quick actions |
| `GET /api/stock-movements/establishment/{id}?from&to&productId&type` | Movements tab, always with both dates from the period picker (366 days at most; without dates the API would list the last 366) |
| `POST /api/stock-counts` `{ establishmentId, date, notes, items: [{ productId, countedQuantity }] }` → the COUNT movements | Confirming a count |
| `GET /api/purchase-orders/establishment/{id}?status&from&to` | Orders list: without dates, the orders created in the last 366 days; with "See another period", both dates (days of creation, 366 at most) |
| `GET /api/purchase-orders/{id}`, `POST`, `PUT /{id}`, `DELETE /{id}` `{ establishmentId (on create), supplierId, expectedDate, notes, lines: [{ productId, quantity, unitCost }] }` | Editing a draft |
| `PUT /api/purchase-orders/{id}/order`, `PUT /api/purchase-orders/{id}/cancel` | "Mark as ordered", "Cancel order" |
| `PUT /api/purchase-orders/{id}/receive` `{ receivedDate, lines: [{ lineId, receivedQuantity, unitCost }], createExpense, paymentMethod }`, every line, `createExpense` always and `paymentMethod` with it; a line at 0 with `unitCost: null` | Receiving an order |
| `GET /api/reports/establishment/{id}/inventory?from&to` | The stock figures, "To order" and the period's report |
| `GET /api/reports/establishment/{id}/inventory.csv` and `/stock-movements.csv?from&to` | "Export stock" and "Export movements" (CSV), named by `Content-Disposition` (`inventario_<today>.csv`, `movimientos-stock_<from>_<to>.csv`, the same names when it is missing) |
| `GET /api/expenses/establishment/{id}?…` → each expense with `purchaseOrderId` (or `null`); `PUT /api/expenses/{id}` → 409 `EXPENSE_FROM_PURCHASE_ORDER` with `details: { purchaseOrderId }` for one | Expenses: where an expense came from, and no edit for it |

The inventory's 409s carry a stable `code`, which `src/lib/apiMessages.ts` reads before the message (`inventoryRefusal`) and words in both languages: `SUPPLIER_NAME_TAKEN`, `SUPPLIER_HAS_ORDERS`, `PRODUCT_NAME_TAKEN`, `PRODUCT_INACTIVE`, `PRODUCT_UNIT_LOCKED`, `PRODUCT_HAS_HISTORY`, `OTHER_ESTABLISHMENT`, `PURCHASE_ORDER_WRONG_STATUS` (the screen then reloads the order), `PURCHASE_ORDER_NO_TOTAL`, `PURCHASE_ORDER_NOTHING_RECEIVED` and `EXPENSE_FROM_PURCHASE_ORDER`. Receiving with a cash expense on a closed day is the expenses' `CASH_DAY_CLOSED`, with `details.date`, read with `cashRefusal` and `refusalDay`; a future day of a movement, a count or a receipt is `FUTURE_DATE`. Against an API without codes the same cases are read from the message. The 400s that name a field and that the inventory could still meet are worded too (`fieldErrorsMessage`): a product twice in a count (`items`) or an order (`lines`), a line twice in a receipt, a cost on a movement that is not a purchase (`unitCost`), the expense's `createExpense` or `paymentMethod` missing, too many digits, and a count, movement or receipt that would take the stock out of range. The app sends none of the avoidable ones; any other message is shown as it comes.

`GET /api/products/{id}` is typed in `src/api/endpoints.ts` but not used by any screen yet.
