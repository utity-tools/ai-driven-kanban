import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders GFM: emphasis, lists and task lists", () => {
    const { container } = render(<Markdown>{"**bold**\n\n- [x] done\n- [ ] todo"}</Markdown>);

    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it("shows raw HTML as text instead of rendering it", () => {
    const { container } = render(
      <Markdown>{'<img src=x onerror="alert(1)"><script>alert(2)</script>'}</Markdown>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("opens links safely in a new tab", () => {
    render(<Markdown>{"[docs](https://example.com)"}</Markdown>);
    const link = screen.getByRole("link", { name: /docs/ });

    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("drops javascript: URLs", () => {
    render(<Markdown>{"[click](javascript:alert(1))"}</Markdown>);
    const link = screen.getByText("click").closest("a");

    expect(link?.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("turns images into links instead of loading them", () => {
    const { container } = render(<Markdown>{"![a cat](https://example.com/cat.png)"}</Markdown>);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: /a cat/ })).toHaveAttribute(
      "href",
      "https://example.com/cat.png",
    );
  });

  it("shifts headings below the modal's own headings", () => {
    render(<Markdown>{"# Title\n\n## Sub"}</Markdown>);

    expect(screen.getByRole("heading", { name: "Title" }).tagName).toBe("H4");
    expect(screen.getByRole("heading", { name: "Sub" }).tagName).toBe("H5");
  });
});
