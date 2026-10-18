@echo off
rem Mannequin-Figuren mit Blender + MPFB neu erzeugen (siehe figuren_erzeugen.py).
rem Ergebnis: public\assets\figuren\*.glb und figuren.json
set BLENDER="C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
if not exist %BLENDER% (
  echo Blender nicht gefunden unter %BLENDER% - Pfad in dieser Datei anpassen.
  pause
  exit /b 1
)
%BLENDER% -b --python "%~dp0figuren_erzeugen.py" -- "%~dp0..\public\assets\figuren"
echo.
echo Fertig. Neue Figuren liegen in public\assets\figuren.
pause
