@echo off
title SISTEMA O CACHORRAO - PAINEL DE CONTROLE
color 0A

:: Força o caminho exato da pasta do projeto
cd /d "D:\projeto-delivery"

echo ==========================================
echo      INICIANDO O SISTEMA DO RESTAURANTE
echo ==========================================
echo.

echo 1. Ligando o Banco de Dados e API...
:: Entra na pasta api e roda o comando
start "API SERVER" /min cmd /k "cd /d D:\projeto-delivery\api && npm run dev"

echo 2. Ligando o Site e PDV...
:: Entra na pasta web e roda o comando
start "WEB FRONTEND" /min cmd /k "cd /d D:\projeto-delivery\web && npm run dev"

echo.
echo Aguardando os servidores subirem (10 segundos)...
timeout /t 10 >nul

echo.
echo 3. Abrindo o navegador...
start http://localhost:5173/

echo.
echo ==========================================
echo        SISTEMA ONLINE! BOAS VENDAS.
echo ==========================================
echo.
pause