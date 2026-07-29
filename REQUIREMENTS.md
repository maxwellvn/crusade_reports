# Project Requirements

## 1. Project Purpose

1. Provide a web application for capturing, tracking, and reporting Rhapsody End-Time Teaching Crusade activity.
2. Support both pre-crusade registration/planning and post-crusade outcome reporting.
3. Provide admin-only dashboards for reviewing crusade performance, registrations, and aggregated ministry impact.
4. Support public campaign pages and self-contained registration/reporting links for campaign participants.

## 2. Meeting Feedback Summary

1. REON should be recorded under Rhapsody.
2. Mega crusades must capture details of all ministers ministering.
3. After crusade registration, publicity must begin and daily publicity reports must capture fliers, videos, and related campaign activity.
4. Each registered crusade must have an SOP checklist before it can be confirmed, especially for network-led crusades.
5. Two SOP flows are required: crusade readiness and staff-related financials.
6. The portal must include feedback/reporting sections for churches and networks to capture physical details, outcomes, ministers, materials distributed, and other crusade details.
7. The portal should include live counters, similar to a world clock or "race for the last man" display, for souls won and Rhapsody distributed.
8. Every church and network must have a unique link.
9. Registered crusades must be editable.
10. Crusades must be cancellable with reasons and supporting evidence.
11. Each crusade should be treated as a project with tracking phases, periodic reports, reminders, and evidence.
12. Evidence should include short videos or reels of crusades in progress.
13. Financing issues related to crusades and materials should not be captured in the portal.
14. Sponsorship, costs, expenses, and individual network/church contributions were also requested for capture, creating a finance-scope decision that must be resolved.
15. Every individual crusade must have its own details page or record on the portal.
16. A separate coordinating-team dashboard is required for challenges, updates, and efficient tracking.
17. Collaborators for each crusade must be captured, including collaborator type and identity.
18. Crusades should be registered at least one week before the crusade date, with warnings or tooltips when this is not met.
19. Every crusade must include a post-crusade plan for baptism, foundation school, cells, soul integration, and follow-up conclusion reports.
20. Post-crusade reporting should happen within 24 to 48 hours.
21. Super-admins should be assigned for each network, zone, or crusade to own project status updates and reporting.

## 3. User Groups

1. Public visitors should be able to view the campaign landing page.
2. Crusade organizers should be able to register planned crusades before an event.
3. Report submitters should be able to submit completed crusade reports.
4. Administrators should be able to access dashboards, registrations, reports, crusade records, and zone-link management.
5. Zone or network leaders should be able to access token-scoped dashboards through generated capability links.
6. Coordinating team members should be able to monitor crusade progress, challenges, evidence, publicity, and follow-up status.
7. Church and network users should be able to access their own unique links for registration, updates, reporting, and tracking.
8. Network, zone, or crusade super-admins should be able to manage assigned crusade projects, update project status, and submit required reports.

## 4. Public Campaign Requirements

1. The application must provide a public landing page for "A Night of a Thousand Crusades".
2. The campaign landing page must link users to the crusade registration flow.
3. Public campaign routes must be self-contained and must not expose admin navigation.
4. Public pages must use the project branding and logo assets.

## 5. Crusade Registration Requirements

1. Users must be able to register planned crusades through a public registration form.
2. Registration must support organization types: zone, group, church, cell, and network.
3. Zone must be required for zone, group, church, and cell registrations.
4. Group must be required for group, church, and cell registrations.
5. Church must be required for church and cell registrations.
6. Cell name must be required for cell registrations.
7. Network name must be required for network registrations.
8. Country must be required for every registration.
9. Plan date must be required for every registration.
10. A registration must include at least one planned crusade item.
11. Each planned crusade item must include a crusade type and planned count.
12. Planned count must be an integer greater than or equal to 1.
13. Mega crusade registration items must require the minister name.
14. Planned crusade items may include city and city place ID.
15. Registration data must be stored as one submission row plus one fact-table item row per planned crusade type.
16. Every registered crusade must be treated as an individual project record.
17. Every registered crusade must have its own detailed portal record.
18. Crusades should be registered at least seven days before the planned crusade date.
19. If a user registers a crusade less than seven days before the planned date, the portal must show a warning or tooltip.
20. Registered crusades must support editing after submission.
21. Registered crusades must support cancellation.
22. Cancellation must capture a cancellation reason.
23. Cancellation must support uploading or linking supporting evidence.
24. Mega crusades must support capturing multiple minister details, not only one minister name.
25. Each registered crusade must be confirmable only after required SOP checklist items are completed.
26. Network-led crusades must have checklist-driven confirmation before proceeding.

