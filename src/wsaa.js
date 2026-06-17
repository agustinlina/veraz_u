const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { execFileSync } = require('child_process');
const { config } = require('./config');
const { parseXml, escapeXml, findSoapBody, findSoapFault } = require('./xml');

let cachedTicket = null;

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    const error = new Error(`${label} no encontrado: ${filePath}`);
    error.statusCode = 500;
    throw error;
  }
}

function toIsoWithoutMs(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, '-00:00');
}

function createTRA(service) {
  const now = new Date();
  const generationTime = new Date(now.getTime() - 10 * 60 * 1000);
  const expirationTime = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const uniqueId = Math.floor(now.getTime() / 1000);

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${toIsoWithoutMs(generationTime)}</generationTime>
    <expirationTime>${toIsoWithoutMs(expirationTime)}</expirationTime>
  </header>
  <service>${escapeXml(service)}</service>
</loginTicketRequest>`;
}

function signTRAWithOpenSSL(traXml) {
  ensureFileExists(config.certPath, 'Certificado ARCA');
  ensureFileExists(config.keyPath, 'Clave privada ARCA');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arca-wsaa-'));
  const traPath = path.join(tempDir, 'login-ticket-request.xml');
  const cmsPath = path.join(tempDir, 'login-ticket-request.cms');
  fs.writeFileSync(traPath, traXml, 'utf8');

  try {
    execFileSync(config.opensslBin, [
      'cms',
      '-sign',
      '-in', traPath,
      '-out', cmsPath,
      '-signer', config.certPath,
      '-inkey', config.keyPath,
      '-nodetach',
      '-noattr',
      '-outform', 'PEM'
    ], { stdio: 'pipe' });

    const pem = fs.readFileSync(cmsPath, 'utf8');
    return pem
      .replace(/-----BEGIN CMS-----/g, '')
      .replace(/-----END CMS-----/g, '')
      .replace(/\s+/g, '');
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString('utf8') : '';
    const detail = stderr || error.message;
    const wrapped = new Error(`No se pudo firmar el Ticket Request con OpenSSL. Verificá OPENSSL_BIN, el certificado y la clave privada. Detalle: ${detail}`);
    wrapped.statusCode = 500;
    throw wrapped;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function loginCms(cmsBase64) {
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${escapeXml(cmsBase64)}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  let response;
  try {
    response = await axios.post(config.wsaaEndpoint, soap, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: ''
      },
      timeout: config.timeoutMs
    });
  } catch (error) {
    const detail = error.response?.data || error.message;
    const wrapped = new Error(`WSAA rechazó o no respondió la solicitud loginCms. Detalle: ${detail}`);
    wrapped.statusCode = 500;
    throw wrapped;
  }

  const parsed = parseXml(response.data);
  const fault = findSoapFault(parsed);
  if (fault) {
    const faultString = fault.faultstring || JSON.stringify(fault);
    const error = new Error(`Error SOAP de WSAA: ${faultString}`);
    error.statusCode = 500;
    throw error;
  }

  const body = findSoapBody(parsed);
  const loginReturnXml = body?.loginCmsResponse?.loginCmsReturn;
  if (!loginReturnXml) {
    const error = new Error(`Respuesta inesperada de WSAA. No se encontró loginCmsReturn.`);
    error.statusCode = 500;
    throw error;
  }

  const ticket = parseXml(loginReturnXml).loginTicketResponse;
  const credentials = ticket?.credentials;
  const header = ticket?.header;

  if (!credentials?.token || !credentials?.sign) {
    const error = new Error('Respuesta de WSAA sin token/sign. Verificá certificado, clave privada, ambiente y asociación al servicio.');
    error.statusCode = 500;
    throw error;
  }

  return {
    token: credentials.token,
    sign: credentials.sign,
    generationTime: header?.generationTime,
    expirationTime: header?.expirationTime,
    source: 'wsaa'
  };
}

function isTicketUsable(ticket) {
  if (!ticket?.expirationTime) return false;
  const expiration = new Date(ticket.expirationTime).getTime();
  return Number.isFinite(expiration) && expiration - Date.now() > 5 * 60 * 1000;
}

async function getTicket(forceRefresh = false) {
  if (!forceRefresh && isTicketUsable(cachedTicket)) {
    return { ...cachedTicket, source: 'cache' };
  }

  const tra = createTRA(config.serviceId);
  const cms = signTRAWithOpenSSL(tra);
  cachedTicket = await loginCms(cms);
  return cachedTicket;
}

function clearTicketCache() {
  cachedTicket = null;
}

module.exports = { getTicket, clearTicketCache };
