from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

class Task(BaseModel):
    id: UUID
    user_id: UUID
    title: str = Field(min_length=1, max_length=200)
    due_at: AwareDatetime | None = None
    importance: int = Field(ge=1, le=5)
    difficulty: int = Field(ge=1, le=5)
    estimated_minutes: int = Field(ge=1, le=10080)
    progress: int = Field(ge=0, le=100)
    status: Literal['todo', 'in_progress', 'completed']
    created_at: AwareDatetime
    course_id: UUID | None = None
    project_id: UUID | None = None

class StrictInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class PlannerInput(StrictInput):
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    focus_minutes: int = Field(default=50, ge=15, le=120)
    break_minutes: int = Field(default=10, ge=0, le=30)

    @model_validator(mode='after')
    def valid_window(self):
        duration = (self.ends_at - self.starts_at).total_seconds()
        if not 60 <= duration <= 16 * 3600:
            raise ValueError('Choose a planning window between 1 minute and 16 hours.')
        return self

class ExplainInput(StrictInput):
    task_id: UUID

class ChatInput(StrictInput):
    message: str = Field(min_length=1, max_length=1000)
