/** Generators for `MdEditor`'s exposed `insert(generator)` API — used to drive the custom
 * toolbar in `MarkdownEditor.vue` instead of the library's built-in (and much wider) toolbar. */

import type { InsertGenerator } from "../models/markdown-toolbar.models";

function wrapSelection(before: string, after: string, placeholder: string): InsertGenerator {
  return selectedText => {
    const text = selectedText || placeholder;
    return {
      targetValue: `${before}${text}${after}`,
      select: true,
      deviationStart: before.length,
      deviationEnd: -after.length,
    };
  };
}

function linePrefix(prefix: string, placeholder: string): InsertGenerator {
  return selectedText => {
    const text = selectedText || placeholder;
    return {
      targetValue: `${prefix}${text}`,
      select: true,
      deviationStart: prefix.length,
      deviationEnd: 0,
    };
  };
}

export const bold = wrapSelection("**", "**", "bold text");
export const italic = wrapSelection("*", "*", "italic text");
export const underline = wrapSelection("<u>", "</u>", "underline text");
export const strikeThrough = wrapSelection("~~", "~~", "strikethrough");
export const sub = wrapSelection("<sub>", "</sub>", "subscript");
export const sup = wrapSelection("<sup>", "</sup>", "superscript");
export const quote = linePrefix("> ", "quote");
export const unorderedList = linePrefix("- ", "list item");
export const orderedList = linePrefix("1. ", "list item");
export const task = linePrefix("- [ ] ", "to-do");
export const codeInline = wrapSelection("`", "`", "code");

export function heading(level: 1 | 2 | 3 | 4 | 5 | 6): InsertGenerator {
  return linePrefix(`${"#".repeat(level)} `, "heading");
}

export const codeBlock: InsertGenerator = selectedText => {
  const text = selectedText || "code";
  return {
    targetValue: `\n\`\`\`\n${text}\n\`\`\`\n`,
    select: true,
    deviationStart: 5,
    deviationEnd: -5,
  };
};

export const link: InsertGenerator = selectedText => {
  const text = selectedText || "link text";
  return {
    targetValue: `[${text}](https://)`,
    select: true,
    deviationStart: text.length + 3,
    deviationEnd: -1,
  };
};

export const image: InsertGenerator = selectedText => {
  const text = selectedText || "alt text";
  return {
    targetValue: `![${text}](https://)`,
    select: true,
    deviationStart: text.length + 4,
    deviationEnd: -1,
  };
};

export const table: InsertGenerator = () => ({
  targetValue: "\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n",
  select: false,
});

export const mermaid: InsertGenerator = () => ({
  targetValue: "\n```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```\n",
  select: false,
});

export const katex: InsertGenerator = selectedText => {
  const text = selectedText || "formula";
  return {
    targetValue: `\n$$\n${text}\n$$\n`,
    select: true,
    deviationStart: 4,
    deviationEnd: -4,
  };
};
