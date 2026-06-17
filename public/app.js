const form = document.getElementById('form')
const cuitInput = document.getElementById('cuit')
const state = document.getElementById('state')
const report = document.getElementById('report')

const btnHealth = document.getElementById('btnHealth')
const btnDebug = document.getElementById('btnDebug')
const btnDummy = document.getElementById('btnDummy')
const btnLogin = document.getElementById('btnLogin')

let lastReportData = null
let loaderInterval = null;
let loaderProgress = 0;

function ensureLoader() {
  let loader = document.getElementById('globalLoader');

  if (loader) return loader;

  loader = document.createElement('div');
  loader.id = 'globalLoader';
  loader.className = 'loader-overlay hidden';

  loader.innerHTML = `
    <div class="loader-box">
      <div class="loader-title">Consultando información</div>
      <div class="loader-subtitle" id="loaderSubtitle">
        Procesando datos...
      </div>

      <div class="loader-bar-wrap">
        <div class="loader-bar" id="loaderBar"></div>
      </div>

      <div class="loader-percent" id="loaderPercent">0%</div>
    </div>
  `;

  document.body.appendChild(loader);

  return loader;
}

function setLoaderProgress(value) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));

  loaderProgress = safeValue;

  const bar = document.getElementById('loaderBar');
  const percent = document.getElementById('loaderPercent');

  if (bar) bar.style.width = `${safeValue}%`;
  if (percent) percent.textContent = `${safeValue}%`;
}

function startLoader(message = 'Consultando datos...') {
  const loader = ensureLoader();
  const subtitle = document.getElementById('loaderSubtitle');

  if (subtitle) subtitle.textContent = message;

  loader.classList.remove('hidden');

  clearInterval(loaderInterval);

  loaderProgress = 0;
  setLoaderProgress(0);

  loaderInterval = setInterval(() => {
    if (loaderProgress < 70) {
      setLoaderProgress(loaderProgress + 3);
      return;
    }

    if (loaderProgress < 90) {
      setLoaderProgress(loaderProgress + 1);
      return;
    }

    if (loaderProgress < 95) {
      setLoaderProgress(loaderProgress + 0.5);
    }
  }, 350);
}

function finishLoader() {
  clearInterval(loaderInterval);
  setLoaderProgress(100);

  setTimeout(() => {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.add('hidden');
  }, 450);
}

function stopLoaderWithError() {
  clearInterval(loaderInterval);

  const subtitle = document.getElementById('loaderSubtitle');

  if (subtitle) {
    subtitle.textContent = 'No se pudo completar la consulta.';
  }

  setTimeout(() => {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.add('hidden');
  }, 700);
}

