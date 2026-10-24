import { z } from "zod";

const id = z.string().uuid();
const text = z.string();
const textList = z.array(text);
export const kindSchema = z.enum([
    "idea", "feature", "requirement", "artifact", "task", "test_case",
    "decision",
]);
export type Kind = z.infer<typeof kindSchema>;

export const dataSchemas = {
    idea: z.object({
        source_url: text.default(""), notes: text.default(""),
    }).passthrough(),
    feature: z.object({
        current_behavior: text.default(""), evidence_url: text.default(""),
        target_sha: text.default(""),
    }).passthrough(),
    requirement: z.object({
        category: z.enum(["functional", "nonfunctional"]).default("functional"),
        acceptance_criteria: textList.default([]),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        disposition: text.default("new"), feature_ids: z.array(id).default([]),
        excluded_reason: text.default(""),
    }).passthrough(),
    artifact: z.object({
        artifact_type: text.default("application-design"),
        template_ref: text.nullable().default(null),
        template_version: text.nullable().default(null),
        example_refs: textList.default([]),
        inspection_status: text.default("unverified"),
        project_source_refs: textList.default([]),
    }).passthrough(),
    task: z.object({
        workflow: z.enum(["delivery", "personal"]).default("delivery"),
        state: z.enum([
            "todo", "in_progress", "in_review", "done", "cancelled",
        ]).default("todo"),
        list_name: text.default("Inbox"),
        planned_date: text.default(""), due_date: text.default(""),
        estimated_minutes: z.number().int().nonnegative().default(0),
        context: text.default(""),
        energy: z.enum(["any", "low", "medium", "high"]).default("any"),
        next_action: z.boolean().default(true),
        abc_priority: z.enum(["none", "A", "B", "C"]).default("none"),
        abc_order: z.number().int().nonnegative().default(0),
        goal: text.default(""),
        github_issue_url: text.default(""),
        acceptance_criteria: textList.default([]),
        result_url: text.default(""), target_sha: text.default(""),
        requires_test: z.boolean().default(true),
        cancellation_reason: text.default(""),
    }).passthrough(),
    test_case: z.object({
        steps: textList.default([]), expected: text.default(""),
    }).passthrough(),
    decision: z.object({
        reason: text.default(""), alternatives: textList.default([]),
    }).passthrough(),
};

const itemShape = {
    id, project_id: id, title: text, body: text,
    board_order: z.number().int().nonnegative().optional(),
    revision: z.number().int().positive(),
    status: z.enum(["draft", "confirmed", "archived"]),
    created_at: text, updated_at: text,
};
export const itemSchema = z.discriminatedUnion("kind", [
    z.object({ ...itemShape, kind: z.literal("idea"), data: dataSchemas.idea }),
    z.object({ ...itemShape, kind: z.literal("feature"), data: dataSchemas.feature }),
    z.object({ ...itemShape, kind: z.literal("requirement"), data: dataSchemas.requirement }),
    z.object({ ...itemShape, kind: z.literal("artifact"), data: dataSchemas.artifact }),
    z.object({ ...itemShape, kind: z.literal("task"), data: dataSchemas.task }),
    z.object({ ...itemShape, kind: z.literal("test_case"), data: dataSchemas.test_case }),
    z.object({ ...itemShape, kind: z.literal("decision"), data: dataSchemas.decision }),
]);
export type Item = z.infer<typeof itemSchema>;
export const taskViewSettingsSchema = z.object({
    mode: z.enum(["simple", "complex"]),
    view: z.enum(["today", "inbox", "upcoming", "list", "board", "calendar", "insights"]),
    query: text, status: text, lens: z.enum(["gtd", "abc"]),
    minutes: z.number().int().nonnegative(), context: text,
    energy: z.enum(["any", "low", "medium", "high"]),
    grouping: z.enum(["state", "list", "none"]),
    sort: z.enum(["manual", "gtd", "abc", "due_date"]),
    card_fields: z.array(z.enum([
        "list_name", "planned_date", "due_date", "estimated_minutes",
        "abc_priority", "context", "goal", "github_issue_url",
    ])),
});
export type TaskViewSettings = z.infer<typeof taskViewSettingsSchema>;
export const taskViewSchema = z.object({
    id, project_id: id, owner_id: id, name: text,
    scope: z.literal("personal"), settings: taskViewSettingsSchema,
    is_default: z.boolean(), revision: z.number().int().positive(),
});
export type TaskView = z.infer<typeof taskViewSchema>;
export const revisionSchema = z.object({
    revision: z.number().int().positive(), title: text, body: text,
    data: z.record(text, z.unknown()),
    status: z.enum(["draft", "confirmed", "archived"]), created_at: text,
});
export type Revision = z.infer<typeof revisionSchema>;

