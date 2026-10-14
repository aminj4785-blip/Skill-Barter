@echo off
setlocal
title SkillBarter AI Launcher
echo ===============================================================================
echo                      Starting SkillBarter AI Local Server
echo ===============================================================================
echo.
cd /d "%~dp0"

:: 1. Try Python 3
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python detected. Starting web server at http://localhost:5000 ...
    start http://localhost:5000
    python -m http.server 5000
    goto :eof
)

:: 2. Try py launcher
where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python launcher detected. Starting web server at http://localhost:5000 ...
    start http://localhost:5000
    py -m http.server 5000
    goto :eof
)

:: 3. Try Node.js / npx
where npx >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Node.js/npx detected. Starting web server at http://localhost:5000 ...
    start http://localhost:5000
    npx --yes serve -p 5000
    goto :eof
)

:: 4. Built-in Windows PowerShell Web Server (works on all Windows 10/11 machines with 0 installs)
echo [OK] Starting built-in Windows web server at http://localhost:5000 ...
start http://localhost:5000
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listener = New-Object System.Net.HttpListener; ^
   $listener.Prefixes.Add('http://localhost:5000/'); ^
   $listener.Start(); ^
   Write-Host 'SkillBarter AI is live at http://localhost:5000 (Press Ctrl+C to stop)'; ^
   while ($listener.IsListening) { ^
     try { ^
       $context = $listener.GetContext(); ^
       $req = $context.Request; ^
       $res = $context.Response; ^
       $path = $req.Url.LocalPath.TrimStart('/'); ^
       if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }; ^
       $filePath = Join-Path (Get-Location) $path; ^
       if (Test-Path $filePath -PathType Leaf) { ^
         $bytes = [System.IO.File]::ReadAllBytes($filePath); ^
         $res.ContentLength64 = $bytes.Length; ^
         if ($filePath.EndsWith('.html')) { $res.ContentType = 'text/html' } ^
         elseif ($filePath.EndsWith('.js')) { $res.ContentType = 'application/javascript' } ^
         elseif ($filePath.EndsWith('.css')) { $res.ContentType = 'text/css' } ^
         elseif ($filePath.EndsWith('.json')) { $res.ContentType = 'application/json' } ^
         elseif ($filePath.EndsWith('.svg')) { $res.ContentType = 'image/svg+xml' } ^
         $res.OutputStream.Write($bytes, 0, $bytes.Length) ^
       } else { ^
         $res.StatusCode = 404 ^
       }; ^
       $res.OutputStream.Close() ^
     } catch {} ^
   }"
