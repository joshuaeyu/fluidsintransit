import pathlib

from sqlalchemy import create_engine,  MetaData, text
from sqlalchemy.orm import sessionmaker

from .models import * # Must declare all Model classes before creating tables

# SQLite database
sqlite_path = pathlib.Path(__file__).parents[2].joinpath("data/database.db").resolve()
sqlite_url = "sqlite+pysqlite:///" + str(sqlite_path)

# Engine handles communication with database
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, echo=False, connect_args=connect_args) # echo = print all SQL statements

# Session dependency
Session = sessionmaker(engine)
# with Session() as session
# with Session().begin() as session

# Create database and table
def create_db_and_tables():
    # Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)