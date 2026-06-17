const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const { execFileSync } = require('child_process')
const { XMLParser } = require('fast-xml-parser')

const config = require('./config')
const {
  cleanDigits,
  isValidCuit,
  assertValidCuit,
  assertValidDni,
  getDniFromCuitOrCuil
} = require('./utils-cuit')

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true
})

let cachedAuth = null

function escapeXml (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function ensureFileExists (filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} no encontrado: ${filePath}`)
  }
}

function createLoginTicketRequestXml () {
  const now = new Date()

  const generationTime = new Date(now.getTime() - 10 * 60 * 1000)
  const expirationTime = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  const uniqueId = Math.floor(now.getTime() / 1000)

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime.toISOString()}</generationTime>
    <expirationTime>${expirationTime.toISOString()}</expirationTime>
  </header>
  <service>${config.serviceId}</service>
</loginTicketRequest>`
}

function signTRAWithOpenSSL (traXml) {
  ensureFileExists(config.certPath, 'Certificado ARCA')
  ensureFileExists(config.keyPath, 'Clave privada ARCA')

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arca-wsaa-'))
  const traPath = path.join(tempDir, 'login-ticket-request.xml')
  const cmsPath = path.join(tempDir, 'login-ticket-request.cms')

  fs.writeFileSync(traPath, traXml, 'utf8')

  try {
    execFileSync(
      config.opensslBin,
      [
        'cms',
        '-sign',
        '-in',
        traPath,
        '-out',
        cmsPath,
        '-signer',
        config.certPath,
        '-inkey',
        config.keyPath,
        '-nodetach',
        '-noattr',
        '-outform',
        'PEM'
      ],
      {
        stdio: 'pipe'
      }
    )

    const pem = fs.readFileSync(cmsPath, 'utf8')

    return pem
      .replace(/-----BEGIN CMS-----/g, '')
      .replace(/-----END CMS-----/g, '')
      .replace(/-----BEGIN PKCS7-----/g, '')
      .replace(/-----END PKCS7-----/g, '')
      .replace(/\s+/g, '')
  } catch (error) {
    const detail = error.stderr ? error.stderr.toString() : error.message

    throw new Error(
      `No se pudo firmar el loginTicketRequest con OpenSSL. ` +
        `Verificá OPENSSL_BIN, certificado y clave privada. Detalle: ${detail}`
    )
  } finally {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true
    })
  }
}

function getSoapBody (parsed) {
  return parsed?.Envelope?.Body || parsed?.Body || null
}

function detectSoapFault (parsed, rawXml) {
  const body = getSoapBody(parsed)
  const fault = body?.Fault

  if (!fault) {
    return
  }

  const faultCode = fault.faultcode || 'SOAP Fault'
  const faultString = fault.faultstring || 'Error SOAP sin detalle'

  throw new Error(`${faultCode}: ${faultString}. Respuesta completa: ${rawXml}`)
}

function parseXml (xml) {
  return parser.parse(xml)
}

function normalizeText (value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function getClaveClassification (cuit, datosGenerales = {}, forced = null) {
  const clean = String(cuit || '').replace(/\D/g, '')
  const prefix = clean.slice(0, 2)

  const tipoPersona = normalizeText(datosGenerales.tipoPersona)
  const razonSocial = String(datosGenerales.razonSocial || '').trim()

  const humanPrefixes = ['20', '23', '24', '27']
  const companyPrefixes = ['30', '33', '34']

  const isPersonaFisica =
    forced === 'DNI' ||
    tipoPersona.includes('FISICA') ||
    tipoPersona.includes('HUMANA') ||
    humanPrefixes.includes(prefix)

  const isPersonaJuridica =
    tipoPersona.includes('JURIDICA') || companyPrefixes.includes(prefix)

  if (isPersonaJuridica && forced !== 'DNI') {
    return {
      inputType: 'CUIT',
      label: 'CUIT - Persona jurídica',
      isPersonaFisica: false,
      isPersonaJuridica: true,
      shouldQuerySecondaryApi: false,
      dniCalculado: null
    }
  }

  if (isPersonaFisica) {
    return {
      inputType: forced === 'DNI' ? 'DNI' : 'CUIL_CUIT_PERSONA_FISICA',
      label:
        forced === 'DNI'
          ? 'DNI consultado'
          : razonSocial
          ? 'CUIT/CUIL - Persona física'
          : 'CUIL - Persona física',
      isPersonaFisica: true,
      isPersonaJuridica: false,
      shouldQuerySecondaryApi: true,
      dniCalculado:
        forced === 'DNI'
          ? cleanDigits(datosGenerales.dni || '')
          : getDniFromCuitOrCuil(clean)
    }
  }

  return {
    inputType: 'DESCONOCIDO',
    label: 'CUIT/CUIL no clasificado',
    isPersonaFisica: false,
    isPersonaJuridica: false,
    shouldQuerySecondaryApi: false,
    dniCalculado: null
  }
}

function addOneDayToDateString (value) {
  if (!value) return null

  const text = String(value).trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text
  }

  const [year, month, day] = text.split('-').map(Number)

  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + 1)

  const adjustedYear = date.getFullYear()
  const adjustedMonth = String(date.getMonth() + 1).padStart(2, '0')
  const adjustedDay = String(date.getDate()).padStart(2, '0')

  return `${adjustedYear}-${adjustedMonth}-${adjustedDay}`
}

