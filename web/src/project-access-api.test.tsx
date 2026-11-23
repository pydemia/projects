import { describe, expect, it, vi } from "vitest";
import { accessApi, projectAccessSchema } from "./project-access";

describe("project access API contracts", () => {
    it("validates a nonowner role response without disclosing membership counts", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
            {id: "viewer", name: "뷰어", preset: "viewer", permissions: ["project.read"], revision: 1},
        ]))));
        const roles = await accessApi.roles("project");
        expect(roles[0]?.member_count).toBeUndefined();
        expect(roles[0]?.permissions).toEqual(["project.read"]);
    });

    it("accepts the mutation member response and encodes stable IDs", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({account_id: "member", membership_id: "membership", role_id: "editor", access_revision: 2})));
        vi.stubGlobal("fetch", fetchMock);
        const body = {expected_revision: 1, operation_id: "op", role_id: "editor"};
        await expect(accessApi.updateMember("project/one", "account/one", body)).resolves.toMatchObject({access_revision: 2});
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects/project%2Fone/members/account%2Fone");
        expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual(body);
    });

    it("rejects an invalid capability response instead of trusting a TypeScript assertion", () => {
        expect(projectAccessSchema.safeParse({project_id: "project", access_revision: 1, membership_id: "membership",
            role: {id: "role", name: "뷰어", preset: "viewer"}, capabilities: "project.read", archived: false}).success).toBe(false);
    });
});