function escapeHtml (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function toArray (value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function formatDate (value) {
  if (!value) return '—'

  const text = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-')
    return `${day}/${month}/${year}`
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function formatDateTime (value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatPeriod (value) {
  const text = String(value || '')

  if (/^\d{8}$/.test(text)) {
    return `${text.slice(6, 8)}/${text.slice(4, 6)}/${text.slice(0, 4)}`
  }

  if (/^\d{6}$/.test(text)) {
    return `${text.slice(4, 6)}/${text.slice(0, 4)}`
  }

  return text || '—'
}

function formatMoney (value) {
  const number = Number(value || 0)

  return number.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  })
}

function showState (title, message, type = 'info') {
  report.classList.add('hidden')
  report.innerHTML = ''

  state.className = `state-card ${type}`
  state.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
  `
}

function showDiagnostic (title, data) {
  report.classList.add('hidden')
  report.innerHTML = ''

  state.className = 'state-card diagnostic'
  state.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
  `
}

async function requestJson (url) {
  const response = await fetch(url)
  const text = await response.text()

  let data

  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  if (!response.ok) {
    if (typeof data === 'object' && data !== null) {
      throw new Error(data.error || JSON.stringify(data, null, 2))
    }

    throw new Error(String(data))
  }

  return data
}

function getMainActivity (activities) {
  const sorted = [...activities].sort((a, b) => {
    return Number(a.orden || 999) - Number(b.orden || 999)
  })

  return sorted[0] || null
}

function getDisplayName (generales, payload) {
  const complementarios = payload.datosComplementarios?.persona || {}

  const razonSocial = String(generales.razonSocial || '').trim()
  const denominacion = String(generales.denominacion || '').trim()
  const nombreFantasia = String(generales.nombreFantasia || '').trim()

  const apellido = String(generales.apellido || '').trim()
  const nombre = String(generales.nombre || '').trim()

  const apellidoNombre = [apellido, nombre].filter(Boolean).join(' ').trim()
  const nombreApellido = [nombre, apellido].filter(Boolean).join(' ').trim()

  const nombreCompletoComplementario = String(
    complementarios.nombreCompleto || ''
  ).trim()

  const idPersona = generales.idPersona || payload.idPersona || ''

  return (
    razonSocial ||
    denominacion ||
    nombreFantasia ||
    apellidoNombre ||
    nombreApellido ||
    nombreCompletoComplementario ||
    `CUIT/CUIL ${idPersona || 'sin identificar'}`
  )
}

function getRiskClass (level) {
  if (level === 'ALTO') return 'risk-high'
  if (level === 'MEDIO') return 'risk-medium'
  if (level === 'BAJO') return 'risk-low'
  return 'risk-none'
}

function buildPieGradient (entities) {
  const filtered = (entities || []).filter(
    item => Number(item.porcentaje || 0) > 0
  )

  if (!filtered.length) {
    return '#1f2937'
  }

  let current = 0

  const parts = filtered.map(item => {
    const start = current
    const end = current + Number(item.porcentaje || 0)
    current = end

    return `${item.situacionColor || '#64748b'} ${start}% ${end}%`
  })

  return `conic-gradient(${parts.join(', ')})`
}

function buildSummaryText (payload) {
  const data = payload.data || {}
  const generales = data.datosGenerales || {}
  const regimen = data.datosRegimenGeneral || {}
  const domicilio = generales.domicilioFiscal || {}
  const actividades = toArray(regimen.actividad)
  const impuestos = toArray(regimen.impuesto)

  const mainActivity = getMainActivity(actividades)
  const displayName = getDisplayName(generales, payload)
  const complementarios = payload.datosComplementarios?.persona || {}
  const bcra = payload.datosBcra || {}
  const deudas = bcra.deudas || {}
  const cheques = bcra.cheques || {}
  const interpretacion = bcra.interpretacion || {}

  return [
    'Informe ARCA / BCRA',
    `CUIT/CUIL: ${generales.idPersona || payload.idPersona || ''}`,
    `Nombre / razón social: ${displayName}`,
    `DNI: ${
      complementarios.dni || payload.clasificacionClave?.dniCalculado || ''
    }`,
    `Fecha de nacimiento: ${formatDate(complementarios.fechaNacimiento)}`,
    `Sexo: ${complementarios.sexoDescripcion || complementarios.sexo || ''}`,
    `Edad: ${complementarios.edad ?? ''}`,
    `Estado ARCA: ${generales.estadoClave || ''}`,
    `Tipo de persona: ${generales.tipoPersona || ''}`,
    `Tipo detectado: ${payload.clasificacionClave?.label || ''}`,
    `Actividad principal: ${mainActivity?.descripcionActividad || ''}`,
    `Domicilio fiscal: ${domicilio.direccion || ''}, ${
      domicilio.localidad || ''
    }, ${domicilio.descripcionProvincia || ''}`,
    `Impuestos activos: ${impuestos
      .map(i => i.descripcionImpuesto)
      .filter(Boolean)
      .join(', ')}`,
    `Nivel de riesgo BCRA: ${interpretacion.nivelRiesgo || ''}`,
    `Peor situación BCRA: ${deudas.peorSituacionLabel || ''}`,
    `Total deuda actual: ${formatMoney(deudas.totalDeuda || 0)}`,
    `Cheques rechazados: ${cheques.cantidadChequesRechazados || 0}`,
    `Cheques pendientes: ${cheques.cantidadPendientes || 0}`
  ].join('\n')
}

async function copySummary () {
  if (!lastReportData) return

  const text = buildSummaryText(lastReportData)

  try {
    await navigator.clipboard.writeText(text)
    showToast('Resumen copiado')
  } catch {
    showToast('No se pudo copiar')
  }
}

function showToast (message) {
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, 2200)
}

function renderPersonalSupplement (payload) {
  const classification = payload.clasificacionClave || {}
  const complement = payload.datosComplementarios || {}
  const persona = complement.persona || {}

  if (!classification.isPersonaFisica && classification.inputType !== 'DNI') {
    return ''
  }

  if (!complement.ok) {
    return `
      <section class="panel">
        <div class="panel-title">
          <h3>Datos personales complementarios</h3>
          <span>Persona física / DNI</span>
        </div>

        <div class="notice">
          <strong>DNI calculado: ${escapeHtml(
            classification.dniCalculado || payload.dniConsultado || '—'
          )}</strong>
          <span>No se pudieron obtener datos complementarios. ${escapeHtml(
            complement.motivo || ''
          )}</span>
        </div>
      </section>
    `
  }

  return `
    <section class="panel">
      <div class="panel-title">
        <h3>Datos personales complementarios</h3>
        <span>Persona física / DNI</span>
      </div>

      <div class="person-grid">
        <article class="person-card wide">
          <span class="label">Nombre completo</span>
          <strong>${escapeHtml(persona.nombreCompleto || '—')}</strong>
        </article>

        <article class="person-card">
          <span class="label">DNI</span>
          <strong>${escapeHtml(
            persona.dni ||
              classification.dniCalculado ||
              payload.dniConsultado ||
              '—'
          )}</strong>
        </article>

        <article class="person-card">
          <span class="label">Fecha de nacimiento</span>
          <strong>${escapeHtml(formatDate(persona.fechaNacimiento))}</strong>
        </article>

        <article class="person-card">
          <span class="label">Edad</span>
          <strong>${persona.edad ?? '—'}</strong>
        </article>

        <article class="person-card">
          <span class="label">Sexo</span>
          <strong>${escapeHtml(
            persona.sexoDescripcion || persona.sexo || '—'
          )}</strong>
        </article>
      </div>
    </section>
  `
}

function renderBcraSection(payload) {
  const bcra = payload.datosBcra;

  if (!bcra || !bcra.consultado) {
    return `
      <section class="panel">
        <div class="panel-title">
          <h3>Situación financiera BCRA</h3>
          <span>No consultado</span>
        </div>

        <div class="notice">
          <strong>Información financiera no disponible</strong>
          <span>No hay CUIT/CUIL/CDI disponible para consultar la situación financiera.</span>
        </div>
      </section>
    `;
  }

  if (!bcra.ok || bcra.tieneInformacionRelevante === false) {
    return `
      <section class="panel">
        <div class="panel-title">
          <h3>Situación financiera BCRA</h3>
          <span>${escapeHtml(bcra.identificacionConsultada || '—')}</span>
        </div>

        <div class="notice">
          <strong>Información financiera no disponible</strong>
          <span>${escapeHtml(bcra.motivo || 'No se encontraron datos financieros disponibles.')}</span>
        </div>
      </section>
    `;
  }

  const deudas = bcra.deudas || {};
  const cheques = bcra.cheques || {};
  const interpretacion = bcra.interpretacion || {};

  const entidades = (deudas.entidades || []).filter((item) => {
    return item.situacion && item.situacion > 0;
  });

  const chequesPositivos = cheques.positivos || [];
  const chequesNegativos = cheques.negativos || [];

  const pieGradient = buildPieGradient(entidades);

  return `
    <section class="panel financial-panel">
      <div class="panel-title">
        <h3>Situación financiera BCRA</h3>
        <span>${escapeHtml(bcra.identificacionConsultada || '—')}</span>
      </div>

      <div class="financial-summary">
        <article class="financial-card">
          <span class="label">Nivel de riesgo</span>
          <strong class="${getRiskClass(interpretacion.nivelRiesgo)}">${escapeHtml(interpretacion.nivelRiesgo || '—')}</strong>
        </article>

        <article class="financial-card">
          <span class="label">Peor situación</span>
          <strong>${escapeHtml(deudas.peorSituacionLabel || '—')}</strong>
        </article>

        <article class="financial-card">
          <span class="label">Total deuda actual</span>
          <strong>${formatMoney(deudas.totalDeuda || 0)}</strong>
        </article>

        <article class="financial-card">
          <span class="label">Entidades informantes</span>
          <strong>${entidades.length || 0}</strong>
        </article>
      </div>

      <div class="financial-analysis">
        <div>
          <h4>Lectura rápida</h4>
          <ul>
            ${(interpretacion.resumen || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>

          ${
            (interpretacion.alertas || []).length
              ? `
                <div class="alerts">
                  ${(interpretacion.alertas || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
                </div>
              `
              : ''
          }

          ${
            deudas.observacionMontos
              ? `<p class="small-note">${escapeHtml(deudas.observacionMontos)}</p>`
              : ''
          }
        </div>

        <div class="pie-box">
          <div class="pie-chart" style="background: ${pieGradient};"></div>
          <p>Distribución de deuda por entidad</p>
        </div>
      </div>

      <div class="legend">
        <span><i style="background:#22c55e"></i> Sit. 1</span>
        <span><i style="background:#a3e635"></i> Sit. 2</span>
        <span><i style="background:#8b5cf6"></i> Sit. 3</span>
        <span><i style="background:#f97316"></i> Sit. 4</span>
        <span><i style="background:#ef4444"></i> Sit. 5</span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>Deuda por entidad</h3>
        <span>${escapeHtml(deudas.periodoActualFormateado || 'Último período')}</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Entidad</th>
              <th>Situación</th>
              <th>Monto real</th>
              <th>% deuda</th>
              <th>Monto informado BCRA</th>
            </tr>
          </thead>
          <tbody>
            ${
              entidades.length
                ? entidades.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.entidad)}</td>
                    <td>
                      <span class="situation-badge" style="background:${escapeHtml(item.situacionColor)}">
                        ${escapeHtml(item.situacion || '—')}
                      </span>
                      ${escapeHtml(item.situacionLabel || '')}
                    </td>
                    <td>${formatMoney(item.monto)}</td>
                    <td>${escapeHtml(item.porcentaje)}%</td>
                    <td>${escapeHtml(item.montoOriginal || '—')} x 1.000</td>
                  </tr>
                `).join('')
                : '<tr><td colspan="5">Información financiera no disponible.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>Cheques negativos</h3>
        <span>${chequesNegativos.length} pendiente/s</span>
      </div>

      <div class="financial-summary">
        <article class="financial-card">
          <span class="label">Cantidad</span>
          <strong class="risk-high">${chequesNegativos.length}</strong>
        </article>

        <article class="financial-card">
          <span class="label">Monto total</span>
          <strong>${formatMoney(cheques.montoNegativo || 0)}</strong>
        </article>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha rechazo</th>
              <th>Causal</th>
              <th>Entidad</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Fecha pago</th>
            </tr>
          </thead>
          <tbody>
            ${
              chequesNegativos.length
                ? chequesNegativos.map((item) => `
                  <tr>
                    <td>${escapeHtml(formatDate(item.fechaRechazo))}</td>
                    <td>${escapeHtml(item.causal || '—')}</td>
                    <td>${escapeHtml(item.entidad || '—')}</td>
                    <td>${formatMoney(item.monto)}</td>
                    <td>${escapeHtml(item.estadoPago || 'Pendiente de abonar')}</td>
                    <td>${escapeHtml(formatDate(item.fechaPago))}</td>
                  </tr>
                `).join('')
                : '<tr><td colspan="6">No se informaron cheques negativos.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>Cheques positivos</h3>
        <span>${chequesPositivos.length} abonado/s</span>
      </div>

      <div class="financial-summary">
        <article class="financial-card">
          <span class="label">Cantidad</span>
          <strong class="risk-low">${chequesPositivos.length}</strong>
        </article>

        <article class="financial-card">
          <span class="label">Monto total</span>
          <strong>${formatMoney(cheques.montoPositivo || 0)}</strong>
        </article>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha rechazo</th>
              <th>Causal</th>
              <th>Entidad</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Fecha pago</th>
            </tr>
          </thead>
          <tbody>
            ${
              chequesPositivos.length
                ? chequesPositivos.map((item) => `
                  <tr>
                    <td>${escapeHtml(formatDate(item.fechaRechazo))}</td>
                    <td>${escapeHtml(item.causal || '—')}</td>
                    <td>${escapeHtml(item.entidad || '—')}</td>
                    <td>${formatMoney(item.monto)}</td>
                    <td>${escapeHtml(item.estadoPago || 'Abonado')}</td>
                    <td>${escapeHtml(formatDate(item.fechaPago))}</td>
                  </tr>
                `).join('')
                : '<tr><td colspan="6">No se informaron cheques positivos.</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <p class="small-note">
        ${escapeHtml(cheques.observacion || '')}
      </p>
    </section>
  `;
}

function renderReport (payload) {
  lastReportData = payload

  const data = payload.data || {}
  const generales = data.datosGenerales || {}
  const regimen = data.datosRegimenGeneral || {}
  const domicilio = generales.domicilioFiscal || {}
  const metadata = data.metadata || {}
  const classification = payload.clasificacionClave || {}

  const actividades = toArray(regimen.actividad).sort((a, b) => {
    return Number(a.orden || 999) - Number(b.orden || 999)
  })

  const impuestos = toArray(regimen.impuesto)
  const regimenes = toArray(regimen.regimen)

  const mainActivity = getMainActivity(actividades)
  const displayName = getDisplayName(generales, payload)

  const estado = generales.estadoClave || '—'
  const estadoClass = estado.toUpperCase() === 'ACTIVO' ? 'success' : 'warning'

  state.classList.add('hidden')
  report.classList.remove('hidden')

  report.innerHTML = `
    <div class="report-header">
      <div>
        <p class="eyebrow">Informe de constancia</p>
        <h2>${escapeHtml(displayName)}</h2>
        <p class="cuit-line">
          ${escapeHtml(generales.tipoClave || 'CUIT/CUIL/DNI')}: ${escapeHtml(
    generales.idPersona || payload.idPersona
  )}
        </p>
      </div>

      <div class="report-actions">
        <button type="button" onclick="window.print()">Imprimir</button>
        <button type="button" id="copySummary">Copiar resumen</button>
      </div>
    </div>

    <div class="hero-grid">
      <article class="hero-card">
        <span class="label">Estado de clave</span>
        <strong class="${estadoClass}">${escapeHtml(estado)}</strong>
      </article>

      <article class="hero-card">
        <span class="label">Tipo de persona</span>
        <strong>${escapeHtml(generales.tipoPersona || '—')}</strong>
      </article>

      <article class="hero-card">
        <span class="label">Tipo detectado</span>
        <strong>${escapeHtml(classification.label || '—')}</strong>
      </article>

      <article class="hero-card">
        <span class="label">DNI calculado</span>
        <strong>${escapeHtml(
          classification.dniCalculado || payload.dniConsultado || '—'
        )}</strong>
      </article>
    </div>

    ${renderPersonalSupplement(payload)}

    ${renderBcraSection(payload)}

    <section class="panel">
      <div class="panel-title">
        <h3>Actividad principal</h3>
      </div>

      <div class="main-activity">
        <strong>${escapeHtml(
          mainActivity?.descripcionActividad || 'Sin actividad informada'
        )}</strong>
        <span>Código ${escapeHtml(
          mainActivity?.idActividad || '—'
        )} · Desde ${escapeHtml(formatPeriod(mainActivity?.periodo))}</span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>Domicilio fiscal</h3>
      </div>

      <div class="address">
        <strong>${escapeHtml(domicilio.direccion || '—')}</strong>
        <span>
          ${escapeHtml(domicilio.localidad || '—')} ·
          ${escapeHtml(domicilio.descripcionProvincia || '—')} ·
          CP ${escapeHtml(domicilio.codPostal || '—')}
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>Actividades registradas</h3>
        <span>${actividades.length} actividad${
    actividades.length === 1 ? '' : 'es'
  }</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Orden</th>
              <th>Actividad</th>
              <th>Código</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            ${
              actividades.length
                ? actividades
                    .map(
                      actividad => `
                  <tr>
                    <td>${escapeHtml(actividad.orden || '—')}</td>
                    <td>${escapeHtml(
                      actividad.descripcionActividad || '—'
                    )}</td>
                    <td>${escapeHtml(actividad.idActividad || '—')}</td>
                    <td>${escapeHtml(formatPeriod(actividad.periodo))}</td>
                  </tr>
                `
                    )
                    .join('')
                : '<tr><td colspan="4">No se informaron actividades.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>Impuestos activos</h3>
        <span>${impuestos.length} impuesto${
    impuestos.length === 1 ? '' : 's'
  }</span>
      </div>

      <div class="chips">
        ${
          impuestos.length
            ? impuestos
                .map(
                  impuesto => `
              <div class="chip">
                <strong>${escapeHtml(
                  impuesto.descripcionImpuesto || '—'
                )}</strong>
                <span>Estado ${escapeHtml(
                  impuesto.estadoImpuesto || '—'
                )} · Desde ${escapeHtml(formatPeriod(impuesto.periodo))}</span>
              </div>
            `
                )
                .join('')
            : '<p class="empty">No se informaron impuestos.</p>'
        }
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h3>Regímenes informados</h3>
        <span>${regimenes.length} régimen${
    regimenes.length === 1 ? '' : 'es'
  }</span>
      </div>

      <div class="chips">
        ${
          regimenes.length
            ? regimenes
                .map(
                  item => `
              <div class="chip soft">
                <strong>${escapeHtml(item.descripcionRegimen || '—')}</strong>
                <span>Desde ${escapeHtml(formatPeriod(item.periodo))}</span>
              </div>
            `
                )
                .join('')
            : '<p class="empty">No se informaron regímenes.</p>'
        }
      </div>
    </section>

    <footer class="report-footer">
      <span>Consulta generada: ${escapeHtml(
        formatDateTime(metadata.fechaHora)
      )}</span>
      <span>CUIT representada: ${escapeHtml(
        payload.cuitRepresentada || '—'
      )}</span>
    </footer>
  `

  document.getElementById('copySummary').addEventListener('click', copySummary)
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const identifier = cuitInput.value.replace(/\D/g, '');

  if (!identifier) {
    showState('Dato requerido', 'Ingresá un CUIT, CUIL o DNI para consultar.', 'error');
    return;
  }

  showState(
    'Consultando información',
    'Obteniendo datos de ARCA, datos complementarios y situación financiera.',
    'loading'
  );

  startLoader('Consultando ARCA, datos personales y situación financiera...');

  try {
    const data = await requestJson(`/api/cuit/${identifier}`);
    renderReport(data);
    finishLoader();
  } catch (error) {
    stopLoaderWithError();
    showState('No se pudo obtener la información', error.message, 'error');
  }
});

btnHealth.addEventListener('click', async () => {
  try {
    const data = await requestJson('/api/health')
    showDiagnostic('Estado de la app', data)
  } catch (error) {
    showState('Error', error.message, 'error')
  }
})

btnDebug.addEventListener('click', async () => {
  try {
    const data = await requestJson('/api/debug/config')
    showDiagnostic('Configuración actual', data)
  } catch (error) {
    showState('Error', error.message, 'error')
  }
})

btnDummy.addEventListener('click', async () => {
  try {
    const data = await requestJson('/api/dummy')
    showDiagnostic('Dummy ARCA', data)
  } catch (error) {
    showState('Error', error.message, 'error')
  }
})

btnLogin.addEventListener('click', async () => {
  try {
    const data = await requestJson('/api/login-test')
    showDiagnostic('Prueba WSAA', data)
  } catch (error) {
    showState('Error', error.message, 'error')
  }
})
