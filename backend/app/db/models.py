from sqlmodel import Field, SQLModel, Relationship

# ===== Route model =====

class RouteBase(SQLModel): # Data model
    route_id: str | None = Field(default=None, index=True)

class Route(RouteBase, table=True): # Table model
    id: int | None = Field(default=None, primary_key=True) # None until saved to database; index automatically created for primary keys
    # vehicles: list["Vehicle"] = Relationship(back_populates="route", passive_deletes="all") 
    vehicles: list["Vehicle"] = Relationship(back_populates="route", cascade_delete=True) 
    # back_populates = Name of corresponding attribute in the other model
    # cascade_delete = Automatically delete vehicles (from both Python and database) when route is deleted via session.delete()
    # passive_deletes = SQLModel skips loading and deleting records before sending the delete for the team, allowing the database to handles these on its own (slightly more efficient?)

class RouteCreate(RouteBase): # Data model
    pass

class RoutePublic(RouteBase): # Data model
    id: int

class RoutePublicWithVehicles(RoutePublic): # Data model
    vehicles: list["VehiclePublic"] = []

class RouteUpdate(SQLModel): # Data model
    route_id: str | None = None
    vehicles: list["Vehicle"] | None = None

# ===== Vehicle model =====

class VehicleBase(SQLModel): # Data model
    vehicle_id: int = Field(index=True) # Use as an index (increases write cost but decreases filter (search) cost when using WHERE)
    # route_id: int | None = Field(default=None, foreign_key="route.id", ondelete="CASCADE") # id column of route table
    route_id: int | None = Field(default=None, foreign_key="route.id", ondelete="SET NULL") # id column of route table
    # route_id: int | None = Field(default=None, foreign_key="route.id", ondelete="RESTRICT") # id column of route table
    # ondelete = Database handles response to route deletion - either CASCADE, SET NULL, or RESTRICT
    # SET NULL - database sets field to NULL
    # CASCADE - database deletes vehicle 
    # RESTRICT - database raises an error; route deletion not allowed!
    # back_populates = Name of corresponding attribute in the other model
    latitude: float | None = None
    longitude: float | None = None
    speed: float | None = None
    bearing: float | None = None

class Vehicle(VehicleBase, table=True): # Table model
    id: int | None = Field(default=None, primary_key=True) # None until saved to database; index automatically created for primary keys
    route: Route | None = Relationship(back_populates="vehicles") 

class VehicleCreate(VehicleBase): # Data model
    pass

class VehiclePublic(VehicleBase): # Data model
    id: int = Field(primary_key=True) # None until saved to database; index automatically created for primary keys

class VehiclePublicWithRoute(VehiclePublic): # Data model
    route: RoutePublic | None = None

class VehicleUpdate(SQLModel): # Data model
    vehicle_id: int | None = None
    route_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    speed: float | None = None
    bearing: float | None = None

# Field - Database (SQL)
# Relationship - SQLModel (Python)

# delete config options
# - cascade_delete=True, ondelete="CASCADE"
# - ondelete="SET NULL"
# - passive_deletes="all", ondelete="SET NULL"
# - passive_deletes="all", ondelete="RESTRICT"

# Use a link table for many-to-many relationships