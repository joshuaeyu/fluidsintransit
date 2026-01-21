from fastapi import APIRouter

from ..db.models import VehiclePosition
from ..services.fetcher import load_from_cache

router = APIRouter(prefix="/live")

@router.get("", response_model=None)
def get_vehiclepositions() -> dict[str, VehiclePosition] | None:
    return load_from_cache()

@router.get("/{vehicle_id}", response_model=None)
def get_vehicleposition(vehicle_id: str) -> VehiclePosition | None:
    vehicle_dict = load_from_cache()
    return vehicle_dict.get(vehicle_id)