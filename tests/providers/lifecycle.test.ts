import { describe, it, expect } from "vitest";
import {
  recoverSubmission,
  stopAndVerify,
  submitExactlyOnce,
} from "../../lib/providers/lifecycle";
const identity = {
  schemaVersion: 1 as const,
  submissionId: "uuid",
  kind: "deployment" as const,
  uniqueName: "greenlight-unique-uuid",
  expectedModel: "me/model",
  deadlineMs: 100000,
  createdAt: "2026-10-17T00:00:00Z",
};
describe("paid resource lifecycle recovery", () => {
  it("persists submission identity before the one create even on immediate success", async () => {
    const order: string[] = [];
    const resource = await submitExactlyOnce({
      client: {} as never,
      identity,
      persist: async (r) => {
        order.push(r.state);
      },
      create: async () => {
        order.push("create");
        return {
          id: "d",
          model: "me/model",
          source: "huggingface",
          status: "queued",
        };
      },
    });
    expect(order).toEqual(["submitting", "create", "known"]);
    expect(resource.id).toBe("d");
  });
  it("recovers a timed-out successful create by unique name and never creates twice", async () => {
    let creates = 0;
    const records: unknown[] = [];
    const client = {
      request: async () => ({
        data: [
          {
            id: "dep1",
            name: identity.uniqueName,
            model: "me/model",
            status: "provisioning",
          },
        ],
        has_more: false,
      }),
    };
    const result = await submitExactlyOnce({
      client: client as never,
      identity,
      persist: async (value) => {
        records.push(value);
      },
      create: async () => {
        creates++;
        throw new Error("timeout after server committed");
      },
      recoveryAttempts: 1,
      recoveryDelayMs: 0,
    });
    expect(result.id).toBe("dep1");
    expect(creates).toBe(1);
    expect(records[0]).toMatchObject({
      state: "submitting",
      uniqueName: identity.uniqueName,
    });
    expect(records.at(-1)).toMatchObject({
      state: "known",
      resourceId: "dep1",
      recoveredFromAmbiguousCreate: true,
    });
  });
  it("retains an unknown submission when successful creation cannot be excluded", async () => {
    let creates = 0;
    const records: unknown[] = [];
    await expect(
      submitExactlyOnce({
        client: {
          request: async () => ({ data: [], has_more: false }),
        } as never,
        identity,
        persist: async (x) => {
          records.push(x);
        },
        create: async () => {
          creates++;
          throw new Error("lost response");
        },
        recoveryAttempts: 1,
        recoveryDelayMs: 0,
      }),
    ).rejects.toThrow(/unknown/i);
    expect(creates).toBe(1);
    expect(records.at(-1)).toMatchObject({
      state: "ambiguous",
      needsCostReconciliation: true,
    });
  });
  it("does not treat stop acknowledgement or idle parking as terminal verification", async () => {
    let reads = 0,
      stops = 0;
    const client = {
      deployment: async () => ({
        id: "d",
        status: ++reads < 3 ? "scaled_to_zero" : "stopped",
      }),
      stop: async () => {
        stops++;
        return { id: "d", status: "stopping" };
      },
    };
    const result = await stopAndVerify(client as never, "deployment", "d", {
      attempts: 5,
      delayMs: 0,
    });
    expect(stops).toBeGreaterThan(0);
    expect(reads).toBe(3);
    expect(result.status).toBe("stopped");
  });
  it("refuses a stop that never reaches an observed terminal state", async () => {
    const client = {
      deployment: async () => ({ id: "d", status: "provisioning" }),
      stop: async () => ({ id: "d", status: "stopped" }),
    };
    await expect(
      stopAndVerify(client as never, "deployment", "d", {
        attempts: 2,
        delayMs: 0,
      }),
    ).rejects.toThrow(/not verified/i);
  });
  it("does not select a collision or differently scoped resource", async () => {
    const client = {
      request: async () => ({
        data: [
          {
            id: "d",
            name: identity.uniqueName,
            model: "other/model",
            status: "serving",
          },
        ],
        has_more: false,
      }),
    };
    await expect(recoverSubmission(client as never, identity)).rejects.toThrow(
      /identity/i,
    );
  });
  it("continues unique-identity discovery across pages without creating or selecting a neighbor", async () => {
    let page = 0;
    const paths: string[] = [];
    const client = {
      request: async (path: string) => {
        paths.push(path);
        return ++page === 1
          ? {
              data: [
                {
                  id: "other",
                  name: "other",
                  model: "me/model",
                  status: "serving",
                },
              ],
              has_more: true,
            }
          : {
              data: [
                {
                  id: "ours",
                  name: identity.uniqueName,
                  model: "me/model",
                  status: "provisioning",
                },
              ],
              has_more: false,
            };
      },
    };
    expect((await recoverSubmission(client as never, identity))?.id).toBe(
      "ours",
    );
    expect(paths[1]).toContain("after=other");
  });
});
