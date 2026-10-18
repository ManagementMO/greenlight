import { describe, expect, it } from "vitest";
import { assertVeriResponseModel, veriRecoveryRecordPath, veriResponseModelIdentity, verifyVeriServingRecordIdentity } from "../../lib/providers/veri-response-identity";

const alias = "greenlight-v5-base-dev-01234567-0123-0123-0123-0123456789ab";
const repo = "Qwen/Qwen3-4B-Instruct-2507";
const makeRun = () => ({ reservationId: "veri-serving-v5-base-dev-12345678", deploymentId: "abc123", artifact: { repo },
  canary: { returnedModel: alias }, rows: [{ returnedModel: alias }, { returnedModel: alias }], showcase: null });
const makeRecovery = () => ({ kind: "deployment", state: "terminal", verifiedStatus: "stopped", submissionId: makeRun().reservationId,
  resourceId: "abc123", expectedModel: repo, uniqueName: alias });

describe("Veri response model identity", () => {
  it("requires exact deployment alias, rather than interpreting the HF repository as returned-model proof", () => {
    expect(() => assertVeriResponseModel(alias, alias)).not.toThrow();
    for (const returned of [undefined, null, "", repo, alias.toUpperCase(), alias + "-other"])
      expect(() => assertVeriResponseModel(returned, alias)).toThrow("exact submitted deployment");
  });

  it("binds existing and new run records to their terminal recovery identity", () => {
    const expected = veriResponseModelIdentity(alias, repo);
    expect(verifyVeriServingRecordIdentity(makeRun(), makeRecovery())).toEqual(expected);
    expect(verifyVeriServingRecordIdentity({ ...makeRun(), responseModelIdentity: expected }, makeRecovery())).toEqual(expected);
  });

  it("rejects a swapped model, deployment, reservation, missing identity or unconfirmed cleanup", () => {
    for (const change of [
      { expectedModel: "owner/wrong" }, { resourceId: "different" }, { submissionId: "different" },
      { uniqueName: "wrong-alias" }, { uniqueName: undefined }, { kind: "training" },
      { state: "known" }, { verifiedStatus: "serving" },
    ]) expect(() => verifyVeriServingRecordIdentity(makeRun(), { ...makeRecovery(), ...change })).toThrow();
  });

  it("checks every scored response plus recorded canary and showcase", () => {
    expect(() => verifyVeriServingRecordIdentity({ ...makeRun(), rows: [{ returnedModel: alias }, { returnedModel: "wrong" }] }, makeRecovery())).toThrow();
    expect(() => verifyVeriServingRecordIdentity({ ...makeRun(), canary: undefined }, makeRecovery())).toThrow();
    expect(() => verifyVeriServingRecordIdentity({ ...makeRun(), showcase: { returnedModel: "wrong" } }, makeRecovery())).toThrow();
    expect(() => verifyVeriServingRecordIdentity({ ...makeRun(), responseModelIdentity: veriResponseModelIdentity("other", repo) }, makeRecovery())).toThrow();
    expect(() => verifyVeriServingRecordIdentity({ ...makeRun(), rows: [] }, makeRecovery())).toThrow();
  });

  it("never derives a recovery-file path from arbitrary raw record paths", () => {
    expect(veriRecoveryRecordPath(makeRun().reservationId)).toBe("work/ml/recovery/" + makeRun().reservationId + ".json");
    for (const bad of [undefined, "../../.env", "veri-serving-../secret", "veri-serving-x/file"])
      expect(() => veriRecoveryRecordPath(bad)).toThrow();
  });
});
