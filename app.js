/* ══════════════════════════════════════════════════════════
   ARENAS INMOBILIARIA · Generador de Cartas
   Versión: 1.0 · Lógica principal
══════════════════════════════════════════════════════════ */

'use strict';

/* ── Estado global ── */
const APP = {
  clients: [],
  selectedClient: null,
  selectedIndex: -1,
  fileName: '',
  logoDataUrl: null,
  logoAspect: 0.28,
  membreteBytes: null,   /* bytes del PDF membrete plantilla */
  currentStep: 1
};

const REQUIRED_COLS = [
  'fecha_carta','nombre_cliente','direccion','ciudad','asunto',
  'conjunto','apartamento','valor_admon_letras','valor_admon_numero',
  'mes_factura','periodo_retroactivo','valor_retroactivo',
  'empresa_factura','link_pago'
];

/* ══════════════════════════════════════════════════════════
   INICIALIZACIÓN
══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadLogo();
  loadMembrete();
  /* Eliminar fondo blanco de todos los logos que van sobre fondos oscuros */
  removeWhiteBg('.hero-logo');
  removeWhiteBg('.l-nav-logo');
  removeWhiteBg('.dash-banner-logo-img');
  if (window.SpaceAnim) SpaceAnim.init();
  checkAuth();
});

/* ── Elimina el fondo blanco de cualquier imagen via canvas ── */
function removeWhiteBg(selector) {
  const img = document.querySelector(selector);
  if (!img) return;

  function process() {
    if (!img.naturalWidth) return;
    try {
      const cv  = document.createElement('canvas');
      cv.width  = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id  = ctx.getImageData(0, 0, cv.width, cv.height);
      const d   = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const lum = (r + g + b) / 3;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (lum > 215 && sat < 35) {
          const fade = (lum - 215) / 40;
          d[i + 3] = Math.max(0, Math.round(d[i + 3] * (1 - fade)));
        }
      }
      ctx.putImageData(id, 0, 0);
      img.src = cv.toDataURL('image/png');
    } catch (e) { /* falla silenciosa — imagen original sin cambios */ }
  }

  if (img.complete && img.naturalWidth > 0) process();
  else img.addEventListener('load', process, { once: true });
}

function checkAuth() {
  /* Muestra la landing con la animación espacial */
  document.getElementById('landingSection').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
}

function bindEvents() {
  /* Landing · Hero card click */
  document.getElementById('heroCard').addEventListener('click', enterSystem);

  /* Login */
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('togglePwd').addEventListener('click', togglePassword);

  /* Modo oscuro */
  document.getElementById('btnDarkMode').addEventListener('click', toggleDarkMode);
  /* Restaurar preferencia guardada */
  if (localStorage.getItem('darkMode') === '1') applyDark(true);

  /* Dashboard */
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnDownloadTemplate').addEventListener('click', downloadTemplate);
  document.getElementById('btnSelectFile').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', handleFileSelect);
  document.getElementById('btnClearFile').addEventListener('click', clearFile);
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('btnPDF').addEventListener('click', () => generatePDFSingle());
  document.getElementById('btnPDFAll').addEventListener('click', () => generatePDFConsolidated());
  document.getElementById('btnPDFZip').addEventListener('click', () => generatePDFZip());

  /* Upload drag & drop */
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-secondary')) document.getElementById('fileInput').click();
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });
}

/* ── Carga el logo como dataURL para PDF, con múltiples estrategias ── */
function loadLogo() {
  /* Estrategia 1: fetch (funciona con HTTP y file:// en Chrome/Edge) */
  fetch('assets/logo.png')
    .then(r => {
      if (!r.ok) throw new Error('fetch failed');
      return r.blob();
    })
    .then(blob => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        /* Medir dimensiones reales para calcular aspect ratio */
        const img = new Image();
        img.onload = () => {
          APP.logoAspect = img.naturalHeight > 0
            ? img.naturalHeight / img.naturalWidth
            : 0.25;
          APP.logoDataUrl = dataUrl;
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(blob);
    })
    .catch(() => {
      /* Estrategia 2: img ya renderizada en el DOM → canvas */
      const imgEl = document.querySelector('.dash-logo');
      const tryLoad = (el) => {
        if (!el) return;
        if (el.complete && el.naturalWidth > 0) {
          tryCanvasLogo(el);
        } else {
          el.addEventListener('load', () => tryCanvasLogo(el), { once: true });
        }
      };
      tryLoad(imgEl);
    });
}

function tryCanvasLogo(img) {
  try {
    const c = document.createElement('canvas');
    c.width  = img.naturalWidth  || 400;
    c.height = img.naturalHeight || 120;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    APP.logoDataUrl  = c.toDataURL('image/png');
    APP.logoAspect   = img.naturalHeight / (img.naturalWidth || 1);
  } catch (_) { /* sin logo en PDF — se usará texto */ }
}

