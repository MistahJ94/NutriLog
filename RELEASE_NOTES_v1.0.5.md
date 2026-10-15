# NutriLog v1.0.5 — Release Notes

## Status
Desktop interface approved after user testing on October 15, 2026. Android APK/device validation intentionally skipped at release owner's request. This does **not** constitute Android compatibility verification.

## What's new
- Redesigned Tracker dashboard with calorie progress ring and protein, carbohydrate, fat, and fiber indicators.
- Mobile bottom navigation and compact two-column More menu.
- Quick Add Food from Tracker: search saved foods/meals, select servings and date, then log.
- Food diary organized into Breakfast, Lunch, Dinner, and Snacks by local log time; historical entries also grouped. These are display-only time-of-day groups, **not** saved meal categories.
- Progress & Analytics naming and responsive styling improvements.
- Shared Progress calorie ring and responsive layout.
- Administrator account management now explains each action, with expandable controls and added confirmation for account status changes and session revocation.
- Responsive Your Foods buttons, including a compact Delete icon.
- Settings readability, accessibility, appearance controls, and session revocation confirmation.

## Compatibility and limitations
- Existing nutrition records and account data are not migrated by the UI redesign.
- Existing logs do not store a Breakfast/Lunch/Dinner/Snacks category; time-based grouping is inferred from timestamps.
- Android Back button, APK installation, native layout, and Android functionality have **not** been validated for v1.0.5.
- No automated production build or Android release test is asserted in these notes.

## Deployment
For the existing self-hosted LXC deployment, run the configured `update` command to pull and deploy the latest `main` branch.

## Android build
The GitHub Actions workflow `.github/workflows/android-apk.yml` is configured to run for version tags matching `v*`, build a signed APK, and publish it to the associated GitHub release. Creating the `v1.0.5` tag is a separate release action; it must not be represented as completed until GitHub confirms it.
