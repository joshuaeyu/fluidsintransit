from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from typing import Sequence
from sqlmodel import SQLModel, create_engine, Session, select, col, or_, text
from .models import * # Must declare all Model classes before creating tables

# SQLite database
sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///backend/data/{sqlite_file_name}"
# sqlite_inmemory_url = "sqlite://"

# Engine handles communication with database
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, echo=True, connect_args=connect_args) # echo = print all SQL statements

# Session dependency
def get_session():
    with Session(engine) as session:
        yield session

# Create database and table
def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    with engine.connect() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON")) # for SQLite; allows passive_deletes to allow the database to handle deletes/updates on its own