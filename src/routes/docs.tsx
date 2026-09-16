import { Link, createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { DOC_SECTIONS } from "@/lib/docs";

export const Route = createFileRoute("/docs")({ component: DocsPage });

function DocsPage() {
  return (
    <div className="min-h-dvh bg-bone">
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Docs" className="lg:sticky lg:top-6 lg:self-start">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">
            Docs
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {DOC_SECTIONS.map((s) => (
              <li key={s.slug}>
                <a href={`#${s.slug}`} className="hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
            <li>
              <Link to="/roadmap" className="hover:underline">
                Roadmap
              </Link>
            </li>
          </ul>
        </nav>
        <main>
          <h1 className="font-display text-4xl tracking-tight">Documentation</h1>
          <p className="mt-3 max-w-2xl text-graphite">
            What MetricMotive is, how a Guard is locked, and how a verdict is produced.
          </p>
          {DOC_SECTIONS.map((s) => (
            <section key={s.slug} id={s.slug} className="border-t border-rule py-10">
              <h2 className="font-display text-3xl">{s.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed">
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