## 6. Crusade Reporting Requirements

1. Users must be able to submit completed crusade reports through a public reporting form.
2. The report form must support organization types: zone, group, church, and network.
3. Zone must be required for zone, group, and church reports.
4. Group must be required for group and church reports.
5. Church name must be required for church reports.
6. Network name must be required for network reports.
7. Country must be required for every report.
8. A report must include at least one crusade.
9. Each crusade must capture whether it was physical or online.
10. Online-native crusade types should default to online format.
11. Each crusade must include crusade type, event name, city, event date, attendance, minister name, and venue.
12. The "Other" crusade type must require a specific custom crusade type description.
13. Report outcomes must be captured per crusade, not only at report level.
14. Outcome metrics must support onsite attendance, online participation, salvations, Holy Spirit baptisms, water baptisms, Rhapsody distributed, Bibles distributed, radio/TV reach, testimonies recorded, TAP2read distributed, NTYBA distributed, and Healing to the Nations Magazine distributed.
15. Outcome metric values must be non-negative integers.
16. Highlights and media links may be captured as optional report-level fields.
17. The form may show plausibility warnings, but unusual values should not automatically block submission.
18. Report data must be stored as one report row plus one fact-table crusade row per crusade.
19. The portal must support church and network feedback sections for completed crusades.
20. Completed crusade feedback must capture physical details of the crusade as it happened.
21. Completed crusade feedback must capture souls won.
22. Completed crusade feedback must capture materials distributed.
23. Completed crusade feedback must capture ministers who attended or ministered.
24. Completed crusade feedback must capture any additional relevant event details.
25. Each crusade should be reported within 24 to 48 hours after the event.
26. The portal should flag or track late reports after the 24 to 48 hour reporting window.
27. Evidence for completed crusades should support short videos, reels, or media links.
28. Each individual crusade must maintain its own report details, not only grouped submission details.

## 7. Crusade Type Requirements

1. The system must support Mega Crusades.
2. The system must support TAP2read Crusades.
3. The system must support Youths Aglow Crusades.
4. The system must support Teevolution Crusades.
5. The system must support Say Yes To Kids Crusades.
6. The system must support No One Left Behind Crusades.
7. The system must support Leading Ladies Crusades.
8. The system must support Mighty Men Crusades.
9. The system must support Specialized Crusades to Professionals.
10. The system must support TV, Radio, Social Media, Online, and MyStreamSpace Crusades.
11. The system must support Mall, School, Hospital, Street, Prison, Transport Station, Village, Community, and Football Stadium Crusades.
12. The system must support an "Other" option with a required custom label.

## 8. Data Model Requirements

1. SQLite must be used as the application database.
2. The database must run in WAL mode.
3. Reports must store submitter and organizational context.
4. Crusades must be stored as the single source of truth for completed crusade metrics.
5. Registration submissions must store pre-crusade planning context.
6. Registration items must be stored as the single source of truth for planned crusade counts.
7. Attribution fields must be denormalized onto crusade and registration item rows for direct aggregation.
8. Dashboard totals must aggregate from fact tables using grouped queries.
9. Derived aggregate columns should be avoided where they can drift from the source data.
10. Networks must be stored in SQLite and seeded idempotently.
11. Zone and network capability-link tokens must be stored in SQLite.
12. Crusade search must support full-text search across human-readable crusade fields.
13. City coordinates should be backfilled from city place IDs for geographic dashboards.
14. REON must be categorized under Rhapsody.
15. Each crusade must have a unique project-level identifier.
16. Each crusade must support lifecycle status tracking.
17. Required lifecycle statuses should include at least registered, SOP pending, confirmed, publicity active, completed, reported, follow-up active, follow-up concluded, and cancelled.
18. Each crusade must support storing multiple ministers.
19. Each crusade must support storing multiple collaborators.
20. Collaborators must include collaborator type, such as zone, network, group, church, or campaign.
21. Collaborators must include collaborator identity or name.
22. Each crusade must support evidence records such as fliers, videos, reels, links, cancellation evidence, and post-crusade evidence.
23. Each crusade must support periodic update records.
24. Each crusade must support challenge records for coordinating-team review.
25. Each crusade must support post-crusade follow-up plan records.
26. Each crusade must support post-crusade follow-up conclusion report records.

## 9. Admin Requirements

