# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Public campaign participants register and report individual Rhapsody End-Time Teaching Crusades.
- Zonal Pastors use the Mission Nation Selection Portal to state one preferred mission nation outside their zone's home nation.
- Zone, Group, and Church teams register presenters, cameramen, and technical personnel for the August 24 Global Media Training.
- Approved administrators review campaign operations. Super administrators manage restricted settings and destructive actions.

## Product Purpose

The portal coordinates crusade planning, reporting, and mission-nation responsibility for A Night of a Thousand Crusades. The Mission Nation Selection workflow gathers preferences across 242 nations, with a proposed minimum commitment of 1,000 crusades per preference, before administrators make final assignments.

## Operating Context

Zonal Pastors identify their zone, contact details, KingsChat username, and zone home nation before choosing a preferred mission nation. The zone home nation is self-declared because the upstream zone directory does not provide country data. Multiple zones may prefer the same nation. Pastors who do not submit during the open window may later have a nation designated to them.

## Capabilities and Constraints

- The mission-nation catalogue uses the existing geolocation-compatible 242-country inventory.
- A Zonal Pastor cannot select the nation they declare as their zone's home nation.
- Each zone can submit one active preference; multiple zones may prefer the same mission nation.
- Administrators can assign, reassign, or clear a zone's final mission nation independently of its submitted preference.
- Every selected nation carries a minimum commitment of 1,000 crusades.
- The delegation notice about assigning local church tasks to Group Pastors is informational and never blocks submission.
- Successful submissions produce a direct confirmation receipt.
- Admin users can review, filter, export, and make final assignments; selection-window controls and destructive actions are super-admin only.
- Each Global Media Training trainee selects their Zone and may optionally identify their Group and Church, then enters their media role and contact details; approved admins can filter by Zone and export the combined roster.

## Brand Commitments

The product remains part of the Rhapsody End-Time Teaching Crusades and A Night of a Thousand Crusades campaign, using the existing campaign logo, language, and visual system.

## Evidence on Hand

- Existing campaign logo and imagery under `client/public/`.
- Existing 242-entry country catalogue in `server/routes/countries.js`.
- Existing zone directory integration in `server/routes/zones.js`.
- Existing KingsChat-backed admin authorization.

## Product Principles

- Make responsibility and availability unambiguous.
- Enforce allocation rules on the server, not only in the interface.
- Preserve a clear receipt for every commitment.
- Keep operational notices visible without turning information into form friction.
- Match public and admin workflows to the established campaign portal.

## Accessibility & Inclusion

Public and administrative workflows must remain keyboard accessible, responsive, and understandable without relying on color alone.