/* ── Carga el PDF membrete como plantilla ── */
async function loadMembrete() {
  try {
    const res = await fetch('assets/membrete.pdf');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    APP.membreteBytes = new Uint8Array(await res.arrayBuffer());
    console.log('Membrete cargado correctamente.');
  } catch (e) {
    console.warn('Membrete no disponible, se usará generación estándar:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════
   AUTENTICACIÓN
══════════════════════════════════════════════════════════ */

function handleLogin(e) {
  e.preventDefault();
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;
  const errBox = document.getElementById('loginError');

  if (user === 'admin' && pass === 'admin') {
    errBox.style.display = 'none';
    sessionStorage.setItem('ai_logged', '1');
    animateLoginSuccess();
  } else {
    errBox.style.display = 'flex';
    /* shake en el form */
    const card = document.querySelector('.login-form-card');
    card.style.animation = 'none';
    requestAnimationFrame(() => { card.style.animation = ''; });
    document.getElementById('fieldUser').querySelector('input').style.borderColor = 'var(--c-red)';
    document.getElementById('fieldPass').querySelector('input').style.borderColor = 'var(--c-red)';
    setTimeout(() => {
      document.getElementById('fieldUser').querySelector('input').style.borderColor = '';
      document.getElementById('fieldPass').querySelector('input').style.borderColor = '';
    }, 1500);
  }
}

function animateLoginSuccess() {
  const btn = document.getElementById('btnLogin');
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Acceso concedido…</span>`;
  btn.style.background = 'linear-gradient(135deg,#059669,#10B981)';
  btn.style.boxShadow = '0 4px 20px rgba(16,185,129,.35)';
  setTimeout(() => showDashboard(), 700);
}

function showLanding() {
  const landing = document.getElementById('dashboardSection');
  if (landing) landing.style.display = 'none';
  const ls = document.getElementById('landingSection');
  if (ls) ls.style.display = 'block';
  /* Reinicia la animación espacial */
  if (window.SpaceAnim) {
    SpaceAnim.stop();
    SpaceAnim.init();
  }
}

function enterSystem() {
  const hero  = document.getElementById('heroCard');
  const flash = document.getElementById('warpFlash');

  /* Fase 1 (0–400ms): el héroe se ilumina y expande */
  if (hero) {
    hero.style.transition = 'filter 0.45s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)';
    hero.style.filter     = 'brightness(1.8) saturate(1.5)';
    hero.style.transform  = 'translate(-50%,-50%) scale(1.15)';
  }

  /* Fase 2 (400ms): velo oscuro se despliega lentamente */
  setTimeout(() => {
    if (flash) flash.classList.add('active');
  }, 400);

  /* Fase 3 (1500ms): entra al sistema */
  setTimeout(() => {
    if (window.SpaceAnim) SpaceAnim.stop();
    document.getElementById('landingSection').style.display = 'none';
    if (hero) { hero.style.filter = ''; hero.style.transition = ''; hero.style.transform = ''; }
    sessionStorage.setItem('ai_logged', '1');
    showDashboard();
    /* Fase 4: velo se retira revelando el dashboard */
    setTimeout(() => { if (flash) flash.classList.remove('active'); }, 120);
  }, 1500);
}

function showLogin() {
  showLanding();
}

function showDashboard() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('landingSection').style.display = 'none';
  const dash = document.getElementById('dashboardSection');
  dash.style.display = 'flex';
  dash.style.flexDirection = 'column';
  dash.classList.add('section-enter');
  setTimeout(() => dash.classList.remove('section-enter'), 600);
  setStep(1);
}

function logout() {
  sessionStorage.removeItem('ai_logged');
  /* Resetear estado */
  clearFile(true);
  /* Limpiar inputs de login */
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('loginError').style.display = 'none';
  const btn = document.getElementById('btnLogin');
  btn.innerHTML = `<span class="btn-login-text">Ingresar al sistema</span><svg class="btn-login-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  btn.style.background = '';
  btn.style.boxShadow = '';
  showLanding();
  showToast('Volviste al inicio.', 'info');
}

function togglePassword() {
  const input = document.getElementById('password');
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  document.getElementById('eyeIcon').innerHTML = isText
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;
}

/* ══════════════════════════════════════════════════════════
   STEPPER
══════════════════════════════════════════════════════════ */

function setStep(n) {
  APP.currentStep = n;
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`si${i}`);
    if (!el) continue;
    el.classList.remove('active','done');
    if (i < n)  el.classList.add('done');
    if (i === n) el.classList.add('active');
  }
}

/* ══════════════════════════════════════════════════════════
   DESCARGA DEL FORMATO EXCEL
══════════════════════════════════════════════════════════ */

function downloadTemplate() {
  const headers = [
    'fecha_carta','nombre_cliente','direccion','ciudad','asunto',
    'conjunto','apartamento','valor_admon_letras','valor_admon_numero',
    'mes_factura','periodo_retroactivo','valor_retroactivo',
    'empresa_factura','link_pago'
  ];

  const example = [
    'Barranquilla, 19 de mayo 2026',
    'GUTIERREZ NOGUERA XIMENA',
    'CL 104 53 49 CON ZION TOWERS TO 1 AP 901',
    'Ciudad',
    'Aumento admón.',
    'CONJUNTO RESIDENCIAL ZION TOWERS',
    'AP 901',
    'UN MILLÓN QUINIENTOS VEINTICUATRO MIL PESOS',
    '$1.524.000',
    'JULIO 2026',
    'ENERO 2026 A JUNIO 2026',
    '$756.000',
    'Grupo Arenas S.A.',
    'https://www.psepagos.co/PSEHostingUI/showTicketOffice.aspx?ID=5025'
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);

  /* Anchos de columna */
  ws['!cols'] = [
    {wch:35},{wch:35},{wch:45},{wch:20},{wch:25},
    {wch:40},{wch:14},{wch:45},{wch:18},
    {wch:18},{wch:28},{wch:18},{wch:28},{wch:70}
  ];

  /* Estilo encabezado (solo aplica en xlsx con xlsxStyle, aquí básico) */
  XLSX.utils.book_append_sheet(wb, ws, 'Cartas');
  XLSX.writeFile(wb, 'Formato_Cartas_Arenas_Inmobiliaria.xlsx');

  showToast('Formato Excel descargado correctamente.', 'success');
  setStep(2);
}

/* ══════════════════════════════════════════════════════════
   CARGA Y PROCESAMIENTO DEL EXCEL
══════════════════════════════════════════════════════════ */

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
  e.target.value = '';
}

