import os
from typing import List
from dotenv import load_dotenv
from mastodon import Mastodon
from retry import retry
from misskey import Misskey

from gymrun import Exercise

load_dotenv()

MASTODON_BASE_URL = os.environ['MASTODON_BASE_URL']
MASTODON_CLIENT_KEY = os.environ['MASTODON_CLIENT_KEY']
MASTODON_CLIENT_SECRET = os.environ['MASTODON_CLIENT_SECRET']
MASTODON_ACCESS_TOKEN = os.environ['MASTODON_ACCESS_TOKEN']
MISSKEY_BASE_URL = os.environ['MISSKEY_BASE_URL']
MISSKEY_ACCESS_TOKEN = os.environ['MISSKEY_ACCESS_TOKEN']
POST_MODE = os.environ['POST_MODE']


def caption(exercises: List[List[Exercise]]) -> str:
    groups = []
    for exercise in exercises:
        sets = ", ".join(map(lambda x: f"{x.weight}{x.unit}×{x.reps}", exercise))
        groups.append(f"{exercise[0].name}\n{sets}")
    return "Recent workout\n\n" + "\n\n".join(groups)

@retry(delay=1, backoff=2, max_delay=4, tries=5)
def toot_card(exercises: List[List[Exercise]], time):
    text = caption(exercises)
    if POST_MODE == "mastodon":
        mastodon = Mastodon(client_id=MASTODON_CLIENT_KEY, client_secret=MASTODON_CLIENT_SECRET,
                            access_token=MASTODON_ACCESS_TOKEN, api_base_url=MASTODON_BASE_URL)
        media = mastodon.media_post("card.png", mime_type="image/png", description=text)
        post = mastodon.status_post("Workout of the day.", visibility="public", language="en", media_ids=[media["id"]])
        return post["url"]
    elif POST_MODE == "misskey":
        with open("card.png", "rb") as f:    
            mk = Misskey(address=MISSKEY_BASE_URL, i=MISSKEY_ACCESS_TOKEN)
            file = mk.drive_files_create(file=f, name=f"gymrun-{time.isoformat()}.png")
            mk.drive_files_update(file["id"], comment=text)
            post = mk.notes_create(text="Workout of the day.", visibility="public", file_ids=[file["id"]])
            return f"{MISSKEY_BASE_URL}/notes/{post['createdNote']['id']}"

