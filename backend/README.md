# SARCINA Backend

## Run backend AI service

```bash
cd backend
python -m venv venv
venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health endpoint:

- `GET http://localhost:8000/health`

AI endpoints used by frontend:

- `POST http://localhost:8000/api/agent/new-task`
- Body:
  - `prompt`: natural language task request
  - `preferred_date`: optional `YYYY-MM-DD`

- `POST http://localhost:8000/api/agent/habit-suggestions`
- Body:
  - `goal`: user goal text (for example, "get better at playing Valorant")
  - `existing_habits`: optional list of existing habit names
  - `count`: optional number of suggestions (1-6)
- Notes:
  - Uses a free external model first (no billing key required).
  - Uses Gemini second when `GEMINI_API_KEY` is set (optional).
  - Falls back to local suggestions if external AI is unavailable.

- `POST http://localhost:8000/api/agent/breakdown`
- Body:
  - `task`: object with task text

- `POST http://localhost:8000/api/agent/orchestrate`
- Body:
  - `tasks`: list of task objects
  - `mood`: current UI mode

- `GET http://localhost:8000/api/meta/quote`
- Returns quote-of-the-moment payload for ticker
