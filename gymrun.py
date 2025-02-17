from dataclasses import dataclass
from io import BytesIO
import itertools
from tempfile import NamedTemporaryFile, TemporaryDirectory
from typing import List, Tuple, Literal
from requests.models import Response
import sqlite3
import pyzipper
from datetime import datetime

@dataclass
class Exercise:
    time: datetime
    name: str
    unit: Literal["lbs", "kg", None]
    weight: float
    reps: int
    set: int

def lbs_to_kg(lbs: float) -> float:
    return lbs * 0.45359237

def kg_to_lbs(kg: float) -> float:
    return kg * 2.20462262

def get_sqlite_file(data: bytes) -> bytes:
    with TemporaryDirectory() as ve_dir, NamedTemporaryFile(dir=ve_dir, delete=False) as tmp:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        with pyzipper.AESZipFile(tmp.name) as zf:
            zf.setpassword(b"13-ImPeRiOn,90#")
            return zf.read("gymapp.db")

def read_sqlite_file(sqlite_file: bytes):
    with TemporaryDirectory() as ve_dir, NamedTemporaryFile(dir=ve_dir, delete=False) as tmp:
        tmp.write(sqlite_file)
        tmp.flush()
        tmp.close()
        value = []
        conn =sqlite3.connect(tmp.name)
        c = conn.cursor()
        c.execute("select entry.time, entry.data, exercise.xlabel, exercise.unit from entry inner join exercise on entry.exercise = exercise._id where entry.time >= (select time_start from workout order by time_start desc limit 1) and entry.time <= (select time_end from workout order by time_start desc limit 1);")
        value = c.fetchall()
        c.close()
        conn.close()
    return value

def parse_data(data: List[Tuple[int, str, str, str]]) -> List[List[Exercise]]:
    result = []
    for d in data:
        time = datetime.fromtimestamp(d[0])
        property_pairs = dict(map(lambda x: tuple(map(float, x.split("-"))), d[1].split(",")))
        set_number = int(property_pairs.get(3, 0))
        weight = property_pairs.get(4, 0)
        reps = int(property_pairs.get(5, 0) + property_pairs.get(52, 0))
        name = d[2]
        unit = None if d[3] is None else "lbs" if d[3] == "2" else "kg"
        if unit == "lbs":
            weight = round(kg_to_lbs(weight))
        else:
            weight = int(weight)
        result.append(Exercise(time, name, unit, weight, reps, set_number))

    # Group result by name then sort by set
    result.sort(key=lambda x: x.set)
    result.sort(key=lambda x: x.name)
    groups = []
    for k, g in itertools.groupby(result, lambda x: x.name):
        groups.append(list(g))
        
    return groups

def process_zip(data: bytes) -> List[List[Exercise]]:
    sqlite_file = get_sqlite_file(data)
    result = read_sqlite_file(sqlite_file)
    parsed = parse_data(result)
    return parsed

def process_db(sqlite_file: bytes) -> List[List[Exercise]]:
    result = read_sqlite_file(sqlite_file)
    parsed = parse_data(result)
    return parsed
