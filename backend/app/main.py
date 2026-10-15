"""FastAPI app: list, view and save projects through the upstream, merging concurrent edits."""

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import config, merge
from app.models import ConflictResponse, Editable, ProjectSummary, SaveRequest
from app.upstream_client import EDITABLE_KEYS, UpstreamClient, UpstreamError, editable_of

PROBLEM = "application/problem+json"


def problem(status: int, kind: str, title: str, **extra) -> JSONResponse:
    return JSONResponse({"type": kind, "status": status, "title": title, **extra}, status_code=status, media_type=PROBLEM)


def display(raw: dict) -> dict:
    """Detail shape: editable fields plus the read-only ones for display."""
    return {
        "id": raw["id"],
        "editable": Editable(**editable_of(raw)).model_dump(mode="json"),
        "readonly": {k: v for k, v in raw.items() if k not in EDITABLE_KEYS and k != "id"},
    }


def norm(data: dict) -> dict:
    return Editable(**data).model_dump(mode="json")


def conflict_response(kind: str, title: str, current: dict, conflicts: list, auto_merged: list) -> JSONResponse:
    body = ConflictResponse(type=kind, title=title, current=current, conflicts=conflicts, auto_merged=auto_merged)
    return JSONResponse(body.model_dump(mode="json"), status_code=409, media_type=PROBLEM)


async def save_project(client: UpstreamClient, project_id: str, req: SaveRequest) -> JSONResponse:
    base, mine = norm(req.base.model_dump()), norm(req.mine.model_dump())
    raw = await client.get_project(project_id)
    current = norm(editable_of(raw))
    attempts = 0
    while True:
        result = merge.three_way_merge(base, mine, current, req.resolutions, req.seen)
        auto = list(result.auto_merged)
        if result.conflicts:
            return conflict_response("conflict", "The project changed while you were editing", current, result.conflicts, auto)
        merged = norm(result.merged)
        if merged == current:
            return JSONResponse({"project": display(raw), "saved": True, "auto_merged": auto})
        confirmed = False
        try:
            await client.put_project(project_id, merged)
        except UpstreamError as exc:
            if exc.status != 504:
                raise
            # The write may or may not have landed: read before deciding anything.
            raw = await client.get_project(project_id)
            if norm(editable_of(raw)) == merged:
                confirmed = True
            else:
                current = norm(editable_of(raw))
                attempts += 1
                if attempts > config.MAX_PUT_RETRIES:
                    raise UpstreamError(504, "The save could not be confirmed", {"current": current})
                continue
        raw = await client.get_project(project_id)
        stored = norm(editable_of(raw))
        if stored != merged:
            return conflict_response("concurrent_overwrite_detected",
                                     "Someone else saved at the same moment; your save was overwritten",
                                     stored, [], auto)
        out = {"project": display(raw), "saved": True, "auto_merged": auto}
        if confirmed:
            out["confirmed_after_504"] = True
        return JSONResponse(out)


def create_app(transport: httpx.AsyncBaseTransport | None = None, base_url: str | None = None,
               api_key: str | None = None) -> FastAPI:
    client = UpstreamClient(transport=transport, base_url=base_url, api_key=api_key)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await client.close()

    app = FastAPI(title="BNamericas project editor", lifespan=lifespan)
    app.state.upstream = client

    @app.exception_handler(UpstreamError)
    async def upstream_error(_, exc: UpstreamError):
        extra = {}
        if exc.status in (404, 422) and exc.body:
            extra["upstream"] = exc.body
        if isinstance(exc.body, dict) and "current" in exc.body:
            extra["current"] = exc.body["current"]
        return problem(exc.status, "upstream_error", exc.detail, detail=exc.detail, **extra)

    @app.exception_handler(RequestValidationError)
    async def invalid(_, exc: RequestValidationError):
        return problem(422, "validation_error", "The request is not valid", errors=exc.errors())

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/api/projects")
    async def list_projects():
        rows = await client.list_projects()
        return [ProjectSummary(**{k: r[k] for k in ProjectSummary.model_fields}).model_dump() for r in rows]

    @app.get("/api/projects/{project_id}")
    async def get_project(project_id: str):
        return display(await client.get_project(project_id))

    @app.put("/api/projects/{project_id}")
    async def put_project(project_id: str, req: SaveRequest):
        try:
            return await save_project(client, project_id, req)
        except UpstreamError as exc:
            if exc.status in (502, 504) and not (isinstance(exc.body, dict) and "current" in exc.body):
                exc.body = {"current": await _last_current(client, project_id)}
            raise

    return app


async def _last_current(client: UpstreamClient, project_id: str) -> dict | None:
    """Best effort: the latest editable snapshot so the form is not lost on a 502/504."""
    try:
        return norm(editable_of(await client.get_project(project_id)))
    except Exception:
        return None


app = create_app()
