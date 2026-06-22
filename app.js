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
  currentStep: 1,
  moduleType: 'admin'   /* 'admin' | 'desoc' | 'sp' */
};

const REQUIRED_COLS = [
  'fecha_carta','nombre_cliente','direccion','ciudad','asunto',
  'conjunto','apartamento','valor_admon_letras','valor_admon_numero',
  'mes_factura','periodo_retroactivo','valor_retroactivo',
  'empresa_factura','link_pago'
];

const DESOC_COLS = [
  'fecha_carta','nombre_cliente','direccion_cliente','ciudad',
  'direccion_inmueble','motivo_incumplimiento',
  'valor_deuda_numero','valor_deuda_letras','fecha_limite_entrega'
];

const SP_COLS = [
  'fecha_carta','ciudad','nombre_cliente','cedula','direccion_inmueble','valor_total',
  'servicio_1','contrato_1','valor_1',
  'servicio_2','contrato_2','valor_2',
  'servicio_3','contrato_3','valor_3'
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

  /* Selector de módulo */
  document.getElementById('btnModuleAdmin').addEventListener('click', () => switchModule('admin'));
  document.getElementById('btnModuleDesoc').addEventListener('click', () => switchModule('desoc'));
  document.getElementById('btnModuleSP').addEventListener('click', () => switchModule('sp'));

  /* Arte SVG en tarjetas de módulo */
  applyModuleCardArt();

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
  if (APP.moduleType === 'desoc') { downloadTemplateDesoc(); return; }
  if (APP.moduleType === 'sp')    { downloadTemplateSP();    return; }

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

      const validation = APP.moduleType === 'desoc' ? validateDataDesoc(raw, file.name)
        : APP.moduleType === 'sp' ? validateDataSP(raw, file.name)
        : validateData(raw, file.name);
      hideLoading();

      if (validation.ok) {
        APP.clients = validation.clients;
        APP.fileName = file.name;
        hideValidation();
        renderFileCard();
        renderClients(APP.clients);
        showToast(`${APP.clients.length} cliente(s) cargados correctamente.`, 'success');
        setStep(3);
        animateUploadSuccess(APP.clients.length, file.name);
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
  const sheet = document.getElementById('letterSheet');
  sheet.innerHTML = `
    <div class="letter-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <p>Seleccione un cliente de la tabla para ver la carta</p>
    </div>`;
  sheet.style.padding = '';
  sheet.style.background = '';
  sheet.style.opacity = '';
  sheet.style.transform = '';
  document.getElementById('searchInput').value = '';
  hideValidation();
  setStep(1);

  if (!silent) showToast('Archivo eliminado correctamente. Puede cargar un nuevo formato.', 'info');
}

/* ══════════════════════════════════════════════════════════
   TABLA DE CLIENTES
══════════════════════════════════════════════════════════ */

function renderClients(list) {
  if (APP.moduleType === 'desoc') { renderClientsDesoc(list); return; }
  if (APP.moduleType === 'sp')    { renderClientsSP(list);    return; }
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
  const filtered = APP.clients.filter(c => {
    if (APP.moduleType === 'desoc') {
      return (c.nombre_cliente + c.direccion_cliente + c.direccion_inmueble + c.ciudad)
        .toLowerCase().includes(q);
    }
    if (APP.moduleType === 'sp') {
      return (c.nombre_cliente + c.cedula + c.direccion_inmueble + c.ciudad)
        .toLowerCase().includes(q);
    }
    return (c.nombre_cliente + c.direccion + c.conjunto + c.apartamento + c.ciudad)
      .toLowerCase().includes(q);
  });
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

  if (APP.moduleType === 'desoc') {
    renderLetterPreviewDesoc(client);
  } else if (APP.moduleType === 'sp') {
    renderLetterPreviewSP(client);
  } else {
    renderLetterPreview(client);
  }
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
        top:18.3%; left:11.6%; right:12%;
        font-family:Arial,Helvetica,sans-serif;
        font-size:1.8cqw;
        color:#000;
        line-height:1.55;
      ">
        <p style="margin:0 0 1em 0">${esc(c.fecha_carta)}</p>

        <p style="margin:0">Señor(a)(es)</p>
        <p style="margin:0;font-weight:700">${esc(c.nombre_cliente)}</p>
        <p style="margin:0">${esc(c.direccion)}</p>
        <p style="margin:0 0 0.75em 0">${esc(c.ciudad)}</p>

        <p style="margin:0 0 5.4em 0;font-weight:700">Asunto: ${esc(c.asunto)}</p>

        <p style="margin:0 0 0.75em 0">Cordial saludo,</p>

        <p style="margin:0 0 1.8em 0;text-align:justify">
          De acuerdo a información recibida por parte de la administración del
          <strong>${esc(c.conjunto)}</strong>, se acordó un incremento de la expensa del
          apartamento que actualmente se encuentra ocupando. Quedando en
          <strong>${esc(c.valor_admon_letras)}</strong>
          (<strong>${esc(c.valor_admon_numero)}</strong>).
        </p>

        <p style="margin:0 0 2.3em 0;text-align:justify">
          Por tal motivo, en su factura de arriendo correspondiente al mes de
          <strong>${esc(c.mes_factura)}</strong> observará el cobro
          RETROACTIVOS DE <strong>${esc(c.periodo_retroactivo)}</strong> por
          <strong>${esc(c.valor_retroactivo)}</strong> y el nuevo valor a
          cancelar, ya que este concepto se le factura a través de
          <strong>${esc(c.empresa_factura)}</strong>.
        </p>

        <p style="margin:0;font-weight:700;font-size:.9em">PUEDE CANCELAR POR MEDIO DE ESTE LINK:</p>
        <p style="margin:0 0 9.8em 0;word-break:break-all;font-size:.9em">
          <a href="${esc(c.link_pago)}" target="_blank" rel="noopener" style="color:#000">${esc(c.link_pago)}</a>
        </p>

        <p style="margin:0 0 3.1em 0">Atentamente,</p>
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
   Justifica todas las líneas excepto la última. Devuelve Y final (bottom-up). */
function libDrawMixed(page, segs, x, y, maxW, ls, size, fN, fB, cNorm, cRed) {
  /* Separar en palabras puras (sin espacios) conservando estilo */
  const words = [];
  segs.forEach(s => {
    s.t.split(/\s+/).forEach(w => {
      if (w) words.push({ w, b: !!s.b, r: !!s.r });
    });
  });

  const spW = fN.widthOfTextAtSize(' ', size); /* ancho del espacio normal */

  /* Construir líneas */
  const lines = [];
  let cur = [], curW = 0;
  words.forEach(tok => {
    const f  = tok.b ? fB : fN;
    const ww = f.widthOfTextAtSize(tok.w, size);
    const sp = cur.length > 0 ? spW : 0;
    if (cur.length > 0 && curW + sp + ww > maxW) {
      lines.push(cur);
      cur = [tok]; curW = ww;
    } else {
      cur.push(tok); curW += sp + ww;
    }
  });
  if (cur.length) lines.push(cur);

  /* Dibujar con justificación */
  lines.forEach((ln, li) => {
    const isLast = li === lines.length - 1;
    let cx = x;
    if (isLast || ln.length <= 1) {
      /* Última línea: alineación izquierda */
      ln.forEach((tok, ti) => {
        const f   = tok.b ? fB : fN;
        const col = tok.r ? cRed : cNorm;
        if (ti > 0) cx += spW;
        page.drawText(tok.w, { x: cx, y, size, font: f, color: col });
        cx += f.widthOfTextAtSize(tok.w, size);
      });
    } else {
      /* Líneas intermedias: justificadas — distribuir espacio extra entre palabras */
      const totalWordW = ln.reduce((s, t) => s + (t.b ? fB : fN).widthOfTextAtSize(t.w, size), 0);
      const gap = (maxW - totalWordW) / (ln.length - 1);
      ln.forEach((tok, ti) => {
        const f   = tok.b ? fB : fN;
        const col = tok.r ? cRed : cNorm;
        page.drawText(tok.w, { x: cx, y, size, font: f, color: col });
        cx += f.widthOfTextAtSize(tok.w, size) + (ti < ln.length - 1 ? gap : 0);
      });
    }
    y -= ls;
  });
  return y;
}

/* Genera un PDF (Uint8Array) usando el membrete como plantilla */
async function buildPDFWithTemplate(client) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  /* Carga el membrete y obtiene sus dimensiones */
  const templateDoc = await PDFDocument.load(APP.membreteBytes, { ignoreEncryption: true });
  const { width: PW, height: PH } = templateDoc.getPage(0).getSize();

  /* Documento receptor limpio — embedPdf garantiza que el membrete
     (incluidos sus XObjects, imágenes y fuentes) se copie correctamente */
  const pdfDoc = await PDFDocument.create();
  const [embMem] = await pdfDoc.embedPdf(templateDoc, [0]);
  const page = pdfDoc.addPage([PW, PH]);
  page.drawPage(embMem, { x: 0, y: 0, width: PW, height: PH });

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
  if (APP.moduleType === 'desoc') { await generatePDFSingleDesoc(); return; }
  if (APP.moduleType === 'sp')    { await generatePDFSingleSP();    return; }
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
  if (APP.moduleType === 'desoc') { await generatePDFConsolidatedDesoc(); return; }
  if (APP.moduleType === 'sp')    { await generatePDFConsolidatedSP();    return; }
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
        const [emb] = await mergedDoc.embedPdf(letterDoc, [0]);
        const { width: lw, height: lh } = letterDoc.getPage(0).getSize();
        const pg = mergedDoc.addPage([lw, lh]);
        pg.drawPage(emb, { x: 0, y: 0, width: lw, height: lh });
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
  if (APP.moduleType === 'desoc') { await generatePDFZipDesoc(); return; }
  if (APP.moduleType === 'sp')    { await generatePDFZipSP();    return; }
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

/* Animación de éxito en la zona de carga */
function animateUploadSuccess(count, filename) {
  const zone = document.getElementById('uploadZone');
  zone.classList.add('upload-success');

  const overlay = document.createElement('div');
  overlay.className = 'upload-success-overlay';
  overlay.innerHTML = `
    <div class="upload-success-icon-wrap">
      <div class="upload-success-ring"></div>
      <div class="upload-success-ring"></div>
      <div class="upload-success-circle">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
    </div>
    <p class="upload-success-label">¡Archivo cargado correctamente!</p>
    <p class="upload-success-count">${count} cliente(s) &middot; ${esc(filename)}</p>
    <p class="upload-success-hint">Clic para cerrar</p>`;
  zone.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.classList.add('out');
    setTimeout(() => {
      overlay.remove();
      zone.classList.remove('upload-success');
    }, 350);
  }, { once: true });
}

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