1. Admin dashboard routes must require an admin key.
2. Admin API read endpoints for reports, registrations, stats, crusades, and dashboard management must require an admin key.
3. Public writes for registration and report submission must remain accessible without admin authentication.
4. Admin users must be able to view dashboard analytics.
5. Admin users must be able to view all crusades.
6. Admin users must be able to view registrations.
7. Admin users must be able to view live registration activity.
8. Admin users must be able to generate and manage zone or network dashboard links.
9. Admin dashboard layout must be persistable in the database.
10. Admin users must be able to view and manage individual crusade project records.
11. Admin users must be able to review edited registrations.
12. Admin users must be able to review cancelled crusades with reasons and evidence.
13. Admin users must be able to view SOP completion status.
14. Admin users must be able to view publicity reporting status.
15. Admin users must be able to view post-crusade reporting compliance against the 24 to 48 hour target.
16. Admin users must be able to view post-crusade follow-up status.
17. Admin users must be able to assign super-admins to networks, zones, or individual crusades.
18. Admin users must be able to review project status updates made by super-admins.
19. Admin users must be able to audit reporting activity by assigned super-admin.

## 10. Dashboard and Analytics Requirements

1. The dashboard must show overall crusade totals.
2. The dashboard must show total reports submitted.
3. The dashboard must aggregate crusades by format, category, organization type, zone, group, church, network, country, city, and month.
4. Dashboard ranking should consider combined onsite attendance and online attendance where appropriate.
5. The dashboard must distinguish onsite attendance from online participation.
6. The dashboard must include planned-versus-held data using registrations and reported crusades.
7. The dashboard must expose recent report activity.
8. Live registration dashboard data must include totals, planned counts, countries, types, type breakdown, country breakdown, geographic points, and recent registrations.
9. Geographic dashboards must use geocoded city points where available.
10. The portal must provide real-time or near-real-time counters for souls won.
11. The portal must provide real-time or near-real-time counters for Rhapsody distributed.
12. Live counters should support a public-facing "race for the last man" or world-clock-style display.
13. Dashboard metrics must count each church or network contribution toward that church or network.
14. Dashboards must show individual crusade project status.
15. Dashboards must show publicity progress.
16. Dashboards must show SOP readiness progress.
17. Dashboards must show post-crusade follow-up progress.

## 11. Project Tracking Requirements

1. Each crusade must be tracked as a project from registration through follow-up conclusion.
2. Each crusade project must have phases.
3. Required project phases should include registration, readiness/SOP, publicity, confirmation, crusade execution, reporting, and post-crusade follow-up.
4. Each crusade project must support periodic status reports.
5. Each crusade project must support reminders for required actions.
6. Reminders should cover SOP completion, publicity reporting, crusade date readiness, 24 to 48 hour reporting, and post-crusade follow-up reporting.
7. Each crusade project must support challenge reporting.
8. Challenge reports must be visible to the coordinating team.
9. Each crusade project must support update history for audit and tracking.
10. Each crusade project must have one or more assigned owners or super-admins.
11. Assigned super-admins must be able to toggle a crusade project on or off where applicable.
12. Assigned super-admins must be able to mark a crusade project as ongoing.
13. Assigned super-admins must be able to mark a crusade project as completed.
14. Assigned super-admins must be able to update the active project phase.
15. Assigned super-admins must be responsible for submitting or coordinating the required reports for their assigned crusades.
16. Project status changes must record who made the change and when it was made.

## 12. Super-Admin Requirements

1. The portal must support super-admin users for networks, zones, or individual crusades.
2. A network super-admin must be able to manage crusade projects assigned to that network.
3. A zone super-admin must be able to manage crusade projects assigned to that zone.
4. A crusade super-admin must be able to manage only the specific crusade projects assigned to them.
5. Super-admins must be able to update project status.
6. Super-admins must be able to toggle assigned projects on or off where applicable.
7. Super-admins must be able to mark assigned projects as ongoing.
8. Super-admins must be able to mark assigned projects as completed.
9. Super-admins must be able to submit or update reports for assigned projects.
10. Super-admins must be able to update publicity reports, SOP progress, challenges, evidence, and post-crusade follow-up for assigned projects.
11. Super-admin permissions must be scoped to their assigned network, zone, or crusade.
12. Super-admin activity must be auditable.

## 13. SOP and Confirmation Requirements

1. The portal must provide an SOP checklist for registered crusades.
2. The SOP checklist must be completed before a crusade can be confirmed.
3. The SOP checklist must be especially clear for network-led crusades.
4. The portal must support a crusade-readiness SOP.
5. The portal must support a staff-related financials SOP, subject to final finance-scope decision.
6. SOP completion status must be visible on the crusade project record.
7. SOP completion status must be visible on admin and coordinating-team dashboards.