function calculateAge (fechaNacimiento) {
  if (!fechaNacimiento) return null

  const text = String(fechaNacimiento).trim()

  let birthDate

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number)
    birthDate = new Date(year, month - 1, day)
  } else {
    birthDate = new Date(text)
  }

  if (Number.isNaN(birthDate.getTime())) {
    return null
  }

  const today = new Date()

  let age = today.getFullYear() - birthDate.getFullYear()

  const monthDifference = today.getMonth() - birthDate.getMonth()
  const dayDifference = today.getDate() - birthDate.getDate()

  if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
    age -= 1
  }

  return age
}

function normalizeSex (value) {
  const sex = normalizeText(value)

  if (sex === 'M') return 'Masculino'
  if (sex === 'F') return 'Femenino'
  if (sex === 'X') return 'X'

  return value || null
}

function normalizeSecondaryCustomer (record, dniCalculado) {
  if (!record) return null

  const fechaNacimientoOriginal =
    record.fechanacimiento || record.fechaNacimiento || null
  const fechaNacimientoAjustada = addOneDayToDateString(fechaNacimientoOriginal)

  return {
    cuit: record.cuit || null,
    nombreCompleto: record.nombrecompleto || record.nombreCompleto || null,
    dni: record.dni || dniCalculado || null,
    fechaNacimiento: fechaNacimientoAjustada,
    fechaNacimientoOriginal,
    sexo: record.sexo || null,
    sexoDescripcion: normalizeSex(record.sexo),
    edad: calculateAge(fechaNacimientoAjustada),
    dniCalculado:
      record.dni_calculado || record.dniCalculado || dniCalculado || null,
    fuente: 'API secundaria'
  }
}

async function querySecondaryPersonApi (dniCalculado) {
  if (!config.secondaryPersonApiEnabled) {
    return {
      consultado: false,
      ok: false,
      motivo: 'API secundaria deshabilitada por configuración.'
    }
  }

  if (!dniCalculado) {
    return {
      consultado: false,
      ok: false,
      motivo: 'No se pudo calcular DNI.'
    }
  }

  const url = `${config.secondaryPersonApiUrl.replace(
    /\/+$/,
    ''
  )}/${encodeURIComponent(dniCalculado)}`

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        Accept: 'application/json'
      }
    })

    const records = Array.isArray(response.data)
      ? response.data
      : [response.data]
    const first = records.find(Boolean)

    if (!first) {
      return {
        consultado: true,
        ok: false,
        dniConsultado: dniCalculado,
        motivo: 'La API secundaria no devolvió datos.'
      }
    }

    return {
      consultado: true,
      ok: true,
      dniConsultado: dniCalculado,
      persona: normalizeSecondaryCustomer(first, dniCalculado)
    }
  } catch (error) {
    return {
      consultado: true,
      ok: false,
      dniConsultado: dniCalculado,
      motivo: error.response?.data || error.message
    }
  }
}