/* ══════════════════════════════════════════════════════════
   MÓDULO: CARTAS DE DESOCUPACIÓN
══════════════════════════════════════════════════════════ */

/* ── Cambio de módulo ── */
function switchModule(type) {
  if (APP.moduleType === type) return;
  APP.moduleType = type;

  /* Actualizar botones de selección */
  const btnAdmin = document.getElementById('btnModuleAdmin');
  const btnDesoc = document.getElementById('btnModuleDesoc');
  const btnSP    = document.getElementById('btnModuleSP');
  btnAdmin.classList.toggle('active', type === 'admin');
  btnDesoc.classList.toggle('active', type === 'desoc');
  btnSP.classList.toggle('active',    type === 'sp');
  document.getElementById('pillAdmin').style.display = type === 'admin' ? '' : 'none';
  document.getElementById('pillDesoc').style.display = type === 'desoc' ? '' : 'none';
  document.getElementById('pillSP').style.display    = type === 'sp'    ? '' : 'none';

  /* Tema de color del dashboard */
  const dash = document.getElementById('dashboardSection');
  if (dash) {
    dash.classList.toggle('dash-mode-desoc', type === 'desoc');
    dash.classList.toggle('dash-mode-sp',    type === 'sp');
  }

  /* Animar la tarjeta recién activada */
  const newCard = type === 'desoc' ? btnDesoc : type === 'sp' ? btnSP : btnAdmin;
  newCard.classList.remove('just-activated');
  void newCard.offsetWidth;
  newCard.classList.add('just-activated');
  setTimeout(() => newCard.classList.remove('just-activated'), 600);

  /* Flash de transición */
  animateModuleSwitch(type);

  /* Actualizar info de descarga */
  if (type === 'desoc') {
    document.getElementById('dlInfoCols').textContent = '9 columnas predefinidas';
    document.getElementById('dlInfoFile').textContent = 'Formato_Cartas_Desocupacion_Arenas.xlsx';
  } else if (type === 'sp') {
    document.getElementById('dlInfoCols').textContent = '15 columnas predefinidas';
    document.getElementById('dlInfoFile').textContent = 'Formato_Servicios_Publicos_Arenas.xlsx';
  } else {
    document.getElementById('dlInfoCols').textContent = '14 columnas predefinidas';
    document.getElementById('dlInfoFile').textContent = 'Formato_Cartas_Arenas_Inmobiliaria.xlsx';
  }

  /* Actualizar encabezados de tabla */
  const head = document.getElementById('clientTableHead');
  if (head) {
    if (type === 'desoc') {
      head.innerHTML = '<th>#</th><th>Cliente</th><th>Dirección</th><th>Inmueble</th><th>Ciudad</th><th>Deuda</th><th>Fecha límite</th><th>Acción</th>';
    } else if (type === 'sp') {
      head.innerHTML = '<th>#</th><th>Cliente</th><th>Cédula</th><th>Inmueble</th><th>Ciudad</th><th>Total SP</th><th>Acción</th>';
    } else {
      head.innerHTML = '<th>#</th><th>Cliente</th><th>Dirección</th><th>Conjunto</th><th>Apto</th><th>Valor admón.</th><th>Retroactivo</th><th>Acción</th>';
    }
  }

  /* Limpiar estado y UI */
  clearFile(true);
  const msgs = {
    admin: 'Módulo: Cartas de Administración activado.',
    desoc: 'Módulo: Cartas de Desocupación activado.',
    sp:    'Módulo: Requerimiento de Servicios Públicos activado.'
  };
  showToast(msgs[type] || msgs.admin, 'info');
}

/* ── Flash de color al cambiar de módulo ── */
function animateModuleSwitch(type) {
  const selector = document.querySelector('.module-selector');
  if (!selector) return;
  const color = type === 'desoc' ? 'rgba(217,119,6,.18)'
    : type === 'sp' ? 'rgba(5,150,105,.18)'
    : 'rgba(43,109,232,.18)';
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute', 'inset:0', 'border-radius:inherit',
    `background:radial-gradient(ellipse at 50% 50%, ${color} 0%, transparent 70%)`,
    'pointer-events:none', 'z-index:10',
    'animation:moduleSwitchFlash 0.6s ease-out both'
  ].join(';');
  selector.appendChild(el);
  setTimeout(() => el.remove(), 660);
}

