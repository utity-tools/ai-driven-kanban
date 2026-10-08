import { BUILT_WITH } from "./content";
import { SectionContainer } from "./section-container";

export function BuiltWith() {
  return (
    <div className="py-10">
      <SectionContainer className="grid justify-items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Built with</p>
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm font-medium">
          {BUILT_WITH.map((item, index) => (
            <li key={item} className="flex gap-3">
              {index > 0 ? (
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
              ) : null}
              {item}
            </li>
          ))}
        </ul>
      </SectionContainer>
    </div>
  );
}
