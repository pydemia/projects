import type { Item, SkillRun } from "./models";

export const projectId = "ca673a01-4200-4b42-a1f4-614c78235c41";
export const userId = "09d1cc05-3a65-4222-a0be-4128ef3589ce";
export const idea: Item = {
    id: "ca673a01-4200-4b42-a1f4-614c78235c42", project_id: projectId,
    kind: "idea", title: "원문 아이디어", body: "서버에 보관한 원문입니다.",
    data: { source_url: "", notes: "" }, revision: 1, status: "draft",
    created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
};
export const candidateRun: SkillRun = {
    id: "ca673a01-4200-4b42-a1f4-614c78235c43", project_id: projectId,
    operation: "analyze_idea", instruction: "원문을 요건으로 정리해 주세요.",
    target_id: idea.id, target_revision: 1, status: "review_ready",
    skills_lock: [{ id: "requirements-authoring", source_revision: "abc123" }],
    reference_manifest: {}, source_snapshots: [{ ...idea }], error: null,
    created_at: idea.created_at, updated_at: idea.updated_at, applied_ids: [],
    result: {
        document: null, review: "근거를 확인한 후보입니다.", assumptions: [], questions: [],
        source_ids: [idea.id],
        requirements: ["첫 번째 요건", "선택할 두 번째 요건"].map(title => ({
            title, body: "후보 본문", acceptance_criteria: ["실제 검증할 수 있어야 함"],
            feature_ids: [], disposition: "new", rationale: "아이디어 원문 기준",
            design_changes: [], tasks: [], tests: [],
        })),
    },
};