/* ── Arte SVG en tarjetas de módulo (inyectado via <style> para evitar escapes) ── */
function applyModuleCardArt() {
  /* Documentos / adminitración — azul tenue (inactivo) */
  const adminLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 140">
    <rect x="90" y="14" width="76" height="96" rx="5" fill="rgba(30,77,160,.04)" stroke="rgba(30,77,160,.07)" stroke-width="1.2"/>
    <line x1="104" y1="34" x2="154" y2="34" stroke="rgba(30,77,160,.06)" stroke-width="1.2"/>
    <line x1="104" y1="48" x2="154" y2="48" stroke="rgba(30,77,160,.05)" stroke-width="1.2"/>
    <line x1="104" y1="62" x2="138" y2="62" stroke="rgba(30,77,160,.04)" stroke-width="1.2"/>
    <rect x="14" y="24" width="90" height="110" rx="5" fill="rgba(30,77,160,.06)" stroke="rgba(30,77,160,.1)" stroke-width="1.5"/>
    <rect x="14" y="24" width="90" height="24" rx="5" fill="rgba(30,77,160,.05)"/>
    <line x1="28" y1="36" x2="72" y2="36" stroke="rgba(30,77,160,.16)" stroke-width="1.5"/>
    <line x1="28" y1="62" x2="92" y2="62" stroke="rgba(30,77,160,.08)" stroke-width="1.2"/>
    <line x1="28" y1="76" x2="92" y2="76" stroke="rgba(30,77,160,.07)" stroke-width="1.2"/>
    <line x1="28" y1="90" x2="82" y2="90" stroke="rgba(30,77,160,.06)" stroke-width="1.2"/>
    <line x1="28" y1="104" x2="92" y2="104" stroke="rgba(30,77,160,.06)" stroke-width="1.2"/>
    <circle cx="86" cy="120" r="8" fill="rgba(30,77,160,.06)" stroke="rgba(30,77,160,.1)" stroke-width="1"/>
    <polyline points="82,120 85,123 91,117" fill="none" stroke="rgba(30,77,160,.18)" stroke-width="1.5"/>
  </svg>`;

  /* Documentos / administración — blanco (activo sobre azul) */
  const adminDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 140">
    <rect x="90" y="14" width="76" height="96" rx="5" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.12)" stroke-width="1.2"/>
    <line x1="104" y1="34" x2="154" y2="34" stroke="rgba(255,255,255,.1)" stroke-width="1.2"/>
    <line x1="104" y1="48" x2="154" y2="48" stroke="rgba(255,255,255,.09)" stroke-width="1.2"/>
    <line x1="104" y1="62" x2="138" y2="62" stroke="rgba(255,255,255,.08)" stroke-width="1.2"/>
    <rect x="14" y="24" width="90" height="110" rx="5" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>
    <rect x="14" y="24" width="90" height="24" rx="5" fill="rgba(255,255,255,.09)"/>
    <line x1="28" y1="36" x2="72" y2="36" stroke="rgba(255,255,255,.28)" stroke-width="1.5"/>
    <line x1="28" y1="62" x2="92" y2="62" stroke="rgba(255,255,255,.14)" stroke-width="1.2"/>
    <line x1="28" y1="76" x2="92" y2="76" stroke="rgba(255,255,255,.12)" stroke-width="1.2"/>
    <line x1="28" y1="90" x2="82" y2="90" stroke="rgba(255,255,255,.11)" stroke-width="1.2"/>
    <line x1="28" y1="104" x2="92" y2="104" stroke="rgba(255,255,255,.1)" stroke-width="1.2"/>
    <circle cx="86" cy="120" r="8" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.2)" stroke-width="1"/>
    <polyline points="82,120 85,123 91,117" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/>
  </svg>`;

  /* Casa / desocupación — ámbar tenue (inactivo) */
  const desocLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 140">
    <polygon points="90,16 162,60 162,126 18,126 18,60" fill="rgba(217,119,6,.04)" stroke="rgba(217,119,6,.09)" stroke-width="1.5"/>
    <polygon points="90,16 162,60 18,60" fill="rgba(217,119,6,.03)"/>
    <rect x="68" y="86" width="44" height="40" rx="2" fill="rgba(217,119,6,.04)" stroke="rgba(217,119,6,.09)" stroke-width="1.5"/>
    <circle cx="79" cy="108" r="2.5" fill="rgba(217,119,6,.16)"/>
    <rect x="24" y="76" width="30" height="26" rx="2" fill="rgba(217,119,6,.03)" stroke="rgba(217,119,6,.07)" stroke-width="1"/>
    <line x1="39" y1="76" x2="39" y2="102" stroke="rgba(217,119,6,.06)" stroke-width="1"/>
    <line x1="24" y1="89" x2="54" y2="89" stroke="rgba(217,119,6,.06)" stroke-width="1"/>
    <rect x="126" y="76" width="30" height="26" rx="2" fill="rgba(217,119,6,.03)" stroke="rgba(217,119,6,.07)" stroke-width="1"/>
    <line x1="141" y1="76" x2="141" y2="102" stroke="rgba(217,119,6,.06)" stroke-width="1"/>
    <line x1="126" y1="89" x2="156" y2="89" stroke="rgba(217,119,6,.06)" stroke-width="1"/>
    <line x1="128" y1="22" x2="162" y2="22" stroke="rgba(217,119,6,.22)" stroke-width="2"/>
    <polyline points="148,14 162,22 148,30" fill="none" stroke="rgba(217,119,6,.22)" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;

  /* Casa / desocupación — blanco (activo sobre ámbar) */
  const desocDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 140">
    <polygon points="90,16 162,60 162,126 18,126 18,60" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.14)" stroke-width="1.5"/>
    <polygon points="90,16 162,60 18,60" fill="rgba(255,255,255,.05)"/>
    <rect x="68" y="86" width="44" height="40" rx="2" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/>
    <circle cx="79" cy="108" r="2.5" fill="rgba(255,255,255,.28)"/>
    <rect x="24" y="76" width="30" height="26" rx="2" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.11)" stroke-width="1"/>
    <line x1="39" y1="76" x2="39" y2="102" stroke="rgba(255,255,255,.09)" stroke-width="1"/>
    <line x1="24" y1="89" x2="54" y2="89" stroke="rgba(255,255,255,.09)" stroke-width="1"/>
    <rect x="126" y="76" width="30" height="26" rx="2" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.11)" stroke-width="1"/>
    <line x1="141" y1="76" x2="141" y2="102" stroke="rgba(255,255,255,.09)" stroke-width="1"/>
    <line x1="126" y1="89" x2="156" y2="89" stroke="rgba(255,255,255,.09)" stroke-width="1"/>
    <line x1="128" y1="22" x2="162" y2="22" stroke="rgba(255,255,255,.34)" stroke-width="2"/>
    <polyline points="148,14 162,22 148,30" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;

  /* Rayo / servicios públicos — verde tenue (inactivo) */
  const spLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 140">
    <circle cx="140" cy="30" r="22" fill="rgba(5,150,105,.03)" stroke="rgba(5,150,105,.07)" stroke-width="1.2"/>
    <circle cx="140" cy="30" r="14" fill="rgba(5,150,105,.04)" stroke="rgba(5,150,105,.08)" stroke-width="1"/>
    <polygon points="140,16 147,27 133,27" fill="rgba(5,150,105,.12)" stroke="rgba(5,150,105,.15)" stroke-width="1"/>
    <path d="M96,20 L72,68 L90,68 L66,120 L120,60 L100,60 Z" fill="rgba(5,150,105,.06)" stroke="rgba(5,150,105,.12)" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="24" y1="50" x2="50" y2="50" stroke="rgba(5,150,105,.1)" stroke-width="1.5" stroke-dasharray="4,3"/>
    <line x1="20" y1="70" x2="55" y2="70" stroke="rgba(5,150,105,.08)" stroke-width="1.2" stroke-dasharray="4,3"/>
    <line x1="28" y1="90" x2="48" y2="90" stroke="rgba(5,150,105,.07)" stroke-width="1.2" stroke-dasharray="4,3"/>
    <circle cx="30" cy="115" r="6" fill="rgba(5,150,105,.04)" stroke="rgba(5,150,105,.1)" stroke-width="1"/>
    <circle cx="50" cy="115" r="6" fill="rgba(5,150,105,.04)" stroke="rgba(5,150,105,.1)" stroke-width="1"/>
    <line x1="36" y1="115" x2="44" y2="115" stroke="rgba(5,150,105,.1)" stroke-width="1.5"/>
  </svg>`;

  /* Rayo / servicios públicos — blanco (activo sobre verde) */
  const spDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 140">
    <circle cx="140" cy="30" r="22" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.12)" stroke-width="1.2"/>
    <circle cx="140" cy="30" r="14" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
    <polygon points="140,16 147,27 133,27" fill="rgba(255,255,255,.22)" stroke="rgba(255,255,255,.28)" stroke-width="1"/>
    <path d="M96,20 L72,68 L90,68 L66,120 L120,60 L100,60 Z" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.22)" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="24" y1="50" x2="50" y2="50" stroke="rgba(255,255,255,.18)" stroke-width="1.5" stroke-dasharray="4,3"/>
    <line x1="20" y1="70" x2="55" y2="70" stroke="rgba(255,255,255,.14)" stroke-width="1.2" stroke-dasharray="4,3"/>
    <line x1="28" y1="90" x2="48" y2="90" stroke="rgba(255,255,255,.12)" stroke-width="1.2" stroke-dasharray="4,3"/>
    <circle cx="30" cy="115" r="6" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <circle cx="50" cy="115" r="6" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
    <line x1="36" y1="115" x2="44" y2="115" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>
  </svg>`;

  function uri(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  const style = document.createElement('style');
  style.id = 'module-card-art';
  style.textContent = `
    .module-card.admin-card::before { background-image: ${uri(adminLight)}; }
    .module-card.admin-card::after  { background-image: ${uri(adminDark)}; }
    .module-card.desoc-card::before { background-image: ${uri(desocLight)}; }
    .module-card.desoc-card::after  { background-image: ${uri(desocDark)}; }
    .module-card.sp-card::before    { background-image: ${uri(spLight)}; }
    .module-card.sp-card::after     { background-image: ${uri(spDark)}; }
  `;
  document.head.appendChild(style);
}

