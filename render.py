from datetime import datetime
from typing import List, Literal
import pickle
import pathlib
import base64

import humanize
import html2image
from jinja2 import Template
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

from gymrun import Exercise, lbs_to_kg, kg_to_lbs

chrome_options = Options()
chrome_options.add_argument('--headless')
chrome_options.add_argument("--remote-debugging-port=9222")
chrome_options.add_argument(f"--force-device-scale-factor=2")

hti = html2image.Html2Image()
Unit = Literal["lbs", "kg", "native"]

with open("./static/Archivo[wdth,wght].ttf", "rb") as f:
    font_b64 = base64.b64encode(f.read()).decode("utf-8")

def format_set(exercises: List[Exercise], unit: Unit) -> str:
    if unit == "native":
        sets = []
        for exercise in exercises:
            if exercise.unit is None:
                sets.append(f"×{exercise.reps}")
            else:
                sets.append(f"{exercise.weight}{exercise.unit}×{exercise.reps}")
        return ", ".join(sets)
    elif unit == "lbs":
        sets = []
        for exercise in exercises:
            if exercise.unit is None:
                sets.append(f"×{exercise.reps}")
            elif exercise.unit == "kg":
                weight = round(kg_to_lbs(exercise.weight))
            else:
                weight = exercise.weight
            sets.append(f"{weight}lbs×{exercise.reps}")
        return ", ".join(sets)
    else:
        sets = []
        for exercise in exercises:
            if exercise.unit is None:
                sets.append(f"×{exercise.reps}")
            elif exercise.unit == "lbs":
                weight = round(lbs_to_kg(exercise.weight))
            else:
                weight = exercise.weight
            sets.append(f"{weight}kg×{exercise.reps}")
        return ", ".join(sets)

def store_data(data: List[List[Exercise]]):
    with open("data.pickle", "wb") as f:
        pickle.dump(data, f)

def load_data() -> List[List[Exercise]]:
    with open("data.pickle", "rb") as f:
        return pickle.load(f)

def calculate_stretch(name: str) -> str:
    return f"{int(min(100, max(0, len(name) * -2.1 + 194)))}%"  # Archivo

def build_svg(data: List[List[Exercise]], unit: Unit = "native") -> str:
    with open("template.svg") as f:
        template = Template(f.read())
    last_time = max(map(lambda x: x.time, sum(data, [])))
    last_time_word = humanize.naturaltime(datetime.now() - last_time)

    exercises = [{
        "name": e[0].name,
        "sets": format_set(e, unit),
        "stretch": calculate_stretch(e[0].name),
    } for e in data]
    
    svg = template.render(exercises=exercises, last_update=last_time_word, font_b64=font_b64)
    
    return svg

def render(data: List[List[Exercise]], unit: Unit = "native"):
    store_data(data)
    svg = build_svg(data, unit)
    with open("card.svg", "w") as f:
        f.write(svg)

    driver = webdriver.Chrome(options=chrome_options)

    # Load the SVG image
    driver.get(pathlib.Path("card.svg").absolute().as_uri())

    # Get the SVG element
    svg_element = driver.find_element(By.TAG_NAME, 'svg')

    # Get the dimensions of the SVG element
    width = svg_element.get_attribute('width')
    height = svg_element.get_attribute('height')

    # Set the dimensions of the browser window to match the SVG element
    driver.set_window_size(width, height)

    # Take a screenshot of the SVG element and save it as a PNG file
    driver.save_screenshot('card.png')

    # Quit the driver
    driver.quit()
