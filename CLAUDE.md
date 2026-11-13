# Vantage — Backend API

Express 5 + Mongoose 9 REST API for Vantage, a tour-booking platform, on MongoDB Atlas. The frontend lives in `../frontend` (Next.js); it calls this API server-to-server and has its own CLAUDE.md with the full API summary.

## How Claude works in this repo (read first)

This is Kareem's first Express/Mongoose project, written by hand as practice. **The point is for Kareem to write every line.**

- **Don't write or edit backend code**, not even one-line fixes, and don't paste snippets that solve the task.
- **Don't give the answer away as a "hint" either.** Be a mentor: ask guiding questions, point to the relevant file or function, name the concept or the doc page to read (Mongoose, Express, MDN, the course section), and explain _why_ something is a problem.
- Start with the smallest nudge. Get more specific only if Kareem asks or is clearly stuck.
- Reviews are welcome: when Kareem asks, point out bugs, security issues, and edge cases with the reasoning, still without rewriting the code.
- The only file Claude may edit here is this one (ticking items or adding findings), and only when asked.
- Never print secret values from `config.env`.

## Commands

- `npm run dev`: nodemon in development mode (port comes from `config.env`).
- `node dev-data/data/importData.js`: **deletes** all tours, users, and reviews, then re-imports the seed JSON. Run it from this folder (it reads `./config.env`).
- `node dev-data/data/importDates.js`: copies each tour's `startDates` from `tours.json` into the database and changes nothing else. Same folder rule.

## Fix checklist

Roughly in the order the frontend needs them. Each item says what's wrong, why it matters, where to look, and a direction to explore, never the solution. "Agreed with the frontend" lines are contracts between the two apps, not hints.

### Phase 1: before the frontend can show real data

- [x] **0. Port clash.** The API listens on 3000, which is also Next.js's default dev port. Fixed: the API runs on 3001, and the startup log prints the port it actually uses.
  - Where: `config.env`, `server.js`.
  - Direction: give the API its own port, and check that the startup log reports the real one.
- [x] **1. Images don't exist anywhere.** `imageCover`, `images`, and `photo` are bare filenames (`tour-2-cover.jpg`) that nothing serves. Fixed for the seed data: tours and users hold Cloudinary public IDs (`the-sea-explorer-cover`, `jonas-schmedtmann`) in the JSON files and in the database. User photos are set by `dev-data/data/updateUserPhotos.js`. Upload endpoints are still to come (item 7).
  - Why: the frontend can't render a single tour card or avatar.
  - Agreed with the frontend: images live on Cloudinary, and the API stores Cloudinary **public IDs** (e.g. `vantage/tours/the-sea-explorer/cover`), not full URLs. The frontend builds sized URLs from them.
  - Direction: for the seed data, a one-off script with the Cloudinary Node SDK is enough. Upload endpoints for users and admins come later (phase 3), and we'll design that flow together because it touches both apps.
- [x] **2. Reading reviews requires login.** Fixed: both review lists are public; a single review (`/reviews/:id`) still needs a login.
  - Why: logged-out visitors can't see any reviews: not on a tour page, and not on the homepage, whose "Postcards from travelers" shows three reviews from `GET /reviews` (each with its tour attached, for the tour's name and where it starts). The homepage types them in until this is fixed.
  - Where: `routes/reviewRoutes.js`. Look at where `protect` sits relative to each route.
  - Direction: which review routes actually need to know who the user is? An alternative worth reading about: Mongoose "virtual populate" (covered in the course), to include reviews in `GET /tours/:id`.
- [x] **3. Production errors lose their message.** In production every AppError arrived as `{"status":"fail"}`, so the frontend's login form would show a blank error. Fixed: the production branch sends the `AppError` itself instead of a `{ ...err }` copy, which dropped `message` (it isn't enumerable). Token errors already arrive as 401 `AppError`s from `protect`.
  - Where: the production branch of `controllers/errorController.js`.
  - Direction: in the Node REPL, create an `AppError`, spread it into a new object, and log the result. What's missing, and why? (MDN: "enumerability of properties".)
- [x] **4. Seed data refresh (decided).** Every `startDates` value was in the past (2021 to early 2023), so every tour looked expired.
  - Done (2026-10-22): real tour descriptions and review texts, and photos (item 1), in the JSON files and the database. `dev-data/data/importData2.js` copies the descriptions and review texts from the files into the database without touching anything else.
  - Done (2026-11-10): future start dates in `tours.json` and the database (checked: all 9 tours match). `dev-data/data/importDates.js` copies only `startDates` (`bulkWrite` + `$set`), so it's safe to re-run. The dates are all in 2027, sorted within each tour (the tour page circles the first one as the next trip), fit each tour's season, start at 9:00 local time at the start point, and never overlap: not between departures of one tour, and no guide is on two trips at once.
  - Next time: the first tour runs out of future dates after Sep 11, 2027 (The Forest Hiker). Then: new dates in `tours.json`, and re-run `importDates.js`.