/* ── Descarga del formato Excel de desocupación ── */
function downloadTemplateDesoc() {
  const headers = DESOC_COLS;

  const example = [
    'Barranquilla, 12 de junio de 2026',
    'GALVAN GARCIA CRISTIAN',
    'Calle 104 # 53-49, Torre 1 Apto 901',
    'Barranquilla',
    'Calle 2 # 54-35 Piso 3 ED MIRADOR DEL MAR',
    'mora en el pago de cánones de arrendamiento',
    '$1.000.000',
    'UN MILLÓN DE PESOS',
    '25 de julio de 2026'
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);

  ws['!cols'] = [
    {wch:35},{wch:35},{wch:40},{wch:20},
    {wch:45},{wch:50},{wch:18},{wch:40},{wch:28}
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Desocupacion');
  XLSX.writeFile(wb, 'Formato_Cartas_Desocupacion_Arenas.xlsx');

  showToast('Formato Excel de desocupación descargado correctamente.', 'success');
  setStep(2);
}

/* ── Validación del Excel de desocupación ── */
function validateDataDesoc(raw, fileName) {
  if (!raw || raw.length === 0) {
    return { ok: false, message: 'No se encontraron registros en el archivo cargado.' };
  }

  const headers = Object.keys(raw[0]).map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  const missing = DESOC_COLS.filter(c => !headers.includes(c));

  if (missing.length > 0) {
    return { ok: false, message: 'Faltan las siguientes columnas obligatorias:', list: missing };
  }

  const clients = raw.map((row, i) => {
    const normalized = {};
    Object.keys(row).forEach(k => {
      normalized[k.trim().toLowerCase().replace(/\s+/g,'_')] = String(row[k] ?? '').trim();
    });
    normalized._index = i;
    return normalized;
  });

  const valid = clients.filter(c => c.nombre_cliente && c.nombre_cliente.length > 0);

  if (valid.length === 0) {
    return { ok: false, message: 'No se encontraron registros con nombre_cliente diligenciado.' };
  }

  return { ok: true, clients: valid };
}

/* ── Tabla de clientes desocupación ── */
function renderClientsDesoc(list) {
  const tbody = document.getElementById('clientTableBody');
  const cardsWrap = document.getElementById('clientCards');

  tbody.innerHTML = '';
  cardsWrap.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No se encontraron registros con ese criterio.</td></tr>`;
    cardsWrap.innerHTML = `<p class="table-empty">No se encontraron registros.</p>`;
    return;
  }

  list.forEach((c) => {
    const isSelected = APP.selectedIndex === c._index;

    /* Fila de tabla */
    const tr = document.createElement('tr');
    tr.dataset.idx = c._index;
    if (isSelected) tr.classList.add('selected');
    tr.innerHTML = `
      <td>${c._index + 1}</td>
      <td><strong>${esc(c.nombre_cliente)}</strong></td>
      <td>${esc(c.direccion_cliente)}</td>
      <td>${esc(c.direccion_inmueble)}</td>
      <td>${esc(c.ciudad)}</td>
      <td>${esc(c.valor_deuda_numero)}</td>
      <td>${esc(c.fecha_limite_entrega)}</td>
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
      <div class="client-card-row"><span>Inmueble</span><span>${esc(c.direccion_inmueble)}</span></div>
      <div class="client-card-row"><span>Ciudad</span><span>${esc(c.ciudad)}</span></div>
      <div class="client-card-row"><span>Deuda</span><span>${esc(c.valor_deuda_numero)}</span></div>
      <div class="client-card-row"><span>Fecha límite</span><span>${esc(c.fecha_limite_entrega)}</span></div>
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

/* ── Previsualización desocupación — dos páginas con membrete ── */
function renderLetterPreviewDesoc(c) {
  /*
   * Proporciones calculadas desde el PDF real (Letter 612×792pt, SZ=10.5pt, LS=5.6mm):
   *   font-size : 10.5/792 * 1.294 * 100cqw = 1.72cqw
   *   left      : 25mm/215.9mm = 11.6%
   *   right     : (215.9-190)mm/215.9mm = 12%  (antes era 9.3% — incorrecto)
   *   line-h    : 5.6mm*2.835 / 10.5 = 1.51 ≈ 1.52
   *   1mm       ≈ 0.269em  →  skip(N mm) = N×0.269em
   */
  const PAGE  = 'position:relative;width:100%;padding-top:129.4%;overflow:hidden;border-radius:4px;box-shadow:0 3px 18px rgba(0,0,0,.18);background:#fff;';
  const IMG   = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block;';
  const TEXT  = 'position:absolute;top:18.3%;left:11.6%;right:12%;font-family:Arial,Helvetica,sans-serif;font-size:1.72cqw;color:#000;line-height:1.62;';

  /* Encabezado */
  const PH   = 'margin:0 0 1.9em 0;';                                    // skip(7) = 1.89em
  const PASO = 'margin:0 0 2.4em 0;font-weight:700;text-align:justify;'; // Asunto + skip(9) = 2.42em

  /* Cuerpo — sin espaciado entre párrafos */
  const P0   = 'margin:0;';                                               // Cordial saludo (línea corta)
  const PJ   = 'margin:0;text-align:justify;';                            // párrafo justificado
  const PJT  = 'margin:0 0 1.35em 0;text-align:justify;';                // + skip(5) = 1.35em después
  const PJE  = 'margin:0 0 1.35em 0;text-align:justify;';                // costas procesales + skip(5)
  const PBH  = 'margin:0;font-weight:700;';                               // títulos de sección
  const PBHT = 'margin:0 0 1.35em 0;font-weight:700;';                   // REQUISITOS + skip(5)
  const PI   = 'margin:0;padding-left:1.35em;text-align:justify;';        // indentado (5mm = 1.35em)
  const UL   = 'margin:0;padding-left:1.35em;';                           // lista indentada

  /* Cierre */
  const PAGR  = 'margin:0;text-align:justify;';                           // Agradecemos
  const PATEN = 'margin:2.5em 0 0 0;';                                    // Atentamente (espacio firma)
  const PFIRM = 'margin:3em 0 0;font-weight:700;';                        // GRUPO ARENAS (espacio firma)

  /* ── PÁGINA 1 ── */
  const pg1 = `<div style="${PAGE}">
    <img src="assets/membrete_preview.png" style="${IMG}" alt="Membrete">
    <div style="${TEXT}">
      <p style="${PH}">${esc(c.fecha_carta)}</p>
      <p style="${PH}">Señor(a): <strong>${esc(c.nombre_cliente)}</strong><br>Dirección: ${esc(c.direccion_cliente)}<br>${esc(c.ciudad)}</p>
      <p style="${PASO}">Asunto: Requerimiento de entrega voluntaria del inmueble por incumplimiento contractual &ndash; Inmueble ${esc(c.direccion_inmueble)}</p>
      <p style="${P0}">Cordial saludo.</p>
      <p style="${PJ}">En nuestra calidad de administradores del inmueble identificado en el asunto, nos permitimos informar que a la fecha usted presenta incumplimiento de las obligaciones derivadas del contrato de arrendamiento suscrito con <strong>GRUPO ARENAS S.A.S.</strong>, consistente en <strong>${esc(c.motivo_incumplimiento)}</strong>.</p>
      <p style="${PJ}">Actualmente registra una deuda por valor de <strong>${esc(c.valor_deuda_numero)}</strong> (<strong>${esc(c.valor_deuda_letras)}</strong>), suma que deberá ser cancelada junto con los demás valores que se continúen causando hasta la fecha de pago efectivo.</p>
      <p style="${PJ}">De conformidad con las causales de terminación previstas en la Cláusula Décima del contrato de arrendamiento, y ante el incumplimiento antes descrito, requerimos formalmente la restitución y entrega voluntaria del inmueble a más tardar el día <strong>${esc(c.fecha_limite_entrega)}</strong>.</p>
      <p style="${PJ}">Así mismo, le informamos que el incumplimiento contractual genera la aplicación de la Cláusula Décima Primera (Cláusula Penal), equivalente a tres (3) cánones de arrendamiento vigentes, sin perjuicio del cobro de los cánones, cuotas de administración, servicios públicos, reparaciones locativas, honorarios de cobranza, perjuicios y demás obligaciones a su cargo establecidas en el contrato y en la ley.</p>
      <p style="${PJT}">Le recordamos que, conforme a lo pactado contractualmente, para la recepción formal del inmueble deberá cumplir con los siguientes requisitos:</p>
    </div>
  </div>`;

  /* ── SEPARADOR entre páginas ── */
  const sep = `<div style="display:flex;align-items:center;gap:.6rem;padding:.65rem 0;">
    <div style="flex:1;border-top:1px solid var(--c-border,#e2e8f0);"></div>
    <span style="font-size:.72rem;font-weight:700;letter-spacing:.07em;color:var(--c-text-3,#94a3b8);white-space:nowrap;">— Página 2 —</span>
    <div style="flex:1;border-top:1px solid var(--c-border,#e2e8f0);"></div>
  </div>`;

  /* Página 2 más alta (140%) para que todo el contenido quepa sin superposición */
  const PAGE2 = PAGE.replace('padding-top:129.4%', 'padding-top:140%');

  /* ── PÁGINA 2 ── */
  const pg2 = `<div style="${PAGE2}">
    <img src="assets/membrete_preview.png" style="${IMG}" alt="Membrete">
    <div style="${TEXT}">
      <p style="${PBHT}">REQUISITOS PARA LA ENTREGA DEL INMUEBLE</p>
      <p style="${PBH}">1. Diligencia de pre inventario</p>
      <p style="${PI}">Un supervisor de la inmobiliaria realizará una visita al inmueble con el fin de verificar su estado general. Como resultado de esta inspección se indicarán las reparaciones locativas o adecuaciones que deban efectuarse antes de la entrega.</p>
      <p style="${PBH}">2. Ejecución de reparaciones</p>
      <p style="${PI}">Realizar las reparaciones requeridas en el pre inventario y entregar el inmueble en las condiciones exigidas por el contrato.</p>
      <p style="${PBH}">3. Presentación de documentos con una (1) semana de antelación a la entrega</p>
      <ul style="${UL}">
        <li>Fotocopia de las tres (3) últimas facturas de servicios públicos canceladas.</li>
        <li>Soportes de pago y paz y salvos correspondientes.</li>
        <li>Paz y salvo de administración, incluyendo retroactivos o incrementos aprobados por la copropiedad.</li>
        <li>Paz y salvo y/o constancia de retiro de líneas telefónicas, internet, televisión y demás servicios contratados.</li>
        <li>Copia del último mantenimiento de los aires acondicionados, cuando aplique.</li>
        <li>Encontrarse al día en el pago de cánones de arrendamiento y demás obligaciones contractuales.</li>
      </ul>
      <p style="${PBH}">4. Pago de promedios de servicios públicos</p>
      <p style="${PI}">Realizar el pago correspondiente a los promedios de servicios públicos establecidos en el contrato como requisito previo a la recepción del inmueble.</p>
      <p style="${PJ}">Una vez cumplidos los requisitos anteriores, se programará la fecha y hora para la entrega formal del inmueble y la firma del inventario de restitución.</p>
      <p style="${PJE}">En caso de persistir el incumplimiento o de no efectuarse la entrega voluntaria del inmueble dentro del plazo señalado, nos veremos obligados a iniciar las acciones judiciales correspondientes para obtener la restitución del inmueble y el cobro de todas las sumas adeudadas, incluyendo cláusula penal, intereses, honorarios, gastos de cobranza y costas procesales.</p>
      <p style="${PAGR}">Agradecemos su pronta atención y gestión frente a esta situación.</p>
      <p style="${PATEN}">Atentamente,</p>
      <p style="${PFIRM}">GRUPO ARENAS S.A.S.<br>Área Jurídica y de Cartera</p>
    </div>
  </div>`;

  const html = `<div style="padding:.8rem .8rem 1rem;">
    <div style="text-align:center;font-size:.72rem;font-weight:700;letter-spacing:.07em;color:var(--c-text-3,#94a3b8);margin-bottom:.55rem;">— Página 1 —</div>
    ${pg1}${sep}${pg2}
  </div>`;

  const sheet = document.getElementById('letterSheet');
  sheet.style.opacity = '0';
  sheet.style.transform = 'translateY(10px)';
  sheet.style.padding = '0';
  sheet.style.background = '#f1f5f9';
  sheet.innerHTML = html;
  requestAnimationFrame(() => {
    sheet.style.transition = 'opacity .35s ease, transform .35s ease';
    sheet.style.opacity = '1';
    sheet.style.transform = 'translateY(0)';
  });
}

/* ── Sanitiza texto para pdf-lib (WinAnsi) ── */
function pdfSafe(text) {
  return String(text || '').trim()
    .replace(/–/g, '-').replace(/—/g, '--')
    .replace(/‘/g, "'").replace(/’/g, "'")
    .replace(/“/g, '"').replace(/”/g, '"')
    .replace(/…/g, '...');
}

/* ── PDF multi-página de desocupación ── */
async function buildPDFDesocWithTemplate(client) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const MM   = 2.835;
  const ML   = 25 * MM;
  const CW   = 165 * MM;
  const SZ   = 10.5;
  const LS   = 5.6 * MM;

  /* Documento receptor */
  const mergedDoc = await PDFDocument.create();

  async function addMemPage() {
    const fresh = await PDFDocument.load(APP.membreteBytes, { ignoreEncryption: true });
    const { width: W, height: H } = fresh.getPage(0).getSize();
    const [embedded] = await mergedDoc.embedPdf(fresh, [0]);
    const pg = mergedDoc.addPage([W, H]);
    pg.drawPage(embedded, { x: 0, y: 0, width: W, height: H });
    return pg;
  }

  let page = await addMemPage();
  const { height: PH } = page.getSize();
  const TOP_Y = PH - 51 * MM;
  const BOT_Y = 22 * MM;

  const fN = await mergedDoc.embedFont(StandardFonts.Helvetica);
  const fB = await mergedDoc.embedFont(StandardFonts.HelveticaBold);
  const cMain = rgb(0, 0, 0);

  let y = TOP_Y;

  async function chk(needed) {
    if (y - needed < BOT_Y) { page = await addMemPage(); y = TOP_Y; }
  }

  async function line(text, bold, sz) {
    const size = sz || SZ;
    const lh   = size * 1.62;
    await chk(lh);
    const t = pdfSafe(text);
    if (t) page.drawText(t, { x: ML, y, size, font: bold ? fB : fN, color: cMain });
    y -= lh;
  }

  async function wrapped(text, bold, sz, indent) {
    const size = sz || SZ;
    const lh   = size * 1.62;
    const ind  = (indent || 0) * MM;
    const w    = CW - ind;
    const font = bold ? fB : fN;
    const lines = libWrap(pdfSafe(text), w, font, size);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await chk(lh);
      if (l) {
        const isLast = i === lines.length - 1;
        if (!bold && !isLast) {
          /* Justificación: dibujar cada palabra en posición calculada */
          const words = l.split(' ');
          if (words.length > 1) {
            const totalWordW = words.reduce((s, wd) => s + font.widthOfTextAtSize(wd, size), 0);
            const gap = (w - totalWordW) / (words.length - 1);
            let cx = ML + ind;
            for (const wd of words) {
              page.drawText(wd, { x: cx, y, size, font, color: cMain });
              cx += font.widthOfTextAtSize(wd, size) + gap;
            }
          } else {
            page.drawText(l, { x: ML + ind, y, size, font, color: cMain });
          }
        } else {
          page.drawText(l, { x: ML + ind, y, size, font, color: cMain });
        }
      }
      y -= lh;
    }
  }

  async function skip(mm) { y -= mm * MM; if (y < BOT_Y) { page = await addMemPage(); y = TOP_Y; } }

  /* ─── Contenido ─── */
  await line(v(client.fecha_carta), false);
  await skip(7);

  await line('Señor(a): ' + v(client.nombre_cliente), true);
  await line('Dirección: ' + v(client.direccion_cliente), false);
  await line(v(client.ciudad), false);
  await skip(7);

  await wrapped(
    'Asunto: Requerimiento de entrega voluntaria del inmueble por incumplimiento contractual - Inmueble ' + v(client.direccion_inmueble),
    true
  );
  await skip(9);

  await line('Cordial saludo.', false);

  await wrapped(
    'En nuestra calidad de administradores del inmueble identificado en el asunto, nos permitimos informar que a la fecha usted presenta incumplimiento de las obligaciones derivadas del contrato de arrendamiento suscrito con GRUPO ARENAS S.A.S., consistente en ' + v(client.motivo_incumplimiento) + '.',
    false
  );

  await wrapped(
    'Actualmente registra una deuda por valor de ' + v(client.valor_deuda_numero) + ' (' + v(client.valor_deuda_letras) + '), suma que deberá ser cancelada junto con los demás valores que se continúen causando hasta la fecha de pago efectivo.',
    false
  );

  await wrapped(
    'De conformidad con las causales de terminación previstas en la Cláusula Décima del contrato de arrendamiento, y ante el incumplimiento antes descrito, requerimos formalmente la restitución y entrega voluntaria del inmueble a más tardar el día ' + v(client.fecha_limite_entrega) + '.',
    false
  );

  await wrapped(
    'Así mismo, le informamos que el incumplimiento contractual genera la aplicación de la Cláusula Décima Primera (Cláusula Penal), equivalente a tres (3) cánones de arrendamiento vigentes, sin perjuicio del cobro de los cánones, cuotas de administración, servicios públicos, reparaciones locativas, honorarios de cobranza, perjuicios y demás obligaciones a su cargo establecidas en el contrato y en la ley.',
    false
  );

  await wrapped(
    'Le recordamos que, conforme a lo pactado contractualmente, para la recepción formal del inmueble deberá cumplir con los siguientes requisitos:',
    false
  );
  await skip(5);

  await line('REQUISITOS PARA LA ENTREGA DEL INMUEBLE', true);
  await skip(5);

  await line('1. Diligencia de pre inventario', true);
  await wrapped(
    'Un supervisor de la inmobiliaria realizará una visita al inmueble con el fin de verificar su estado general. Como resultado de esta inspección se indicarán las reparaciones locativas o adecuaciones que deban efectuarse antes de la entrega.',
    false, null, 5
  );

  await line('2. Ejecución de reparaciones', true);
  await wrapped(
    'Realizar las reparaciones requeridas en el pre inventario y entregar el inmueble en las condiciones exigidas por el contrato.',
    false, null, 5
  );

  await line('3. Presentación de documentos con una (1) semana de antelación a la entrega', true);

  const items3 = [
    'Fotocopia de las tres (3) últimas facturas de servicios públicos canceladas.',
    'Soportes de pago y paz y salvos correspondientes.',
    'Paz y salvo de administración, incluyendo retroactivos o incrementos aprobados por la copropiedad.',
    'Paz y salvo y/o constancia de retiro de líneas telefónicas, internet, televisión por suscripción y demás servicios contratados.',
    'Copia del último mantenimiento de los aires acondicionados, cuando aplique.',
    'Encontrarse al día en el pago de cánones de arrendamiento y demás obligaciones contractuales.',
  ];
  for (const item of items3) {
    await wrapped('- ' + item, false, null, 5);
  }

  await line('4. Pago de promedios de servicios públicos', true);
  await wrapped(
    'Realizar el pago correspondiente a los promedios de servicios públicos establecidos en el contrato como requisito previo a la recepción del inmueble.',
    false, null, 5
  );

  await wrapped(
    'Una vez cumplidos los requisitos anteriores, se programará la fecha y hora para la entrega formal del inmueble y la firma del inventario de restitución.',
    false
  );

  await wrapped(
    'En caso de persistir el incumplimiento o de no efectuarse la entrega voluntaria del inmueble dentro del plazo señalado, nos veremos obligados a iniciar las acciones judiciales correspondientes para obtener la restitución del inmueble y el cobro de todas las sumas adeudadas, incluyendo cláusula penal, intereses, honorarios, gastos de cobranza y costas procesales.',
    false
  );
  await skip(5);

  await line('Agradecemos su pronta atención y gestión frente a esta situación.', false);
  await skip(14);

  await line('Atentamente,', false);
  await skip(16);

  /* Firma: verificar que cabe en la página actual */
  await chk(3 * SZ * 1.62);
  await line('GRUPO ARENAS S.A.S.', true);
  await line('Área Jurídica y de Cartera', false);

  return mergedDoc.save();
}

