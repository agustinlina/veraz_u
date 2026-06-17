const fs = require('fs');
const path = require('path');

require('dotenv').config();

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta configurar ${name} en el archivo .env`);
  }

  return value;
}

function optional(name, fallback = '') {
  const value = process.env[name];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return value;
}

function bool(name, fallback = false) {
  const value = process.env[name];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).trim().toLowerCase() === 'true';
}

function normalizePemText(value) {
  if (!value) return '';

  return String(value)
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim() + '\n';
}

function writeSecretTextToTmp(filename, content) {
  if (!content) return null;

  const normalizedContent = normalizePemText(content);
  const tmpPath = path.join('/tmp', filename);

  fs.writeFileSync(tmpPath, normalizedContent, 'utf8');

  return tmpPath;
}

const arcaEnv = optional('ARCA_ENV', 'prod');

const certPathFromText = writeSecretTextToTmp(
  'arca-certificado.crt',
  process.env.ARCA_CERT_TEXT
);

const keyPathFromText = writeSecretTextToTmp(
  'arca-privada.key',
  process.env.ARCA_KEY_TEXT
);

const certPath = certPathFromText || optional('ARCA_CERT_PATH', './certs/certificado.crt');
const keyPath = keyPathFromText || optional('ARCA_KEY_PATH', './certs/privada_BL2631071411367.key');

module.exports = {
  arcaEnv,

  cuitRepresentada: required('ARCA_CUIT_REPRESENTADA'),

  certPath,
  keyPath,

  opensslBin: optional('OPENSSL_BIN', 'openssl'),

  secondaryPersonApiEnabled: bool('SECONDARY_PERSON_API_ENABLED', true),
  secondaryPersonApiUrl: optional(
    'SECONDARY_PERSON_API_URL',
    'https://clientes.credicuotas.com.ar/v1/onboarding/resolvecustomers'
  ),

  bcraApiEnabled: bool('BCRA_API_ENABLED', false),
  bcraApiBaseUrl: optional('BCRA_API_BASE_URL', 'https://api.bcra.gob.ar'),

  wsaaService: optional('ARCA_WSAA_SERVICE', 'ws_sr_constancia_inscripcion'),

  wsaaUrl: arcaEnv === 'prod'
    ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
    : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',

  constanciaUrl: arcaEnv === 'prod'
    ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5'
    : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5'
};