## 14. Publicity Requirements

1. Publicity must begin after crusade registration.
2. The portal must support daily publicity reporting for each registered crusade.
3. Daily publicity reports must capture fliers.
4. Daily publicity reports must capture videos.
5. Daily publicity reports should capture other publicity activities and updates.
6. Publicity evidence should be attached as files or provided as media links, depending on final media handling decisions.
7. Publicity progress must be visible on the crusade project record.
8. Publicity progress must be visible to administrators and coordinating team members.

## 15. Unique Link Requirements

1. Every church must have a unique portal link.
2. Every network must have a unique portal link.
3. Unique links should scope users to their church or network.
4. Unique links should support registration, project updates, reporting, and status visibility for the scoped church or network.
5. Unique links must not expose unrelated churches, networks, zones, or admin-wide data.

## 16. Collaboration Requirements

1. Every crusade must support collaborator tracking.
2. Collaborators may include zones, networks, groups, churches, and campaigns.
3. The number of collaborators must be captured for each crusade.
4. The identity of each collaborator must be captured for each crusade.
5. Collaborator contributions must be attributable to each collaborator where applicable.
6. Collaboration data must be visible on individual crusade details.
7. Collaboration data should be available for dashboard aggregation.

## 17. Coordinating-Team Dashboard Requirements

1. The portal must provide a separate dashboard for the coordinating team.
2. The coordinating-team dashboard must show each crusade and its current phase.
3. The coordinating-team dashboard must show reported challenges.
4. The coordinating-team dashboard must show recent updates.
5. The coordinating-team dashboard must show SOP readiness.
6. The coordinating-team dashboard must show publicity activity.
7. The coordinating-team dashboard must show cancellations and cancellation evidence.
8. The coordinating-team dashboard must show overdue reports.
9. The coordinating-team dashboard must support efficient tracking across zones, networks, groups, churches, and campaigns.

## 18. Post-Crusade Follow-Up Requirements

1. Every crusade must have a post-crusade plan.
2. The post-crusade plan must include baptism follow-up.
3. The post-crusade plan must include foundation school follow-up.
4. The post-crusade plan must include cell integration.
5. The post-crusade plan must include soul integration.
6. The post-crusade plan may include other follow-up activities.
7. The conclusion of each post-crusade plan must be reportable.
8. Post-crusade conclusion reports must be linked to the individual crusade.
9. Post-crusade follow-up status must be visible on dashboards.

## 19. Finance and Contribution Requirements

1. The meeting feedback contains conflicting finance requirements that must be resolved before implementation.
2. One requirement states that financing issues related to crusades and materials should not be captured in the portal.
3. Another requirement asks that sponsorship, costs, expenses, and individual network/church contributions be captured so each contribution counts personally.
4. Until resolved, the portal should separate finance-related requirements into a pending decision area.
5. If finance capture is approved, the portal must distinguish contribution tracking from sensitive financing issues.
6. If finance capture is approved, sponsorship and cost/expense records must be linked to individual churches, networks, and crusades.
7. If finance capture is rejected, finance-related SOP items must be removed or converted to non-financial readiness checks.

## 20. Import Requirements

1. The system must provide an app-generated XLSX import template.
2. The import template must include category dropdowns and instructions.
3. Template generation and validation must share the same constants used by the form.
4. Users must be able to upload a completed import template.
5. The import flow must support preview validation.
6. The import flow must report row-level errors.
7. The import flow must only commit data when explicitly requested.
8. Imported reports must use the same insertion path and validation rules as form-submitted reports.

## 21. Location and Organization Data Requirements

1. Countries must come from a static ISO country list endpoint.
2. Country selection should allow browsing on open.
3. City search must use Google Places API through a server-side proxy.
4. Google Places API keys must not be exposed to the browser.
5. City autocomplete should support country filtering.
6. Zones and groups must be fetched from the configured zones URL.
7. Zone and group data must be normalized.
8. Zone and group data must be cached in memory for one hour.
9. A local JSON fallback cache must be available for zones and groups.

## 22. API Requirements

