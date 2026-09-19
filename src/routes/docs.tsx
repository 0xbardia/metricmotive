import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DEPLOYMENT_FACTS,
  DOC_SECTIONS,
  type DocSection,
} from "@/lib/docs-content";

export const Route = createFileRoute("/docs")({ component: DocsPage });

function DocsPage() {
  const [active, setActive] = useState(DOC_SECTIONS[0].slug);

  /**
   * Highlight the section in view. Progressive enhancement only: with the
   * observer unavailable the first section stays marked, so nothing is broken.
   */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    for (const section of DOC_SECTIONS) {
      const element = document.getElementById(section.slug);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        {/*
          Sticky on desktop, a horizontal scroller on small screens: one nav
          implementation, two presentations, no duplicated links in the DOM.
        */}
        <nav aria-label="Documentation sections" className="lg:sticky lg:top-24 lg:self-start">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">
            Documentation
          </p>
          <ul
            className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
            data-doc-nav
          >
            {DOC_SECTIONS.map((section) => (
              <li key={section.slug} className="shrink-0 lg:shrink">
                <a
                  href={`#${section.slug}`}
                  aria-current={active === section.slug ? "true" : undefined}
                  data-active={active === section.slug ? "true" : "false"}
                  className="block whitespace-nowrap rounded-sm px-2 py-2 text-sm text-graphite transition-colors hover:bg-cream hover:text-carbon data-[active=true]:text-carbon lg:whitespace-normal"
                >
                  {section.nav ?? section.title}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden border-t border-rule pt-4 lg:block">
            <Link to="/app" className="text-sm text-graphite hover:text-carbon">
              Open App →
            </Link>
            <a
              href={DEPLOYMENT_FACTS.repository}
              className="mt-2 flex items-center gap-1 text-sm text-graphite hover:text-carbon"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </nav>

        <main className="mt-10 min-w-0 lg:mt-0">
          <header className="border-b border-rule pb-8">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ochre">
              MetricMotive
            </p>
            <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Documentation</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-graphite">
              Your agent hit the metric. Did it honor the motive? How a Guard is defined, locked,
              evidenced, and verified on GenLayer.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/app">
                <Button>
                  Open App <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </Link>
              <a href={DEPLOYMENT_FACTS.repository} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">GitHub</Button>
              </a>
              <a href="#deployment" className="text-sm text-graphite underline-offset-4 hover:underline">
                Current deployment
              </a>
            </div>
          </header>

          {DOC_SECTIONS.map((section) => (
            <DocSectionView key={section.slug} section={section} />
          ))}
        </main>
      </div>
    </MarketingShell>
  );
}

function DocSectionView({ section }: { section: DocSection }) {
  const extra = section as DocSection & {
    paragraphs2?: string[];
    paragraphsAfter?: string[];
  };
  return (
    // scroll-mt keeps the sticky header from covering a deep-linked heading.
    <section id={section.slug} className="scroll-mt-24 border-b border-rule py-12">
      <h2 className="font-display text-3xl tracking-tight">{section.title}</h2>

      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="mt-4 max-w-3xl leading-relaxed text-graphite">
          {paragraph}
        </p>
      ))}

      {extra.paragraphs2?.map((paragraph) => (
        <p key={paragraph} className="mt-4 max-w-3xl leading-relaxed text-graphite">
          {paragraph}
        </p>
      ))}

      {section.bullets?.length ? (
        <ul className="mt-5 max-w-3xl space-y-2">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 leading-relaxed">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ochre" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.table ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-rule text-left">
                {section.table.head.map((cell) => (
                  <th
                    key={cell}
                    scope="col"
                    className="py-3 pr-4 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row) => (
                <tr key={row.join("|")} className="border-b border-rule align-top">
                  {row.map((cell, index) => (
                    <td
                      key={`${row[0]}-${index}`}
                      className={`py-3 pr-4 leading-relaxed ${index === 0 ? "whitespace-nowrap font-medium" : "text-graphite"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {section.code ? (
        <figure className="mt-6">
          <figcaption className="flex items-center justify-between gap-3">
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite">
              {section.code.label}
            </span>
            <CopyButton value={section.code.source} label={`${section.code.label} code sample`} />
          </figcaption>
          <pre className="mt-2 overflow-x-auto bg-carbon p-4 font-mono text-xs leading-relaxed text-bone">
            <code>{section.code.source}</code>
          </pre>
        </figure>
      ) : null}

      {extra.paragraphsAfter?.map((paragraph) => (
        <p key={paragraph} className="mt-4 max-w-3xl leading-relaxed text-graphite">
          {paragraph}
        </p>
      ))}

      {section.links?.length ? (
        <p className="mt-5 flex flex-wrap gap-4 text-sm">
          {section.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              {link.label} <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ))}
        </p>
      ) : null}
    </section>
  );
}
