"""Obtain a Gmail API refresh token for BEP_VIET_EMAIL_GMAIL_REFRESH_TOKEN (run once, locally).

Usage:
    python scripts/get_gmail_refresh_token.py

The OAuth client must be of type "Desktop app" in Google Cloud Console. Client credentials
can be entered at the prompts or supplied as environment variables. Sign in with the Gmail
account that should send email (same as BEP_VIET_EMAIL_FROM_ADDRESS). The refresh token is
printed only to this terminal; store it in your host's secret settings, never in Git.
"""

import argparse
import getpass
import http.server
import json
import os
import secrets
import urllib.parse
import urllib.request
import webbrowser

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/gmail.send"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--client-id")
    parser.add_argument("--client-secret")
    args = parser.parse_args()
    client_id = args.client_id or os.environ.get("BEP_VIET_EMAIL_GMAIL_CLIENT_ID")
    client_secret = args.client_secret or os.environ.get("BEP_VIET_EMAIL_GMAIL_CLIENT_SECRET")
    if not client_id:
        client_id = input("OAuth client ID: ").strip()
    if not client_secret:
        client_secret = getpass.getpass("OAuth client secret: ").strip()
    if not client_id or not client_secret:
        raise SystemExit("Cần OAuth client ID và client secret.")

    state = secrets.token_urlsafe(24)
    result: dict[str, str] = {}

    class CallbackHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            result.update({key: values[0] for key, values in query.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("Đã nhận mã. Có thể đóng tab này và quay lại terminal.".encode())

        def log_message(self, format: str, *args: object) -> None:
            return

    server = http.server.HTTPServer(("127.0.0.1", 0), CallbackHandler)
    redirect_uri = f"http://127.0.0.1:{server.server_port}"
    url = (
        AUTH_URL
        + "?"
        + urllib.parse.urlencode(
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": SCOPE,
                "access_type": "offline",
                "prompt": "consent",
                "state": state,
            }
        )
    )
    print("Mở trình duyệt để đăng nhập Gmail. Nếu không tự mở, truy cập:\n" + url)
    webbrowser.open(url)
    while "code" not in result and "error" not in result:
        server.handle_request()
    server.server_close()

    if "error" in result:
        raise SystemExit(f"Google từ chối cấp quyền: {result['error']}")
    if result.get("state") != state:
        raise SystemExit("State không khớp, hủy để an toàn.")

    body = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "code": result["code"],
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        }
    ).encode()
    with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=body)) as response:
        token = json.load(response)

    refresh_token = token.get("refresh_token")
    if not refresh_token:
        raise SystemExit("Google không trả refresh_token. Thu hồi quyền cũ của app rồi chạy lại.")
    granted_scopes = set(str(token.get("scope", "")).split())
    if SCOPE not in granted_scopes:
        raise SystemExit("Tài khoản chưa cấp quyền gmail.send. Hãy cấp quyền rồi chạy lại.")
    print("\nBEP_VIET_EMAIL_GMAIL_REFRESH_TOKEN=" + refresh_token)


if __name__ == "__main__":
    main()
