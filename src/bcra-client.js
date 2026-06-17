const { connect } = require('puppeteer-real-browser')

const SITUATION_MAP = {
  1: {
    label: 'Situación 1 - Normal',
    color: '#22c55e',
    description: 'Cumplimiento normal.'
  },
  2: {
    label: 'Situación 2 - Riesgo bajo / seguimiento',
    color: '#a3e635',
    description: 'Riesgo bajo o atraso leve.'
  },
  3: {
    label: 'Situación 3 - Riesgo medio',
    color: '#8b5cf6',
    description: 'Riesgo medio.'
  },
  4: {
    label: 'Situación 4 - Riesgo alto',
    color: '#f97316',
    description: 'Riesgo alto.'
  },
  5: {
    label: 'Situación 5 - Irrecuperable / muy alto riesgo',
    color: '#ef4444',
    description: 'Riesgo muy alto.'
  }
}

function cleanDigits (value) {
  return String(value || '').replace(/\D/g, '')
}

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toNumber (value) {
  if (typeof value === 'number') return value

  const text = String(value || '')
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')

  if (!text) return 0

  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/\./g, '')

  const number = Number(normalized)

  return Number.isFinite(number) ? number : 0
}

function getSituationInfo (situation) {
  const number = Number(String(situation || '').replace(/\D/g, ''))

  return (
    SITUATION_MAP[number] || {
      label: `Situación ${situation || 'sin informar'}`,
      color: '#64748b',
      description: 'Situación no informada.'
    }
  )
}

function formatPeriod (period) {
  const value = String(period || '').trim()

  if (/^\d{6}$/.test(value)) {
    return `${value.slice(4, 6)}/${value.slice(0, 4)}`
  }

  return value || null
}

function getBcraIdentificationFromPersona (personaResult) {
  const ids = []

  const idPersona = cleanDigits(personaResult?.idPersona)
  const datosGeneralesId = cleanDigits(
    personaResult?.data?.datosGenerales?.idPersona
  )
  const complementCuit = cleanDigits(
    personaResult?.datosComplementarios?.persona?.cuit
  )

  for (const item of [idPersona, datosGeneralesId, complementCuit]) {
    if (/^\d{11}$/.test(item) && !ids.includes(item)) {
      ids.push(item)
    }
  }

  return ids[0] || null
}