export const sessionSchema = z.object({
    user: z.object({ id, username: text }), csrf_token: text.min(1),
});
export type Session = z.infer<typeof sessionSchema>;
export const projectSchema = z.object({
    id, name: text, goal: text, profile: text,
    version: z.number().int(), created_at: text,
    repository_url: text.nullable(), repository_path: text,
    repository_branch: text.nullable(), repository_sha: text.nullable(),
    repository_kind: text.nullable(), repository_manifest: text.nullable(),
    repository_imported_at: text.nullable(),
});
export type Project = z.infer<typeof projectSchema>;
export const repositoryActivitySchema = z.object({
    id, project_id: id, kind: z.enum(["commit", "pr"]), external_id: text,
    title: text, url: text, state: z.enum(["committed", "open", "closed", "merged"]),
    occurred_at: text,
});
export type RepositoryActivity = z.infer<typeof repositoryActivitySchema>;
export const gitPreviewSchema = z.object({
    repository_url: text, repository_full_name: text, branch: text,
    sha: text, path: text, kind: text, visibility: z.enum(["public", "private"]),
    scopes: z.array(z.object({ path: text, label: text })),
    manifest_path: text, suggested_name: text, suggested_goal: text,
    activities: z.array(repositoryActivitySchema.omit({ id: true, project_id: true })),
    warnings: z.array(text),
});
export type GitPreview = z.infer<typeof gitPreviewSchema>;
export const gitZipPreviewSchema = z.object({
    archive_sha256: text, archive_name: text, path: text, kind: text,
    scopes: z.array(z.object({ path: text, label: text })),
    manifest_path: text, suggested_name: text, suggested_goal: text,
    warnings: z.array(text),
});
export type GitZipPreview = z.infer<typeof gitZipPreviewSchema>;
const countPair = z.object({ total: z.number().nonnegative() });
export const summarySchema = z.object({
    items_by_kind: z.record(text, z.number().nonnegative()),
    tasks: countPair.extend({ done: z.number().nonnegative(), cancelled: z.number().nonnegative().default(0) }),
    artifacts: countPair.extend({ confirmed: z.number().nonnegative() }),
    tests: countPair.extend({ passed: z.number().nonnegative() }),
    needs_review: z.number().nonnegative(),
});
export const relationSchema = z.enum([
    "source", "implements", "verifies", "depends_on", "relates_to",
]);
export const linkSchema = z.object({
    id, project_id: id, source_id: id, target_id: id,
    relation: relationSchema,
    source_revision: z.number().int().positive(),
    target_revision: z.number().int().positive(),
}).passthrough();
export type Link = z.infer<typeof linkSchema>;
export const outcomeSchema = z.enum(["passed", "failed", "aborted"]);
export const testRunSchema = z.object({
    id, project_id: id, case_id: id,
    case_revision: z.number().int().positive(), outcome: outcomeSchema,
    actual: text, environment: text, target_sha: text,
    evidence_url: text, created_at: text,
});
export type TestRun = z.infer<typeof testRunSchema>;
export const baselineSchema = z.object({
    id, name: text, revisions: z.record(text, z.number().int().positive()),
    created_at: text,
});
export const traceSchema = z.object({
    requirements: z.array(z.object({
        item: itemSchema, links: z.array(linkSchema), needs_review: z.boolean(),
    })), stale_links: z.array(linkSchema),
});

