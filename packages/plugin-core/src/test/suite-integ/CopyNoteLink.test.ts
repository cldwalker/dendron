import { NotePropsV2 } from "@dendronhq/common-all";
import { DirResult, tmpDir } from "@dendronhq/common-server";
import { NodeTestPresetsV2, NOTE_PRESETS } from "@dendronhq/common-test-utils";
import assert from "assert";
import { afterEach, beforeEach } from "mocha";
import path from "path";
import * as vscode from "vscode";
import { CopyNoteLinkCommand } from "../../commands/CopyNoteLink";
import { HistoryService } from "../../services/HistoryService";
import { VSCodeUtils } from "../../utils";
import { DendronWorkspace } from "../../workspace";
import { onWSInit, setupDendronWorkspace, TIMEOUT } from "../testUtils";
import { expect, LocationTestUtils, runMultiVaultTest } from "../testUtilsv2";

suite("notes", function () {
  let root: DirResult;
  let ctx: vscode.ExtensionContext;
  let vaultPath: string;
  this.timeout(TIMEOUT);

  beforeEach(function () {
    root = tmpDir();
    ctx = VSCodeUtils.getOrCreateMockContext();
    DendronWorkspace.getOrCreate(ctx);
  });

  afterEach(function () {
    HistoryService.instance().clearSubscriptions();
  });

  test("basic", (done) => {
    onWSInit(async () => {
      const notePath = path.join(vaultPath, "foo.md");
      await VSCodeUtils.openFileInEditor(vscode.Uri.file(notePath));
      const link = await new CopyNoteLinkCommand().run();
      assert.strictEqual(link, "[[Foo|foo]]");
      done();
    });
    setupDendronWorkspace(root.name, ctx, {
      lsp: true,
      useCb: async (vaultDir) => {
        vaultPath = vaultDir;
        await NodeTestPresetsV2.createOneNoteOneSchemaPreset({ vaultDir });
      },
    });
  });

  test("with anchor", function (done) {
    let noteWithTarget: NotePropsV2;

    runMultiVaultTest({
      ctx,
      preSetupHook: async ({ vaults }) => {
        noteWithTarget = await NOTE_PRESETS.NOTE_WITH_ANCHOR_TARGET({
          vault: vaults[0],
        });
        await NOTE_PRESETS.NOTE_WITH_ANCHOR_LINK({
          vault: vaults[0],
        });
      },
      onInit: async () => {
        const editor = await VSCodeUtils.openNote(noteWithTarget);
        const pos = LocationTestUtils.getPresetWikiLinkPosition();
        const pos2 = LocationTestUtils.getPresetWikiLinkPosition({ char: 12 });
        editor.selection = new vscode.Selection(pos, pos2);
        const link = await new CopyNoteLinkCommand().run();
        expect(link).toEqual(`[[Alpha|${noteWithTarget.fname}#h1]]`);
        editor.selection = new vscode.Selection(
          LocationTestUtils.getPresetWikiLinkPosition({ line: 8 }),
          LocationTestUtils.getPresetWikiLinkPosition({ line: 8, char: 12 })
        );
        const link2 = await new CopyNoteLinkCommand().run();
        expect(link2).toEqual(`[[Alpha|${noteWithTarget.fname}#h2-8a]]`);
        done();
      },
    });
  });
});
