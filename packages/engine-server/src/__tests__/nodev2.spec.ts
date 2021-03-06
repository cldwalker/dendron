import { DEngineV2, NoteUtilsV2, SchemaUtilsV2 } from "@dendronhq/common-all";
import { note2File } from "@dendronhq/common-server";
import {
  EngineTestUtilsV2,
  NodeTestUtilsV2,
} from "@dendronhq/common-test-utils";
import fs from "fs-extra";
import { tmpdir } from "os";
import path from "path";
import { DendronEngineV2 } from "../enginev2";

const beforePreset = async () => {
  const vaultDir = await EngineTestUtilsV2.setupVault({
    initDirCb: async (vaultPath: string) => {
      await NodeTestUtilsV2.createSchemas({ vaultPath });
      await NodeTestUtilsV2.createNotes({ vaultPath });
      await NodeTestUtilsV2.createNoteProps({ vaultPath, rootName: "foo" });
      await NodeTestUtilsV2.createSchemaModuleOpts({
        vaultDir: vaultPath,
        rootName: "foo",
      });
    },
  });

  const engine = DendronEngineV2.create({ vaults: [vaultDir] });
  return { vaultDir, engine };
};

describe("note", () => {
  const vault = { fsPath: tmpdir() };

  describe("serialize", () => {
    test("basic", () => {
      const note = NoteUtilsV2.create({
        id: "foo",
        fname: "foo",
        created: "1",
        updated: "1",
        vault,
      });
      const serialized = NoteUtilsV2.serialize(note);
      expect(serialized).toMatchSnapshot();
      expect(serialized.indexOf("stub") >= 0).toBeFalsy();
    });

    test("with children", () => {
      const note = NoteUtilsV2.create({
        id: "foo",
        fname: "foo",
        created: "1",
        updated: "1",
        children: ["ch1", "ch2"],
        vault,
      });
      const serialized = NoteUtilsV2.serialize(note);
      expect(serialized).toMatchSnapshot();
    });

    test("with parent", () => {
      const note = NoteUtilsV2.create({
        id: "foo",
        fname: "foo",
        created: "1",
        updated: "1",
        parent: "root",
        vault,
      });
      const serialized = NoteUtilsV2.serialize(note);
      expect(serialized).toMatchSnapshot();
    });

    test("with custom", () => {
      const note = NoteUtilsV2.create({
        id: "foo",
        fname: "foo",
        created: "1",
        updated: "1",
        custom: {
          bond: 42,
        },
        vault,
      });
      const serialized = NoteUtilsV2.serialize(note);
      expect(serialized).toMatchSnapshot();
      // should be at beginning of line
      expect(serialized.match(/^bond/gm)).toBeTruthy();
    });

    test("with hierarchy", () => {
      const note = NoteUtilsV2.create({
        id: "foo",
        fname: "foo",
        created: "1",
        updated: "1",
        children: ["ch1", "ch2"],
        parent: "root",
        vault,
      });
      const serialized = NoteUtilsV2.serialize(note, { writeHierarchy: true });
      expect(serialized).toMatchSnapshot();
      expect(serialized.match(/^parent: root/gm)).toBeTruthy();
      expect(serialized.match(/ch1/gm)).toBeTruthy();
      expect(serialized.match(/ch2/gm)).toBeTruthy();
    });

    test("with hierarchy and null parent", () => {
      const note = NoteUtilsV2.create({
        id: "foo",
        fname: "foo",
        created: "1",
        updated: "1",
        children: ["ch1", "ch2"],
        parent: null,
        vault,
      });
      const serialized = NoteUtilsV2.serialize(note, { writeHierarchy: true });
      expect(serialized).toMatchSnapshot();
      expect(serialized.match(/^parent: null/gm)).toBeTruthy();
      expect(serialized.match(/ch1/gm)).toBeTruthy();
      expect(serialized.match(/ch2/gm)).toBeTruthy();
    });
  });
});

describe("matchPath", () => {
  let engine: DEngineV2;

  beforeEach(async () => {
    ({ engine } = await beforePreset());
  });

  it("match path on domain, reg", async () => {
    await engine.init();
    const resp = SchemaUtilsV2.matchPath({
      notePath: "foo",
      schemaModDict: engine.schemas,
    });
    expect(resp?.schema.id).toEqual("foo");
  });

  it("match path on domain as namespace", async () => {
    await engine.init();
    const schema = SchemaUtilsV2.createModuleProps({
      fname: "bond",
      vault: engine.vaultsv3[0],
    });
    schema.schemas[schema.root.id].data.namespace = true;
    await engine.init();
    await engine.updateSchema(schema);
    const resp = SchemaUtilsV2.matchPath({
      notePath: "bond",
      schemaModDict: engine.schemas,
    });
    expect(resp?.schema.id).toEqual("bond");
    expect(resp?.namespace).toBeTruthy();
  });

  it("match path on domain as namespace, child", async () => {
    await engine.init();
    const schema = SchemaUtilsV2.createModuleProps({
      fname: "bond",
      vault: engine.vaultsv3[0],
    });
    schema.schemas[schema.root.id].data.namespace = true;
    await engine.init();
    await engine.updateSchema(schema);
    const resp = SchemaUtilsV2.matchPath({
      notePath: "bond.foo",
      schemaModDict: engine.schemas,
    });
    expect(resp?.schema.id).toEqual("bond");
    expect(resp?.namespace).toBeFalsy();
  });
});

describe("matchDomain", () => {
  let vaultDir: string;
  let engine: DEngineV2;

  beforeEach(async () => {
    ({ vaultDir, engine } = await beforePreset());
  });

  it("match path on domain, reg", async () => {
    await engine.init();
    const schema = engine.notes["foo"].schema;
    expect(schema).toEqual({ moduleId: "foo", schemaId: "foo" });
  });

  it("match path on domain as namespace", async () => {
    await NodeTestUtilsV2.createSchemaModuleOpts({
      vaultDir,
      rootName: "bond",
      rootOpts: {
        data: { namespace: true },
      },
    });
    await NodeTestUtilsV2.createNoteProps({
      vaultPath: vaultDir,
      rootName: "bond",
    });
    fs.removeSync(path.join(vaultDir, "foo.schema.yml"));
    await engine.init();
    const schema = engine.notes["bond"].schema;
    expect(schema).toEqual({ moduleId: "bond", schemaId: "bond" });
  });

  it("match path on domain as namespace", async () => {
    await NodeTestUtilsV2.createSchemaModuleOpts({
      vaultDir,
      rootName: "bond",
      rootOpts: {
        data: { namespace: true },
      },
    });
    const rootName = "bond";
    const ch1 = NoteUtilsV2.create({
      fname: `${rootName}.ch1`,
      id: `${rootName}.ch1`,
      created: "1",
      updated: "1",
      vault: { fsPath: vaultDir },
    });
    await note2File(ch1, vaultDir);
    fs.removeSync(path.join(vaultDir, "foo.schema.yml"));
    await engine.init();
    const schema = engine.notes["bond.ch1"].schema;
    expect(schema).toEqual({ moduleId: "bond", schemaId: "bond" });
  });
});
