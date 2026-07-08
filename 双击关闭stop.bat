@echo off
chcp 65001 >nul
title 停止智能工厂设备监控看板系统

echo 正在停止后端服务...
echo.

:: 查找并关闭 node.exe 进程中运行 server.js 的实例
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq node.exe" /fo csv /nh 2^>nul') do (
    set "PID=%%~a"
    >nul taskkill /f /pid %%~a 2>&1
)

:: 备用方案：强制关闭所有 node.exe（更彻底）
>nul taskkill /f /im node.exe 2>&1

echo [完成] 后端服务已停止
echo 你可以关闭此窗口了
echo.

>nul timeout /t 3 /nobreak
