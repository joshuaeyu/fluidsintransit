from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class VehiclePosition(Base):
    __tablename__ = "vehicle_position"

    id: Mapped[int] = mapped_column(primary_key=True)

    timestamp_fetch: Mapped[int] = mapped_column(index=True)
    timestamp: Mapped[int] = mapped_column(index=True)
    batch_id: Mapped[int]
    
    trip_id: Mapped[str | None]
    route_id: Mapped[str | None]
    vehicle_id: Mapped[str]
    vehicle_label: Mapped[str]
    
    latitude: Mapped[float]
    longitude: Mapped[float]
    bearing: Mapped[float | None]
    odometer: Mapped[float | None]
    speed: Mapped[float | None]

    apparent_velocity_lat: Mapped[float | None]
    apparent_velocity_long: Mapped[float | None]