function processFile(file) {
  /* Validar extensión */
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx','xls'].includes(ext)) {
    showValidation('El archivo cargado no tiene el formato esperado. Descargue el formato base e inténtelo nuevamente.', 'error');
    return;
  }

  showLoading('Procesando archivo Excel…');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

      const validation = validateData(raw, file.name);
      hideLoading();

      if (validation.ok) {
        APP.clients = validation.clients;
        APP.fileName = file.name;
        hideValidation();
        renderFileCard();
        renderClients(APP.clients);
        showToast(`${APP.clients.length} cliente(s) cargados correctamente.`, 'success');
        setStep(3);
      } else {
        showValidation(validation.message, 'error', validation.list);
      }
    } catch (err) {
      hideLoading();
      showValidation('No se pudo leer el archivo. Asegúrese de que sea un archivo Excel válido (.xlsx o .xls).', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function validateData(raw, fileName) {
  if (!raw || raw.length === 0) {
    return { ok: false, message: 'No se encontraron clientes en el archivo cargado. Verifique que el archivo tenga datos.' };
  }

  /* Normalizar headers */
  const headers = Object.keys(raw[0]).map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  const missing = REQUIRED_COLS.filter(c => !headers.includes(c));

  if (missing.length > 0) {
    return {
      ok: false,
      message: 'Faltan las siguientes columnas obligatorias:',
      list: missing
    };
  }

  /* Normalizar claves */
  const clients = raw.map((row, i) => {
    const normalized = {};
    Object.keys(row).forEach(k => {
      normalized[k.trim().toLowerCase().replace(/\s+/g,'_')] = String(row[k] ?? '').trim();
    });
    normalized._index = i;
    return normalized;
  });

  /* Filtrar filas completamente vacías */
  const valid = clients.filter(c => c.nombre_cliente && c.nombre_cliente.length > 0);

  if (valid.length === 0) {
    return { ok: false, message: 'No se encontraron clientes con datos válidos en el archivo. Verifique que la columna nombre_cliente esté diligenciada.' };
  }

  return { ok: true, clients: valid };
}

/* ══════════════════════════════════════════════════════════
   TARJETA DEL ARCHIVO CARGADO
══════════════════════════════════════════════════════════ */

function renderFileCard() {
  const card = document.getElementById('fileCard');
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })
    + ' ' + now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });

  document.getElementById('fcName').textContent = APP.fileName;
  document.getElementById('fcCount').textContent = `${APP.clients.length} cliente(s)`;
  document.getElementById('fcDate').textContent = dateStr;

  card.style.display = 'flex';
}

function clearFile(silent) {
  APP.clients = [];
  APP.selectedClient = null;
  APP.selectedIndex = -1;
  APP.fileName = '';

  document.getElementById('fileCard').style.display = 'none';
  document.getElementById('cardClients').style.display = 'none';
  document.getElementById('cardPreview').style.display = 'none';
  document.getElementById('clientTableBody').innerHTML = '';
  document.getElementById('clientCards').innerHTML = '';
  document.getElementById('letterSheet').innerHTML = `
    <div class="letter-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <p>Seleccione un cliente de la tabla para ver la carta</p>
    </div>`;
  document.getElementById('searchInput').value = '';
  hideValidation();
  setStep(1);

  if (!silent) showToast('Archivo eliminado correctamente. Puede cargar un nuevo formato.', 'info');
}

/* ══════════════════════════════════════════════════════════
   TABLA DE CLIENTES
══════════════════════════════════════════════════════════ */