async function loginCms () {
  if (
    cachedAuth &&
    cachedAuth.expirationTime &&
    cachedAuth.expirationTime > new Date(Date.now() + 5 * 60 * 1000)
  ) {
    return {
      token: cachedAuth.token,
      sign: cachedAuth.sign
    }
  }

  const traXml = createLoginTicketRequestXml()
  const cms = signTRAWithOpenSSL(traXml)

  const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <in0>${cms}</in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  let response

  try {
    response = await axios.post(config.wsaaUrl, soapRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: ''
      },
      timeout: 30000
    })
  } catch (error) {
    const detail = error.response?.data || error.message

    throw new Error(
      `WSAA rechazó o no respondió la solicitud loginCms. Detalle: ${detail}`
    )
  }

  const parsed = parseXml(response.data)

  detectSoapFault(parsed, response.data)

  const body = getSoapBody(parsed)
  const loginCmsReturn = body?.loginCmsResponse?.loginCmsReturn

  if (!loginCmsReturn) {
    throw new Error(
      `WSAA no devolvió loginCmsReturn. Respuesta: ${response.data}`
    )
  }

  const ticket = parseXml(loginCmsReturn)
  const loginTicketResponse = ticket?.loginTicketResponse

  if (
    !loginTicketResponse?.credentials?.token ||
    !loginTicketResponse?.credentials?.sign
  ) {
    throw new Error(
      `WSAA no devolvió token/sign válidos. Respuesta: ${loginCmsReturn}`
    )
  }

  cachedAuth = {
    token: loginTicketResponse.credentials.token,
    sign: loginTicketResponse.credentials.sign,
    expirationTime: loginTicketResponse.header?.expirationTime
      ? new Date(loginTicketResponse.header.expirationTime)
      : new Date(Date.now() + 10 * 60 * 60 * 1000)
  }

  return {
    token: cachedAuth.token,
    sign: cachedAuth.sign
  }
}

async function dummy () {
  const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a5:dummy/>
  </soapenv:Body>
</soapenv:Envelope>`

  let response

  try {
    response = await axios.post(config.constanciaUrl, soapRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: ''
      },
      timeout: 30000
    })
  } catch (error) {
    const detail = error.response?.data || error.message

    throw new Error(
      `El método dummy no respondió correctamente. Detalle: ${detail}`
    )
  }

  const parsed = parseXml(response.data)

  detectSoapFault(parsed, response.data)

  const body = getSoapBody(parsed)

  return {
    ok: true,
    rawXml: response.data,
    data: body?.dummyResponse?.return || body
  }
}

async function requestPersonaFromArca (cuitInput) {
  const idPersona = assertValidCuit(cuitInput, 'idPersona')
  const cuitRepresentada = assertValidCuit(
    config.cuitRepresentada,
    'ARCA_CUIT_REPRESENTADA'
  )

  const auth = await loginCms()

  const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a5:getPersona_v2>
      <token>${escapeXml(auth.token)}</token>
      <sign>${escapeXml(auth.sign)}</sign>
      <cuitRepresentada>${cuitRepresentada}</cuitRepresentada>
      <idPersona>${idPersona}</idPersona>
    </a5:getPersona_v2>
  </soapenv:Body>
</soapenv:Envelope>`

  let response

  try {
    response = await axios.post(config.constanciaUrl, soapRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: ''
      },
      timeout: 30000
    })
  } catch (error) {
    const detail = error.response?.data || error.message

    throw new Error(
      `ARCA rechazó o no respondió getPersona_v2. Detalle: ${detail}`
    )
  }

  const parsed = parseXml(response.data)

  detectSoapFault(parsed, response.data)

  const body = getSoapBody(parsed)
  const personaReturn =
    body?.getPersona_v2Response?.personaReturn ||
    body?.getPersonaResponse?.personaReturn ||
    body

  return {
    idPersona,
    cuitRepresentada,
    rawXml: response.data,
    data: personaReturn
  }
}

