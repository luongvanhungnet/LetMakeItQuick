from base64 import b64encode
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parent.parent
static = root / "dist"
types = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4"}
assets = {}
for file in sorted(static.rglob("*")):
    if not file.is_file() or file.suffix not in types or "server" in file.relative_to(static).parts:
        continue
    binary = file.suffix in {".png", ".jpg", ".mp4"}
    content = b64encode(file.read_bytes()).decode("ascii") if binary else file.read_text(encoding="utf-8")
    route = "/" + file.relative_to(static).as_posix()
    assets[route] = [types[file.suffix], content, binary]
assets["/"] = assets["/index.html"]
out = static / "server" / "index.js"
out.parent.mkdir(exist_ok=True)
modules = [root / "worker" / "data.mjs", static / "release-model.js"]
modules.extend(root / "worker" / module for module in [
    "workspace.mjs", "product-data.mjs", "releases.mjs", "operations.mjs", "commerce.mjs", "catalog.mjs", "team.mjs"
])
parts = [re.sub(r"^export (?=(?:async )?function |const |class )", "", module.read_text(encoding="utf-8"), flags=re.M)
         for module in modules]
out.write_text("const siteAssets = " + json.dumps(assets, ensure_ascii=False) + ";\n" +
               "\n;\n".join(parts + [(root / "worker" / "index.mjs").read_text(encoding="utf-8")]),
               encoding="utf-8")

# Include the hosting declaration and schema migrations in the deployable artifact.
import shutil
manifest = root / ".openai" / "hosting.json"
(static / ".openai").mkdir(exist_ok=True)
shutil.copyfile(manifest, static / ".openai" / "hosting.json")
migrations = out.parent / "migrations"
migrations.mkdir(exist_ok=True)
for migration in (root / "worker" / "migrations").glob("*.sql"):
    shutil.copyfile(migration, migrations / migration.name)
