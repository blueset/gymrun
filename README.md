# GymRun Poster

Monitor [GymRun] automatic backups to [OneDrive], and generate poster for the most recent workout.

Poster can be accessible as a dynamic SVG image, and is posted to Mastodon or Misskey.

## Setup

<!--
1. Setup GymRun to automatically backup to Google Drive.
2. Use [GPSOauth] to get the master token of your account.
    ```python
    import gpsoauth

    email = 'example@gmail.com'  # Your Google account email
    password = 'my-password'  # Your Google account password, if you have 2FA, use an “app password”
    android_id = '0123456789abcdef'  # Get it from `adb shell 'settings get secure android_id'`

    # As of July 2023, you need to install OpenSSL 1.* and urllib3 1.26.16 to make this work.
    # Install urllib3 1.* with `pip install urllib3==1.26.16`.
    # Check your OpenSSL version with `python -c "import ssl; print(ssl.OPENSSL_VERSION)"`.
    master_response = gpsoauth.perform_master_login(email, password, android_id)
    master_token = master_response['Token']
    # Master token usually starts with `aas_et/`
    print(master_token)
    ```
4. Create a `.env` file as the example.
5. Run the Flask server at `app.py`.

[Google Drive]: https://www.google.com/drive/
[GPSOauth]: https://github.com/simon-weber/gpsoauth/
-->

1. Setup GymRun to automatically backup to OneDrive.
2. Create an application at [Microsoft Entra].
3. Create an application in your Mastodon or Misskey instance.
4. Create a `.env` file as the example.

## Card

Card PNG is available at `{Root URL}/card.png`, where the timestamp is updated updated upon request.
Suffix with `?unit=native`, `?unit=kg`, or `?unit=lbs` to change the units.

[GymRun]: https://play.google.com/store/apps/details?id=com.imperon.android.gymapp
[OneDrive]: https://onedrive.live.com/
[Microsoft Entra]: https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview

## Demo

| Native units | Metric units | Imperial units |
|:--:|:--:|:--:|
| ![Demo (Native units)](https://labs.1a23.com/gymrun/card.png) | ![Demo (Metric units)](https://labs.1a23.com/gymrun/card.png?unit=kg) | ![Demo (Imperial units)](https://labs.1a23.com/gymrun/card.png?unit=lbs) |

## License

MIT
