import { ROUTES } from "@/lib/site";
import { ButtonLink, H2, Kicker, SECTION, TextLink } from "./parts";

export default function CtaSection() {
  return (
    <section id="cta" data-tone="light" aria-labelledby="cta-title" className="ambient text-carbon">
      <div className={SECTION}>
        <div className="glass glass-flat rounded-lg p-6 sm:p-10">
          <Kicker>Live on Studio Dev</Kicker>
          <h2 id="cta-title" className={H2}>
            Define what success actually means.
          </h2>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink to={ROUTES.builder} variant="solid">
              Create a Motive Guard
            </ButtonLink>
            <ButtonLink to={ROUTES.demo} variant="outline">
              Try the demo
            </ButtonLink>
            <TextLink to={ROUTES.docs}>Read the docs</TextLink>
          </div>
        </div>
      </div>
    </section>
  );
}
