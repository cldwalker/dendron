import { DNoteAnchor, NotePropsV2, NoteUtilsV2 } from "@dendronhq/common-all";
import fs from "fs";
import _ from "lodash";
import path from "path";
import vscode, { commands, extensions, Location, TextDocument } from "vscode";
import { VSCodeUtils } from "../utils";
import { DendronWorkspace } from "../workspace";
import { matchAll } from "./strings";
import { sort as sortPaths } from "cross-path-sort";

export type RefT = {
  label: string;
  ref: string;
  anchor?: DNoteAnchor;
};

export type FoundRefT = {
  location: Location;
  matchText: string;
};

const markdownExtRegex = /\.md$/i;
export const refPattern = "(\\[\\[)([^\\[\\]]+?)(\\]\\])";
const partialRefPattern = "(\\[\\[)([^\\[\\]]+)";
export const REGEX_FENCED_CODE_BLOCK = /^( {0,3}|\t)```[^`\r\n]*$[\w\W]+?^( {0,3}|\t)``` *$/gm;
export { sortPaths };
const REGEX_CODE_SPAN = /`[^`]*?`/gm;
export const RE_WIKI_LINK_ALIAS = "([^\\[\\]]+?\\|)?";

export class MarkdownUtils {
  static async openPreview(opts?: { reuseWindow?: boolean }) {
    const cleanOpts = _.defaults(opts, { reuseWindow: false });
    let previewEnhanced = extensions.getExtension(
      "dendron.markdown-preview-enhanced"
    );
    let previewEnhanced2 = extensions.getExtension(
      "dendron.dendron-markdown-preview-enhanced"
    );
    const cmds = {
      builtin: {
        open: "markdown.showPreview",
        openSide: "markdown.showPreviewToSide",
      },
      enhanced: {
        open: "markdown-preview-enhanced.openPreview",
        openSide: "markdown-preview-enhanced.openPreviewToTheSide",
      },
    };
    const mdClient =
      cmds[previewEnhanced || previewEnhanced2 ? "enhanced" : "builtin"];
    const openCmd = mdClient[cleanOpts.reuseWindow ? "open" : "openSide"];
    return commands.executeCommand(openCmd);
  }
}

export const isInFencedCodeBlock = (
  documentOrContent: TextDocument | string,
  lineNum: number
): boolean => {
  const content =
    typeof documentOrContent === "string"
      ? documentOrContent
      : documentOrContent.getText();
  const textBefore = content
    .slice(0, positionToOffset(content, { line: lineNum, column: 0 }))
    .replace(REGEX_FENCED_CODE_BLOCK, "")
    .replace(/<!--[\W\w]+?-->/g, "");
  // So far `textBefore` should contain no valid fenced code block or comment
  return /^( {0,3}|\t)```[^`\r\n]*$[\w\W]*$/gm.test(textBefore);
};

export const positionToOffset = (
  content: string,
  position: { line: number; column: number }
) => {
  if (position.line < 0) {
    throw new Error("Illegal argument: line must be non-negative");
  }

  if (position.column < 0) {
    throw new Error("Illegal argument: column must be non-negative");
  }

  const lineBreakOffsetsByIndex = lineBreakOffsetsByLineIndex(content);
  if (lineBreakOffsetsByIndex[position.line] !== undefined) {
    return (
      (lineBreakOffsetsByIndex[position.line - 1] || 0) + position.column || 0
    );
  }

  return 0;
};

export const lineBreakOffsetsByLineIndex = (value: string): number[] => {
  const result = [];
  let index = value.indexOf("\n");

  while (index !== -1) {
    result.push(index + 1);
    index = value.indexOf("\n", index + 1);
  }

  result.push(value.length + 1);

  return result;
};

export const isInCodeSpan = (
  documentOrContent: TextDocument | string,
  lineNum: number,
  offset: number
): boolean => {
  const content =
    typeof documentOrContent === "string"
      ? documentOrContent
      : documentOrContent.getText();
  const textBefore = content
    .slice(0, positionToOffset(content, { line: lineNum, column: offset }))
    .replace(REGEX_CODE_SPAN, "")
    .trim();

  return /`[^`]*$/gm.test(textBefore);
};

