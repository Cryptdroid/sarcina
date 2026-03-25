from __future__ import annotations

import json
import os
import re
from urllib import error as urllib_error
from urllib import request as urllib_request
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

WEEKDAY_MAP = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

DATE_MARKER_PATTERN = re.compile(
    r"\b("
    r"today|tomorrow|day after tomorrow|next week|next month|weekend|"
    r"next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"coming\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|"
    r"(?:january|february|march|april|may|june|july|august|september|october|november|december|"
    r"jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)"
    r")\b",
    flags=re.IGNORECASE,
)

MONTH_MAP = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}

NUMBER_WORDS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
}


@dataclass
class ScheduledTask:
    title: str
    due_date: date
    due_time: str | None
    reasoning: str


class TaskPlannerModel:
    """Lightweight local planner model that extracts task title + due date from prompt."""

    GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

    def plan_task(self, prompt: str, preferred_date: str | None = None) -> ScheduledTask:
        title = self._extract_title(prompt)
        due_datetime, relative_reasoning = self._extract_relative_datetime(prompt)

        due: date | None
        due_time: str | None = None
        reasoning_parts: list[str] = []

        if due_datetime is not None:
            due = due_datetime.date()
            due_time = due_datetime.strftime("%H:%M")
            reasoning_parts.append(relative_reasoning)
        else:
            due, date_reasoning = self._extract_date(prompt)
            if date_reasoning:
                reasoning_parts.append(date_reasoning)

            time_value, time_reasoning = self._extract_time(prompt)
            due_time = time_value
            if time_reasoning:
                reasoning_parts.append(time_reasoning)

        if due is None and preferred_date:
            try:
                due = datetime.strptime(preferred_date, "%Y-%m-%d").date()
                reasoning_parts.append("Used your selected calendar date.")
            except ValueError:
                due = None

        if due is None:
            due = date.today()
            reasoning_parts.append("No date was detected, so I scheduled it for today.")

        reasoning = " ".join(part for part in reasoning_parts if part).strip() or "Scheduled from parsed prompt."

        return ScheduledTask(title=title, due_date=due, due_time=due_time, reasoning=reasoning)

    def plan_tasks(self, prompt: str, preferred_date: str | None = None) -> list[ScheduledTask]:
        chunks = self._split_multi_prompt(prompt)
        planned = [self.plan_task(chunk, preferred_date) for chunk in chunks if chunk.strip()]
        return planned or [self.plan_task(prompt, preferred_date)]

    def should_use_gemini_fallback(self, prompt: str, local_plan: list[ScheduledTask]) -> bool:
        lowered = prompt.lower()
        word_count = len(prompt.split())

        complex_connectors = len(
            re.findall(
                r"\b(if|then|unless|except|before|after|between|while|otherwise|first|second|third|finally|reschedule)\b",
                lowered,
            )
        )
        has_constraint_language = bool(
            re.search(
                r"\b(not later than|no later than|at least|at most|depends on|contingent|only if|unless)\b",
                lowered,
            )
        )
        no_clear_date_count = sum(
            1 for item in local_plan if "No clear date was detected" in item.reasoning
        )
        too_many_items = len(local_plan) >= 4
        long_prompt = len(prompt) >= 170 or word_count >= 32

        return bool(
            (no_clear_date_count > 0 and (long_prompt or complex_connectors >= 2 or has_constraint_language))
            or complex_connectors >= 4
            or (too_many_items and has_constraint_language)
        )

    def plan_tasks_with_gemini(
        self, prompt: str, preferred_date: str | None = None
    ) -> tuple[list[ScheduledTask] | None, str | None]:
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            return None, "Gemini API key missing."

        instruction = (
            "You are a scheduling parser. Return only strict JSON with this schema: "
            '{"tasks":[{"title":"string","due_date":"YYYY-MM-DD","due_time":"HH:MM or null","reasoning":"string"}]}. '
            "No markdown and no extra fields. If date is unknown, use preferred_date if provided, otherwise today's date. "
            "Use 24-hour HH:MM when time is present."
        )
        preferred_hint = preferred_date or "none"
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": (
                                f"{instruction}\n"
                                f"preferred_date={preferred_hint}\n"
                                f"prompt={prompt}"
                            )
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        request_url = f"{self.GEMINI_ENDPOINT}?key={api_key}"
        req = urllib_request.Request(
            request_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib_request.urlopen(req, timeout=8) as response:
                body = response.read().decode("utf-8")
        except urllib_error.URLError:
            return None, "Gemini request failed."

        try:
            response_json = json.loads(body)
        except json.JSONDecodeError:
            return None, "Gemini returned invalid JSON response."

        text_payload = self._extract_gemini_text(response_json)
        if not text_payload:
            return None, "Gemini response had no usable content."

        parsed_payload = self._extract_json_payload(text_payload)
        if not parsed_payload:
            return None, "Gemini content was not valid task JSON."

        raw_tasks = parsed_payload.get("tasks")
        if not isinstance(raw_tasks, list) or not raw_tasks:
            return None, "Gemini returned no tasks."

        normalized = self._normalize_gemini_tasks(raw_tasks, preferred_date)
        if not normalized:
            return None, "Gemini tasks could not be normalized."

        return normalized, None

    def _split_multi_prompt(self, prompt: str) -> list[str]:
        cleaned = " ".join(prompt.strip().split())
        if not cleaned:
            return []

        # Split on clear separators first. Avoid splitting plain "and" to reduce false positives.
        chunks = re.split(r"(?:\s*;\s*|\s*\n+\s*|\s+and\s+also\s+|\s+also\s+|\s+then\s+)", cleaned, flags=re.IGNORECASE)
        normalized = [chunk.strip(" .,") for chunk in chunks if chunk.strip(" .,")]
        if len(normalized) > 1:
            return normalized

        # Split by plain "and" when multiple independent date intents are detected.
        if len(DATE_MARKER_PATTERN.findall(cleaned)) >= 2 and re.search(r"\s+and\s+", cleaned, flags=re.IGNORECASE):
            and_chunks = re.split(r"\s+and\s+", cleaned, flags=re.IGNORECASE)
            normalized_and = [chunk.strip(" .,") for chunk in and_chunks if chunk.strip(" .,")]
            if len(normalized_and) > 1:
                return normalized_and

        # If no explicit separators, split around repeated date intents like "on next ...".
        date_intent = re.compile(r"\b(?:on\s+)?(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", re.IGNORECASE)
        matches = list(date_intent.finditer(cleaned))
        if len(matches) <= 1:
            return [cleaned]

        segments: list[str] = []
        starts = [m.start() for m in matches]
        starts.append(len(cleaned))
        for idx in range(len(starts) - 1):
            segment = cleaned[starts[idx] : starts[idx + 1]].strip(" .,")
            if segment:
                segments.append(segment)

        return segments or [cleaned]

    def _extract_title(self, prompt: str) -> str:
        cleaned = " ".join(prompt.strip().split())

        for_clause = re.search(r"\bfor\s+(.+?)(?:\s+on\s+.+|\s+by\s+.+|$)", cleaned, flags=re.IGNORECASE)
        if for_clause:
            candidate = for_clause.group(1).strip(" .")
            if candidate:
                return candidate[0].upper() + candidate[1:]

        patterns = [
            r"(?:make|create|add|schedule)\s+(?:a\s+)?task\s+(?:to\s+)?(.+?)(?:\s+on\s+.+|\s+by\s+.+|\s+for\s+.+|$)",
            r"(?:please\s+)?(.+?)(?:\s+on\s+.+|\s+by\s+.+|\s+for\s+.+|$)",
        ]

        for pattern in patterns:
            match = re.search(pattern, cleaned, flags=re.IGNORECASE)
            if match:
                candidate = match.group(1).strip(" .")
                if candidate:
                    return candidate[0].upper() + candidate[1:]

        fallback = cleaned.strip(" .") or "Untitled task"
        return fallback[0].upper() + fallback[1:] if fallback else "Untitled task"

    def _extract_date(self, prompt: str) -> tuple[date | None, str]:
        lowered = prompt.lower()
        today = date.today()

        if "eod" in lowered or "end of day" in lowered:
            return today, "Detected 'end of day'."

        if "day after tomorrow" in lowered:
            return today + timedelta(days=2), "Detected 'day after tomorrow'."
        if "tomorrow" in lowered:
            return today + timedelta(days=1), "Detected 'tomorrow'."
        if "today" in lowered:
            return today, "Detected 'today'."
        if "tonight" in lowered:
            return today, "Detected 'tonight'."
        if "next week" in lowered:
            return today + timedelta(days=7), "Detected 'next week'."
        if "next month" in lowered:
            tentative = today + timedelta(days=31)
            return tentative, "Detected 'next month'."
        if "end of month" in lowered or "eom" in lowered:
            next_month = date(today.year + (1 if today.month == 12 else 0), 1 if today.month == 12 else today.month + 1, 1)
            return next_month - timedelta(days=1), "Detected 'end of month'."
        if "start of month" in lowered or "beginning of month" in lowered:
            return date(today.year, today.month, 1), "Detected 'start of month'."

        relative_span = re.search(r"\bin\s+(\d+|[a-z]+)\s+(day|days|week|weeks|month|months)\b", lowered)
        if relative_span:
            amount = self._parse_number_token(relative_span.group(1))
            unit = relative_span.group(2)
            if amount is not None:
                if unit.startswith("day"):
                    return today + timedelta(days=amount), f"Detected relative span: in {amount} day(s)."
                if unit.startswith("week"):
                    return today + timedelta(days=amount * 7), f"Detected relative span: in {amount} week(s)."
                if unit.startswith("month"):
                    return today + timedelta(days=amount * 30), f"Detected relative span: in {amount} month(s)."

        if "weekend" in lowered:
            delta = (5 - today.weekday()) % 7
            return today + timedelta(days=delta), "Detected 'weekend' (scheduled for Saturday)."

        explicit_iso = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", lowered)
        if explicit_iso:
            try:
                parsed = datetime.strptime(explicit_iso.group(1), "%Y-%m-%d").date()
                return parsed, "Detected explicit YYYY-MM-DD date."
            except ValueError:
                pass

        numeric_date = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", lowered)
        if numeric_date:
            first = int(numeric_date.group(1))
            second = int(numeric_date.group(2))
            year_token = numeric_date.group(3)
            year = int(year_token) if year_token else today.year
            if year < 100:
                year += 2000

            # Prefer DD/MM parsing, unless it is impossible.
            day, month = first, second
            if second > 12 and first <= 12:
                day, month = second, first

            try:
                parsed = date(year, month, day)
                if not year_token and parsed < today:
                    parsed = date(year + 1, month, day)
                return parsed, "Detected numeric date phrase."
            except ValueError:
                pass

        long_date = re.search(
            r"\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+"
            r"(january|february|march|april|may|june|july|august|september|october|november|december|"
            r"jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+(\d{4}))?\b",
            lowered,
        )
        if long_date:
            day = int(long_date.group(1))
            month_name = long_date.group(2).lower()
            year_token = long_date.group(3)
            year = int(year_token) if year_token else today.year
            try:
                month = MONTH_MAP[month_name]
                parsed = date(year, month, day)
                if not year_token and parsed < today:
                    parsed = date(year + 1, month, day)
                return parsed, "Detected calendar date phrase."
            except ValueError:
                pass

        month_first = re.search(
            r"\b(?:on\s+)?"
            r"(january|february|march|april|may|june|july|august|september|october|november|december|"
            r"jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+"
            r"(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b",
            lowered,
        )
        if month_first:
            month_name = month_first.group(1).lower()
            day = int(month_first.group(2))
            year_token = month_first.group(3)
            year = int(year_token) if year_token else today.year
            try:
                month = MONTH_MAP[month_name]
                parsed = date(year, month, day)
                if not year_token and parsed < today:
                    parsed = date(year + 1, month, day)
                return parsed, "Detected month-first date phrase."
            except ValueError:
                pass

        weekday_with_intent = re.search(
            r"\b(?:(next|this|coming)\s+)?"
            r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
            lowered,
        )
        if weekday_with_intent:
            qualifier = weekday_with_intent.group(1)
            weekday_name = weekday_with_intent.group(2)
            weekday_number = WEEKDAY_MAP[weekday_name]

            if qualifier in {"next", "coming"}:
                delta = (weekday_number - today.weekday()) % 7
                if delta == 0:
                    delta = 7
                return today + timedelta(days=delta), f"Detected '{qualifier} {weekday_name}'."

            if qualifier == "this":
                delta = (weekday_number - today.weekday()) % 7
                return today + timedelta(days=delta), f"Detected 'this {weekday_name}'."

        for weekday_name, weekday_number in WEEKDAY_MAP.items():
            if weekday_name in lowered:
                base = today
                delta = (weekday_number - base.weekday()) % 7
                if delta == 0:
                    delta = 7
                return base + timedelta(days=delta), f"Detected weekday '{weekday_name}'."

        return None, "No clear date was detected."

    def _extract_relative_datetime(self, prompt: str) -> tuple[datetime | None, str]:
        lowered = prompt.lower()
        now = datetime.now()

        span = re.search(r"\bin\s+(\d+|[a-z]+)\s+(minute|minutes|hour|hours)\b", lowered)
        if not span:
            return None, ""

        amount = self._parse_number_token(span.group(1))
        unit = span.group(2)
        if amount is None:
            return None, ""

        if unit.startswith("minute"):
            return now + timedelta(minutes=amount), f"Detected relative time: in {amount} minute(s)."
        return now + timedelta(hours=amount), f"Detected relative time: in {amount} hour(s)."

    def _extract_time(self, prompt: str) -> tuple[str | None, str]:
        lowered = prompt.lower()

        if "noon" in lowered:
            return "12:00", "Detected time keyword 'noon'."
        if "midnight" in lowered:
            return "00:00", "Detected time keyword 'midnight'."
        if "eod" in lowered or "end of day" in lowered:
            return "17:00", "Detected time keyword 'end of day'."
        if "tonight" in lowered:
            return "20:00", "Detected time keyword 'tonight'."
        if "this morning" in lowered or "morning" in lowered:
            return "09:00", "Detected time bucket 'morning'."
        if "this afternoon" in lowered or "afternoon" in lowered:
            return "15:00", "Detected time bucket 'afternoon'."
        if "this evening" in lowered or "evening" in lowered:
            return "19:00", "Detected time bucket 'evening'."

        am_pm = re.search(r"\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lowered)
        if am_pm:
            hour = int(am_pm.group(1)) % 12
            minute = int(am_pm.group(2) or "0")
            meridian = am_pm.group(3)
            if meridian == "pm":
                hour += 12
            return f"{hour:02d}:{minute:02d}", "Detected explicit 12-hour time."

        twenty_four = re.search(r"\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b", lowered)
        if twenty_four:
            hour = int(twenty_four.group(1))
            minute = int(twenty_four.group(2))
            return f"{hour:02d}:{minute:02d}", "Detected explicit 24-hour time."

        compact_time = re.search(r"\b(?:at\s+)?([01]\d|2[0-3])([0-5]\d)\b", lowered)
        if compact_time:
            hour = int(compact_time.group(1))
            minute = int(compact_time.group(2))
            return f"{hour:02d}:{minute:02d}", "Detected compact military time."

        return None, ""

    def _parse_number_token(self, token: str) -> int | None:
        if token.isdigit():
            return int(token)
        return NUMBER_WORDS.get(token.lower())

    def _extract_gemini_text(self, payload: dict[str, Any]) -> str | None:
        candidates = payload.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            return None

        content = candidates[0].get("content")
        if not isinstance(content, dict):
            return None

        parts = content.get("parts")
        if not isinstance(parts, list) or not parts:
            return None

        for part in parts:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                return str(part.get("text"))

        return None

    def _extract_json_payload(self, text_payload: str) -> dict[str, Any] | None:
        direct = text_payload.strip()
        for candidate in [direct, self._extract_code_fence_json(direct)]:
            if not candidate:
                continue
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed

        return None

    def _extract_code_fence_json(self, text_payload: str) -> str | None:
        match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text_payload, flags=re.DOTALL)
        if not match:
            return None
        return match.group(1)

    def _normalize_gemini_tasks(
        self, raw_tasks: list[Any], preferred_date: str | None
    ) -> list[ScheduledTask]:
        normalized: list[ScheduledTask] = []
        fallback_date = self._parse_iso_date(preferred_date) or date.today()

        for raw_task in raw_tasks:
            if not isinstance(raw_task, dict):
                continue

            title = str(raw_task.get("title", "")).strip() or "Untitled task"
            due_date_text = str(raw_task.get("due_date", "")).strip()
            due_date = self._parse_iso_date(due_date_text) or fallback_date

            raw_due_time = raw_task.get("due_time")
            due_time = str(raw_due_time).strip() if isinstance(raw_due_time, str) else None
            if due_time and not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", due_time):
                due_time = None

            reasoning = str(raw_task.get("reasoning", "")).strip() or "Planned by Gemini fallback for complex prompt."

            normalized.append(
                ScheduledTask(
                    title=title,
                    due_date=due_date,
                    due_time=due_time,
                    reasoning=reasoning,
                )
            )

        return normalized

    def _parse_iso_date(self, raw: str | None) -> date | None:
        if not raw:
            return None
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            return None

    def breakdown_task(self, task_text: str) -> list[dict[str, Any]]:
        cleaned = task_text.strip()
        if not cleaned:
            return []

        objective = self._extract_objective(cleaned)
        templates = self._breakdown_templates_for_text(cleaned)
        base_hash = abs(hash(cleaned)) % 10000

        return [
            {
                "id": f"sub-{idx + 1}-{base_hash}",
                "text": template.format(task=cleaned, objective=objective),
                "completed": False,
            }
            for idx, template in enumerate(templates)
        ]

    def _extract_objective(self, text: str) -> str:
        normalized = " ".join(text.split()).strip(" .")
        if not normalized:
            return "this task"

        stripped = re.sub(
            r"^(submit|create|write|draft|prepare|call|email|message|plan|organize|finish|complete)\s+",
            "",
            normalized,
            flags=re.IGNORECASE,
        ).strip()

        return stripped or normalized

    def _breakdown_templates_for_text(self, text: str) -> list[str]:
        lowered = text.lower()

        intent_catalog: dict[str, dict[str, list[str]]] = {
            "communication": {
                "patterns": [
                    r"\b(call|phone|ring|dial|talk\s+to|speak\s+with|follow\s*up)\b",
                    r"\bemail|mail|message|inbox|reply\b",
                ],
                "steps": [
                    "Clarify the exact outcome needed for {objective}",
                    "Prepare key points, files, or facts to reference",
                    "Send or conduct the communication with a clear ask",
                    "Capture decisions and owners immediately after",
                    "Set a follow-up checkpoint with a date/time",
                ],
            },
            "writing": {
                "patterns": [
                    r"\b(report|proposal|essay|document|write|draft|cv|resume|statement)\b",
                    r"\bsubmit|submission|deliverable\b",
                ],
                "steps": [
                    "Define the expected format and acceptance criteria for {objective}",
                    "Collect source material, references, and required facts",
                    "Draft the structure (sections, headings, key points)",
                    "Write the full draft focusing on clarity and flow",
                    "Review, edit, and submit the final version",
                ],
            },
            "meeting": {
                "patterns": [
                    r"\b(meeting|presentation|review|demo|sync|standup|discussion)\b",
                    r"\bagenda|stakeholder|judge|panel\b",
                ],
                "steps": [
                    "Set objective and success criteria for {objective}",
                    "Prepare agenda, talking points, and timing",
                    "Gather evidence/examples to support each key point",
                    "Run the meeting/demo and note decisions live",
                    "Share recap with actions, owners, and deadlines",
                ],
            },
            "engineering": {
                "patterns": [
                    r"\b(code|bug|feature|deploy|api|frontend|backend|integration|fastapi|dbms)\b",
                    r"\btest|fix|implement|refactor|debug\b",
                ],
                "steps": [
                    "Break {objective} into implementation milestones",
                    "Implement the highest-risk piece first",
                    "Validate with targeted tests and edge-case checks",
                    "Integrate changes and run end-to-end verification",
                    "Document what changed and ship safely",
                ],
            },
            "study": {
                "patterns": [
                    r"\b(study|learn|course|practice|exam|read|revise|revision)\b",
                    r"\btopic|chapter|syllabus|quiz\b",
                ],
                "steps": [
                    "Define the exact scope and output for {objective}",
                    "Split the topic into short focused chunks",
                    "Complete one focused study/practice block",
                    "Summarize key points from memory",
                    "Schedule a quick recall/revision session",
                ],
            },
        }

        intent_scores: dict[str, int] = {}
        for intent, config in intent_catalog.items():
            patterns = config.get("patterns", [])
            score = self._count_intent_hits(lowered, patterns)
            intent_scores[intent] = score

        best_intent = max(intent_scores.items(), key=lambda item: item[1])[0]
        best_score = intent_scores[best_intent]

        if best_score <= 0:
            base_steps = [
                "Define what done means for {objective}",
                "Prepare the inputs needed to start",
                "Execute the core work block for {objective}",
                "Review quality and close with clear next actions",
                "Log follow-up risks and schedule the next checkpoint",
            ]
        else:
            base_steps = intent_catalog[best_intent]["steps"]

        step_count = 4
        if len(text) >= 120 or text.count(",") >= 2 or re.search(r"\b(and|but|however|while)\b", lowered):
            step_count = 5

        offset = abs(hash(lowered)) % len(base_steps)
        rotated = base_steps[offset:] + base_steps[:offset]
        return rotated[:step_count]

    def _count_intent_hits(self, text: str, patterns: list[str]) -> int:
        score = 0
        for pattern in patterns:
            if re.search(pattern, text, flags=re.IGNORECASE):
                score += 1
        return score

    def orchestrate_tasks(self, tasks: list[dict[str, Any]], mood: str | None) -> dict[str, Any]:
        ranked = []
        for task in tasks:
            text = str(task.get("text", "")).strip()
            is_completed = bool(task.get("completed", False))
            urgency = 0.0 if is_completed else min(1.0, 0.35 + (len(text) / 120.0))
            ranked.append(
                {
                    "id": task.get("id"),
                    "text": text,
                    "completed": is_completed,
                    "priorityScore": round(urgency, 3),
                }
            )

        ranked.sort(key=lambda item: item["priorityScore"], reverse=True)

        ambient_theme = "fuchsia-500/30" if (mood or "").lower() == "focus" else "emerald-500/20"
        return {
            "priorityScores": ranked,
            "ambientTheme": ambient_theme,
        }
