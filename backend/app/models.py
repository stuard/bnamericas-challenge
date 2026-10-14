"""Pydantic models: the editable fields, the save request and the 409 conflict body."""

from typing import Literal

from pydantic import BaseModel, Field

Sector = Literal["energy", "mining", "water", "transport", "oil_and_gas", "ict"]
Stage = Literal["idea", "feasibility", "tender", "financing", "construction", "operation", "cancelled"]
CompanyRole = Literal["owner", "developer", "epc_contractor", "financier", "consultant"]


class KeyDate(BaseModel):
    label: str = Field(min_length=1)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class LinkedCompany(BaseModel):
    name: str = Field(min_length=1)
    role: CompanyRole


class Editable(BaseModel):
    """The fields a person may change; this is exactly what the upstream PUT accepts."""

    name: str = Field(min_length=1)
    sector: Sector
    country: str = Field(min_length=1)
    stage: Stage
    key_dates: list[KeyDate]
    linked_companies: list[LinkedCompany]


class SaveRequest(BaseModel):
    """base = snapshot the browser loaded, mine = values to save, resolutions = choice per conflicting key."""

    base: Editable
    mine: Editable
    resolutions: dict[str, Literal["mine", "theirs"]] | None = None


class Conflict(BaseModel):
    key: str
    field: str
    label: str | None = None
    base: str | None = None
    mine: str | None = None
    theirs: str | None = None


class ConflictResponse(BaseModel):
    """Body of the 409 answer; current is the new base for the retry."""

    type: str = "conflict"
    status: int = 409
    title: str = "The project changed while you were editing"
    current: Editable
    conflicts: list[Conflict]
    auto_merged: list[str] = []


class ProjectSummary(BaseModel):
    id: str
    name: str
    sector: str
    country: str
    stage: str
