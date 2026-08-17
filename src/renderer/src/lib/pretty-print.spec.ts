import { describe, expect, it } from "vitest";

import { prettyPrintJson, prettyPrintMarkup } from "./pretty-print";

describe("prettyPrintJson", () => {
  it("reindents minified json", () => {
    expect(prettyPrintJson('{"a":1,"b":[1,2]}')).toEqual({
      text: '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}',
    });
  });

  it("returns the raw text with a warning on malformed json", () => {
    const result = prettyPrintJson("{not valid");
    expect(result.text).toBe("{not valid");
    expect(result.warning).toBeTruthy();
  });

  it("passes an empty body through untouched", () => {
    expect(prettyPrintJson("")).toEqual({ text: "" });
  });
});

describe("prettyPrintMarkup", () => {
  it("indents nested elements by depth", () => {
    const result = prettyPrintMarkup("<html><body><p>hi</p></body></html>");
    expect(result.text).toBe("<html>\n  <body>\n    <p>hi</p>\n  </body>\n</html>");
  });

  it("does not increase depth for void elements", () => {
    const result = prettyPrintMarkup('<div><img src="x"/><span>a</span></div>');
    expect(result.text).toBe('<div>\n  <img src="x"/>\n  <span>a</span>\n</div>');
  });

  it("never throws on malformed markup", () => {
    expect(() => prettyPrintMarkup("<div><span>unclosed")).not.toThrow();
  });
});
