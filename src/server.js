const path = require('path');
const express = require('express');

const config = require('./config');
const arcaClient = require('./arca-client');
const bcraClient = require('./bcra-client');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Aplicación ARCA CUIT/CUIL/DNI + BCRA funcionando',
    env: config.env,
    serviceId: config.serviceId
  });
});

app.get('/api/debug/config', (req, res) => {
  res.json({
    env: config.env,
    serviceId: config.serviceId,
    wsaaUrl: config.wsaaUrl,
    constanciaUrl: config.constanciaUrl,
    cuitRepresentada: config.cuitRepresentada,
    certPath: config.certPath,
    keyPath: config.keyPath,
    opensslBin: config.opensslBin,
    secondaryPersonApiEnabled: config.secondaryPersonApiEnabled,
    secondaryPersonApiUrl: config.secondaryPersonApiUrl,
    bcraApiEnabled: config.bcraApiEnabled,
    bcraApiBaseUrl: config.bcraApiBaseUrl,
    port: config.port
  });
});

app.get('/api/dummy', async (req, res, next) => {
  try {
    const result = await arcaClient.dummy();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/login-test', async (req, res, next) => {
  try {
    const auth = await arcaClient.loginCms();

    res.json({
      ok: true,
      message: 'WSAA devolvió token y sign correctamente',
      tokenPreview: `${auth.token.slice(0, 20)}...`,
      signPreview: `${auth.sign.slice(0, 20)}...`
    });
  } catch (error) {
    next(error);
  }
});

async function consultarPersonaCompleta(identificadorOriginal) {
  const identificadorLimpio = cleanDigits(identificadorOriginal);

  const persona = await arcaClient.getPersona(identificadorLimpio);

  let datosBcra = null;
  let bcraFuente = null;

  if (/^\d{11}$/.test(identificadorLimpio)) {
    datosBcra = await bcraClient.getBcraFinancialReportByIdentification(identificadorLimpio);
    bcraFuente = 'identificador_ingresado';
  }

  if (!datosBcra || !datosBcra.consultado) {
    datosBcra = await bcraClient.getBcraFinancialReport(persona);
    bcraFuente = 'persona_resultante';
  }

  if (
    datosBcra &&
    datosBcra.consultado &&
    datosBcra.tieneInformacionRelevante === false
  ) {
    const cuitCredicuotas = cleanDigits(persona?.datosComplementarios?.persona?.cuit);

    if (/^\d{11}$/.test(cuitCredicuotas) && cuitCredicuotas !== datosBcra.identificacionConsultada) {
      const datosBcraCredicuotas = await bcraClient.getBcraFinancialReportByIdentification(cuitCredicuotas);

      if (datosBcraCredicuotas?.tieneInformacionRelevante) {
        datosBcra = datosBcraCredicuotas;
        bcraFuente = 'cuit_credicuotas';
      }
    }
  }

  return {
    ...persona,
    datosBcra,
    bcraFuente
  };
}

app.get('/api/cuit/:identificador', async (req, res, next) => {
  try {
    const result = await consultarPersonaCompleta(req.params.identificador);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/persona/:identificador', async (req, res, next) => {
  try {
    const result = await consultarPersonaCompleta(req.params.identificador);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/bcra/:identificacion', async (req, res, next) => {
  try {
    const result = await bcraClient.getBcraFinancialReportByIdentification(req.params.identificacion);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Ruta no encontrada'
  });
});

app.use((error, req, res, next) => {
  console.error(`[ERROR] ${new Date().toISOString()}`);
  console.error(error);

  res.status(500).json({
    ok: false,
    error: error.message
  });
});

app.listen(config.port, () => {
  console.log(`Aplicación iniciada en http://localhost:${config.port}`);
  console.log(`Ambiente ARCA: ${config.env}`);
  console.log(`Servicio WSAA: ${config.serviceId}`);
  console.log(`URL WSAA: ${config.wsaaUrl}`);
  console.log(`URL Constancia: ${config.constanciaUrl}`);
  console.log(`BCRA API: ${config.bcraApiEnabled ? 'habilitada' : 'deshabilitada'}`);
});