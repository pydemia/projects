"""Validated project transfer requests shared by single and bulk routes."""

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TransferTask(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=36)
    expected_revision: int = Field(ge=1)


class TransferPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[TransferTask] = Field(min_length=1, max_length=100)
    target_project_id: str = Field(min_length=1, max_length=36)
    target_list_name: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def unique_tasks(self) -> "TransferPreview":
        if len({task.id for task in self.tasks}) != len(self.tasks):
            raise ValueError("중복 작업은 이동할 수 없습니다.")
        return self


class TransferCommit(TransferPreview):
    preview_token: str = Field(min_length=64, max_length=64)
    operation_id: str = Field(min_length=1, max_length=100)


class TransferUndo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: str = Field(min_length=1, max_length=100)
