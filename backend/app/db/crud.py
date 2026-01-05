from fastapi import HTTPException, Query
from sqlmodel import select, Session
from typing import Iterable
from models import *
from db import engine

# ===== Vehicle operations =====

def create_vehicle(vehicle: VehicleCreate):
    with Session(engine) as session:
        db_vehicle = Vehicle.model_validate(vehicle)
        session.add(db_vehicle)
        session.commit()
        session.refresh(db_vehicle)
        return db_vehicle

def create_vehicles(vehicles: Iterable[VehicleCreate]):
    with Session(engine) as session:
        creations: list[Vehicle] = []
        for vehicle in vehicles:
            db_vehicle = Vehicle.model_validate(vehicle)
            session.add(db_vehicle)
            session.commit()
            session.refresh(db_vehicle)
            creations.append(db_vehicle)
        return creations
    
def read_vehicle(vehicle_id: int):
    with Session(engine) as session:
        vehicle = session.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(404, "Vehicle not found")
        return vehicle

def read_vehicles(offset: int = 0, limit: int = Query(default=100, le=1000)):
    with Session(engine) as session:
        vehicles = session.exec(select(Vehicle).offset(offset).limit(limit)).all()
        return vehicles

def update_vehicle(vehicle_id: int, vehicle: VehicleUpdate):
    with Session(engine) as session:
        db_vehicle = session.get(Vehicle, vehicle_id)
        if not db_vehicle:
            raise HTTPException(404, "Vehicle not found")
        vehicle_data = vehicle.model_dump(exclude_unset=True)
        db_vehicle.sqlmodel_update(vehicle_data)
        session.add(db_vehicle)
        session.commit()
        session.refresh(db_vehicle)
        return db_vehicle
    
def delete_vehicle(vehicle_id: int):
    with Session(engine) as session:
        db_vehicle = session.get(Vehicle, vehicle_id)
        if not db_vehicle:
            raise HTTPException(404, "Vehicle not found")
        session.delete(db_vehicle)
        session.commit()
        return {"ok": True}

# ===== Route operations =====

def create_route(route: RouteCreate):
    with Session(engine) as session:
        db_route = Route.model_validate(route)
        session.add(db_route)
        session.commit()
        session.refresh(db_route)
        return db_route

def create_routes(routes: Iterable[RouteCreate]):
    with Session(engine) as session:
        creations: list[Route] = []
        for route in routes:
            db_route = Route.model_validate(route)
            session.add(db_route)
            session.commit()
            session.refresh(db_route)
            creations.append(db_route)
        return creations
    
def read_route(route_id: int):
    with Session(engine) as session:
        route = session.get(Route, route_id)
        if not route:
            raise HTTPException(404, "Route not found")
        return route

def read_routes(offset: int = 0, limit: int = Query(default=100, le=1000)):
    with Session(engine) as session:
        routes = session.exec(select(Route).offset(offset).limit(limit)).all()
        return routes

def update_route(route_id: int, route: RouteUpdate):
    with Session(engine) as session:
        db_route = session.get(Route, route_id)
        if not db_route:
            raise HTTPException(404, "Route not found")
        route_data = route.model_dump(exclude_unset=True)
        db_route.sqlmodel_update(route_data)
        session.add(db_route)
        session.commit()
        session.refresh(db_route)
        return db_route
    
def delete_route(route_id: int):
    with Session(engine) as session:
        db_route = session.get(Route, route_id)
        if not db_route:
            raise HTTPException(404, "Route not found")
        session.delete(db_route)
        session.commit()
        return {"ok": True}