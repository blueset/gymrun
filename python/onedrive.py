import asyncio
import os
import time
from azure.core.credentials import AccessToken
from msal import ConfidentialClientApplication, SerializableTokenCache
from dotenv import load_dotenv
from msgraph import GraphServiceClient
from msgraph.generated.models.subscription import Subscription
import aiohttp

from gymrun import process_zip

load_dotenv()
AZURE_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad"
AZURE_CLIENT_ID = os.environ["AZURE_CLIENT_ID"]
AZURE_CLIENT_SECRET = os.environ["AZURE_CLIENT_SECRET"]
AZURE_REDIRECT_URI = os.environ["AZURE_REDIRECT_URI"]
scopes = ['https://graph.microsoft.com/.default']

class MSALCredential:
    def __init__(self):
        self.cache = SerializableTokenCache()
        if os.path.exists("token_cache.bin"):
            self.cache.deserialize(open("token_cache.bin", "r").read())
        self.app = ConfidentialClientApplication(
            client_id=AZURE_CLIENT_ID,
            client_credential=AZURE_CLIENT_SECRET,
            authority=f"https://login.microsoftonline.com/{AZURE_TENANT_ID}",
            token_cache=self.cache
        )

    def get_authorization_url(self, scopes):
        app = self.app
        result = app.acquire_token_for_client(scopes)
        if "error" in result:
            raise Exception(f"{result}")

        flow = app.initiate_auth_code_flow(scopes=scopes, redirect_uri=AZURE_REDIRECT_URI)

        if "error" in flow:
            raise Exception(f"{flow}")

        return flow["auth_uri"], flow
    
    def process_auth_response_url(self, auth_resp_url, flow):
        app = self.app
        # parse query string into dict
        auth_resp_url = auth_resp_url.split("?")[1]
        auth_resp = dict(q.split("=") for q in auth_resp_url.split("&"))
        print(f"{auth_resp = }")

        # The uth_response value from visiting the auth_uri endpoint is passed as a query string
        # You can change this by passing a value to the response_mode in the initiate_auth_code_flow method
        try:
            result = app.acquire_token_by_auth_code_flow(flow, auth_resp)
            
            if "access_token" in result:
                # print(f"{result = }")
                return result
            else:
                raise Exception(f"{result}")
        except ValueError:  # Usually caused by CSRF
            pass  # Simply ignore them
    
    def get_token(
        self,
        *scopes: str,
        claims = None,
        tenant_id = None,
        enable_cae: bool = False,
        **kwargs
    ):
        result = None
        app = self.app

        scopes = list(scopes)
        # print(f"{scopes = }")

        accounts = app.get_accounts()
        # print(f"{accounts = }")
        if accounts:
            result = app.acquire_token_silent(scopes, account=accounts[0])
            # print(f"acquire_token_silent, {result = }")

        if not result:
            _, flow = self.get_authorization_url(scopes)

            auth_resp_url = input("Redirect URL: ")
            result = self.process_auth_response_url(auth_resp_url, flow)
        
        if result:
            with open("token_cache.bin", "w") as f:
                f.write(self.cache.serialize())

        return AccessToken(result["access_token"], result["expires_in"] + time.time())

credential = MSALCredential()
client = GraphServiceClient(credentials=credential, scopes=scopes)

async def get_zip():
    item = await client.drives.with_url("https://graph.microsoft.com/v1.0/drives/me/root:/Apps/GymRun/gymapp.zip").get()
    download_url = item.additional_data["@microsoft.graph.downloadUrl"]
    async with aiohttp.ClientSession() as session:
        async with session.get(download_url) as response:
            if response.status == 200:
                file_bytes = await response.read()
                return file_bytes
            else:
                raise Exception("Failed to download file")

async def register_subscription(url: str):
    after_60_days_iso_8901 = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 60*24*60*60))
    result = await client.drives.with_url("https://graph.microsoft.com/v1.0/drive/root/subscriptions").post(Subscription(
        change_type="updated",
        notification_url=url,
        resource="/drives/me/root:/Apps/GymRun/gymapp.zip",
        expiration_date_time=after_60_days_iso_8901,
    ))
    return result

async def main():
    zip = await get_zip()
    print("process_zip", process_zip(zip))

if __name__ == "__main__":
    asyncio.run(main())
    pass