/* ── Nombre PDF desocupación ── */
function pdfNameDesoc(client) {
  const nm = v(client.nombre_cliente).replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').substring(0,40);
  return `Carta_Desocupacion_${nm}.pdf`;
}

/* ── PDF individual desocupación ── */
async function generatePDFSingleDesoc() {
  if (!APP.selectedClient) {
    showToast('Seleccione un destinatario para generar el PDF.', 'warning');
    return;
  }
  showLoading('Generando PDF con membrete...');
  await delay(50);
  try {
    if (APP.membreteBytes) {
      const bytes = await buildPDFDesocWithTemplate(APP.selectedClient);
      saveAs(new Blob([bytes], { type: 'application/pdf' }), pdfNameDesoc(APP.selectedClient));
    } else {
      buildPDFDesocFallback(APP.selectedClient).save(pdfNameDesoc(APP.selectedClient));
    }
    setStep(6);
    showToast('PDF de desocupación generado correctamente.', 'success');
  } catch (err) {
    showToast('Error al generar el PDF: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ── PDF consolidado desocupación ── */
async function generatePDFConsolidatedDesoc() {
  if (APP.clients.length === 0) {
    showToast('No hay destinatarios cargados.', 'warning');
    return;
  }
  showLoading(`Generando PDF consolidado (${APP.clients.length} cartas)...`);
  await delay(50);
  try {
    if (APP.membreteBytes) {
      const { PDFDocument } = PDFLib;
      const merged = await PDFDocument.create();
      for (let i = 0; i < APP.clients.length; i++) {
        document.getElementById('loadingMsg').textContent =
          `Procesando carta ${i + 1} de ${APP.clients.length}...`;
        await delay(5);
        const bytes  = await buildPDFDesocWithTemplate(APP.clients[i]);
        const single = await PDFDocument.load(bytes);
        const pgCount = single.getPageCount();
        for (let pi = 0; pi < pgCount; pi++) {
          const [emb] = await merged.embedPdf(single, [pi]);
          const { width: pw, height: ph } = single.getPage(pi).getSize();
          const pg = merged.addPage([pw, ph]);
          pg.drawPage(emb, { x: 0, y: 0, width: pw, height: ph });
        }
      }
      const out = await merged.save();
      saveAs(new Blob([out], { type: 'application/pdf' }),
        'Cartas_Desocupacion_Arenas_Inmobiliaria.pdf');
    } else {
      /* Fallback jsPDF */
      const { jsPDF } = window.jspdf;
      let doc = null;
      for (let i = 0; i < APP.clients.length; i++) {
        const pageDoc = buildPDFDesocFallback(APP.clients[i]);
        if (!doc) { doc = pageDoc; }
        else {
          doc.addPage('letter','portrait');
          buildDesocPageInDoc(doc, APP.clients[i]);
        }
      }
      doc.save('Cartas_Desocupacion_Arenas_Inmobiliaria.pdf');
    }
    setStep(6);
    showToast(`PDF consolidado de desocupación generado con ${APP.clients.length} carta(s).`, 'success');
  } catch (err) {
    showToast('Error al generar el PDF consolidado: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ── ZIP desocupación ── */
async function generatePDFZipDesoc() {
  if (APP.clients.length === 0) {
    showToast('No hay destinatarios cargados.', 'warning');
    return;
  }
  showLoading(`Generando ${APP.clients.length} PDF de desocupación...`);
  await delay(80);
  try {
    const zip    = new JSZip();
    const folder = zip.folder('Cartas_Desocupacion_Arenas');
    for (let i = 0; i < APP.clients.length; i++) {
      const c = APP.clients[i];
      document.getElementById('loadingMsg').textContent =
        `Generando PDF ${i + 1} de ${APP.clients.length}...`;
      await delay(10);
      let bytes;
      if (APP.membreteBytes) {
        bytes = await buildPDFDesocWithTemplate(c);
      } else {
        bytes = buildPDFDesocFallback(c).output('arraybuffer');
      }
      folder.file(pdfNameDesoc(c), bytes);
    }
    document.getElementById('loadingMsg').textContent = 'Comprimiendo archivos...';
    await delay(30);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveAs(blob, 'Cartas_Desocupacion_Arenas_Inmobiliaria.zip');
    setStep(6);
    showToast(`ZIP de desocupación generado con ${APP.clients.length} PDF.`, 'success');
  } catch (err) {
    showToast('Error al generar el ZIP: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ── Fallback jsPDF para desocupación (sin membrete) ── */
function buildPDFDesocFallback(client) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  buildDesocPageInDoc(doc, client);
  return doc;
}

/* ══════════════════════════════════════════════════════════
   MÓDULO: REQUERIMIENTO DE SERVICIOS PÚBLICOS
══════════════════════════════════════════════════════════ */

/* ── Descarga del formato Excel SP ── */
function downloadTemplateSP() {
  const example = [
    'Barranquilla, 21 de junio de 2026',
    'Barranquilla',
    'GALVAN GARCIA CRISTIAN DAVID',
    '1.063.151.881',
    'Calle 2 # 54-35 Piso 3 ED MIRADOR DEL MAR',
    '$3.595.715',
    'Energía', '1161936', '$1.774.240',
    'Agua',    '500363',  '$1.589.208',
    'Gas',     '249206',  '$232.267'
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([SP_COLS, example]);

  ws['!cols'] = [
    {wch:35},{wch:20},{wch:35},{wch:18},{wch:45},{wch:18},
    {wch:14},{wch:18},{wch:18},
    {wch:14},{wch:18},{wch:18},
    {wch:14},{wch:18},{wch:18}
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'ServiciosPublicos');
  XLSX.writeFile(wb, 'Formato_Servicios_Publicos_Arenas.xlsx');

  showToast('Formato Excel de servicios públicos descargado correctamente.', 'success');
  setStep(2);
}

/* ── Validación del Excel SP ── */
function validateDataSP(raw, fileName) {
  if (!raw || raw.length === 0) {
    return { ok: false, message: 'No se encontraron registros en el archivo cargado.' };
  }

  const headers = Object.keys(raw[0]).map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  const missing = SP_COLS.filter(c => !headers.includes(c));

  if (missing.length > 0) {
    return { ok: false, message: 'Faltan las siguientes columnas obligatorias:', list: missing };
  }

  const clients = raw.map((row, i) => {
    const normalized = {};
    Object.keys(row).forEach(k => {
      normalized[k.trim().toLowerCase().replace(/\s+/g,'_')] = String(row[k] ?? '').trim();
    });
    normalized._index = i;
    return normalized;
  });

  const valid = clients.filter(c => c.nombre_cliente && c.nombre_cliente.length > 0);

  if (valid.length === 0) {
    return { ok: false, message: 'No se encontraron registros con nombre_cliente diligenciado.' };
  }

  return { ok: true, clients: valid };
}

/* ── Tabla de clientes SP ── */
function renderClientsSP(list) {
  const tbody = document.getElementById('clientTableBody');
  const cardsWrap = document.getElementById('clientCards');

  tbody.innerHTML = '';
  cardsWrap.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No se encontraron registros con ese criterio.</td></tr>`;
    cardsWrap.innerHTML = `<p class="table-empty">No se encontraron registros.</p>`;
    return;
  }

  list.forEach((c) => {
    const isSelected = APP.selectedIndex === c._index;

    const tr = document.createElement('tr');
    tr.dataset.idx = c._index;
    if (isSelected) tr.classList.add('selected');
    tr.innerHTML = `
      <td>${c._index + 1}</td>
      <td><strong>${esc(c.nombre_cliente)}</strong></td>
      <td>${esc(c.cedula)}</td>
      <td>${esc(c.direccion_inmueble)}</td>
      <td>${esc(c.ciudad)}</td>
      <td>${esc(c.valor_total)}</td>
      <td>
        <button class="btn-select-client${isSelected ? ' selected-btn' : ''}" data-idx="${c._index}">
          ${isSelected ? '✓ Seleccionado' : 'Ver carta'}
        </button>
      </td>`;
    tr.querySelector('.btn-select-client').addEventListener('click', () => selectClient(c));
    tbody.appendChild(tr);

    const div = document.createElement('div');
    div.className = `client-card${isSelected ? ' selected' : ''}`;
    div.dataset.idx = c._index;
    div.innerHTML = `
      <div class="client-card-name">${esc(c.nombre_cliente)}</div>
      <div class="client-card-row"><span>Cédula</span><span>${esc(c.cedula)}</span></div>
      <div class="client-card-row"><span>Inmueble</span><span>${esc(c.direccion_inmueble)}</span></div>
      <div class="client-card-row"><span>Ciudad</span><span>${esc(c.ciudad)}</span></div>
      <div class="client-card-row"><span>Total SP</span><span>${esc(c.valor_total)}</span></div>
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

/* ── Previsualización SP ── */
function renderLetterPreviewSP(c) {
  const PAGE = 'position:relative;width:100%;padding-top:129.4%;overflow:hidden;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.15);';
  const IMG  = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block;';
  const TEXT = 'position:absolute;top:14.7%;left:11.6%;right:12%;font-family:Arial,Helvetica,sans-serif;font-size:1.8cqw;color:#000;line-height:1.55;';

  /* Tabla de servicios */
  const row = (s, con, val) => s
    ? `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:.18em .5em;text-align:center;font-weight:600">${esc(s)}</td>
        <td style="padding:.18em .5em;text-align:center">${esc(con)}</td>
        <td style="padding:.18em .5em;text-align:center">${esc(val)}</td>
       </tr>`
    : '';

  const tableRows = [
    row(c.servicio_1, c.contrato_1, c.valor_1),
    row(c.servicio_2, c.contrato_2, c.valor_2),
    row(c.servicio_3, c.contrato_3, c.valor_3)
  ].join('');

  const html = `<div style="${PAGE}">
    <img src="assets/membrete_preview.png" style="${IMG}" alt="Membrete">
    <div style="${TEXT}">
      <p style="margin:0">${esc(c.fecha_carta)}</p>

      <p style="margin:0">Señor(a)</p>
      <p style="margin:0;font-weight:700">${esc(c.nombre_cliente)}</p>
      <p style="margin:0">C.C. No ${esc(c.cedula)}</p>
      <p style="margin:0 0 1.8em 0">Ref.: Cobro de servicios públicos pendientes del inmueble ubicado en <strong>${esc(c.direccion_inmueble)}</strong></p>

      <p style="margin:0 0 0.75em 0">Cordial saludo.</p>

      <p style="margin:0 0 0.75em 0;text-align:justify">
        Por medio de la presente nos permitimos requerir formalmente el pago de los servicios públicos domiciliarios pendientes correspondientes al inmueble citado en referencia, obligación que, de conformidad con el contrato de arrendamiento suscrito, se encuentra a su cargo como arrendatario.
      </p>

      <p style="margin:0 0 1.8em 0;text-align:justify">
        Una vez revisado el estado de cuenta del inmueble, se evidencia un saldo pendiente por concepto de servicios públicos por valor de <strong>${esc(c.valor_total)}</strong>, discriminado de acuerdo con las facturas emitidas por las respectivas empresas prestadoras del servicio.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:.9em;margin-bottom:.75em;border-top:1.5px solid #334155;">
        <thead>
          <tr style="background:rgba(5,150,105,.08);">
            <th style="padding:.22em .5em;text-align:center;font-weight:700">Servicios Públicos</th>
            <th style="padding:.22em .5em;text-align:center;font-weight:700">Contrato / Póliza</th>
            <th style="padding:.22em .5em;text-align:center;font-weight:700">Valor</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <p style="margin:0 0 1.8em 0;text-align:justify">
        Le solicitamos realizar el pago de esta obligación dentro de los cinco (5) días hábiles siguientes al recibo de la presente comunicación y remitir el respectivo soporte.
      </p>

      <p style="margin:0 0 1.8em 0;text-align:justify">
        Es importante señalar que el incumplimiento de esta obligación genera perjuicios al inmueble y a su propietario, pudiendo dar lugar al inicio de las acciones de cobro pre jurídico y jurídico a que haya lugar, así como al cobro de intereses, costos y gastos derivados de la recuperación de la cartera.
      </p>

      <p style="margin:0 0 1.55em 0;text-align:justify">
        Agradecemos su pronta atención y cumplimiento de esta obligación.
      </p>

      <p style="margin:0 0 3.1em 0">Atentamente,</p>
      <p style="margin:0;font-weight:700">GRUPO ARENAS S.A.S.<br>Área de Cartera y Cobranza</p>
    </div>
  </div>`;

  const sheet = document.getElementById('letterSheet');
  sheet.style.opacity = '0';
  sheet.style.transform = 'translateY(10px)';
  sheet.style.padding = '0';
  sheet.style.background = 'none';
  sheet.innerHTML = html;
  requestAnimationFrame(() => {
    sheet.style.transition = 'opacity .35s ease, transform .35s ease';
    sheet.style.opacity = '1';
    sheet.style.transform = 'translateY(0)';
  });
}

/* ── PDF SP con membrete ── */
async function buildPDFSPWithTemplate(client) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const MM = 2.835;
  const ML = 25 * MM;
  const CW = 165 * MM;
  const SZ = 11;
  const LS = 6 * MM;

  const templateDoc = await PDFDocument.load(APP.membreteBytes, { ignoreEncryption: true });
  const { width: PW, height: PH } = templateDoc.getPage(0).getSize();

  const pdfDoc = await PDFDocument.create();
  const [embMem] = await pdfDoc.embedPdf(templateDoc, [0]);
  const page = pdfDoc.addPage([PW, PH]);
  page.drawPage(embMem, { x: 0, y: 0, width: PW, height: PH });

  const fN = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const cMain = rgb(0, 0, 0);

  let y = PH - 41 * MM;

  /* ── Fecha ── */
  page.drawText(v(client.fecha_carta), { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= LS;

  /* ── Destinatario ── */
  page.drawText('Señor(a)', { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= LS;
  page.drawText(v(client.nombre_cliente).toUpperCase(), { x: ML, y, size: SZ, font: fB, color: cMain });
  y -= LS;
  page.drawText('C.C. No ' + v(client.cedula), { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= LS;

  libWrap('Ref.: Cobro de servicios públicos pendientes del inmueble ubicado en ' + v(client.direccion_inmueble), CW, fN, SZ)
    .forEach(l => { page.drawText(l, { x: ML, y, size: SZ, font: fN, color: cMain }); y -= LS; });
  y -= 7 * MM;

  /* ── Saludo ── */
  page.drawText('Cordial saludo.', { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= 9 * MM;

  /* ── Párrafo 1 ── */
  y = libDrawMixed(page, [
    { t: 'Por medio de la presente nos permitimos requerir formalmente el pago de los servicios públicos domiciliarios pendientes correspondientes al inmueble citado en referencia, obligación que, de conformidad con el contrato de arrendamiento suscrito, se encuentra a su cargo como arrendatario.' }
  ], ML, y, CW, LS, SZ, fN, fB, cMain, cMain) - 3 * MM;

  /* ── Párrafo 2 ── */
  y = libDrawMixed(page, [
    { t: 'Una vez revisado el estado de cuenta del inmueble, se evidencia un saldo pendiente por concepto de servicios públicos por valor de ' },
    { t: v(client.valor_total), b: 1 },
    { t: ', discriminado de acuerdo con las facturas emitidas por las respectivas empresas prestadoras del servicio.' }
  ], ML, y, CW, LS, SZ, fN, fB, cMain, cMain) - 7 * MM;

  /* ── Tabla de servicios ── */
  const colW = [CW * 0.38, CW * 0.32, CW * 0.30];
  const rowH = 6.5 * MM;
  const tSZ  = 10;
  const tLS  = tSZ * 1.5;

  /* Encabezado tabla */
  page.drawRectangle({ x: ML, y: y - rowH * 0.2, width: CW, height: rowH, color: rgb(0.94,0.99,0.97) });
  const headers = ['Servicios Públicos', 'Contrato / Póliza', 'Valor'];
  let colX = ML;
  headers.forEach((h, i) => {
    const tw = fB.widthOfTextAtSize(pdfSafe(h), tSZ);
    const centeredX = colX + (colW[i] - tw) / 2;
    page.drawText(pdfSafe(h), { x: centeredX, y: y + rowH * 0.15, size: tSZ, font: fB, color: cMain });
    colX += colW[i];
  });
  y -= rowH;

  /* Filas */
  const services = [
    [client.servicio_1, client.contrato_1, client.valor_1],
    [client.servicio_2, client.contrato_2, client.valor_2],
    [client.servicio_3, client.contrato_3, client.valor_3]
  ].filter(r => v(r[0]));

  services.forEach(([s, con, val]) => {
    colX = ML;
    [v(s), v(con), v(val)].forEach((txt, i) => {
      const font = i === 0 ? fB : fN;
      const tw   = font.widthOfTextAtSize(pdfSafe(txt), tSZ);
      const centeredX = colX + (colW[i] - tw) / 2;
      page.drawText(pdfSafe(txt), { x: centeredX, y: y + rowH * 0.15, size: tSZ, font, color: cMain });
      colX += colW[i];
    });
    page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.5, color: rgb(0.88,0.88,0.88) });
    y -= rowH;
  });

  y -= 3 * MM;

  /* ── Párrafo 3 ── */
  y = libDrawMixed(page, [
    { t: 'Le solicitamos realizar el pago de esta obligación dentro de los cinco (5) días hábiles siguientes al recibo de la presente comunicación y remitir el respectivo soporte.' }
  ], ML, y, CW, LS, SZ, fN, fB, cMain, cMain) - 7 * MM;

  /* ── Párrafo 4 ── */
  y = libDrawMixed(page, [
    { t: 'Es importante señalar que el incumplimiento de esta obligación genera perjuicios al inmueble y a su propietario, pudiendo dar lugar al inicio de las acciones de cobro pre jurídico y jurídico a que haya lugar, así como al cobro de intereses, costos y gastos derivados de la recuperación de la cartera.' }
  ], ML, y, CW, LS, SZ, fN, fB, cMain, cMain) - 7 * MM;

  /* ── Cierre ── */
  page.drawText('Agradecemos su pronta atención y cumplimiento de esta obligación.', { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= 12 * MM;

  page.drawText('Atentamente,', { x: ML, y, size: SZ, font: fN, color: cMain });
  y -= 18 * MM;

  page.drawText('GRUPO ARENAS S.A.S.', { x: ML, y, size: SZ, font: fB, color: cMain });
  y -= LS;
  page.drawText('Área de Cartera y Cobranza', { x: ML, y, size: SZ, font: fN, color: cMain });

  return pdfDoc.save();
}

/* ── Nombre PDF SP ── */
function pdfNameSP(client) {
  const nm = v(client.nombre_cliente).replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').substring(0,40);
  return `Carta_SP_${nm}.pdf`;
}

/* ── PDF individual SP ── */
async function generatePDFSingleSP() {
  if (!APP.selectedClient) {
    showToast('Seleccione un destinatario para generar el PDF.', 'warning');
    return;
  }
  showLoading('Generando PDF con membrete...');
  await delay(50);
  try {
    if (APP.membreteBytes) {
      const bytes = await buildPDFSPWithTemplate(APP.selectedClient);
      saveAs(new Blob([bytes], { type: 'application/pdf' }), pdfNameSP(APP.selectedClient));
    } else {
      buildPDFSPFallback(APP.selectedClient).save(pdfNameSP(APP.selectedClient));
    }
    setStep(6);
    showToast('PDF de servicios públicos generado correctamente.', 'success');
  } catch (err) {
    showToast('Error al generar el PDF: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ── PDF consolidado SP ── */
async function generatePDFConsolidatedSP() {
  if (APP.clients.length === 0) {
    showToast('No hay destinatarios cargados.', 'warning');
    return;
  }
  showLoading(`Generando PDF consolidado (${APP.clients.length} cartas)...`);
  await delay(50);
  try {
    if (APP.membreteBytes) {
      const { PDFDocument } = PDFLib;
      const merged = await PDFDocument.create();
      for (let i = 0; i < APP.clients.length; i++) {
        document.getElementById('loadingMsg').textContent =
          `Procesando carta ${i + 1} de ${APP.clients.length}...`;
        await delay(5);
        const bytes  = await buildPDFSPWithTemplate(APP.clients[i]);
        const single = await PDFDocument.load(bytes);
        const [emb]  = await merged.embedPdf(single, [0]);
        const { width: pw, height: ph } = single.getPage(0).getSize();
        const pg = merged.addPage([pw, ph]);
        pg.drawPage(emb, { x: 0, y: 0, width: pw, height: ph });
      }
      const out = await merged.save();
      saveAs(new Blob([out], { type: 'application/pdf' }),
        'Cartas_ServiciosPublicos_Arenas_Inmobiliaria.pdf');
    } else {
      const { jsPDF } = window.jspdf;
      let doc = null;
      for (let i = 0; i < APP.clients.length; i++) {
        const pageDoc = buildPDFSPFallback(APP.clients[i]);
        if (!doc) { doc = pageDoc; }
        else { doc.addPage('letter','portrait'); buildSPPageInDoc(doc, APP.clients[i]); }
      }
      doc.save('Cartas_ServiciosPublicos_Arenas_Inmobiliaria.pdf');
    }
    setStep(6);
    showToast(`PDF consolidado de servicios públicos generado con ${APP.clients.length} carta(s).`, 'success');
  } catch (err) {
    showToast('Error al generar el PDF consolidado: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ── ZIP SP ── */
async function generatePDFZipSP() {
  if (APP.clients.length === 0) {
    showToast('No hay destinatarios cargados.', 'warning');
    return;
  }
  showLoading(`Generando ${APP.clients.length} PDF de servicios públicos...`);
  await delay(80);
  try {
    const zip    = new JSZip();
    const folder = zip.folder('Cartas_ServiciosPublicos_Arenas');
    for (let i = 0; i < APP.clients.length; i++) {
      const c = APP.clients[i];
      document.getElementById('loadingMsg').textContent =
        `Generando PDF ${i + 1} de ${APP.clients.length}...`;
      await delay(10);
      let bytes;
      if (APP.membreteBytes) {
        bytes = await buildPDFSPWithTemplate(c);
      } else {
        bytes = buildPDFSPFallback(c).output('arraybuffer');
      }
      folder.file(pdfNameSP(c), bytes);
    }
    document.getElementById('loadingMsg').textContent = 'Comprimiendo archivos...';
    await delay(30);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveAs(blob, 'Cartas_ServiciosPublicos_Arenas_Inmobiliaria.zip');
    setStep(6);
    showToast(`ZIP de servicios públicos generado con ${APP.clients.length} PDF.`, 'success');
  } catch (err) {
    showToast('Error al generar el ZIP: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ── Fallback jsPDF para SP (sin membrete) ── */
function buildPDFSPFallback(client) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  buildSPPageInDoc(doc, client);
  return doc;
}

function buildSPPageInDoc(doc, client) {
  const PW = 215.9, ML = 22, MR = 22;
  const CW = PW - ML - MR;
  const LS = 5.8;
  let y = 18;

  if (APP.logoDataUrl) {
    try {
      const lW = 75, lA = APP.logoAspect || 0.28;
      const lH = Math.min(lW * lA, 28);
      doc.addImage(APP.logoDataUrl, 'PNG', ML, y, lW, lH, undefined, 'FAST');
      y += lH + 4;
    } catch (_) { y += 5; }
  } else {
    doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(124,58,237);
    doc.text('ARENAS INMOBILIARIA', ML, y + 8); y += 14;
  }
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3);
  doc.line(ML, y, PW - MR, y); y += 2;

  doc.setFontSize(10.5); doc.setFont('helvetica','normal'); doc.setTextColor(30,41,59);

  doc.text(pdfSafe(v(client.fecha_carta)), ML, y); y += LS;
  doc.text('Señor(a)', ML, y); y += LS;
  doc.setFont('helvetica','bold');
  doc.text(v(client.nombre_cliente).toUpperCase(), ML, y); y += LS;
  doc.setFont('helvetica','normal');
  doc.text('C.C. No ' + pdfSafe(v(client.cedula)), ML, y); y += LS;
  const refLines = doc.splitTextToSize(pdfSafe('Ref.: Cobro de servicios públicos pendientes del inmueble ubicado en ' + v(client.direccion_inmueble)), CW);
  doc.text(refLines, ML, y); y += refLines.length * LS + 7;

  doc.text('Cordial saludo.', ML, y); y += 9;

  const p1 = doc.splitTextToSize(pdfSafe('Por medio de la presente nos permitimos requerir formalmente el pago de los servicios públicos domiciliarios pendientes correspondientes al inmueble citado en referencia, obligación que, de conformidad con el contrato de arrendamiento suscrito, se encuentra a su cargo como arrendatario.'), CW);
  doc.text(p1, ML, y); y += p1.length * LS + 2;

  const p2 = doc.splitTextToSize(pdfSafe('Una vez revisado el estado de cuenta del inmueble, se evidencia un saldo pendiente por concepto de servicios públicos por valor de ' + v(client.valor_total) + ', discriminado de acuerdo con las facturas emitidas por las respectivas empresas prestadoras del servicio.'), CW);
  doc.text(p2, ML, y); y += p2.length * LS + 5;

  /* Tabla servicios */
  const cols = [CW * 0.38, CW * 0.32, CW * 0.30];
  const rH = 6;
  const tblCenter = (txt, colStart, colWidth) => {
    const tw = doc.getTextWidth(txt);
    return colStart + (colWidth - tw) / 2;
  };

  doc.setFillColor(236,253,245); doc.rect(ML, y, CW, rH, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text('Servicios Públicos', tblCenter('Servicios Públicos', ML, cols[0]), y + rH * 0.7);
  doc.text('Contrato / Póliza',  tblCenter('Contrato / Póliza',  ML + cols[0], cols[1]), y + rH * 0.7);
  doc.text('Valor',              tblCenter('Valor',              ML + cols[0] + cols[1], cols[2]), y + rH * 0.7);
  y += rH;

  [[client.servicio_1, client.contrato_1, client.valor_1],
   [client.servicio_2, client.contrato_2, client.valor_2],
   [client.servicio_3, client.contrato_3, client.valor_3]]
  .filter(r => v(r[0]))
  .forEach(([s, con, val]) => {
    doc.setFontSize(9);
    const ts = pdfSafe(v(s)), tc = pdfSafe(v(con)), tv = pdfSafe(v(val));
    doc.setFont('helvetica','bold');
    doc.text(ts, tblCenter(ts, ML,              cols[0]), y + rH * 0.7);
    doc.setFont('helvetica','normal');
    doc.text(tc, tblCenter(tc, ML + cols[0],    cols[1]), y + rH * 0.7);
    doc.text(tv, tblCenter(tv, ML + cols[0] + cols[1], cols[2]), y + rH * 0.7);
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ML, y + rH, ML + CW, y + rH);
    y += rH;
  });
  y += 3;

  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(30,41,59);

  const p3 = doc.splitTextToSize(pdfSafe('Le solicitamos realizar el pago de esta obligación dentro de los cinco (5) días hábiles siguientes al recibo de la presente comunicación y remitir el respectivo soporte.'), CW);
  doc.text(p3, ML, y); y += p3.length * LS + 5;

  const p4 = doc.splitTextToSize(pdfSafe('Es importante señalar que el incumplimiento de esta obligación genera perjuicios al inmueble y a su propietario, pudiendo dar lugar al inicio de las acciones de cobro pre jurídico y jurídico a que haya lugar, así como al cobro de intereses, costos y gastos derivados de la recuperación de la cartera.'), CW);
  doc.text(p4, ML, y); y += p4.length * LS + 7;

  doc.text(pdfSafe('Agradecemos su pronta atención y cumplimiento de esta obligación.'), ML, y); y += 8;
  doc.text('Atentamente,', ML, y); y += 18;
  doc.setFont('helvetica','bold');
  doc.text('GRUPO ARENAS S.A.S.', ML, y); y += LS;
  doc.setFont('helvetica','normal');
  doc.text('Área de Cartera y Cobranza', ML, y);
}

/* ══════════════════════════════════════════════════════════
   MÓDULO: CARTAS DE DESOCUPACIÓN (mantener abajo)
══════════════════════════════════════════════════════════ */

function buildDesocPageInDoc(doc, client) {
  const PW = 215.9, ML = 22, MR = 22;
  const CW = PW - ML - MR;
  const LS = 5.6;
  const PH = 279.4;
  const BOT = 18;

  let y = 18;

  if (APP.logoDataUrl) {
    try {
      const lW = 75, lA = APP.logoAspect || 0.28;
      const lH = Math.min(lW * lA, 28);
      doc.addImage(APP.logoDataUrl, 'PNG', ML, y, lW, lH, undefined, 'FAST');
      y += lH + 4;
    } catch (_) { y += 5; }
  } else {
    doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(124,58,237);
    doc.text('ARENAS INMOBILIARIA', ML, y + 8); y += 14;
  }
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3);
  doc.line(ML, y, PW - MR, y); y += 8;

  function chkPageBreak(need) {
    if (y + need > PH - BOT) { doc.addPage('letter','portrait'); y = 18; }
  }

  function wline(text, bold, sz) {
    const s = sz || 10.5;
    chkPageBreak(s * 0.35 + LS);
    doc.setFontSize(s);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(30,41,59);
    doc.text(pdfSafe(text), ML, y); y += LS;
  }

  function wpar(text, indent) {
    const s = 10.5;
    const ind = indent || 0;
    const lines = doc.splitTextToSize(pdfSafe(text), CW - ind);
    lines.forEach(l => { chkPageBreak(LS); doc.text(l, ML + ind, y); y += LS; });
  }

  doc.setFontSize(10.5); doc.setFont('helvetica','normal'); doc.setTextColor(30,41,59);

  wline(v(client.fecha_carta)); y += 7;
  wline('Señor(a): ' + v(client.nombre_cliente), true);
  wline('Dirección: ' + v(client.direccion_cliente));
  wline(v(client.ciudad)); y += 7;
  wpar('Asunto: Requerimiento de entrega voluntaria del inmueble por incumplimiento contractual - Inmueble ' + v(client.direccion_inmueble)); y += 9;
  wline('Cordial saludo.'); y += 6;
  wpar('En nuestra calidad de administradores del inmueble identificado en el asunto, nos permitimos informar que a la fecha usted presenta incumplimiento de las obligaciones derivadas del contrato de arrendamiento suscrito con GRUPO ARENAS S.A.S., consistente en ' + v(client.motivo_incumplimiento) + '.'); y += 4;
  wpar('Actualmente registra una deuda por valor de ' + v(client.valor_deuda_numero) + ' (' + v(client.valor_deuda_letras) + '), suma que deberá ser cancelada junto con los demás valores que se continúen causando hasta la fecha de pago efectivo.'); y += 4;
  wpar('De conformidad con las causales de terminación previstas en la Cláusula Décima del contrato de arrendamiento, y ante el incumplimiento antes descrito, requerimos formalmente la restitución y entrega voluntaria del inmueble a más tardar el día ' + v(client.fecha_limite_entrega) + '.'); y += 4;
  wpar('Así mismo, le informamos que el incumplimiento contractual genera la aplicación de la Cláusula Décima Primera (Cláusula Penal), equivalente a tres (3) cánones de arrendamiento vigentes, sin perjuicio del cobro de los cánones, cuotas de administración, servicios públicos, reparaciones locativas, honorarios de cobranza, perjuicios y demás obligaciones a su cargo establecidas en el contrato y en la ley.'); y += 4;
  wpar('Le recordamos que, conforme a lo pactado contractualmente, para la recepción formal del inmueble deberá cumplir con los siguientes requisitos:'); y += 7;
  wline('REQUISITOS PARA LA ENTREGA DEL INMUEBLE', true); y += 4;
  wline('1. Diligencia de pre inventario', true); y += 2;
  wpar('Un supervisor de la inmobiliaria realizará una visita al inmueble con el fin de verificar su estado general. Como resultado de esta inspección se indicarán las reparaciones locativas o adecuaciones que deban efectuarse antes de la entrega.', 5); y += 4;
  wline('2. Ejecución de reparaciones', true); y += 2;
  wpar('Realizar las reparaciones requeridas en el pre inventario y entregar el inmueble en las condiciones exigidas por el contrato.', 5); y += 4;
  wline('3. Presentación de documentos con una (1) semana de antelación a la entrega', true); y += 2;
  [
    'Fotocopia de las tres (3) últimas facturas de servicios públicos canceladas.',
    'Soportes de pago y paz y salvos correspondientes.',
    'Paz y salvo de administración, incluyendo retroactivos o incrementos aprobados por la copropiedad.',
    'Paz y salvo y/o constancia de retiro de líneas telefónicas, internet, televisión por suscripción y demás servicios contratados.',
    'Copia del último mantenimiento de los aires acondicionados, cuando aplique.',
    'Encontrarse al día en el pago de cánones de arrendamiento y demás obligaciones contractuales.',
  ].forEach(item => wpar('- ' + item, 5));
  y += 4;
  wline('4. Pago de promedios de servicios públicos', true); y += 2;
  wpar('Realizar el pago correspondiente a los promedios de servicios públicos establecidos en el contrato como requisito previo a la recepción del inmueble.', 5); y += 7;
  wpar('Una vez cumplidos los requisitos anteriores, se programará la fecha y hora para la entrega formal del inmueble y la firma del inventario de restitución.'); y += 4;
  wpar('En caso de persistir el incumplimiento o de no efectuarse la entrega voluntaria del inmueble dentro del plazo señalado, nos veremos obligados a iniciar las acciones judiciales correspondientes para obtener la restitución del inmueble y el cobro de todas las sumas adeudadas, incluyendo cláusula penal, intereses, honorarios, gastos de cobranza y costas procesales.'); y += 4;
  wline('Agradecemos su pronta atención y gestión frente a esta situación.'); y += 12;
  wline('Atentamente,'); y += 16;
  chkPageBreak(LS * 2);
  wline('GRUPO ARENAS S.A.S.', true);
  wline('Área Jurídica y de Cartera');
}
