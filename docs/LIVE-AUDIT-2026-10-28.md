# Teamville live-site audit — 28 October 2026

Target: https://teamville-school-mvp.netlify.app/demo/start . Tested deployed version ddeb4d3 with fictional data in separate demonstration workspaces. No real bank transactions, messages or pupil records were used.

## Confirmed findings

| Priority | Finding | Reproduction and evidence | Status in website branch |
|---|---|---|---|
| P1 | Results, class positions, class sheets and results CSV fail on hosted PostgreSQL. | Teacher or guardian → Academics & results / Class positions. Error boundary; CSV HTTP500. Function logs show PostgreSQL 42803, digest4187884303. Query groups by pupil ID but selects names; hosted key is composite. | Fixed query grouping; regression test executes real leaderboard against PostgreSQL. Live retest required after deployment. |
| P2 | Search requires exact capitalization. | Pupil search Fikayo returns1; fikayo/FIKAYO return0. Admission TV/2026/001 works; tv/2026/001 does not. Browser and isolated HTTP confirmed. | Normalize both sides of search in website branch. |
| P2 | Incorrect pending payments cannot be cancelled or rejected. | Dara starts with NGN60,000 outstanding. Record two NGN60,000 pending payments, verify one. Other remains Pending; Verify fails amount validation, no cancel/reject control. | Open; needs audited void/reject workflow. |
| P2 | Future payment dates post immediately as paid. | Approve October salary, record actual payment date2027-01-01. Immediately markedPaid, purse dropsNGN120,000, teacher notified. | Open; reject future actual payment dates or implement scheduled payments. |
| P2 | Receipt shows UTC day as school payment date. | Payment entered shortly after midnight October28 Lagos shows October27, since receipt slices UTC created_at without timezone conversion. Cashbook explicitly labels UTC. | Open; separate actual school payment date and verification timestamp. |
| P3 | Impossible attendance URL date renders. | Attendance?date=2026-02-30 shows that date and Unmarked. Save rejects invalid calendar dates correctly. | Open; validate filter calendar dates too. |
| P3 | Concurrent duplicate admissions can return500. | Four concurrent identical admission form posts yield one admitted, two duplicate responses and one500. Only one record created. This is an HTTP stress case, not an ordinary single click. | Open; handle duplicate/race response. |

## Verified workflows

- Browser: demo start; admin/teacher/bursar/guardian role switching; school navigation; mobile drawer open/close at390px with no document overflow on tested pages.
- Browser: attendance Mark all present → save success; Fikayo correction toLate → save; guardian seesLate and only Fikayo.
- Browser: Salary/Expense toggle; staff selector updates amount120k→110k; salary submit; admin approve; bursar cash payout; voucher and correct purse decrement110k. Cancel path left Approved before confirmation; accepted path completed.
- Browser: voucher print and walkthrough print invoke window.print (intercepted to avoid printing). No physical printing or PDF appearance claim.
- Live HTTP forms: admissions invalid/valid/duplicate, assigned admission number, class/search/no-match filtering, notice validation/publication, audit persistence, parent seesnotice and only linkedpupil, enddemo redirects.
- Live HTTP forms: bank/cash pending payments, overpayment/zero/duplicate checks, verification, receiptcontents, chargeposting and duplicateprotection; debtorclass/status/search filters and CSV; openingbalance/otherincome/fundingduplicates; ledgerbalances match purse.
- Live HTTP forms: salaryautoamount ignores tamperedamount/payee; duplicateperiodblocked, reject/rerequest, expensesvalidation, approve/reject, insufficientfunds, invalidcalendardate, repeatpaymentidempotence; teacher receivesownslip/notice and correctledgerdebit.
- Live HTTP: parent cross-pupil results unavailable; teacher class tampering restricted; guardian cannot download teacher result templates/exports.

## Coverage limitations

The academic page crash blocks its scoreentry, publish, CSVupload, reportprint and leaderboardcontrols. Those did not pass and require retesting after the fix. Some equivalent repeated links were checked by destination/server action rather than individually clicking each row. Native print/download dialogs and every PDF layout were not verified. Production login is deliberately disabled in this MVP; no realaccount authentication tested. This audit does not claim every button passed.

The public school website is a subsequent request. Sample photos must remain labelled until replaced by approved Teamville images; confirmed telephone, email and streetaddress have not been supplied.