async function scrapeBcraWeb (identificacion) {
  const cuit = cleanDigits(identificacion)

  if (!/^\d{11}$/.test(cuit)) {
    return {
      ok: false,
      motivo: 'BCRA requiere CUIT/CUIL/CDI de 11 dígitos.'
    }
  }

  let browser
  let page

  try {
    const connection = await connect({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1200,800',
        '--window-position=-32000,-32000'
      ],
      defaultViewport: null
    })

    browser = connection.browser
    page = connection.page

    await page.goto('https://www.bcra.gob.ar/situacion-crediticia/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })

    await page.waitForSelector('#user_cuit', {
      timeout: 30000
    })

    await page.click('#user_cuit', { clickCount: 3 })
    await page.keyboard.press('Backspace')
    await delay(150)

    await page.focus('#user_cuit')
    await page.type('#user_cuit', cuit, { delay: 55 })

    const valorEscrito = await page.$eval('#user_cuit', el => el.value.trim())

    if (valorEscrito !== cuit) {
      await page.evaluate(value => {
        const input = document.querySelector('#user_cuit')
        if (input) input.value = value
      }, cuit)
    }

    await delay(3000)

    await page.evaluate(() => {
      const btn = document.querySelector('#consulta-cuit')
      if (btn) {
        btn.scrollIntoView({ block: 'center' })
        btn.click()
      }
    })

    await delay(5000)

    const data = await page.evaluate(() => {
      function normalizeSpaces (value) {
        return String(value || '')
          .replace(/\s+/g, ' ')
          .trim()
      }

      const resultado = {
        cuit: document.querySelector('#user_cuit')?.value?.trim() || '',
        razonSocial: '',
        deudas: [],
        cheques: [],
        textos: [],
        textoCompleto: '',
        fechaConsulta: new Date().toISOString()
      }

      const titulo =
        document.querySelector('h2.titulo-principal-n') ||
        document.querySelector('h2') ||
        document.querySelector('.titulo-principal-n')

      if (titulo) {
        resultado.razonSocial = normalizeSpaces(titulo.innerText)
      }

      resultado.textoCompleto = normalizeSpaces(document.body.innerText || '')

      document.querySelectorAll('.alert').forEach(alert => {
        const text = normalizeSpaces(alert.innerText)
        if (text) resultado.textos.push(text)
      })

      document.querySelectorAll('table').forEach(table => {
        const tableText = normalizeSpaces(table.innerText || '')
        const headers = Array.from(
          table.querySelectorAll('thead th, tr th')
        ).map(th => normalizeSpaces(th.innerText))

        const rows = Array.from(table.querySelectorAll('tbody tr, tr'))

        rows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(td =>
            normalizeSpaces(td.innerText)
          )

          if (cells.length < 2) return

          const joined = cells.join(' ').toLowerCase()

          const pareceDeuda =
            table.id === 'tabla-rowcolspan-int' ||
            headers.join(' ').toLowerCase().includes('situación') ||
            headers.join(' ').toLowerCase().includes('situacion') ||
            joined.includes('situación') ||
            joined.includes('situacion')

          if (pareceDeuda && cells.length >= 4) {
            resultado.deudas.push({
              entidad: cells[1] || cells[0] || '',
              periodo: cells[2] || '',
              situacion: cells[3] || '',
              monto: cells[4] || cells[cells.length - 1] || ''
            })
            return
          }

          const pareceCheque =
            tableText.toLowerCase().includes('cheque') ||
            joined.includes('cheque') ||
            joined.includes('rechaz')

          if (pareceCheque) {
            resultado.cheques.push({
              columnas: cells
            })
          }
        })
      })

      return resultado
    })

    return {
      ok: true,
      data
    }
  } catch (error) {
    return {
      ok: false,
      motivo: error.message || 'No se pudo consultar BCRA por scraper.'
    }
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        // No cortar el flujo por error de cierre.
      }
    }
  }
}

function normalizeScrapedDebt(item) {
  const montoEnMiles = toNumber(item.monto);
  const montoReal = montoEnMiles * 1000;

  const situacionNumber = Number(String(item.situacion || '').replace(/\D/g, ''));
  const situationInfo = getSituationInfo(situacionNumber);

  return {
    entidad: item.entidad || 'Entidad sin identificar',
    periodo: item.periodo || null,
    periodoFormateado: formatPeriod(item.periodo),
    situacion: situacionNumber || null,
    situacionLabel: situacionNumber ? situationInfo.label : null,
    situacionColor: situacionNumber ? situationInfo.color : '#64748b',
    monto: montoReal,
    montoOriginal: item.monto || '',
    montoEnMiles,
    montoEscala: 'BCRA informa deuda en miles. Monto multiplicado por 1.000.',
    porcentaje: 0,
    diasAtrasoPago: null,
    fechaSit1: null,
    refinanciaciones: false,
    recategorizacionOblig: false,
    situacionJuridica: false,
    irrecDisposicionTecnica: false,
    enRevision: false,
    procesoJud: false
  };
}

