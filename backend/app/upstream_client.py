"""The only code that talks to the upstream records API, through one shared httpx.AsyncClient."""

import logging
import time

import httpx

from app import config

log = logging.getLogger("upstream")

EDITABLE_KEYS = ("name", "sector", "country", "stage", "key_dates", "linked_companies")


class UpstreamError(Exception):
    """The upstream failed. status is what the browser should see (404/422 pass through, else 502/504)."""

    def __init__(self, status: int, detail: str, body: object = None):
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.body = body


def editable_of(project: dict) -> dict:
    """Keep only the six fields the upstream PUT accepts."""
    return {k: project[k] for k in EDITABLE_KEYS}


class UpstreamClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None,
                 base_url: str | None = None, api_key: str | None = None):
        self._http = httpx.AsyncClient(
            base_url=base_url or config.UPSTREAM_URL,
            headers={"X-Api-Key": api_key or config.UPSTREAM_API_KEY},
            timeout=httpx.Timeout(config.READ_TIMEOUT, connect=config.CONNECT_TIMEOUT),
            transport=transport,
        )

    async def close(self) -> None:
        await self._http.aclose()

    async def _send(self, method: str, path: str, **kw) -> httpx.Response:
        started = time.monotonic()
        try:
            resp = await self._http.request(method, path, **kw)
        except httpx.TimeoutException as exc:
            log.warning("upstream %s %s timeout after %.2fs", method, path, time.monotonic() - started)
            raise UpstreamError(504, "The upstream did not answer in time") from exc
        except httpx.HTTPError as exc:
            log.warning("upstream %s %s failed: %s", method, path, type(exc).__name__)
            raise UpstreamError(502, "The upstream is not reachable") from exc
        log.info("upstream %s %s -> %s in %.2fs", method, path, resp.status_code, time.monotonic() - started)
        if resp.status_code >= 400:
            try:
                body = resp.json()
            except ValueError:
                body = None
            status = resp.status_code if resp.status_code in (404, 422) else (504 if resp.status_code == 504 else 502)
            raise UpstreamError(status, f"The upstream answered {resp.status_code}", body)
        return resp

    async def _get(self, path: str):
        """GET with one retry on timeout or 5xx; 4xx is final."""
        try:
            return (await self._send("GET", path)).json()
        except UpstreamError as first:
            if first.status in (404, 422):
                raise
            return (await self._send("GET", path)).json()

    async def list_projects(self) -> list[dict]:
        return await self._get("/projects")

    async def get_project(self, project_id: str) -> dict:
        return await self._get(f"/projects/{project_id}")

    async def put_project(self, project_id: str, editable: dict) -> dict:
        """Never retried here: after a 504 the caller must re-read to learn whether it applied."""
        return (await self._send("PUT", f"/projects/{project_id}", json=editable)).json()
