@echo off
chcp 65001 >nul
title 智能工厂设备监控看板系统

echo ============================================
echo   🏭 智能工厂设备监控看板系统 - 启动中...
echo ============================================
echo.

:: 获取当前目录（项目根目录）
set "PROJECT_DIR=%~dp0"

:: 进入后端目录
cd /d "%PROJECT_DIR%backend"

:: 检查 Node.js 是否安装
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [提示] 检测到 node_modules 不存在，正在安装依赖...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [错误] 依赖安装失败，请检查网络后重试
        pause
        exit /b 1
    )
    echo.
    echo [完成] 依赖安装成功
)

echo [启动] 正在启动后端服务...

:: 以最小化窗口启动后端（不占用当前命令行）
start /min "" node server.js

:: 等待后端启动（最多等待 15 秒）
set "TIMEOUT_COUNT=0"
:WAIT_LOOP
>nul timeout /t 2 /nobreak
set /a TIMEOUT_COUNT+=1

:: 检测端口 3000 是否已被监听
netstat -an | findstr "LISTENING" | findstr ":3000" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [成功] 后端服务已启动！正在打开浏览器...
    goto OPEN_BROWSER
)

if %TIMEOUT_COUNT% geq 8 (
    echo [警告] 等待超时，后端启动可能较慢，正在尝试打开浏览器...
    goto OPEN_BROWSER
)

goto WAIT_LOOP

:OPEN_BROWSER
:: 等待 1 秒确保服务已就绪
>nul timeout /t 1 /nobreak

:: 打开浏览器
echo [启动] 正在打开浏览器访问 http://localhost:3000
start "" http://localhost:3000

echo.
echo ============================================
echo   系统已启动，请等待浏览器打开...
echo   如需停止服务，请关闭后端命令行窗口
echo   或运行 stop.bat
echo ============================================

:: 返回项目根目录
cd /d "%PROJECT_DIR%"

exit /b 0
