"""Build from the installed game's current layout; never ship a stale full HUD.
Requires Python 3.10+, vpk==1.4.0 and Source2Viewer-CLI (MIT).
"""
import argparse
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'vendor'))
import panorama
import vpk

ROOT = Path(__file__).resolve().parent
HOST = 'panorama/layout/hud_damage_impact.vxml_c'
SCRIPT = 's2r://panorama/scripts/challengelock.vts'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--game', required=True, type=Path)
    parser.add_argument('--vrf', required=True, type=Path)
    args = parser.parse_args()
    work = ROOT / 'build'
    work.mkdir(exist_ok=True)
    original = work / 'hud_damage_impact.xml'
    result = subprocess.run([str(args.vrf), '-i', str(args.game / 'game/citadel/pak01_dir.vpk'),
                             '-f', HOST, '-d', '-o', str(original)], capture_output=True, text=True, encoding='utf-8')
    if result.returncode or not original.exists():
        raise SystemExit(result.stdout + result.stderr)
    text = original.read_text(encoding='utf-8')
    if text.count('</styles>') != 1 or '<scripts>' in text or '<CitadelDamageImpact' not in text:
        raise SystemExit('HUD layout changed: inspect it before rebuilding. No game files modified.')
    text = text.replace('</styles>', '</styles>\n<scripts><include src="' + SCRIPT + '" /></scripts>')
    stage = work / 'stage'
    sources = {'panorama/layout/hud_damage_impact.xml': text,
               'panorama/scripts/challengelock.vts': (ROOT / 'src/challengelock.vts').read_text(encoding='utf-8')}
    for name, content in sources.items():
        compiled, data = panorama.compile_text(name, content)
        target = stage / compiled
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        # Independent parser readback validates the resource framing.
        back = work / ('readback-' + Path(name).name)
        check = subprocess.run([str(args.vrf), '-i', str(target), '-d', '-o', str(back)], capture_output=True)
        if check.returncode or 'challengelock' not in back.read_text(encoding='utf-8').lower():
            raise SystemExit('Compiled resource readback failed: ' + name)
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    archive = dist / 'pak99_challengelock_dir.vpk'
    vpk.new(str(stage)).save(str(archive))
    manifest = {'version':'0.1.1', 'host':HOST, 'layoutSHA256':hashlib.sha256(original.read_bytes()).hexdigest(),
                'vpkSHA256':hashlib.sha256(archive.read_bytes()).hexdigest(), 'files':list(sources)}
    (dist / 'build-info.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    with zipfile.ZipFile(dist / 'ChallengeLock-Shop-Mod-0.1.1.zip','w',zipfile.ZIP_DEFLATED) as z:
        z.write(archive,'pak01_dir.vpk')
        z.write(dist / 'build-info.json','build-info.json')
        z.write(ROOT / 'README.md','README.md')
    print(archive)

if __name__ == '__main__':
    main()
