#!/usr/bin/env python3
"""Build Kitabi as a standalone desktop app (single EXE)"""
import os, sys, shutil, subprocess
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / 'kitabi app'
PUBLIC = HERE / 'public'

if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)

print('Building Kitabi desktop app...')

result = subprocess.run([
    sys.executable, '-m', 'PyInstaller', '--clean', '--onefile', '--windowed',
    '--name', 'Kitabi',
    '--distpath', str(OUT),
    '--specpath', str(HERE),
    '--add-data', f'{PUBLIC}{os.pathsep}public',
    '--exclude-module', 'tkinter', '--exclude-module', 'matplotlib',
    '--exclude-module', 'numpy', '--exclude-module', 'PIL',
    '--exclude-module', 'pandas', '--exclude-module', 'scipy',
    '--exclude-module', 'PyQt5', '--exclude-module', 'PyQt6',
    str(HERE / 'server.py')
], capture_output=True, text=True)

if result.returncode != 0:
    print('BUILD FAILED')
    print(result.stdout[-1500:])
    print(result.stderr[-1500:])
    sys.exit(1)

# Clean spec & build dir
for p in [HERE / 'build', HERE / 'Kitabi.spec']:
    if p.is_dir(): shutil.rmtree(p)
    elif p.exists(): p.unlink()

exe = OUT / 'Kitabi.exe'
if exe.exists():
    mb = exe.stat().st_size / (1024*1024)
    print(f'Done. {OUT} ({mb:.1f} MB)')
    # Build NSIS installer
    nsis = r'C:\Program Files (x86)\NSIS\Bin\makensis.exe'
    if os.path.exists(nsis):
        setup = HERE / 'Kitabi_Setup_1.0.0.exe'
        if setup.exists(): setup.unlink()
        result = subprocess.run([nsis, str(HERE / 'installer.nsi')], capture_output=True, text=True, cwd=HERE)
        if result.returncode == 0:
            mb2 = setup.stat().st_size / (1024*1024)
            print(f'Installer: {setup} ({mb2:.1f} MB)')
        else:
            print(f'Installer failed: {result.stderr[-500:]}')
    print(f'Run: {exe}')
