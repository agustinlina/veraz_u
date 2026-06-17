const { execFileSync } = require('child_process');
const config = require('./config');

function run() {
  console.log('Verificando configuración...');

  console.log(`ARCA_ENV: ${config.env}`);
  console.log(`ARCA_CUIT_REPRESENTADA: ${config.cuitRepresentada}`);
  console.log(`ARCA_CERT_PATH: ${config.certPath}`);
  console.log(`ARCA_KEY_PATH: ${config.keyPath}`);
  console.log(`OPENSSL_BIN: ${config.opensslBin}`);
  console.log(`WSAA URL: ${config.wsaaUrl}`);
  console.log(`Constancia URL: ${config.constanciaUrl}`);
  console.log(`Service ID: ${config.serviceId}`);

  config.verifyStaticConfig();

  const opensslVersion = execFileSync(config.opensslBin, ['version'], {
    encoding: 'utf8'
  }).trim();

  console.log(`OpenSSL: ${opensslVersion}`);

  console.log('Configuración básica correcta.');
}

try {
  run();
} catch (error) {
  console.error('ERROR DE CONFIGURACIÓN:');
  console.error(error.message);
  process.exit(1);
}