- [x] **4b. The tour stats leave tours out.** `GET /tours/stats` only counted tours rated 4.5 or more, and its `avgRating` was an average of each tour's average. Fixed (2026-11-10): the `$match` is gone, so every tour counts. `$group` sums `ratingsAverage × ratingsQuantity` into `ratingsSum`, and an `$addFields` stage after it divides that by `totalRatings`. So `avgRating` is the average over every review, and a tour with no reviews no longer adds its default 4.5.
  - Left open (optional): `ratingsSum` shows up in the response; `avgRating` isn't rounded (about 4.608 with the seed data); `$divide` when `totalRatings` is 0; the `$sort` on a single group; the unique start locations.
  - Why: the homepage's "By the numbers" shows these as the site's totals: every tour, every review, and the average rating across all of them. With the seed data, The Sports Lover (3.9) drops out of all three, so the counts come up short and the average looks better than it really is. And a tour with 3 reviews pulls the average as hard as one with 30.
  - Where: `getTourStats` in `controllers/tourController.js`.
  - Direction: which stage decides which tours get counted, and does this stat need it? (The course used it for "top tours" stats.) For the average: if you had every single review in front of you, how would you average them, and what two totals would you need from each tour to get the same result? Then read about adding a pipeline stage after `$group` that works with its results. Optional: the homepage also lists where the tours start ("Miami, Banff and Utah"); look for a `$group` accumulator that collects unique values. Small one: what does `$sort` do when there's only one group?
  - Agreed with the frontend: `data.stats[0]` keeps `toursCount`, `totalRatings` and `avgRating` (the frontend's `TourStats` type in `src/lib/tours.ts`).

### Phase 2: the tour page

- [ ] **4c. A tour's page takes two requests, one after the other.** (Kareem's call, 2026-11-05.) The frontend's tour page (`/tours/the-sea-explorer`) asks `GET /tours?slug=the-sea-explorer` for the tour, then `GET /tours/:id/reviews` for its reviews. The second has to wait for the first, because it needs the tour's `_id`.
  - Why: two round trips where one would do, and each one can hit Render's 30–60 s wake-up. The frontend also has to dig one tour out of a list (`data.docs[0]`), and "no such tour" arrives as an empty list with a 200 instead of a 404.
  - Where: `getSingleTour` in `controllers/tourController.js` (the factory's `getOne`, which already accepts populate options), `routes/tourRoutes.js`, `models/tourModel.js`.
  - Direction, the reviews: a tour doesn't store its reviews; each review points to its tour. So how can a tour `populate` something it has no field for? Look up Mongoose's "virtual populate". Then: should every tour query fill in its reviews, or only the one-tour request? (Think about `GET /tours`, which lists every tour.) And which review fields does a tour's page need?
  - Direction, the slug (recommended): the frontend's URLs use slugs, not ids. Why not accept a slug on `/:id`? How would the handler tell an id from a slug? A separate path avoids the question. Does the factory's `getOne` fit (it uses `findById`), or does this need its own handler? The `slug` field is already indexed (`tourSchema.index({ slug: 1 })`). Route order matters too: which routes could swallow the new path?
  - Agreed with the frontend: `GET /tours/slug/:slug` answers with one tour as `data.doc`, with its guides and its reviews (each review with the traveler's `name` and `photo`, like `GET /tours/:tourId/reviews` sends them today), and a 404 for an unknown slug. Keep `GET /tours/:tourId/reviews` as it is: the reviews UI (phase 4) can use it.

### Phase 3: before the auth and account pages

- [ ] **5. The signup response leaks the hashed password.**
  - Where: `signUp` in `controllers/authController.js`.
  - Direction: `password` has `select: false` in the schema. Which Mongoose operations does `select` affect, and is `create` one of them?
  - Almost fixed (2026-11-13): signup and login now send only the fields a client needs. But signup's `data` reads `user._id`, `user.name`…, and its variable is `newUser`, so it throws a ReferenceError after the account is created, and the client gets a 500.
  - Agreed with the frontend (2026-11-13): signup and login both answer `{ status, token, data: { _id, name, email, photo, role } }` (the user's fields directly in `data`). The frontend saves the name and photo in its session cookie at login, so the navbar never has to ask the API who you are.
- [ ] **6. The password-reset email links to the API.** The user would land on raw JSON instead of a page.
  - Agreed with the frontend: the email links to `FRONTEND_URL/reset-password/<token>`; that page sends `PATCH /api/v1/users/resetPassword/:token`.
  - Where: `forgotPassword` in `authController.js`, plus a new env var.
  - Also: Resend's `onboarding@resend.dev` sender only delivers to your own account email. Real users need a verified domain (see Resend's docs).
- [ ] **7. Users can't change their photo.** `updateMe` only accepts `name` and `email`. Needed for avatar upload; we'll design it together with the upload flow from item 1.

### Phase 4: before the reviews UI

- [ ] **8. Anyone can edit or delete anyone's review.**
  - Where: `updateReview` and `deleteReview` use the generic factory handlers.
  - Direction: how would the handler know who owns the review? Should admins be treated differently? And which fields should a user be allowed to change on a review at all?
- [ ] **9. Reviews don't return `createdAt`**, so the UI can't show "2 weeks ago". Where: `models/reviewModel.js`.
- [ ] **9b. Deleting a tour leaves its reviews behind.** They stay in the database, and `GET /reviews` sends them with `tour: null`. (Two old test reviews were like this; Claude deleted them on 2026-10-22.)
  - Why: every page that lists reviews (the homepage, a user's own reviews) has to skip them, or it breaks on `review.tour.name`.
  - Where: `deleteTour` in `controllers/tourController.js` uses the factory's `deleteOne`, which only runs `findByIdAndDelete`.
  - Direction: where should "also delete this tour's reviews" live: in the controller, or in a middleware on the tour model? If middleware, look up which kind of hook `findByIdAndDelete` triggers (query or document middleware), and how that hook can know which tour was deleted. Bookings (item 10) will raise the same question, plus a new one: should a tour with bookings be deletable at all?
  - Related: users. `deleteMe` only sets `active: false`, and the user find-hook hides inactive users, so their reviews come back with `user: null` too (an admin's `deleteUser` does the same, for good). Should those reviews stay, disappear, or show as written by "a former traveler"?

### Phase 5: bookings

- [ ] **10. Bookings don't exist.** No model and no payment flow, and that's the core of the platform.
  - Direction: the course's final section (Stripe Checkout + webhooks) is your guide; use Stripe test mode. Think about what a booking stores, how the API can trust that a payment really succeeded (a webhook, not the browser redirect), and capacity per start date (`maxGroupSize`).
  - Agreed with the frontend: Stripe's success and cancel URLs point to frontend pages. We'll pin down the exact URLs together when you start this.

### Before deploying to Render

- [ ] **11. Running behind a proxy.** Render puts a proxy in front of your app.
  - Direction: what does `req.ip` return behind a proxy, and what does that mean for the rate limiter? (Express docs: "Express behind proxies".)
- [ ] **12. The rate limiter vs. the Next.js server.** The frontend calls the API from Vercel's servers, so many visitors share a few IP addresses, and 100 requests/hour on all of `/api` would lock everyone out.
  - Direction: which routes need strict limits (think brute-force login attempts) and which are harmless public reads? `express-rate-limit` can be applied per route or router.
- [ ] **13. Start script.** `npm run prod` runs nodemon, a development tool. What should a production start command look like, and what does Render run by default?
  - Also: `config.env` is gitignored, so Render won't have it. The error handler in `errorController.js` only answers when `NODE_ENV` is exactly `development` or `production`. What does a client get when a request fails and `NODE_ENV` is unset? Where should Render get it from, and should the handler cope with any other value?

### Small bugs and cleanup

- [ ] **14. `AppError` is used but never imported** in `controllers/tourController.js`. What happens when someone calls a geo endpoint without coordinates?
- [ ] **15. Guide emails are public.** Every tour response includes its guides' email addresses. Where: the `populate` in `models/tourModel.js`. Which fields does a public visitor actually need?
- [x] **16. Login responds with 201.** What does 201 mean, and is anything created on login? Fixed (2026-11-13): 200.
- [ ] **16b. Some responses say `"Success"`, every other one `"success"`.** Where: `updateMe`, `deleteMe` and the `createUser` stub in `controllers/userController.js`. Nothing breaks today, because the frontend checks the HTTP status (`res.ok`), not this field; it's about one spelling everywhere. Bonus question: `deleteMe` answers with a 204. What does the client actually receive from a 204, body included? (Look up what Express does with a body on 204.)
- [ ] **17. (Optional) Consistent responses.** Payload keys vary (`data.docs`, `data.doc`, bare `data`, `data.user`; the `status` spelling is 16b). One convention makes the frontend simpler. Pagination would also benefit from a total count. (The slug endpoint that used to be here is now item 4c.)
- [ ] **18. (Optional) Forgot-password reveals which emails have accounts** ("There's no user with that email address!"). Look up "user enumeration".
- [ ] **19. (Optional) The API's `jwt` cookie is now unused.** The frontend stores the token itself (the BFF pattern), so the cookie is harmless but dead code.
- [ ] **20. (Later) The token code is written four times.** `signUp`, `login`, `resetPassword` and `updatePassword` each sign a JWT, set the `jwt` cookie and send the reply. (Kareem's call on 2026-11-13: later.)
  - Why: a fix made in one copy has to be repeated in the others, or they drift apart. Item 5's was: today signup and login send the user, and the two password routes don't.
  - Where: `controllers/authController.js`.
  - Direction: one helper that takes the user, the status code and `res`, signs the token, and sends the reply. The course calls it `createSendToken`. Which fields should it put in `data`, so every route answers the same agreed shape (item 5)? Item 19, the unused `jwt` cookie, is easy to drop at the same time.

When a fix changes an endpoint the frontend uses, mention it in a frontend session so `../frontend/CLAUDE.md` stays accurate.