function normalizeScrapedChecks(scraped) {
  const texto = String(scraped?.textoCompleto || '').toLowerCase();
  const textos = Array.isArray(scraped?.textos) ? scraped.textos : [];
  const chequesRaw = Array.isArray(scraped?.cheques) ? scraped.cheques : [];

  const noTieneCheques =
    texto.includes('no registra cheques') ||
    texto.includes('no posee cheques') ||
    texto.includes('sin cheques') ||
    textos.some((item) => String(item).toLowerCase().includes('no registra cheques'));

  const detalle = chequesRaw.map((item) => {
    const columnas = item.columnas || [];
    const textoFila = columnas.join(' ').toLowerCase();

    const esAbonado =
      textoFila.includes('abonado') ||
      textoFila.includes('abonada') ||
      textoFila.includes('pagado') ||
      textoFila.includes('pagada');

    const estadoPago = esAbonado ? 'Abonado' : 'Pendiente de abonar';

    return {
      causal: columnas[0] || 'Cheque rechazado',
      entidad: columnas[1] || null,
      nroCheque: columnas[2] || null,
      fechaRechazo: columnas[3] || null,

      // IMPORTANTE:
      // Los montos de cheques NO se multiplican por 1.000.
      monto: toNumber(columnas[4] || 0),
      montoOriginal: columnas[4] || '',

      fechaPago: columnas[5] || null,
      fechaPagoMulta: null,
      estadoMulta: null,
      ctaPersonal: false,
      denomJuridica: null,
      enRevision: false,
      procesoJud: false,
      estadoPago,
      tipoCheque: esAbonado ? 'positivo' : 'negativo'
    };
  });

  const negativos = noTieneCheques
    ? []
    : detalle.filter((item) => item.tipoCheque === 'negativo');

  const positivos = noTieneCheques
    ? []
    : detalle.filter((item) => item.tipoCheque === 'positivo');

  return {
    tieneChequesRechazados: detalle.length > 0 && !noTieneCheques,

    cantidadChequesRechazados: noTieneCheques ? 0 : detalle.length,

    cantidadPositivos: positivos.length,
    cantidadNegativos: negativos.length,

    cantidadAbonados: positivos.length,
    cantidadPendientes: negativos.length,

    montoTotalCheques: noTieneCheques ? 0 : detalle.reduce((acc, item) => acc + item.monto, 0),
    montoPositivo: positivos.reduce((acc, item) => acc + item.monto, 0),
    montoNegativo: negativos.reduce((acc, item) => acc + item.monto, 0),

    montoAbonado: positivos.reduce((acc, item) => acc + item.monto, 0),
    montoPendiente: negativos.reduce((acc, item) => acc + item.monto, 0),

    positivos,
    negativos,
    detalle: noTieneCheques ? [] : detalle,

    observacion: noTieneCheques
      ? 'No registra cheques rechazados informados en la consulta web del BCRA.'
      : 'Los montos de cheques se muestran tal como informa BCRA, sin multiplicarlos.'
  };
}

function buildFinancialInterpretation (debts, checks) {
  const messages = []

  if (!debts.tieneDeudaActual) {
    messages.push(
      'No registra deuda actual visible en la consulta web del BCRA.'
    )
  } else {
    messages.push(`Registra deuda actual por un total de ${debts.totalDeuda}.`)
    messages.push(`Peor situación informada: ${debts.peorSituacionLabel}.`)
  }

  if (checks.tieneChequesRechazados) {
    messages.push(
      `Registra ${checks.cantidadChequesRechazados} cheque/s rechazado/s.`
    )
    messages.push(`Pendientes de abonar: ${checks.cantidadPendientes}.`)
  } else {
    messages.push(
      'No registra cheques rechazados visibles en la consulta web del BCRA.'
    )
  }

  const alertas = []

  if (Number(debts.peorSituacion || 0) >= 4) {
    alertas.push('Situación financiera de riesgo alto.')
  }

  if (checks.cantidadPendientes > 0) {
    alertas.push('Tiene cheques rechazados pendientes de abonar.')
  }

  return {
    resumen: messages,
    alertas,
    nivelRiesgo:
      Number(debts.peorSituacion || 0) >= 4 || checks.cantidadPendientes > 0
        ? 'ALTO'
        : Number(debts.peorSituacion || 0) === 3
        ? 'MEDIO'
        : Number(debts.peorSituacion || 0) > 0
        ? 'BAJO'
        : 'SIN_DEUDA_INFORMADA'
  }
}

