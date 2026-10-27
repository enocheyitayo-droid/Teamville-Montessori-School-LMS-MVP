# Teamville public school website

The main URL now opens the public school introduction. `/portal` is the demo access entrance; `/demo/start` remains the head-of-school walkthrough. The Student / Parent button creates a private fictional workspace in the existing guardian role, linked to Fikayo. It does not create or authenticate a real student account. Staff can select administrator, teacher or bursar.

## Content and photos

Public layout: school introduction, values, about, nursery/primary learning stages, admissions steps, gallery, portal introduction, contact/FAQ and footer. Navigation, photo filters, native gallery dialog and mobile menu are interactive. Contact details, testimonials, admission dates, facilities and examination statistics have not been invented.

Temporary photographs are explicitly labelled, locally served and credited:

- `public/school/children-learning.jpg`: Annie Spratt, https://unsplash.com/photos/WwSX_X4GrAA
- `public/school/classroom.jpg`: Doug Linstedt, https://unsplash.com/photos/jEEYZsaxbH4

Replace these with approved Teamville photographs and update the descriptions/credits in `src/components/school-website.tsx`. The supplied official logo remains `public/brand/teamville-logo.png`. Confirm the school's telephone, email and street address before replacing the contact note.

## Checks

- 39 tests pass, including a new PostgreSQL regression test that executes the real class-position query against composite pupil keys for both midterm and exam.
- Lint passes; final production build checked separately.
- Browser checked desktop and390px mobile layout, no document overflow, menu open/close and anchor navigation, Learning gallery filter, photo modal open/close, portal entrance and pupil results navigation.
- Academic SQL grouping and case-insensitive pupil search corrected from the live audit. Other audit findings remain tracked in `LIVE-AUDIT-2026-10-28.md`.

Demo access requires `ENABLE_DEMO=true` in the deployed Functions environment. It is intentionally separate from real Supabase school authentication. The public route is available without a demo cookie.
