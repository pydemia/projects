import { z } from "zod";
import { request } from "./api";
import { itemSchema } from "./models";
import { storiesSchema, storyVerificationSchema } from "./story-models";

export const storyApi = {
    list: (projectId: string, signal?: AbortSignal) => request(
        `/api/projects/${encodeURIComponent(projectId)}/stories`, storiesSchema, {signal}),
    verifications: (itemId: string, signal?: AbortSignal) => request(
        `/api/items/${encodeURIComponent(itemId)}/story-verifications`, z.array(storyVerificationSchema), {signal}),
    verify: (itemId: string, body: {
        expected_revision: number; evidence: string;
        criterion_results: {criterion: string; passed: boolean; evidence: string}[];
    }) => request(`/api/items/${encodeURIComponent(itemId)}/story-verifications`,
        z.object({item: itemSchema, verification: storyVerificationSchema}), {method: "POST", body}),
};
