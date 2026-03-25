from datetime import date
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.ai_scheduler import TaskPlannerModel

router = APIRouter(prefix="/api/agent", tags=["agent"])
planner_model = TaskPlannerModel()


class TaskAgentRequest(BaseModel):
    prompt: str = Field(..., min_length=3)
    preferred_date: str | None = None


class PlannedTask(BaseModel):
    title: str
    due_date: date
    due_time: str | None = None


class TaskAgentResponse(BaseModel):
    reply: str
    task: PlannedTask
    tasks: list[PlannedTask] = Field(default_factory=list)


class BreakdownTask(BaseModel):
    id: str | None = None
    text: str


class BreakdownRequest(BaseModel):
    task: BreakdownTask


class OrchestrateTask(BaseModel):
    id: str | None = None
    text: str
    completed: bool = False


class OrchestrateRequest(BaseModel):
    tasks: list[OrchestrateTask] = []
    planner: dict[str, Any] | None = None
    mood: str | None = None


class HabitSuggestionRequest(BaseModel):
    goal: str = Field(..., min_length=3, max_length=240)
    existing_habits: list[str] = Field(default_factory=list)
    count: int = Field(default=4, ge=1, le=6)
    local_only: bool = False


class HabitSuggestionItem(BaseModel):
    text: str
    reason: str


class HabitSuggestionResponse(BaseModel):
    suggestions: list[HabitSuggestionItem]
    source: str
    message: str | None = None


@router.post("/new-task", response_model=TaskAgentResponse)
def create_task_from_prompt(payload: TaskAgentRequest) -> TaskAgentResponse:
    planned_items = planner_model.plan_tasks(payload.prompt, payload.preferred_date)
    used_gemini = False
    gemini_error: str | None = None

    if planner_model.should_use_gemini_fallback(payload.prompt, planned_items):
        gemini_plan, gemini_error = planner_model.plan_tasks_with_gemini(
            payload.prompt,
            payload.preferred_date,
        )
        if gemini_plan:
            planned_items = gemini_plan
            used_gemini = True

    serialized = [
        PlannedTask(title=item.title, due_date=item.due_date, due_time=item.due_time)
        for item in planned_items
    ]
    first = serialized[0]

    if len(serialized) == 1:
        time_hint = f" at {first.due_time}" if first.due_time else ""
        source_hint = " Parsed with Gemini fallback for complex prompt." if used_gemini else ""
        fallback_hint = "" if used_gemini or not gemini_error else " Used local planner because Gemini fallback was unavailable."
        reply = (
            f"Planned task '{first.title}' for {first.due_date.isoformat()}{time_hint}. "
            f"{planned_items[0].reasoning}{source_hint}{fallback_hint}"
        )
    else:
        summary = ", ".join(
            [
                f"'{task.title}' on {task.due_date.isoformat()}{f' at {task.due_time}' if task.due_time else ''}"
                for task in serialized[:4]
            ]
        )
        if len(serialized) > 4:
            summary = f"{summary}, and {len(serialized) - 4} more"
        source_hint = " Parsed with Gemini fallback for complex prompt." if used_gemini else ""
        fallback_hint = "" if used_gemini or not gemini_error else " Used local planner because Gemini fallback was unavailable."
        reply = f"Planned {len(serialized)} tasks: {summary}.{source_hint}{fallback_hint}"

    return TaskAgentResponse(
        reply=reply,
        task=first,
        tasks=serialized,
    )


@router.post("/breakdown")
def breakdown_task(payload: BreakdownRequest) -> dict[str, Any]:
    sub_tasks = planner_model.breakdown_task(payload.task.text)
    return {"subTasks": sub_tasks}


@router.post("/orchestrate")
def orchestrate_tasks(payload: OrchestrateRequest) -> dict[str, Any]:
    raw_tasks = [task.model_dump() for task in payload.tasks]
    orchestration = planner_model.orchestrate_tasks(raw_tasks, payload.mood)
    return {
        **orchestration,
        "hasPlanner": payload.planner is not None,
    }


@router.post("/habit-suggestions", response_model=HabitSuggestionResponse)
def suggest_habits(payload: HabitSuggestionRequest) -> HabitSuggestionResponse:
    suggestions, source, message = planner_model.suggest_habits(
        payload.goal,
        payload.existing_habits,
        payload.count,
        use_external=not payload.local_only,
    )
    serialized = [HabitSuggestionItem(text=item.text, reason=item.reason) for item in suggestions]
    return HabitSuggestionResponse(
        suggestions=serialized,
        source=source,
        message=message,
    )
