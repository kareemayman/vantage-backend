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

## Fix checklist

Roughly in the order the frontend needs them. Each item says what's wrong, why it matters, where to look, and a direction to explore, never the solution. "Agreed with the frontend" lines are contracts between the two apps, not hints.

### Phase 1: before the frontend can show real data

- [ ] **0. Port clash.** The API listens on 3000, which is also Next.js's default dev port.
  - Where: `config.env`, `server.js`.
  - Direction: give the API its own port, and check that the startup log reports the real one.
- [ ] **1. Images don't exist anywhere.** `imageCover`, `images`, and `photo` are bare filenames (`tour-2-cover.jpg`) that nothing serves.
  - Why: the frontend can't render a single tour card or avatar.
  - Agreed with the frontend: images live on Cloudinary, and the API stores Cloudinary **public IDs** (e.g. `vantage/tours/the-sea-explorer/cover`), not full URLs. The frontend builds sized URLs from them.
  - Direction: for the seed data, a one-off script with the Cloudinary Node SDK is enough. Upload endpoints for users and admins come later (phase 3), and we'll design that flow together because it touches both apps.
- [ ] **2. Reading reviews requires login.**
  - Why: logged-out visitors can't see any reviews: not on a tour page, and not on the homepage, whose "Postcards from travelers" shows three reviews from `GET /reviews` (each with its tour attached, for the tour's name and where it starts). The homepage types them in until this is fixed.
  - Where: `routes/reviewRoutes.js`. Look at where `protect` sits relative to each route.
  - Direction: which review routes actually need to know who the user is? An alternative worth reading about: Mongoose "virtual populate" (covered in the course), to include reviews in `GET /tours/:id`.
- [ ] **3. Production errors lose their message.** In production every AppError arrives as `{"status":"fail"}`, so the frontend's login form would show a blank error.
  - Where: the production branch of `controllers/errorController.js`.
  - Direction: in the Node REPL, create an `AppError`, spread it into a new object, and log the result. What's missing, and why? (MDN: "enumerability of properties".)
- [ ] **4. Seed data refresh (decided).** Every `startDates` value is in 2021, so every tour looks expired, and the text is lorem ipsum: the tour descriptions and every review (the homepage shows the design's quotes in their place for now).
  - Where: `dev-data/data/*.json`.
  - Direction: future dates, real destinations and descriptions that fit Vantage's summer/travel identity, and on-theme photos (which feed item 1). Keep the model validators in mind (tour names are 10–40 characters, etc.).
- [ ] **4b. The tour stats leave tours out.** `GET /tours/stats` only counts tours rated 4.5 or more, and its `avgRating` is an average of each tour's average.
  - Why: the homepage's "By the numbers" shows these as the site's totals: every tour, every review, and the average rating across all of them. With the seed data, The Sports Lover (3.9) drops out of all three, so the counts come up short and the average looks better than it really is. And a tour with 3 reviews pulls the average as hard as one with 30.
  - Where: `getTourStats` in `controllers/tourController.js`.
  - Direction: which stage decides which tours get counted, and does this stat need it? (The course used it for "top tours" stats.) For the average: if you had every single review in front of you, how would you average them, and what two totals would you need from each tour to get the same result? Then read about adding a pipeline stage after `$group` that works with its results. Optional: the homepage also lists where the tours start ("Miami, Banff and Utah"); look for a `$group` accumulator that collects unique values. Small one: what does `$sort` do when there's only one group?
  - Agreed with the frontend: `data.stats[0]` keeps `toursCount`, `totalRatings` and `avgRating` (the frontend's `TourStats` type in `src/lib/tours.ts`).

### Phase 3: before the auth and account pages

- [ ] **5. The signup response leaks the hashed password.**
  - Where: `signUp` in `controllers/authController.js`.
  - Direction: `password` has `select: false` in the schema. Which Mongoose operations does `select` affect, and is `create` one of them?
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

### Small bugs and cleanup

- [ ] **14. `AppError` is used but never imported** in `controllers/tourController.js`. What happens when someone calls a geo endpoint without coordinates?
- [ ] **15. Guide emails are public.** Every tour response includes its guides' email addresses. Where: the `populate` in `models/tourModel.js`. Which fields does a public visitor actually need?
- [ ] **16. Login responds with 201.** What does 201 mean, and is anything created on login?
- [ ] **17. (Optional) Consistent responses.** Payload keys vary (`data.docs`, `data.doc`, bare `data`, `data.user`, and `"success"` vs `"Success"`). One convention makes the frontend simpler. Pagination would also benefit from a total count, and a `GET /tours/slug/:slug` endpoint (today the frontend filters with `?slug=`).
- [ ] **18. (Optional) Forgot-password reveals which emails have accounts** ("There's no user with that email address!"). Look up "user enumeration".
- [ ] **19. (Optional) The API's `jwt` cookie is now unused.** The frontend stores the token itself (the BFF pattern), so the cookie is harmless but dead code.

When a fix changes an endpoint the frontend uses, mention it in a frontend session so `../frontend/CLAUDE.md` stays accurate.