function buildBcraReportFromScrapedData(identificacion, scraped) {
  const debts = Array.isArray(scraped.deudas)
    ? scraped.deudas
        .map(normalizeScrapedDebt)
        .filter((item) => {
          // No mostrar entidades con "Situación sin informar".
          return item.situacion && item.situacion > 0 && item.monto > 0;
        })
    : [];

  const totalDebt = debts.reduce((acc, item) => acc + item.monto, 0);

  const debtsWithPercent = debts.map((item) => ({
    ...item,
    porcentaje: totalDebt > 0 ? Number(((item.monto / totalDebt) * 100).toFixed(2)) : 0
  }));

  const maxSituation = debtsWithPercent.reduce((max, item) => {
    return Math.max(max, Number(item.situacion || 0));
  }, 0);

  const situationInfo = getSituationInfo(maxSituation);

  const cheques = normalizeScrapedChecks(scraped);

  const deudaResumen = {
    tieneDeudaActual: debtsWithPercent.length > 0 || totalDebt > 0,
    periodoActual: debtsWithPercent[0]?.periodo || null,
    periodoActualFormateado: debtsWithPercent[0]?.periodoFormateado || null,
    totalDeuda: totalDebt,
    cantidadEntidades: debtsWithPercent.length,
    peorSituacion: maxSituation || null,
    peorSituacionLabel: maxSituation ? situationInfo.label : null,
    peorSituacionColor: maxSituation ? situationInfo.color : '#64748b',
    entidades: debtsWithPercent,
    resumenPorSituacion: [],
    historico: [],
    observacionMontos: 'Los montos de deuda BCRA fueron multiplicados por 1.000 porque la consulta los informa en miles.'
  };

  const interpretacion = buildFinancialInterpretation(deudaResumen, cheques);

  const tieneInformacionRelevante =
    deudaResumen.tieneDeudaActual ||
    cheques.tieneChequesRechazados;

  return {
    consultado: true,
    ok: true,
    fuente: 'scraper_bcra_web',
    tieneInformacionRelevante,
    identificacionConsultada: identificacion,
    motivo: tieneInformacionRelevante
      ? null
      : 'Información financiera no disponible.',
    fuentes: {
      web: {
        ok: true,
        status: 200,
        url: 'https://www.bcra.gob.ar/situacion-crediticia/',
        error: null
      }
    },
    deudas: deudaResumen,
    cheques,
    interpretacion,
    raw: {
      scraper: scraped
    }
  };
}

async function getBcraFinancialReportByIdentification (identificacionInput) {
  const identificacion = cleanDigits(identificacionInput)

  if (!/^\d{11}$/.test(identificacion)) {
    return {
      consultado: false,
      ok: false,
      fuente: 'scraper_bcra_web',
      tieneInformacionRelevante: false,
      identificacionConsultada: identificacion,
      motivo: 'BCRA requiere CUIT/CUIL/CDI de 11 dígitos.',
      deudas: null,
      cheques: null,
      interpretacion: null,
      raw: null
    }
  }

  const scraped = await scrapeBcraWeb(identificacion)

  if (!scraped.ok) {
    return {
      consultado: true,
      ok: false,
      fuente: 'scraper_bcra_web',
      tieneInformacionRelevante: false,
      identificacionConsultada: identificacion,
      motivo: 'Información financiera no disponible.',
      detalleError: scraped.motivo,
      fuentes: {
        web: {
          ok: false,
          status: null,
          url: 'https://www.bcra.gob.ar/situacion-crediticia/',
          error: scraped.motivo
        }
      },
      deudas: null,
      cheques: null,
      interpretacion: null,
      raw: null
    }
  }

  return buildBcraReportFromScrapedData(identificacion, scraped.data)
}

async function getBcraFinancialReport (personaResult) {
  const identificacion = getBcraIdentificationFromPersona(personaResult)

  if (!identificacion) {
    return {
      consultado: false,
      ok: false,
      fuente: 'scraper_bcra_web',
      tieneInformacionRelevante: false,
      motivo: 'No hay CUIT/CUIL/CDI disponible para consultar BCRA.'
    }
  }

  return getBcraFinancialReportByIdentification(identificacion)
}

module.exports = {
  getBcraFinancialReport,
  getBcraFinancialReportByIdentification,
  SITUATION_MAP
}
