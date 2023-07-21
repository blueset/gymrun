import os
import random
import shelve
import time
from dotenv import load_dotenv
import gpsoauth
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.api_core.client_options import ClientOptions


load_dotenv()
GOOGLE_MASTER_TOKEN = os.environ["GOOGLE_MASTER_TOKEN"]
GOOGLE_USERNAME = os.environ["GOOGLE_USERNAME"]
SHELVE_PATH = "shelve.db"
CHANNEL_ID = "gymrun_channel_watch"

app_id = "com.imperon.android.gymapp"
app_signature = "c74f618b352df7d73627daa2f010c4bfc79faa21"
device_id = "0242AC110002"

def store(key, channel):
    with shelve.open(SHELVE_PATH) as db:
        db[key] = channel
        db.sync()

def get(key):
    with shelve.open(SHELVE_PATH) as db:
        if key not in db:
            return None
        return db[key]

def get_token():
    auth = gpsoauth.perform_oauth(
        GOOGLE_USERNAME,
        GOOGLE_MASTER_TOKEN,
        device_id,
        "oauth2:https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file",
        app_id,
        app_signature,
    )
    # {'issueAdvice': 'auto', 'Expiry': '(unix timestamp)', 'ExpiresInDurationSec': '3599', 
    # 'storeConsentRemotely': '0', 'isTokenSnowballed': '0', 'grantedScopes': 'https://www.googleapis.com/auth/drive.appdata', 
    # 'Auth': '(token)'}
    return auth["Auth"]

def get_service():
    creds = Credentials(get_token())
    service = build('drive', 'v3', credentials=creds, client_options=ClientOptions(scopes=["https://www.googleapis.com/auth/drive.appdata", "https://www.googleapis.com/auth/drive.file"]))
    return service

def get_file_id(service):
    results = service.files().list(spaces="appDataFolder", pageSize=10, fields="nextPageToken, files(id, name, modifiedTime)").execute()
    for f in results["files"]:
        if f["name"] == "gymapp.db":
            return f["id"]

def get_file(service, file_id):
    data = service.files().get_media(fileId=file_id).execute()
    return data

def subscribe(service, url):
    file_id = get_file_id(service)
    body = {
        'kind': 'api#channel',
        'resourceId': file_id,
        'id': f"{CHANNEL_ID}{random.randint(0, 100000)}",
        'token': file_id,
        'type': 'web_hook',
        'address': url,
        'expiration': int(time.time() + 24*60*60) * 1000 # 1 day
    }
    channel = service.files().watch(fileId=file_id, body=body).execute()
    store("channel", channel)
    return channel

def unsubscribe(service):
    channel = get("channel")
    if channel:
        service.channels().stop(body=channel).execute()
        store("channel", None)

def resubscribe(service, url):
    unsubscribe(service)
    subscribe(service, url)

if __name__ == "__main__":
    pass