export const getReferenceAtPosition = (
  document: vscode.TextDocument,
  position: vscode.Position,
  partial?: boolean
): {
  range: vscode.Range;
  ref: string;
  label: string;
  anchor?: DNoteAnchor;
} | null => {
  if (
    isInFencedCodeBlock(document, position.line) ||
    isInCodeSpan(document, position.line, position.character)
  ) {
    return null;
  }

  const re = partial ? partialRefPattern : refPattern;
  const range = document.getWordRangeAtPosition(position, new RegExp(re));

  if (!range) {
    return null;
  }

  const { ref, label, anchor } = parseRef(
    document
      .getText(range)
      .replace("![[", "")
      .replace("[[", "")
      .replace("]]", "")
  );

  return {
    ref,
    label,
    range,
    anchor,
  };
};

export const parseRef = (rawRef: string): RefT => {
  const escapedDividerPosition = rawRef.indexOf("\\|");
  const dividerPosition =
    escapedDividerPosition !== -1
      ? escapedDividerPosition
      : rawRef.indexOf("|");

  const out: RefT = {
    label: dividerPosition !== -1 ? rawRef.slice(0, dividerPosition) : "",
    ref:
      dividerPosition !== -1
        ? rawRef.slice(
            dividerPosition + (escapedDividerPosition !== -1 ? 2 : 1),
            rawRef.length
          )
        : rawRef,
  };
  if (out.ref.indexOf("#") >= 0) {
    const [ref, ...anchor] = out.ref.split("#");
    out.ref = ref;
    out.anchor = { type: "header", value: anchor[0] };
  }
  return out;
};

export const findReferences = async (
  ref: string,
  excludePaths: string[] = []
): Promise<FoundRefT[]> => {
  const refs: FoundRefT[] = [];

  // TODO: sanitize reference
  const engine = DendronWorkspace.instance().getEngine();
  engine.notes;
  const doc = VSCodeUtils.getActiveTextEditor()?.document;
  // clean for anchor
  const fname = ref;
  const note = NoteUtilsV2.getNoteByFname(fname, engine.notes, {
    vault: { fsPath: path.dirname(doc?.uri.fsPath as string) },
    throwIfEmpty: true,
  }) as NotePropsV2;
  const notesWithRefs = (await NoteUtilsV2.getNotesWithLinkTo({
    note,
    notes: engine.notes,
  })) as NotePropsV2[];

  _.forEach(notesWithRefs, (note) => {
    const fsPath = NoteUtilsV2.getPath({ note });

    if (excludePaths.includes(fsPath) || !fs.existsSync(fsPath)) {
      return;
    }

    const fileContent = fs.readFileSync(fsPath).toString();
    const refRegexp = new RegExp(
      `\\[\\[([^\\[\\]]+?\\|)?(${escapeForRegExp(ref)}(\\#[^\\[\\]]+?)?)\\]\\]`,
      "gi"
    );
    const fileContentLines = fileContent.split(/\r?\n/g);

    fileContentLines.forEach((lineText, lineNum) => {
      for (const match of matchAll(refRegexp, lineText)) {
        const reference = match[2].split("#")[0];
        const offset = (match.index || 0) + 2;

        if (
          isInFencedCodeBlock(fileContent, lineNum) ||
          isInCodeSpan(fileContent, lineNum, offset)
        ) {
          return;
        }

        const matchText = lineText.slice(
          Math.max(offset - 2, 0),
          lineText.length
        );

        refs.push({
          location: new vscode.Location(
            vscode.Uri.file(fsPath),
            new vscode.Range(
              new vscode.Position(lineNum, offset),
              new vscode.Position(lineNum, offset + reference.length)
            )
          ),
          matchText: matchText,
        });
      }
    });
  });

  return refs;
};

export const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const containsMarkdownExt = (pathParam: string): boolean =>
  !!markdownExtRegex.exec(path.parse(pathParam).ext);

export const trimLeadingSlash = (value: string) =>
  value.replace(/^\/+|^\\+/g, "");
export const trimTrailingSlash = (value: string) =>
  value.replace(/\/+$|\\+$/g, "");
export const trimSlashes = (value: string) =>
  trimLeadingSlash(trimTrailingSlash(value));
export const normalizeSlashes = (value: string) => value.replace(/\\/gi, "/");

export const fsPathToRef = ({
  path: fsPath,
  keepExt,
  basePath,
}: {
  path: string;
  keepExt?: boolean;
  basePath?: string;
}): string | null => {
  const ref =
    basePath && fsPath.startsWith(basePath)
      ? normalizeSlashes(fsPath.replace(basePath, ""))
      : path.basename(fsPath);

  if (keepExt) {
    return trimLeadingSlash(ref);
  }

  return trimLeadingSlash(
    ref.includes(".") ? ref.slice(0, ref.lastIndexOf(".")) : ref
  );
};