1. The API must expose a health endpoint.
2. The API must support report submission.
3. The API must support admin report listing and report detail retrieval.
4. The API must support admin crusade listing and search.
5. The API must support dashboard statistics.
6. The API must support country listing.
7. The API must support network listing and creation.
8. The API must support zone and group lookup.
9. The API must support Google Places autocomplete through a server-side endpoint.
10. The API must support import template download.
11. The API must support import preview and commit.
12. The API must support registration submission.
13. The API must support admin registration listing and live registration analytics.
14. The API must support token-scoped zone or network portal access.
15. The API must support crusade project detail retrieval.
16. The API must support editing registered crusades.
17. The API must support cancelling registered crusades with reason and evidence.
18. The API must support SOP checklist retrieval and updates.
19. The API must support daily publicity reports.
20. The API must support periodic project updates.
21. The API must support challenge reports.
22. The API must support collaborator management.
23. The API must support post-crusade follow-up plans and conclusion reports.
24. The API must support live counter data for souls won and Rhapsody distributed.
25. The API must support unique church and network portal links.
26. The API must support assigning super-admins to networks, zones, and crusades.
27. The API must support scoped super-admin project status updates.
28. The API must support super-admin report submission for assigned crusades.
29. The API must expose audit history for project status and reporting updates.

## 23. Security Requirements

1. Admin-only UI routes must be protected by an admin gate.
2. Admin-only API endpoints must validate the `x-admin-key` header.
3. The server must return safe client-facing error messages.
4. Full error details may be logged server-side for debugging.
5. Google Places credentials must remain server-side.
6. Zone or network dashboard links must use unguessable tokens.
7. Token-scoped portal queries must only return data for the mapped zone or network.
8. Church and network unique links must be unguessable or otherwise access-controlled.
9. Church and network unique links must restrict users to scoped data.
10. Evidence uploads or links must be validated to reduce abuse.
11. Cancellation evidence must be visible only to permitted users.
12. Finance or contribution data, if approved, must have stricter access rules than general crusade status data.
13. Super-admin access must be scoped to assigned networks, zones, or crusades.
14. Super-admins must not be able to manage unassigned crusades.
15. Super-admin status changes and reports must be logged for audit.
16. Global admins must be able to revoke or change super-admin assignments.

## 24. Deployment Requirements

1. The application must support Dockerfile-based deployment.
2. The production server must serve both the built React client and API from one Express process.
3. The production service must listen on port 4000 unless configured otherwise.
4. Required environment variables must include `GOOGLE_PLACES_API_KEY`, `ZONES_URL`, and `ADMIN_KEY`.
5. SQLite data must be stored in the `data` directory.
6. Production deployments must mount persistent storage at `/app/data`.
7. The deployment health check must call `/api/health`.

## 25. Non-Functional Requirements

1. The application must use server-side validation for all writes.
2. Client-side validation should mirror server validation to improve user experience.
3. Data writes that create parent and fact rows must be transactional.
4. Dashboards should aggregate from source fact tables to prevent data drift.
5. The app should remain usable on mobile and desktop viewports.
6. Public, reporting, admin, and zone-portal surfaces should remain navigationally separate.
7. Logs should include useful server-side context while keeping client errors safe.
8. Live counters should update quickly enough to feel active during crusade reporting periods.
9. Reminder workflows should be reliable and auditable.
10. Evidence handling should support lightweight mobile uploads or links because many updates may happen from the field.
11. Individual crusade detail pages should be easy to scan by phase, status, collaborators, evidence, and next required action.
12. Super-admin status controls should be simple and fast to use from mobile devices.
13. Super-admin-scoped dashboards should clearly show assigned projects and next required reporting actions.

## 26. Open Items

1. Confirm whether binary media uploads are required or whether media links are sufficient.
2. Confirm whether additional network names must be seeded by default.
3. Confirm whether role-based user accounts are required beyond the current admin-key model.
4. Confirm whether the admin dashboard should support export/download functionality.
5. Confirm whether completed crusade reports should support editing or deletion after submission.
6. Confirm whether the README note saying "No admin/dashboard UI yet" should be updated, because admin dashboard routes now exist.
7. Resolve whether finance, sponsorship, cost, and expense details should be captured in the portal.
8. Define the exact crusade-readiness SOP checklist items.
9. Define the exact staff-related financials SOP checklist items, if finance capture remains in scope.
10. Define the required evidence types and maximum file/link rules for fliers, videos, reels, and cancellation evidence.
11. Define who can access the coordinating-team dashboard.
12. Define whether reminders should be in-app only, email, SMS, WhatsApp, or another channel.
13. Define whether live counters should be public, admin-only, or available through selected campaign displays.
14. Define whether church and network unique links should require passwords, tokens only, or user accounts.
15. Define whether super-admins should authenticate through user accounts, secure links, or another access method.
16. Define whether each crusade requires exactly one super-admin or can have multiple super-admins.
17. Define which project statuses are final and which can be reversed by a super-admin.
