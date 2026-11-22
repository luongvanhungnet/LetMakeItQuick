"""Run one monitoring interval. Provide the linked Site's service credential on stdin."""
import hashlib
import json
import sys
import urllib.error
import urllib.request

# Dispatch credentials are valid only on this Site's platform hostname.
endpoint = "https://launchpad-studio.luongvanhungnet.chatgpt.site/api/uptime/run"
token = sys.stdin.readline().strip()
if not token:
    sys.exit("The Site service credential is required on stdin.")
key = hashlib.sha256(("launchpad-uptime-v1:" + token).encode()).hexdigest()
headers = {"OAI-Sites-Authorization": "Bearer " + token, "Authorization": "Bearer " + key}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

request = urllib.request.Request(endpoint, method="POST", headers=headers, data=b"")
with urllib.request.build_opener(NoRedirect).open(request, timeout=55) as response:
    result = json.load(response)
    if response.status not in (200, 202) or not (result.get("run") or result.get("status") == "busy"):
        sys.exit("The hosted monitor did not acknowledge this interval.")
    print(json.dumps(result))
