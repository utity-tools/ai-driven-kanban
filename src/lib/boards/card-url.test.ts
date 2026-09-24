import { describe, expect, it } from "vitest";

import {
  OPENED_FROM_BOARD_KEY,
  cardHref,
  hrefWithoutCard,
  selectedCardId,
  wasOpenedFromBoard,
} from "./card-url";

const PATH = "/boards/b0a4d000-0000-4000-8000-000000000001";

describe("cardHref", () => {
  it("adds the card param", () => {
    expect(cardHref(PATH, "", "abc")).toBe(`${PATH}?card=abc`);
  });

  it("replaces an existing card and keeps other params", () => {
    expect(cardHref(PATH, "?card=old&view=compact", "new")).toBe(`${PATH}?card=new&view=compact`);
  });

  it("encodes the id", () => {
    expect(cardHref(PATH, new URLSearchParams(), "a b&c")).toBe(`${PATH}?card=a+b%26c`);
  });
});

describe("hrefWithoutCard", () => {
  it("removes the card param", () => {
    expect(hrefWithoutCard(PATH, "?card=abc")).toBe(PATH);
  });

  it("keeps other params", () => {
    expect(hrefWithoutCard(PATH, "view=compact&card=abc")).toBe(`${PATH}?view=compact`);
  });
});

describe("selectedCardId", () => {
  it("reads the card param", () => {
    expect(selectedCardId("?card=abc")).toBe("abc");
  });

  it("is null when missing or blank", () => {
    expect(selectedCardId("")).toBeNull();
    expect(selectedCardId("?card=")).toBeNull();
    expect(selectedCardId("?card=%20")).toBeNull();
  });
});

describe("wasOpenedFromBoard", () => {
  it("is true only for entries marked by the board", () => {
    expect(wasOpenedFromBoard({ [OPENED_FROM_BOARD_KEY]: true, __NA: true })).toBe(true);
    expect(wasOpenedFromBoard({ [OPENED_FROM_BOARD_KEY]: "true" })).toBe(false);
    expect(wasOpenedFromBoard({ __NA: true })).toBe(false);
    expect(wasOpenedFromBoard(null)).toBe(false);
    expect(wasOpenedFromBoard(undefined)).toBe(false);
  });
});
