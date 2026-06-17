@echo off
setlocal

REM Cambiar estos datos antes de ejecutar
set CUIT=20426887364
set ALIAS=APP_CUIT_2026
set OPENSSL_BIN=C:\Program Files\Git\usr\bin\openssl.exe

if not exist "%OPENSSL_BIN%" (
  echo No se encontro OpenSSL en: %OPENSSL_BIN%
  echo Instale Git para Windows o cambie la variable OPENSSL_BIN.
  exit /b 1
)

if not exist certs mkdir certs

"%OPENSSL_BIN%" genrsa -out certs\privada.key 2048
"%OPENSSL_BIN%" req -new -key certs\privada.key -subj "/C=AR/O=ARCA/CN=%ALIAS%/serialNumber=CUIT %CUIT%" -out certs\pedido.csr

echo.
echo Archivos generados:
echo certs\privada.key   ^<-- NO subir a ARCA. Guardar.
echo certs\pedido.csr    ^<-- Subir a ARCA como CSR PKCS#10.
echo.
pause
