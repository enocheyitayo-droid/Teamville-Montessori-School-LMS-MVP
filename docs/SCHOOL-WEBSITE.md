# Teamville public school website

The main URL now opens the public school introduction. `/portal` is the demo access entrance; `/demo/start` remains the head-of-school walkthrough. The Student / Parent button creates a private fictional workspace in the existing guardian role, linked to Fikayo. It does not create or authenticate a real student account. Staff can select administrator, teacher or bursar.

## Content and photos

Public layout: school introduction, values, about, nursery/primary learning stages, admissions steps, gallery, portal introduction, contact/FAQ and footer. Navigation, photo filters, native gallery dialog and mobile menu are interactive. Contact details, testimonials, admission dates, facilities and examination statistics have not been invented.

The six Teamville images supplied by the user on 28 October 2026 replace all stock photography. Originals are copied unchanged into `public/school/`: the Class of 2026 group photo, pupils with a staff member, early-years graduation, stage performance, cap-throw celebration and the 2026/2027 admissions flyer. The TikTok browser screenshot is used only as a reference for contact details; browser chrome and unrelated tabs are not published.

The hero uses the Class of 2026 group photo. The admissions flyer is displayed uncropped and links to its full-size original. Gallery cards open the full photograph in a dialog, preserving its aspect ratio. CSS controls only the displayed card framing.

The supplied profile screenshot lists Bodija, Ibadan, telephone `0803 854 8782` and TikTok `@teamville_montessorisch`; the website now has `tel:+2348038548782` and the school profile link. No email or street address was inferred. The official logo remains `public/brand/teamville-logo.png`.

## Checks

- 39 tests pass, including a new PostgreSQL regression test that executes the real class-position query against composite pupil keys for both midterm and exam.
- Lint passes; final production build checked separately.
- Browser checked desktop and390px mobile layout, no document overflow, menu open/close and anchor navigation, Learning gallery filter, photo modal open/close, portal entrance and pupil results navigation.
- Academic SQL grouping and case-insensitive pupil search corrected from the live audit. Other audit findings remain tracked in `LIVE-AUDIT-2026-10-28.md`.

Demo access requires `ENABLE_DEMO=true` in the deployed Functions environment. It is intentionally separate from real Supabase school authentication. The public route is available without a demo cookie.
