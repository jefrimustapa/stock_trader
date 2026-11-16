#!/usr/bin/env python3
"""
tests/test_sdlc8_credential_leak.py
SDLC Step 8 Automated Regression Test:
Verifies that no tracked files in git contain hardcoded secrets,
specifically BRIDGE_SERVICE_TOKEN or fallback string literals.
"""

import subprocess
import sys
from pathlib import Path

KNOWN_LEAK_TOKEN = "c7fed05ca5e657d0a08e187e9b36755db8eeb7cf76b82648dc6d60d278a19def"

def main():
    repo_root = Path(__file__).resolve().parent.parent
    
    # Get all tracked files in git
    cmd = ["git", "ls-files"]
    result = subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True, check=True)
    tracked_files = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    
    violations = []
    
    for rel_path in tracked_files:
        file_path = repo_root / rel_path
        if not file_path.is_file():
            continue
        # Skip this test file itself so it doesn't self-flag
        if rel_path == "tests/test_sdlc8_credential_leak.py":
            continue
            
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            continue
            
        if KNOWN_LEAK_TOKEN in content:
            violations.append(f"{rel_path}: Contains hardcoded secret token literal ({KNOWN_LEAK_TOKEN[:8]}...)")
            
        # Also check for regex pattern where SERVICE_TOKEN has non-empty fallback hardcoded string
        if rel_path.endswith(".js") or rel_path.endswith(".jsx") or rel_path.endswith(".py"):
            lines = content.splitlines()
            for idx, line in enumerate(lines, 1):
                if "SERVICE_TOKEN" in line and ("|| '" in line or '|| "' in line):
                    # Check if the fallback is non-empty
                    if not ("|| ''" in line or '|| ""' in line):
                        violations.append(f"{rel_path}:{idx}: Dangerous non-empty fallback string literal pattern detected: {line.strip()}")
                    
    if violations:
        print("[FAIL] SDLC #8 Credential Leak Check FAILED:")
        for v in violations:
            print(f"  - {v}")
        sys.exit(1)
    else:
        print("[PASS] SDLC #8 Credential Leak Check PASSED: No tracked files contain leaked tokens or literal fallbacks.")
        sys.exit(0)

if __name__ == "__main__":
    main()
