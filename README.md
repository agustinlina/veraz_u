# ARCA CUIT App

Aplicación local en Node.js para consultar constancias de CUIT usando el Web Service SOAP de ARCA `ws_sr_constancia_inscripcion`.

## Qué incluye

- Frontend web simple para buscar por CUIT.
- Backend Express.
- Validación de CUIT.
- Endpoint `/api/health` para revisar configuración.
- Endpoint `/api/dummy` para probar disponibilidad del servicio.
- Endpoint `/api/cuit/:cuit` para consultar `getPersona_v2`.
- Soporte para `OPENSSL_BIN`, útil en Windows cuando `openssl` no está en el PATH.
- Manejo de errores más claro para certificado, clave, WSAA y SOAP.
- Carpeta `certs` lista para que agregues tus certificados.

## Requisitos

1. Node.js instalado.
2. OpenSSL instalado o disponible desde Git para Windows.
3. Certificado digital ARCA y clave privada.
4. Certificado asociado al Web Service `ws_sr_constancia_inscripcion`.

En Windows, si instalaste Git, OpenSSL suele estar en:

```txt
C:\Program Files\Git\usr\bin\openssl.exe
```

## Instalación

Dentro de la carpeta del proyecto:

```bash
npm install
```

## Configuración

Copiar el ejemplo:

```bash
copy .env.example .env
```

Editar `.env`:

```env
ARCA_ENV=prod
ARCA_CUIT_REPRESENTADA=20426887364
ARCA_CERT_PATH=./certs/certificado.crt
ARCA_KEY_PATH=./certs/privada.key
OPENSSL_BIN=C:\Program Files\Git\usr\bin\openssl.exe
PORT=3001
```

### Importante

- En `ARCA_ENV` va solo `homo` o `prod`.
- No va el alias del certificado en `ARCA_ENV`.
- El alias sirve dentro de ARCA, no dentro de esta app.
- En `ARCA_CUIT_REPRESENTADA` poné tu CUIT.
- Si tu certificado se llama `certificado.pem`, cambiá `ARCA_CERT_PATH` a `./certs/certificado.pem`.
- La clave privada debe ser la misma que se usó para generar el CSR.

## Carpeta de certificados

Colocá tus archivos en:

```txt
certs/certificado.crt
certs/privada.key
```

También puede ser:

```txt
certs/certificado.pem
certs/privada.key
```

Pero el nombre debe coincidir con el `.env`.

## Chequear configuración

```bash
npm run check
```

Este comando verifica:

- ambiente `homo` o `prod`;
- CUIT representada válida;
- existencia del certificado;
- existencia de la clave privada;
- ejecución de OpenSSL.

## Ejecutar

```bash
npm start
```

Abrir:

```txt
http://localhost:3001
```

Si usás `PORT=3000`, abrí:

```txt
http://localhost:3000
```

## Endpoints útiles

```txt
/api/health
/api/dummy
/api/cuit/20426887364
```

## Si aparece EADDRINUSE

Significa que el puerto está ocupado. Cambiá el `.env`:

```env
PORT=3001
```

O cerrá el proceso que usa el puerto 3000.

## Si aparece error 500

Revisá primero en este orden:

1. `npm run check`.
2. Que `ARCA_ENV` sea `prod` o `homo`, no el alias.
3. Que exista el certificado indicado en `ARCA_CERT_PATH`.
4. Que exista la clave indicada en `ARCA_KEY_PATH`.
5. Que `OPENSSL_BIN` apunte al ejecutable correcto.
6. Que el certificado esté asociado en ARCA al servicio `ws_sr_constancia_inscripcion`.
7. Que el certificado y la clave privada correspondan entre sí.

## Generar CSR en Windows

Hay un script de ayuda:

```txt
scripts/generar-csr-windows.cmd
```

Antes de ejecutarlo, editá estas líneas dentro del archivo:

```bat
set CUIT=20426887364
set ALIAS=APP_CUIT_2026
```

El script genera:

```txt
certs/privada.key
certs/pedido.csr
```

Subí a ARCA solo:

```txt
certs/pedido.csr
```

No subas ni compartas:

```txt
certs/privada.key
```

## Producción vs homologación

- `prod`: usa producción.
- `homo`: usa homologación/testing.

Los certificados y autorizaciones deben corresponder al mismo ambiente.