async function buildFinalResponseFromArca (arcaResult, options = {}) {
  const datosGenerales = arcaResult.data?.datosGenerales || {}
  const clasificacionClave = getClaveClassification(
    arcaResult.idPersona,
    datosGenerales,
    options.forcedClassification || null
  )

  if (options.dniConsultado) {
    clasificacionClave.dniCalculado = options.dniConsultado
  }

  let datosComplementarios = options.datosComplementarios || {
    consultado: false,
    ok: false,
    motivo: 'No corresponde consultar API secundaria.'
  }

  if (
    !options.datosComplementarios &&
    clasificacionClave.shouldQuerySecondaryApi
  ) {
    datosComplementarios = await querySecondaryPersonApi(
      clasificacionClave.dniCalculado
    )
  }

  return {
    ok: true,
    modoConsulta: options.modoConsulta || 'CUIT_CUIL',
    idPersona: arcaResult.idPersona,
    dniConsultado: options.dniConsultado || null,
    cuitRepresentada: arcaResult.cuitRepresentada,
    clasificacionClave,
    datosComplementarios,
    rawXml: arcaResult.rawXml,
    data: arcaResult.data
  }
}

async function getPersonaByCuitOrCuil (identifier) {
  const cuit = assertValidCuit(identifier, 'CUIT/CUIL consultado')
  const arcaResult = await requestPersonaFromArca(cuit)

  return buildFinalResponseFromArca(arcaResult, {
    modoConsulta: 'CUIT_CUIL'
  })
}

async function getPersonaByDni (identifier) {
  const dni = assertValidDni(identifier, 'DNI consultado')

  const datosComplementarios = await querySecondaryPersonApi(dni)
  const cuitFromSecondary = datosComplementarios?.persona?.cuit

  if (cuitFromSecondary && isValidCuit(cuitFromSecondary)) {
    try {
      const arcaResult = await requestPersonaFromArca(cuitFromSecondary)

      return buildFinalResponseFromArca(arcaResult, {
        modoConsulta: 'DNI',
        dniConsultado: dni,
        forcedClassification: 'DNI',
        datosComplementarios
      })
    } catch (error) {
      return {
        ok: true,
        modoConsulta: 'DNI',
        idPersona: cuitFromSecondary,
        dniConsultado: dni,
        cuitRepresentada: config.cuitRepresentada,
        arcaNoEncontrado: true,
        arcaErrorFinal: error.message,
        clasificacionClave: {
          inputType: 'DNI',
          label: 'DNI consultado',
          isPersonaFisica: true,
          isPersonaJuridica: false,
          shouldQuerySecondaryApi: true,
          dniCalculado: dni
        },
        datosComplementarios,
        rawXml: null,
        data: {
          datosGenerales: {
            tipoClave: 'DNI',
            idPersona: cuitFromSecondary,
            tipoPersona: 'FISICA',
            razonSocial: datosComplementarios?.persona?.nombreCompleto || ''
          },
          datosRegimenGeneral: {},
          metadata: {
            fechaHora: new Date().toISOString()
          }
        }
      }
    }
  }

  return {
    ok: true,
    modoConsulta: 'DNI',
    idPersona: dni,
    dniConsultado: dni,
    cuitRepresentada: config.cuitRepresentada,
    arcaNoEncontrado: true,
    arcaErrorFinal: 'No se obtuvo CUIT/CUIL desde la API complementaria.',
    clasificacionClave: {
      inputType: 'DNI',
      label: 'DNI consultado',
      isPersonaFisica: true,
      isPersonaJuridica: false,
      shouldQuerySecondaryApi: true,
      dniCalculado: dni
    },
    datosComplementarios,
    rawXml: null,
    data: {
      datosGenerales: {
        tipoClave: 'DNI',
        idPersona: dni,
        tipoPersona: 'FISICA',
        razonSocial: datosComplementarios?.persona?.nombreCompleto || ''
      },
      datosRegimenGeneral: {},
      metadata: {
        fechaHora: new Date().toISOString()
      }
    }
  }
}

async function getPersona (identifierInput) {
  const identifier = cleanDigits(identifierInput)

  if (/^\d{11}$/.test(identifier)) {
    return getPersonaByCuitOrCuil(identifier)
  }

  if (/^\d{7,8}$/.test(identifier)) {
    return getPersonaByDni(identifier)
  }

  throw new Error(
    'Ingresá un CUIT/CUIL de 11 dígitos o un DNI de 7 u 8 dígitos.'
  )
}

module.exports = {
  loginCms,
  dummy,
  getPersona
}
