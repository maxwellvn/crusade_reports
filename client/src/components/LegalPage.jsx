import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Mail, Phone } from "lucide-react";

const CONTACT = {
  email: "info@rhapsodycrusades.org",
  phone: "+1 (469) 656-1284",
  phoneHref: "+14696561284",
};

function ContactBlock() {
  return (
    <div className="mt-12 border-t border-slate-200 pt-8">
      <h2 className="text-xl font-medium tracking-[-0.02em] text-slate-950">Contact us</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        Questions about these terms or how your information is handled can be sent to the NOTC platform team:
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a href={`mailto:${CONTACT.email}`} className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4">
          <Mail className="size-4" />{CONTACT.email}
        </a>
        <a href={`tel:${CONTACT.phoneHref}`} className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4">
          <Phone className="size-4" />{CONTACT.phone}
        </a>
      </div>
    </div>
  );
}

function LegalSection({ number, heading, blocks }) {
  return (
    <section className="border-t border-slate-200 py-8 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-950"><span className="mr-3 inline-flex size-8 items-center justify-center rounded-full bg-blue-50 align-middle text-sm font-bold text-blue-700">{number}</span>{heading}</h2>
      {blocks.map((block, i) => (
        Array.isArray(block) ? (
          <ul key={i} className="mt-4 space-y-2.5">
            {block.map((item, j) => (
              <li key={j} className="flex max-w-3xl items-start gap-3 text-sm leading-6 text-slate-600">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{block}</p>
        )
      ))}
    </section>
  );
}

function LegalShell({ eyebrow, title, updated, lead, sections, footerNote }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4"><img src="/logo.png" alt="" className="h-10 w-auto" /><span className="hidden truncate text-sm font-semibold sm:block">{title}</span></Link>
          <Link to="/" className="ml-auto text-sm font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4">Return home</Link>
        </div>
      </header>
      <main className="bg-white">
        <section className="border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
            <p className="text-sm font-semibold text-blue-700">{eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-normal leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-6xl">{title}</h1>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">Effective {updated}</p>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{lead}</p>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-3xl">
            {sections.map((section, i) => <LegalSection key={i} number={String(i + 1).padStart(2, "0")} {...section} />)}
            {footerNote && <p className="mt-10 max-w-3xl border-l-2 border-blue-600 pl-4 text-sm font-medium leading-6 text-slate-700">{footerNote}</p>}
            <ContactBlock />
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <p>© 2026 Rhapsody End-Time Teaching Crusades. All rights reserved.</p>
          <nav className="flex gap-4">
            <Link to="/privacy" className="font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">Privacy Policy</Link>
            <Link to="/terms" className="font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">Terms of Service</Link>
            <a href="https://rhapsodycrusades.org" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">rhapsodycrusades.org <ArrowUpRight className="size-3" /></a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell
      eyebrow="Night of a Thousand Crusades (NOTC)"
      title="Privacy Policy"
      updated="14 August 2026"
      lead="This Privacy Policy explains how Rhapsody End-Time Teaching Crusades ('RETC', 'we', 'us') collects, uses, stores, and protects your personal information when you visit or use the Night of a Thousand Crusades (NOTC) platform at notc.rhapsodycrusades.org, including the registration, reporting, and administration services it provides."
      sections={[
        {
          heading: "Information we collect",
          blocks: [
            "We collect the information you provide directly through our forms and services. Depending on the service you use, this may include:",
            [
              "Contact details — your name, email address, phone number, country code, and KingsChat username.",
              "Organisation details — the zone, group, church, cell, or network you represent, and for Blue Elite staff, your department.",
              "Crusade registration details — the type, name, date, venue, country and city of each crusade, expected attendance, collaborating teams, estimated budget, planned Rhapsody copies, permits, and media plans.",
              "Crusade reports — verified outcomes including attendance, salvations, Holy Spirit infillings, water baptisms, materials distributed, online participation, highlights, and evidence links or photos.",
              "Media training registration — your name, role, languages spoken, organisation, country and city, email, phone, and KingsChat username.",
              "Mission trip applications — your name, contact details, organisation, passport country and additional passports, passport expiry date, and medical and travel confirmations.",
              "Mission nation selection — your minister type, name, zone or ministry, home and preferred mission countries, and contact details.",
              "Upcoming crusade interests — your designation, name, zone or group, passport country, and the opportunities you are interested in.",
            ],
            "Authentication information. When you sign in to access the administration or zone areas, we authenticate you through your KingsChat account. We receive your KingsChat username and public profile details to verify that you are an approved user.",
            "Photos. The campaign avatar tool processes your photo entirely within your browser and does not upload it to our servers. Photos attached to crusade reports are uploaded to our servers, validated by file type, and are private to approved report administrators.",
            "Technical information. We do not log IP addresses, and our server logs are configured to redact personal identifiers such as email addresses and phone numbers.",
          ],
        },
        {
          heading: "Cookies and local storage",
          blocks: [
            "We use cookies and browser storage for authentication, preferences, and convenience:",
            [
              "kc_access_token and dashboard_session — set when you sign in through KingsChat to access the administration area; they are HTTP-only, secure in production, and expire after 7 days.",
              "dg_auto_approve and pm_auto_approve — short-lived (5-minute) access markers used when leadership enters through official self-service links.",
              "Local browser storage — records your cookie consent choice, saves in-progress registration drafts on your own device, and remembers your language preference.",
            ],
            "Our cookie banner explains that we use cookies to improve your experience and to count crusades on the live map.",
          ],
        },
        {
          heading: "How we use your information",
          blocks: [
            "We use the information you provide to operate the NOTC campaign:",
            [
              "To register and record crusades and add them to the global tally and live map.",
              "To receive, verify, and record crusade reports and evidence.",
              "To plan, coordinate, and execute NOTC initiatives such as the media training, mission trips, nation selection, and upcoming crusades.",
              "To give approved leadership and administrators the visibility needed for accountability and oversight.",
              "To contact you about your registrations, reports, or participation in campaign initiatives.",
              "To maintain the security and integrity of the platform, including backups and access control.",
            ],
          ],
        },
        {
          heading: "How we share your information",
          blocks: [
            "We do not sell, rent, or trade your personal information.",
            [
              "Approved NOTC leadership and administrators — individuals authenticated through KingsChat with page-level permissions see the data their role requires.",
              "Zone and network portals — a capability link sees only the registrations and reports belonging to its own zone or network scope, never the full database.",
              "KingsChat — receives authentication requests so you can sign in; your interactions there are governed by KingsChat's own policies.",
              "Service providers — hosting and infrastructure providers that store and protect the data on our behalf.",
            ],
            "Aggregated and anonymised statistics — such as total crusades, countries covered, and attendance figures — may be published publicly as part of the campaign without any personal identifiers.",
          ],
        },
        {
          heading: "International data handling",
          blocks: [
            "A Night of a Thousand Crusades is a worldwide campaign. Your information is stored on our servers and may be accessed by approved administrators and leadership in different countries in the course of campaign operations. Where personal data moves across borders, we rely on the consent you provide when submitting it and on the legitimate interest of operating a global evangelistic campaign.",
          ],
        },
        {
          heading: "How long we keep your information",
          blocks: [
            "We keep registrations, reports, and related records for as long as they are needed for campaign operations and accountability. Regular encrypted backups are retained for disaster recovery (48 hourly, 30 daily, and 12 weekly), after which they are removed. Draft registrations saved in your browser remain on your device until you clear them. Session cookies expire after 7 days.",
          ],
        },
        {
          heading: "How we protect your information",
          blocks: [
            [
              "Administration access is limited to an allowlist of approved KingsChat accounts, with page-level permissions for each area.",
              "Authentication and session cookies are HTTP-only and secure, and never exposed to browser scripts.",
              "Uploaded files are validated by type and size (report photos up to 50 MB, 40 per report) and served in a sandboxed manner; report photos are private to approved administrators.",
              "Database backups are verified at startup, hourly, and after registrations, with staged restore procedures.",
              "Server logs redact personal identifiers such as emails, phone numbers, and tokens.",
            ],
            "No method of transmission or storage is completely secure. We apply reasonable organisational and technical measures and encourage you to protect the devices and accounts you use to access the platform.",
          ],
        },
        {
          heading: "Your rights and choices",
          blocks: [
            "Depending on your location, you may have the right to access, correct, or request deletion of your personal information; to withdraw consent; to object to or restrict processing; and to receive a portable copy of the data you provided. To exercise any of these rights, contact us at info@rhapsodycrusades.org. Some information may be retained where needed for legal, audit, or accountability purposes, and deletion requests will be handled within applicable legal timeframes. You also have the right to lodge a complaint with your local data protection authority.",
          ],
        },
        {
          heading: "Children's privacy",
          blocks: [
            "The platform is intended for ministry representatives, staff, and volunteers. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us and we will delete it where possible.",
          ],
        },
        {
          heading: "Third-party links and services",
          blocks: [
            "The platform links to third-party services and websites, including KingsChat authentication and communities, the churches directory, campaign donation pages, font and resource CDNs, and approved resources hosted externally. These services operate under their own privacy policies, which we encourage you to review. We are not responsible for their practices.",
          ],
        },
        {
          heading: "Changes to this policy",
          blocks: [
            "We may update this Privacy Policy as the campaign and platform evolve. The \"Effective\" date at the top of this page reflects the latest revision. Continued use of the platform after changes are posted constitutes acceptance of the updated policy.",
          ],
        },
      ]}
      footerNote="This platform is operated for the purposes of the Night of a Thousand Crusades campaign. For questions about this policy or your data, contact us using the details below."
    />
  );
}

export function TermsOfService() {
  return (
    <LegalShell
      eyebrow="Night of a Thousand Crusades (NOTC)"
      title="Terms of Service"
      updated="14 August 2026"
      lead="These Terms of Service ('Terms') govern your access to and use of the Night of a Thousand Crusades (NOTC) platform at notc.rhapsodycrusades.org, operated by Rhapsody End-Time Teaching Crusades ('RETC', 'we', 'us'). By using the platform — including registering crusades, submitting reports, or accessing any page or service — you agree to these Terms."
      sections={[
        {
          heading: "Agreement to these terms",
          blocks: [
            "By accessing or using the platform, you confirm that you agree to these Terms and to our Privacy Policy, which forms part of them. If you use the platform on behalf of a zone, group, church, cell, network, or other ministry organisation, you represent that you are authorised to act on that organisation's behalf.",
          ],
        },
        {
          heading: "The platform",
          blocks: [
            "The platform supports A Night of a Thousand Crusades:",
            [
              "Registration of planned crusades and their inclusion in the global tally and live map.",
              "Submission of verified crusade reports and evidence.",
              "Campaign initiatives including the mission nation selection, media training, mission trips, upcoming crusades, and campaign avatar.",
              "Approved resources and materials for preparation and outreach.",
              "Zone and network capability portals for planning and reporting.",
              "Administration dashboards for approved NOTC leadership and staff.",
            ],
          ],
        },
        {
          heading: "Eligibility",
          blocks: [
            "You may use the platform if you are at least 18 years old and act as an authorised representative of a zone, group, church, cell, network, or other participating ministry, or as approved Loveworld Blue Elite staff, media personnel, volunteer, or participant. Access to the administration and zone areas requires an approved KingsChat account; access is granted at our discretion and may be revoked at any time.",
          ],
        },
        {
          heading: "Access and accounts",
          blocks: [
            "Keep your KingsChat credentials and any capability links you receive confidential. You are responsible for all activity that occurs through your access. Zone and network capability links are private and must not be shared beyond the designated scope. You must not attempt to access data or areas beyond the scope granted to you, or to circumvent access controls.",
          ],
        },
        {
          heading: "Your commitments",
          blocks: [
            "When you use the platform you agree that:",
            [
              "The crusades you register are real, planned events and the details you provide are accurate and complete.",
              "Reports you submit reflect verified outcomes and may be supported by evidence.",
              "Participants in the National Missions Leadership Initiative commit to at least 1,000 crusades in their chosen nation.",
              "You will not submit duplicate, false, or misleading registrations or reports, or impersonate another person or organisation.",
              "You will keep your registration and reporting information up to date.",
            ],
          ],
        },
        {
          heading: "Acceptable use",
          blocks: [
            "You must not use the platform to:",
            [
              "Submit unlawful, fraudulent, defamatory, or harmful content.",
              "Interfere with the security, integrity, or availability of the platform, including automated scraping or bulk data extraction.",
              "Introduce malicious code or attempt to access systems beyond your authorisation.",
              "Collect or harvest other users' personal information without authorisation.",
              "Impersonate RETC, its leadership, or other users.",
            ],
          ],
        },
        {
          heading: "Content you submit",
          blocks: [
            "You retain ownership of the content you submit. By submitting content — including crusade details, reports, and evidence photos — you grant RETC a non-exclusive, worldwide licence to store, process, and use it to operate the campaign, including displaying aggregated results publicly. You represent that you have the right to submit the content and that it does not infringe the rights of others. For evidence photos and media, you confirm you have the necessary consents from those depicted.",
          ],
        },
        {
          heading: "Approved resources",
          blocks: [
            "Resources published on the platform are approved for use in campaign preparation, teaching, outreach, and execution. You may use them for those authorised purposes only and must not resell, redistribute, or modify them without permission.",
          ],
        },
        {
          heading: "Intellectual property",
          blocks: [
            "The platform, its brand, campaign materials, and approved resources belong to RETC, Loveworld, Rhapsody of Realities, or their licensors and are protected by applicable law. Nothing in these Terms grants you any ownership rights; your use of campaign branding is limited to official campaign participation.",
          ],
        },
        {
          heading: "Third-party services and links",
          blocks: [
            "The platform integrates with third-party services, including KingsChat for authentication, an external churches directory, and approved resources hosted elsewhere. Donations made through external campaign pages are handled by those pages under their own terms. We are not responsible for third-party services, and your use of them is subject to their own terms and policies.",
          ],
        },
        {
          heading: "Disclaimers",
          blocks: [
            "The platform is provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied. We do not warrant that the platform will be uninterrupted, error-free, or free of harmful components. Campaign dates and times — including live shows, training days, and the main event — are subject to change and will be reflected on the platform when updated.",
          ],
        },
        {
          heading: "Limitation of liability",
          blocks: [
            "To the maximum extent permitted by law, RETC and its affiliates, officers, and staff are not liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data or profits, arising out of your use of, or inability to use, the platform.",
          ],
        },
        {
          heading: "Indemnification",
          blocks: [
            "You agree to indemnify and hold harmless RETC and its affiliates from any claims, damages, or expenses (including reasonable legal fees) arising from your use of the platform, your submitted content, or your breach of these Terms.",
          ],
        },
        {
          heading: "Suspension and termination",
          blocks: [
            "We may suspend or terminate access, remove content, or restrict functionality — with or without notice — if we reasonably believe you have breached these Terms, submitted false information, or endangered the security or integrity of the platform. You may stop using the platform at any time.",
          ],
        },
        {
          heading: "Changes to these terms",
          blocks: [
            "We may revise these Terms from time to time. The \"Effective\" date at the top of this page reflects the latest revision. Continued use of the platform after changes are posted constitutes acceptance of the revised Terms.",
          ],
        },
        {
          heading: "Governing law",
          blocks: [
            "These Terms are governed by applicable law. You are responsible for complying with the laws of your own country when using the platform, including any requirements for conducting evangelistic activities or collecting personal data.",
          ],
        },
      ]}
      footerNote="Thank you for joining A Night of a Thousand Crusades. Questions about these Terms? Contact us using the details below."
    />
  );
}
