from typing import Sequence

from fastapi import APIRouter
from sqlalchemy import select, func

from ..db.db import Session
from ..db.models import VehiclePosition

router = APIRouter(prefix="/history")
    
@router.get("", response_model=None)
def get_vehiclepositions_lastbatch() -> dict[int, list[VehiclePosition]] | None:
    with Session() as session:
        subquery = select(func.max(VehiclePosition.batch_id)).subquery()
        statement = select(VehiclePosition).where(VehiclePosition.batch_id == subquery).order_by(VehiclePosition.timestamp_fetch)
        vehicles = session.scalars(statement).all()
        batch_dataframe = {}
        for vp in vehicles:
            if vp.timestamp_fetch not in batch_dataframe:
                batch_dataframe[vp.timestamp_fetch] = []
            batch_dataframe[vp.timestamp_fetch].append(vp)
        return batch_dataframe

@router.get("/batch/{batch_id}", response_model=None)
def get_vehiclepositions_history(batch_id: int) -> dict[str, VehiclePosition] | None:
    with Session() as session:
        statement = select(VehiclePosition).where(VehiclePosition.batch_id == batch_id).order_by(VehiclePosition.batch_id)
        vehicles = session.scalars(statement).all()
        batch_dataframe = {}
        for vp in vehicles:
            if vp.timestamp_fetch not in batch_dataframe:
                batch_dataframe[vp.timestamp_fetch] = []
            batch_dataframe[vp.timestamp_fetch].append(vp)
        return batch_dataframe
    
@router.get("/all_batch_ids", response_model=None)
def get_allbatchids() -> Sequence[int]:
    with Session() as session:
        statement = select(VehiclePosition.batch_id).distinct()
        batch_ids = session.scalars(statement).all()
        return batch_ids
        