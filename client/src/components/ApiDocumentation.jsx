import { Link } from "react-router-dom";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";

const Code = ({ children }) => <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100 sm:text-sm"><code>{children}</code></pre>;
const InlineCode = ({ children }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>;

export function ApiDocumentation() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-slate-200 pb-10">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900">Night of a Thousand Crusades <ArrowRight className="size-4" /></Link>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Developer documentation</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">NOTC data API</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">Read-only access to registered crusades and submitted reports in raw JSON. This API is intended for trusted server-to-server integrations.</p>
        </header>

        <section className="grid gap-4 border-b border-slate-200 py-8 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5"><KeyRound className="size-5 text-blue-700" /><h2 className="mt-4 font-semibold text-slate-950">API key required</h2><p className="mt-2 text-sm leading-6 text-slate-600">Every request needs a valid API key in its request header. Keep your key private and do not include it in public code or links.</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-5"><ShieldCheck className="size-5 text-emerald-700" /><h2 className="mt-4 font-semibold text-slate-950">Safe by default</h2><p className="mt-2 text-sm leading-6 text-slate-600">The API is read-only, excludes reporter contact details, and rate-limits each active key to 120 requests per minute.</p></div>
        </section>

        <section className="space-y-4 border-b border-slate-200 py-8">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">Authentication</h2>
          <p className="text-sm leading-6 text-slate-600">Send the key in the <InlineCode>X-API-Key</InlineCode> header. Do not put it in a URL, spreadsheet, client-side app, or public repository.</p>
          <Code>{`curl https://your-domain.example/api/reports \\
  -H "X-API-Key: notc_live_your_key_here"`}</Code>
          <p className="text-sm leading-6 text-slate-600">A missing, invalid, or revoked key returns <InlineCode>401</InlineCode>. Exceeding the limit returns <InlineCode>429</InlineCode> with <InlineCode>Retry-After</InlineCode> and rate-limit headers.</p>
        </section>

        <section className="space-y-5 border-b border-slate-200 py-8">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">Endpoints</h2>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-mono text-sm font-semibold text-slate-950">GET /api/reports</h3><p className="mt-2 text-sm leading-6 text-slate-600">Returns report records with their submitted crusades and outcome metrics. Reporter contact information and uploaded photo files are not included.</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-mono text-sm font-semibold text-slate-950">GET /api/registrations</h3><p className="mt-2 text-sm leading-6 text-slate-600">Returns individual registered crusade records, their planning details, readiness, and whether a report has been submitted. Registrant contact information is not included.</p></article>
        </section>

        <section className="space-y-4 border-b border-slate-200 py-8">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">Pagination</h2>
          <p className="text-sm leading-6 text-slate-600">Both endpoints return newest records first. Use cursor pagination for consistent performance on large datasets.</p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600"><li><InlineCode>limit</InlineCode>: optional number of records, default 100, maximum 500.</li><li><InlineCode>cursor</InlineCode>: optional <InlineCode>next_cursor</InlineCode> value from the prior response.</li></ul>
          <Code>{`GET /api/registrations?limit=200
GET /api/registrations?limit=200&cursor=512095`}</Code>
          <Code>{`{
  "data": [/* raw records */],
  "meta": {
    "limit": 200,
    "has_more": true,
    "next_cursor": 512095
  }
}`}</Code>
        </section>

        <section className="space-y-4 py-8">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">Filters</h2>
          <p className="text-sm leading-6 text-slate-600">Registration requests support the same safe filters used by the administration table, including <InlineCode>country</InlineCode>, <InlineCode>city</InlineCode>, <InlineCode>network_name</InlineCode>, <InlineCode>event_type</InlineCode>, <InlineCode>date_from</InlineCode>, <InlineCode>date_to</InlineCode>, and <InlineCode>report_status</InlineCode> (<InlineCode>reported</InlineCode> or <InlineCode>unreported</InlineCode>).</p>
          <Code>{`GET /api/registrations?country=Nigeria&event_type=street&limit=100`}</Code>
          <p className="text-sm leading-6 text-slate-600">API fields use the stored database names. Adding fields may occur without notice; integrations should ignore fields they do not use.</p>
        </section>
      </div>
    </main>
  );
}