function renderClients(list) {
  const tbody = document.getElementById('clientTableBody');
  const cardsWrap = document.getElementById('clientCards');

  tbody.innerHTML = '';
  cardsWrap.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No se encontraron clientes con ese criterio de búsqueda.</td></tr>`;
    cardsWrap.innerHTML = `<p class="table-empty">No se encontraron clientes.</p>`;
    return;
  }

  list.forEach((c, i) => {
    const isSelected = APP.selectedIndex === c._index;

    /* Fila de tabla */
    const tr = document.createElement('tr');
    tr.dataset.idx = c._index;
    if (isSelected) tr.classList.add('selected');
    tr.innerHTML = `
      <td>${c._index + 1}</td>
      <td><strong>${esc(c.nombre_cliente)}</strong></td>
      <td>${esc(c.direccion)}</td>
      <td>${esc(c.conjunto)}</td>
      <td>${esc(c.apartamento)}</td>
      <td>${esc(c.valor_admon_numero)}</td>
      <td>${esc(c.valor_retroactivo)}</td>
      <td>
        <button class="btn-select-client${isSelected ? ' selected-btn' : ''}" data-idx="${c._index}">
          ${isSelected ? '✓ Seleccionado' : 'Ver carta'}
        </button>
      </td>`;
    tr.querySelector('.btn-select-client').addEventListener('click', () => selectClient(c));
    tbody.appendChild(tr);

    /* Tarjeta móvil */
    const div = document.createElement('div');
    div.className = `client-card${isSelected ? ' selected' : ''}`;
    div.dataset.idx = c._index;
    div.innerHTML = `
      <div class="client-card-name">${esc(c.nombre_cliente)}</div>
      <div class="client-card-row"><span>Dirección</span><span>${esc(c.direccion)}</span></div>
      <div class="client-card-row"><span>Conjunto</span><span>${esc(c.conjunto)}</span></div>
      <div class="client-card-row"><span>Apto</span><span>${esc(c.apartamento)}</span></div>
      <div class="client-card-row"><span>Valor admón.</span><span>${esc(c.valor_admon_numero)}</span></div>
      <div class="client-card-row"><span>Retroactivo</span><span>${esc(c.valor_retroactivo)}</span></div>
      <div class="client-card-actions">
        <button class="btn-select-client${isSelected ? ' selected-btn' : ''}" style="width:100%;justify-content:center;" data-idx="${c._index}">
          ${isSelected ? '✓ Seleccionado' : 'Ver carta'}
        </button>
      </div>`;
    div.querySelector('.btn-select-client').addEventListener('click', () => selectClient(c));
    cardsWrap.appendChild(div);
  });

  document.getElementById('cardClients').style.display = 'block';
  document.getElementById('cardPreview').style.display = 'block';
}

function handleSearch(e) {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderClients(APP.clients); return; }
  const filtered = APP.clients.filter(c =>
    (c.nombre_cliente + c.direccion + c.conjunto + c.apartamento + c.ciudad)
      .toLowerCase().includes(q)
  );
  renderClients(filtered);
}

/* ══════════════════════════════════════════════════════════
   SELECCIÓN DE CLIENTE Y PREVISUALIZACIÓN
══════════════════════════════════════════════════════════ */

function selectClient(client) {
  APP.selectedClient = client;
  APP.selectedIndex = client._index;

  /* Resaltar fila/card */
  document.querySelectorAll('.client-table tbody tr').forEach(tr => {
    tr.classList.remove('selected');
    const btn = tr.querySelector('.btn-select-client');
    if (btn) { btn.classList.remove('selected-btn'); btn.textContent = 'Ver carta'; }
  });
  document.querySelectorAll('.client-card').forEach(card => {
    card.classList.remove('selected');
    const btn = card.querySelector('.btn-select-client');
    if (btn) { btn.classList.remove('selected-btn'); btn.textContent = 'Ver carta'; }
  });

  const selectedRow = document.querySelector(`tr[data-idx="${client._index}"]`);
  if (selectedRow) {
    selectedRow.classList.add('selected','row-flash');
    const btn = selectedRow.querySelector('.btn-select-client');
    if (btn) { btn.classList.add('selected-btn'); btn.textContent = '✓ Seleccionado'; }
    setTimeout(() => selectedRow.classList.remove('row-flash'), 600);
  }
  const selectedCard = document.querySelector(`.client-card[data-idx="${client._index}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
    const btn = selectedCard.querySelector('.btn-select-client');
    if (btn) { btn.classList.add('selected-btn'); btn.textContent = '✓ Seleccionado'; }
    selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderLetterPreview(client);
  setStep(5);

  /* Scroll suave a la carta */
  setTimeout(() => {
    document.getElementById('cardPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);

  showToast(`Cliente seleccionado: ${client.nombre_cliente}`, 'info');
}

function renderLetterPreview(c) {
  /* Previsualización fiel al PDF: membrete como fondo + carta superpuesta.
     Las proporciones usan % para escalar con el contenedor.
     Equivalencias: left 11.6% = 25mm, top 11.8% = 33mm (Letter 215.9×279.4mm) */
  const html = `
    <div style="
      position:relative;
      width:100%;
      padding-top:129.4%;
      overflow:hidden;
      border-radius:4px;
      box-shadow:0 2px 12px rgba(0,0,0,.15);
    ">
      <!-- Fondo membrete -->
      <img src="assets/membrete_preview.png"
        style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block;"
        alt="Membrete">

      <!-- Contenido de la carta -->
      <div style="
        position:absolute;
        top:18.3%; left:11.6%; right:9.3%;
        font-family:Arial,Helvetica,sans-serif;
        font-size:1.55cqw;
        color:#000;
        line-height:1.55;
      ">
        <p style="margin:0 0 .6em 0">${esc(c.fecha_carta)}</p>

        <p style="margin:0">Señor(a)(es)</p>
        <p style="margin:0;font-weight:700">${esc(c.nombre_cliente)}</p>
        <p style="margin:0">${esc(c.direccion)}</p>
        <p style="margin:0 0 .6em 0">${esc(c.ciudad)}</p>

        <p style="margin:0 0 2.5em 0;font-weight:700">Asunto: ${esc(c.asunto)}</p>

        <p style="margin:0 0 .6em 0">Cordial saludo,</p>

        <p style="margin:0 0 .5em 0;text-align:justify">
          De acuerdo a información recibida por parte de la administración del
          <strong>${esc(c.conjunto)}</strong>, se acordó un incremento de la expensa del
          apartamento que actualmente se encuentra ocupando. Quedando en
          <strong>${esc(c.valor_admon_letras)}</strong>
          (<strong>${esc(c.valor_admon_numero)}</strong>).
        </p>

        <p style="margin:0 0 .7em 0;text-align:justify">
          Por tal motivo, en su factura de arriendo correspondiente al mes de
          <strong>${esc(c.mes_factura)}</strong> observará el cobro
          RETROACTIVOS DE <strong>${esc(c.periodo_retroactivo)}</strong> por
          <strong>${esc(c.valor_retroactivo)}</strong> y el nuevo valor a
          cancelar, ya que este concepto se le factura a través de
          <strong>${esc(c.empresa_factura)}</strong>.
        </p>

        <p style="margin:0 0 .25em 0;font-weight:700;font-size:.9em">PUEDE CANCELAR POR MEDIO DE ESTE LINK:</p>
        <p style="margin:0 0 4.3em 0;word-break:break-all;font-size:.9em">
          <a href="${esc(c.link_pago)}" target="_blank" rel="noopener" style="color:#000">${esc(c.link_pago)}</a>
        </p>

        <p style="margin:0 0 1.8em 0">Atentamente,</p>
        <p style="margin:0;font-weight:700">Dpto. de Cartera</p>
      </div>
    </div>`;

  const sheet = document.getElementById('letterSheet');
  sheet.style.opacity = '0';
  sheet.style.transform = 'translateY(10px)';
  sheet.style.padding = '0';        /* quitar padding del sheet para que el papel llene el contenedor */
  sheet.style.background = 'none';
  sheet.innerHTML = html;
  requestAnimationFrame(() => {
    sheet.style.transition = 'opacity .35s ease, transform .35s ease';
    sheet.style.opacity = '1';
    sheet.style.transform = 'translateY(0)';
  });
}

/* ══════════════════════════════════════════════════════════
   GENERACIÓN DE PDF CON MEMBRETE PLANTILLA  (pdf-lib)
══════════════════════════════════════════════════════════ */

/* Word-wrap para pdf-lib: devuelve array de líneas */
function libWrap(text, maxW, font, size) {
  const words = String(text || '').split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const test = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxW) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/* Renderiza párrafo con segmentos de estilo mixto sobre una página pdf-lib.
   Devuelve la coordenada Y final (bottom-up). */
function libDrawMixed(page, segs, x, y, maxW, ls, size, fN, fB, cNorm, cRed) {
  const tokens = [];
  segs.forEach(s => {
    s.t.split(' ').forEach((w, i, arr) => {
      tokens.push({ w: w + (i < arr.length - 1 ? ' ' : ''), b: !!s.b, r: !!s.r });
    });
  });

  const lines = [];
  let line = [], lw = 0;
  tokens.forEach(tok => {
    const f = tok.b ? fB : fN;
    const ww = f.widthOfTextAtSize(tok.w, size);
    if (lw + ww > maxW && line.length) { lines.push(line); line = [tok]; lw = ww; }
    else { line.push(tok); lw += ww; }
  });
  if (line.length) lines.push(line);

  lines.forEach(ln => {
    let cx = x;
    ln.forEach(tok => {
      const f   = tok.b ? fB : fN;
      const col = tok.r ? cRed : cNorm;
      page.drawText(tok.w, { x: cx, y, size, font: f, color: col });
      cx += f.widthOfTextAtSize(tok.w, size);
    });
    y -= ls;
  });
  return y;
}

/* Genera un PDF (Uint8Array) usando el membrete como plantilla */
async function buildPDFWithTemplate(client) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  /* Copia fresca de la plantilla por cada carta */
  const pdfDoc = await PDFDocument.load(APP.membreteBytes, { ignoreEncryption: true });
  while (pdfDoc.getPageCount() > 1) pdfDoc.removePage(1);

  const page   = pdfDoc.getPage(0);
  const { height: PH } = page.getSize();   /* 792 pts (Letter) */

  /* Fuentes (WinAnsiEncoding — soporta á é í ó ú ñ ü) */
  const fN = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  /* Colores — todo negro */
  const cMain   = rgb(0, 0, 0);
  const cRed    = rgb(0, 0, 0);
  const cSubtle = rgb(0, 0, 0);

  /* ── Medidas ────────────────────────────────────────────────────
     El membrete (header con logo + datos) ocupa ~30 mm desde arriba.
     El área útil de la carta va de ~33 mm a ~185 mm desde el tope.
     Coordenadas en pts: pdf-lib usa origen en la esquina inferior izquierda.
     Conversión: y_pts = PH - y_mm * MM
  ───────────────────────────────────────────────────────────────── */
  const MM = 2.835;          /* 1 mm en puntos */
  const ML = 25 * MM;       /* margen izquierdo: 25 mm */
  const CW = 165 * MM;      /* ancho del contenido: 165 mm */
  const SZ = 11;             /* tamaño de fuente principal (pts) */
  const LS = 6 * MM;        /* interlineado: 6 mm */

  /* Punto de inicio del contenido — 3 espacios después del encabezado */
  let y = PH - 51 * MM;

  /* ── Fecha ── */
  page.drawText(v(client.fecha_carta), { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= 10 * MM;

  /* ── Destinatario ── */
  page.drawText('Señor(a)(es)', { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= LS;
  page.drawText(v(client.nombre_cliente).toUpperCase(), { x: ML, y, size: SZ, font: fB, color: cMain });
  y -= LS;
  libWrap(v(client.direccion), CW, fN, SZ).forEach(l => {
    page.drawText(l, { x: ML, y, size: SZ, font: fN, color: cMain });
    y -= LS;
  });
  page.drawText(v(client.ciudad), { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= 9 * MM;

  /* ── Asunto ── */
  page.drawText('Asunto: ' + v(client.asunto), { x: ML, y, size: SZ, font: fB, color: cMain });
  y -= 27 * MM;   /* 2 espacios después del asunto */

  /* ── Saludo ── */
  page.drawText('Cordial saludo,', { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= 9 * MM;

  /* ── Párrafo 1 ── */
  y = libDrawMixed(page, [
    { t: 'De acuerdo a información recibida por parte de la administración del ' },
    { t: v(client.conjunto), b: 1 },
    { t: ', se acordó un incremento de la expensa del apartamento que actualmente se encuentra ocupando. Quedando en ' },
    { t: v(client.valor_admon_letras), r: 1 },
    { t: ' (' }, { t: v(client.valor_admon_numero), r: 1 }, { t: ').' }
  ], ML, y, CW, LS, SZ, fN, fB, cMain, cRed) - 7 * MM;

  /* ── Párrafo 2 ── */
  y = libDrawMixed(page, [
    { t: 'Por tal motivo, en su factura de arriendo correspondiente al mes de ' },
    { t: v(client.mes_factura), r: 1 },
    { t: ' observará el cobro RETROACTIVOS DE ' },
    { t: v(client.periodo_retroactivo), r: 1 },
    { t: ' por ' }, { t: v(client.valor_retroactivo), r: 1 },
    { t: ' y el nuevo valor a cancelar, ya que este concepto se le factura a través de ' },
    { t: v(client.empresa_factura), b: 1 }, { t: '.' }
  ], ML, y, CW, LS, SZ, fN, fB, cMain, cRed) - 9 * MM;

  /* ── Link de pago ── */
  page.drawText('PUEDE CANCELAR POR MEDIO DE ESTE LINK:', { x: ML, y, size: 10, font: fB, color: cSubtle });
  y -= 6 * MM;
  libWrap(v(client.link_pago), CW, fN, 10).forEach(l => {
    page.drawText(l, { x: ML, y, size: 10, font: fN, color: cMain });
    y -= LS;
  });
  y -= 38 * MM;   /* 4 espacios después del link */

  /* ── Cierre ── */
  page.drawText('Atentamente,', { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= 18 * MM;
  page.drawText('Dpto. de Cartera', { x: ML, y, size: SZ, font: fB, color: cMain });

  return pdfDoc.save();
}

/* ══════════════════════════════════════════════════════════
   GENERACIÓN DE PDF  (jsPDF directo — fallback sin membrete)
══════════════════════════════════════════════════════════ */

function buildPDFDoc(client) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const PW   = 215.9;   /* ancho hoja carta mm */
  const ML   = 22;      /* margen izquierdo    */
  const MR   = 22;      /* margen derecho      */
  const MT   = 18;      /* margen superior     */
  const CW   = PW - ML - MR;  /* ancho contenido */
  const LS   = 5.8;    /* interlineado base mm */

  let y = MT;

  /* ── Logo ── */
  if (APP.logoDataUrl) {
    try {
      const logoW  = 75;
      const aspect = APP.logoAspect || 0.28;   /* ratio alto/ancho real */
      const logoH  = Math.min(logoW * aspect, 28); /* máximo 28 mm de alto */
      doc.addImage(APP.logoDataUrl, 'PNG', ML, y, logoW, logoH, undefined, 'FAST');
      y += logoH + 4;
    } catch (_) { y += 5; }
  } else {
    /* Fallback texto */
    doc.setFontSize(16);
    doc.setFont('helvetica','bold');
    doc.setTextColor(124, 58, 237);
    doc.text('ARENAS INMOBILIARIA', ML, y + 8);
    y += 14;
  }

  /* Línea separadora */
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(ML, y, PW - MR, y);
  y += 8;

  /* ── Fecha ── */
  doc.setFontSize(10.5);
  doc.setFont('helvetica','normal');
  doc.setTextColor(30, 41, 59);
  doc.text(v(client.fecha_carta), ML, y);
  y += 12;

  /* ── Destinatario ── */
  doc.text('Señor(a)(es)', ML, y);                    y += LS;
  doc.setFont('helvetica','bold');
  doc.text(v(client.nombre_cliente).toUpperCase(), ML, y); y += LS;
  doc.setFont('helvetica','normal');

  const dirLines = doc.splitTextToSize(v(client.direccion), CW);
  doc.text(dirLines, ML, y);  y += dirLines.length * LS;
  doc.text(v(client.ciudad), ML, y);                  y += 11;

  /* ── Asunto ── */
  doc.setFont('helvetica','bold');
  doc.text(`Asunto: ${v(client.asunto)}`, ML, y);     y += 11;
  doc.setFont('helvetica','normal');

  /* ── Saludo ── */
  doc.text('Cordial saludo,', ML, y);                 y += 11;

  /* ── Párrafo 1 ──
     Renderizamos el párrafo con segmentos de color distintos */
  y = renderMixedParagraph(doc, [
    { text: `De acuerdo a información recibida por parte de la administración del ` },
    { text: v(client.conjunto), bold: true },
    { text: `, se acordó un incremento de la expensa del apartamento que actualmente se encuentra ocupando. Quedando en ` },
    { text: v(client.valor_admon_letras), red: true },
    { text: ` (` },
    { text: v(client.valor_admon_numero), red: true },
    { text: `).` }
  ], ML, y, CW, LS, doc) + 9;

  /* ── Párrafo 2 ── */
  y = renderMixedParagraph(doc, [
    { text: `Por tal motivo, en su factura de arriendo correspondiente al mes de ` },
    { text: v(client.mes_factura), red: true },
    { text: ` observará el cobro RETROACTIVOS DE ` },
    { text: v(client.periodo_retroactivo), red: true },
    { text: ` por ` },
    { text: v(client.valor_retroactivo), red: true },
    { text: ` y el nuevo valor a cancelar, ya que este concepto se le factura a través de ` },
    { text: v(client.empresa_factura), bold: true },
    { text: `.` }
  ], ML, y, CW, LS, doc) + 12;

  /* ── Link de pago ── */
  doc.setFont('helvetica','bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('PUEDE CANCELAR POR MEDIO DE ESTE LINK:', ML, y); y += 7;

  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  const linkLines = doc.splitTextToSize(v(client.link_pago), CW);
  doc.text(linkLines, ML, y);
  y += linkLines.length * LS + 18;

  /* ── Cierre ── */
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10.5);
  doc.setFont('helvetica','normal');
  doc.text('Atentamente,', ML, y);  y += 22;
  doc.setFont('helvetica','bold');
  doc.text('Dpto. de Cartera', ML, y);

  return doc;
}

/* Renderiza un párrafo con segmentos de distinto estilo.
   Hace word-wrap manual respetando CW. Devuelve y final. */
function renderMixedParagraph(doc, segments, x, y, maxW, ls, docRef) {
  const fontSize = 10.5;
  docRef.setFontSize(fontSize);

  /* 1. Construir tokens: cada palabra con su estilo */
  const tokens = [];
  segments.forEach(seg => {
    const words = seg.text.split(' ');
    words.forEach((w, i) => {
      tokens.push({ word: w + (i < words.length - 1 ? ' ' : ''), bold: !!seg.bold, red: !!seg.red });
    });
  });

  /* 2. Ir agrupando en líneas */
  const lines = [];
  let currentLine = [];
  let lineW = 0;

  tokens.forEach(tok => {
    docRef.setFont('helvetica', tok.bold ? 'bold' : 'normal');
    const ww = docRef.getTextWidth(tok.word);
    if (lineW + ww > maxW && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [tok];
      lineW = ww;
    } else {
      currentLine.push(tok);
      lineW += ww;
    }
  });
  if (currentLine.length) lines.push(currentLine);

  /* 3. Dibujar líneas */
  lines.forEach(line => {
    let cx = x;
    line.forEach(tok => {
      const isBold = tok.bold;
      const isRed  = tok.red;
      docRef.setFont('helvetica', isBold ? 'bold' : 'normal');
      docRef.setTextColor(30, 41, 59);
      docRef.text(tok.word, cx, y);
      cx += docRef.getTextWidth(tok.word);
    });
    y += ls;
  });

  /* Restaurar */
  docRef.setFont('helvetica','normal');
  docRef.setTextColor(30, 41, 59);
  return y;
}

/* Nombre del PDF para un cliente */
function pdfName(client) {
  const nm = v(client.nombre_cliente).replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').substring(0,40);
  const ap = v(client.apartamento).replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
  return `Carta_${nm}${ap ? '_' + ap : ''}.pdf`;
}

/* Valor seguro de campo */
function v(val) { return String(val ?? '').trim(); }

/* Escape HTML */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── PDF individual ── */
async function generatePDFSingle() {
  if (!APP.selectedClient) {
    showToast('Seleccione un cliente para generar el PDF.', 'warning');
    return;
  }
  showLoading('Generando PDF con membrete…');
  await delay(50);
  try {
    if (APP.membreteBytes) {
      const bytes = await buildPDFWithTemplate(APP.selectedClient);
      saveAs(new Blob([bytes], { type: 'application/pdf' }), pdfName(APP.selectedClient));
    } else {
      buildPDFDoc(APP.selectedClient).save(pdfName(APP.selectedClient));
    }
    setStep(6);
    showToast('PDF generado correctamente.', 'success');
  } catch (err) {
    showToast('Error al generar el PDF: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ── PDF consolidado (todas las cartas en un solo PDF) ── */
async function generatePDFConsolidated() {
  if (APP.clients.length === 0) {
    showToast('No hay clientes cargados para generar el PDF consolidado.', 'warning');
    return;
  }
  showLoading(`Generando PDF consolidado (${APP.clients.length} cartas)…`);
  await delay(50);

  try {
    if (APP.membreteBytes) {
      const { PDFDocument } = PDFLib;
      const mergedDoc = await PDFDocument.create();

      for (let i = 0; i < APP.clients.length; i++) {
        document.getElementById('loadingMsg').textContent =
          `Procesando carta ${i + 1} de ${APP.clients.length}…`;
        await delay(5);
        const bytes = await buildPDFWithTemplate(APP.clients[i]);
        const letterDoc = await PDFDocument.load(bytes);
        const [pg] = await mergedDoc.copyPages(letterDoc, [0]);
        mergedDoc.addPage(pg);
      }

      const merged = await mergedDoc.save();
      saveAs(new Blob([merged], { type: 'application/pdf' }),
             'Cartas_Aumento_Administracion_Arenas_Inmobiliaria.pdf');
    } else {
      /* Fallback sin membrete */
      const { jsPDF } = window.jspdf;
      let mergedDoc = null;
      for (let i = 0; i < APP.clients.length; i++) {
        const pageDoc = buildPDFDoc(APP.clients[i]);
        if (i === 0) { mergedDoc = pageDoc; }
        else { mergedDoc.addPage('letter','portrait'); buildPageInDoc(mergedDoc, APP.clients[i]); }
      }
      mergedDoc.save('Cartas_Aumento_Administracion_Arenas_Inmobiliaria.pdf');
    }

    setStep(6);
    showToast(`PDF consolidado generado con ${APP.clients.length} carta(s).`, 'success');
  } catch (err) {
    showToast('Error al generar el PDF consolidado: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* Construye el contenido de un cliente en el doc activo (página ya añadida) */
function buildPageInDoc(doc, client) {
  const PW = 215.9;
  const ML = 22, MR = 22, MT = 18;
  const CW = PW - ML - MR;
  const LS = 5.8;
  let y = MT;

  if (APP.logoDataUrl) {
    try {
      const lW = 75, lA = APP.logoAspect || 0.28;
      const lH = Math.min(lW * lA, 28);
      doc.addImage(APP.logoDataUrl, 'PNG', ML, y, lW, lH, undefined, 'FAST');
      y += lH + 4;
    } catch (_) { y += 5; }
  } else {
    doc.setFontSize(16); doc.setFont('helvetica','bold');
    doc.setTextColor(124,58,237);
    doc.text('ARENAS INMOBILIARIA', ML, y + 8); y += 14;
  }

  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3);
  doc.line(ML, y, PW - MR, y); y += 8;

  doc.setFontSize(10.5); doc.setFont('helvetica','normal'); doc.setTextColor(30,41,59);
  doc.text(v(client.fecha_carta), ML, y); y += 12;
  doc.text('Señor(a)(es)', ML, y); y += LS;
  doc.setFont('helvetica','bold');
  doc.text(v(client.nombre_cliente).toUpperCase(), ML, y); y += LS;
  doc.setFont('helvetica','normal');
  const dirL = doc.splitTextToSize(v(client.direccion), CW);
  doc.text(dirL, ML, y); y += dirL.length * LS;
  doc.text(v(client.ciudad), ML, y); y += 11;
  doc.setFont('helvetica','bold');
  doc.text(`Asunto: ${v(client.asunto)}`, ML, y); y += 11;
  doc.setFont('helvetica','normal');
  doc.text('Cordial saludo,', ML, y); y += 11;

  y = renderMixedParagraph(doc, [
    { text:'De acuerdo a información recibida por parte de la administración del '},
    { text:v(client.conjunto), bold:true },
    { text:', se acordó un incremento de la expensa del apartamento que actualmente se encuentra ocupando. Quedando en '},
    { text:v(client.valor_admon_letras), red:true },
    { text:' ('},{ text:v(client.valor_admon_numero), red:true },{ text:').'}
  ], ML, y, CW, LS, doc) + 9;

  y = renderMixedParagraph(doc, [
    { text:'Por tal motivo, en su factura de arriendo correspondiente al mes de '},
    { text:v(client.mes_factura), red:true },
    { text:' observará el cobro RETROACTIVOS DE '},
    { text:v(client.periodo_retroactivo), red:true },
    { text:' por '},{ text:v(client.valor_retroactivo), red:true },
    { text:' y el nuevo valor a cancelar, ya que este concepto se le factura a través de '},
    { text:v(client.empresa_factura), bold:true },{ text:'.'}
  ], ML, y, CW, LS, doc) + 12;

  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(71,85,105);
  doc.text('PUEDE CANCELAR POR MEDIO DE ESTE LINK:', ML, y); y += 7;
  doc.setFont('helvetica','normal'); doc.setTextColor(30,41,59);
  const lkL = doc.splitTextToSize(v(client.link_pago), CW);
  doc.text(lkL, ML, y); y += lkL.length * LS + 18;
  doc.setTextColor(30,41,59); doc.setFontSize(10.5);
  doc.setFont('helvetica','normal');
  doc.text('Atentamente,', ML, y); y += 22;
  doc.setFont('helvetica','bold');
  doc.text('Dpto. de Cartera', ML, y);
}

/* ── Generar todos como ZIP ── */
async function generatePDFZip() {
  if (APP.clients.length === 0) {
    showToast('No hay clientes cargados para generar los PDF.', 'warning');
    return;
  }
  if (APP.clients.length > 50) {
    showToast(`Generando ${APP.clients.length} PDF en ZIP, esto puede tomar un momento…`, 'info');
  }

  showLoading(`Generando ${APP.clients.length} PDF individuales…`);
  await delay(80);

  try {
    const zip = new JSZip();
    const folder = zip.folder('Cartas_Arenas_Inmobiliaria');

    for (let i = 0; i < APP.clients.length; i++) {
      const c = APP.clients[i];
      document.getElementById('loadingMsg').textContent =
        `Generando PDF ${i + 1} de ${APP.clients.length}…`;
      await delay(10);

      let pdfBytes;
      if (APP.membreteBytes) {
        pdfBytes = await buildPDFWithTemplate(c);
      } else {
        pdfBytes = buildPDFDoc(c).output('arraybuffer');
      }
      folder.file(pdfName(c), pdfBytes);
    }

    document.getElementById('loadingMsg').textContent = 'Comprimiendo archivos…';
    await delay(30);

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveAs(blob, 'Cartas_Arenas_Inmobiliaria.zip');

    setStep(6);
    showToast(`ZIP generado con ${APP.clients.length} PDF correctamente.`, 'success');
  } catch (err) {
    showToast('Error al generar el ZIP: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ══════════════════════════════════════════════════════════
   HELPERS UI
══════════════════════════════════════════════════════════ */

function showLoading(msg) {
  document.getElementById('loadingMsg').textContent = msg || 'Procesando…';
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function showValidation(msg, type, list) {
  const box = document.getElementById('validationBox');
  let html = `<strong>${msg}</strong>`;
  if (list && list.length) {
    html += `<ul>${list.map(c => `<li><code>${c}</code></li>`).join('')}</ul>`;
  }
  box.className = `validation-box ${type}`;
  box.innerHTML = html;
  box.style.display = 'block';
}

function hideValidation() {
  const box = document.getElementById('validationBox');
  box.style.display = 'none';
  box.innerHTML = '';
}

function showToast(msg, type = 'info') {
  const icons = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ══════════════════════════════════════════════════════════
   MODO OSCURO
══════════════════════════════════════════════════════════ */

function toggleDarkMode() {
  const isDark = document.documentElement.classList.contains('dark');
  applyDark(!isDark);
}

function applyDark(on) {
  const html  = document.documentElement;
  const sun   = document.getElementById('iconSun');
  const moon  = document.getElementById('iconMoon');

  if (on) {
    html.classList.add('dark');
    if (sun)  sun.style.display  = 'block';
    if (moon) moon.style.display = 'none';
    localStorage.setItem('darkMode', '1');
  } else {
    html.classList.remove('dark');
    if (sun)  sun.style.display  = 'none';
    if (moon) moon.style.display = 'block';
    localStorage.setItem('darkMode', '0');
  }
}