export const catalogSchema = z.object({
    document_profiles: z.array(z.object({
        id: text, name: text, artifact_id: text, suggested_primary_skill: text,
        review_skill: text, verification_skill: text,
    })).default([]),
    schema_version: z.number(), status: text, checked_date: text,
    skill_policy: text,
    sources: z.array(z.object({
        id: text, name: text, url: text,
        kind: text, format: text, inspection: text, reuse: text, role: text,
    }).passthrough()),
    artifacts: z.array(z.object({
        id: text, name: text, notion_section: text,
        original_status: text, original_observation: text,
        public_reference_ids: textList, starter_fields: textList,
        suggested_primary_skill: text, review_skill: text,
        verification_skill: text,
    }).passthrough()),
}).passthrough();
export type Catalog = z.infer<typeof catalogSchema>;
export function artifactDefinition(catalog: Catalog | undefined, type: unknown) {
    const profile = catalog?.document_profiles.find(entry => entry.id === type);
    const artifact = catalog?.artifacts.find(entry => entry.id === (profile?.artifact_id ?? type));
    return artifact ? { ...artifact, ...profile } : undefined;
}
export const runtimeSchema = z.object({
    configured: z.boolean(), provider: text.nullable(), model: text.nullable(),
    capabilities: textList,
});
export type Runtime = z.infer<typeof runtimeSchema>;
export const bundleSchema = z.object({
    id: text, source_revision: text, cache_key: text,
    files: z.array(z.object({ path: text, sha256: text })),
}).passthrough();
export const resolveSchema = z.object({ bundles: z.array(bundleSchema) });
export type Bundle = z.infer<typeof bundleSchema>;
export const operationSchema = z.enum([
    "write_document", "revise_document", "review_document",
    "analyze_idea", "plan",
]);
export type Operation = z.infer<typeof operationSchema>;
const candidateSchema = z.object({
    title: text, body: text, acceptance_criteria: textList,
    feature_ids: z.array(id),
    disposition: z.enum([
        "new", "extend", "change", "merge", "duplicate", "conflict", "defer",
    ]),
    rationale: text,
    design_changes: z.array(z.object({ artifact_id: id, instruction: text })),
    tasks: z.array(z.object({
        title: text, body: text, acceptance_criteria: textList,
    })),
    tests: z.array(z.object({ title: text, steps: textList, expected: text })),
});
export const resultSchema = z.object({
    document: text.nullable(), review: text,
    requirements: z.array(candidateSchema), assumptions: textList,
    questions: textList, source_ids: z.array(id),
});
export const runSchema = z.object({
    id, project_id: id, operation: operationSchema, instruction: text,
    target_id: id.nullable(), target_revision: z.number().int().nullable(),
    status: z.enum([
        "queued", "running", "review_ready", "failed", "cancelled", "applied",
    ]),
    skills_lock: z.array(z.record(text, z.unknown())),
    reference_manifest: z.record(text, z.unknown()),
    source_snapshots: z.array(z.record(text, z.unknown())),
    result: resultSchema.nullable(), error: text.nullable(),
    created_at: text, updated_at: text, applied_ids: z.array(id),
});
export type SkillRun = z.infer<typeof runSchema>;
export const reconnectSchema = z.object({
    conflict: z.boolean(), diff: text, current_revision: z.number().int(),
    body_sha256: text,
}).passthrough();

export const kindLabels: Record<Kind, string> = {
    idea: "아이디어", feature: "기존 기능", requirement: "요구사항",
    artifact: "임시 문서", task: "작업", test_case: "테스트 케이스",
    decision: "결정 기록",
};
export const statusLabels: Record<string, string> = {
    draft: "초안", confirmed: "확정", archived: "보관",
    todo: "할 일", in_progress: "진행 중", in_review: "검토 중",
    done: "완료", cancelled: "취소", queued: "대기 중",
    running: "실행 중", review_ready: "결과 검토", failed: "실패",
    applied: "적용됨", passed: "통과", aborted: "중단",
    new: "신규", extend: "확장", change: "변경", merge: "통합",
    duplicate: "중복", conflict: "충돌", defer: "보류", excluded: "제외",
};
export const relationLabels: Record<z.infer<typeof relationSchema>, string> = {
    source: "근거", implements: "구현", verifies: "검증",
    depends_on: "선행 작업", relates_to: "관련",
};
export const operationLabels: Record<Operation, string> = {
    write_document: "문서 작성", revise_document: "문서 수정",
    review_document: "문서 검수", analyze_idea: "아이디어 요건화",
    plan: "작업·테스트 계획",
};
export function defaultData(kind: Kind): Record<string, unknown> {
    return dataSchemas[kind].parse({});
}
export function shortId(value: string): string {
    return value.slice(0, 8);
}
export function dateLabel(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("ko-KR", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}
