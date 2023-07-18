import os
import pprint
import threading
from flask import Flask, request, url_for, make_response, send_file
from dotenv import load_dotenv
import urllib3
import shelve
from drive import CHANNEL_ID, get_file, get_file_id, get_service, resubscribe

from gymrun import process_db
from post import toot_card
from render import build_svg, load_data, render

class ReverseProxied(object):
    '''Wrap the application in this middleware and configure the 
    front-end server to add these headers, to let you quietly bind 
    this to a URL other than / and to an HTTP scheme that is 
    different than what is used locally.

    In nginx:
    location /myprefix {
        proxy_pass http://192.168.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Scheme $scheme;
        proxy_set_header X-Script-Name /myprefix;
    }

    :param app: the WSGI application
    '''
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        script_name = environ.get('HTTP_X_SCRIPT_NAME', '')
        if script_name:
            environ['SCRIPT_NAME'] = script_name
            path_info = environ['PATH_INFO']
            if path_info.startswith(script_name):
                environ['PATH_INFO'] = path_info[len(script_name):]

        scheme = environ.get('HTTP_X_SCHEME', '')
        if scheme:
            environ['wsgi.url_scheme'] = scheme
        return self.app(environ, start_response)

load_dotenv()

FORCE_REFRESH_KEY = os.environ['FORCE_REFRESH_KEY']
SHELVE_PATH = "shelve.db"

app = Flask(__name__)
app.wsgi_app = ReverseProxied(app.wsgi_app)
app.secret_key = os.environ['FLASK_SECRET_KEY']

def get_url(route):
    '''Generate a proper URL, forcing HTTPS if not running locally'''
    host = urllib3.util.parse_url(request.url).hostname
    url = url_for(
        route,
        _external=True,
        _scheme='http' if host in ('127.0.0.1', 'localhost') else 'https'
    )

    return url

def store_cursor(cursor):
    with shelve.open(SHELVE_PATH) as db:
        db[f"cursors"] = cursor
        db.sync()

def get_cursor():
    with shelve.open(SHELVE_PATH) as db:
        if f"cursors" not in db:
            return None
        return db[f"cursors"]

def process_file():
    service = get_service()
    file_id = get_file_id(service)
    file = get_file(service, file_id)
    data = process_db(file)
    render(data)
    return toot_card(data)

@app.route('/')
def index():
    html = (
        '<p><a href="./card.svg" target="_blank"><img src="./card.svg" style="width: 100%;" alt="Social Card Preview" /></a></p>'
        '<p><a href="https://github.com/blueset/gymrun" target="_blank">https://github.com/blueset/gymrun</a></p>'
    )
    return html

@app.route('/account', methods=['GET', 'POST'])
def account():
    outcome = load_data()
    # refresh on post
    if request.method == 'POST':
        refresh_key = request.form.get('refresh_key')
        if refresh_key == FORCE_REFRESH_KEY:
            outcome = process_file()

    return (f'<form method="post"><input type="password" name="refresh_key" /><input type="submit" value="Refresh"></form>'
            f'<pre>{pprint.pformat(outcome, indent=2)}</pre>')

@app.route("/card.svg")
def card_svg():
    unit = request.args.get("unit", "native")
    data = load_data()
    svg = build_svg(data, unit)
    response = make_response(svg)
    response.headers['Content-Type'] = 'image/svg+xml'
    return response

@app.route("/card.png")
def card_png():
    return send_file("card.png")

@app.route("/webhook", methods=['POST'])
def webhook():
    if request.headers.get("x-goog-channel-id") == CHANNEL_ID:
        threading.Thread(target=process_file).start()
    return ""

@app.route("/resubscribe")
def resub():
    service = get_service()
    resubscribe(service, get_url("webhook"))
    return "OK"

if __name__=='__main__':
    app.run(debug=True, port=5001)
