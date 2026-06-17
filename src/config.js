const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(process.cwd(), '.env')
});

function required(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`Falta configurar ${name} en el archivo .env`);
  }

  return String(value).trim();
}

const arcaEnv = required('ARCA_ENV').toLowerCase();

if (!['prod', 'homo'].includes(arcaEnv)) {
  throw new Error('ARCA_ENV inválido. Debe ser "prod" o "homo". No pongas el alias ahí.');
}

const isProd = arcaEnv === 'prod';

const certPath = path.resolve(process.cwd(), required('ARCA_CERT_PATH'));
const keyPath = path.resolve(process.cwd(), required('ARCA_KEY_PATH'));

const secondaryPersonApiEnabled = String(process.env.SECONDARY_PERSON_API_ENABLED || 'true')
  .trim()
  .toLowerCase() === 'true';

const secondaryPersonApiUrl = String(
  process.env.SECONDARY_PERSON_API_URL ||
  'https://clientes.credicuotas.com.ar/v1/onboarding/resolvecustomers'
).trim();

const bcraApiEnabled = String(process.env.BCRA_API_ENABLED || 'true')
  .trim()
  .toLowerCase() === 'true';

const bcraApiBaseUrl = String(
  process.env.BCRA_API_BASE_URL || 'https://api.bcra.gob.ar'
).trim();

const config = {
  env: arcaEnv,
  isProd,

  serviceId: 'ws_sr_constancia_inscripcion',

  wsaaUrl: isProd
    ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
    : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',

  constanciaUrl: isProd
    ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5'
    : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',

  cuitRepresentada: required('ARCA_CUIT_REPRESENTADA'),

  certPath,
  keyPath,

  opensslBin: process.env.OPENSSL_BIN && process.env.OPENSSL_BIN.trim()
    ? process.env.OPENSSL_BIN.trim()
    : 'openssl',

  secondaryPersonApiEnabled,
  secondaryPersonApiUrl,

  bcraApiEnabled,
  bcraApiBaseUrl,

  port: Number(process.env.PORT || 3000)
};

function verifyStaticConfig() {
  if (!/^\d{11}$/.test(config.cuitRepresentada)) {
    throw new Error(`ARCA_CUIT_REPRESENTADA debe tener 11 dígitos. Valor actual: ${config.cuitRepresentada}`);
  }

  if (!fs.existsSync(config.certPath)) {
    throw new Error(`No existe el certificado en: ${config.certPath}`);
  }

  if (!fs.existsSync(config.keyPath)) {
    throw new Error(`No existe la clave privada en: ${config.keyPath}`);
  }
}

module.exports = {
  ...config,
  verifyStaticConfig
};