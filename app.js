// ========== INICIALIZACIÓN SUPABASE ==========
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========== ELEMENTOS DOM ==========
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const loadingOverlay = document.getElementById('loading');

const inputNumero = document.getElementById('input-numero');
const inputTiktok = document.getElementById('input-tiktok');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

// ========== ESTADO ==========
let clienteActual = null;
let ventasCliente = [];

// ========== HELPERS ==========
function showLoading() {
    loadingOverlay.classList.add('active');
}

function hideLoading() {
    loadingOverlay.classList.remove('active');
}

function formatMoney(amount) {
    const num = parseFloat(amount) || 0;
    return num.toFixed(2).replace('.', ',') + '€';
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
}

function formatDateFull(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function showScreen(screen) {
    loginScreen.classList.remove('active');
    mainScreen.classList.remove('active');
    screen.classList.add('active');
}

// ========== LOGIN ==========
async function login() {
    const numero = inputNumero.value.trim();
    const tiktok = inputTiktok.value.trim().replace('@', '');
    
    if (!numero && !tiktok) {
        loginError.textContent = 'Introduce tu número de caja o usuario TikTok';
        return;
    }
    
    loginError.textContent = '';
    showLoading();
    
    try {
        let query = supabase.from('clientes').select('*');
        
        if (numero) {
            query = query.eq('numero', parseInt(numero));
        } else {
            query = query.ilike('tiktok', `%${tiktok}%`);
        }
        
        const { data, error } = await query.single();
        
        if (error || !data) {
            loginError.textContent = 'No se encontró ninguna caja con esos datos';
            hideLoading();
            return;
        }
        
        clienteActual = data;
        
        // Guardar en localStorage
        localStorage.setItem('clienteNumero', data.numero);
        
        // Cargar ventas
        await cargarVentas();
        
        // Mostrar pantalla principal
        mostrarDatosCliente();
        showScreen(mainScreen);
        
    } catch (err) {
        console.error('Error login:', err);
        loginError.textContent = 'Error al conectar. Inténtalo de nuevo.';
    }
    
    hideLoading();
}

// ========== CARGAR VENTAS ==========
async function cargarVentas() {
    if (!clienteActual) return;
    
    try {
        const { data, error } = await supabase
            .from('ventas')
            .select('*')
            .eq('numero_cliente', clienteActual.numero)
            .order('fecha', { ascending: false });
        
        if (!error && data) {
            ventasCliente = data;
        }
    } catch (err) {
        console.error('Error cargando ventas:', err);
    }
}

// ========== MOSTRAR DATOS ==========
function mostrarDatosCliente() {
    if (!clienteActual) return;
    
    // Header
    document.getElementById('header-numero').textContent = `#${clienteActual.numero}`;
    document.getElementById('header-nombre').textContent = clienteActual.nombre || 'Cliente';
    
    // Bono
    const bonoTotal = parseFloat(clienteActual.bono_total) || 0;
    const bonoGastado = parseFloat(clienteActual.bono_gastado) || 0;
    const bonoDisponible = bonoTotal - bonoGastado;
    
    document.getElementById('bono-disponible').textContent = formatMoney(bonoDisponible);
    document.getElementById('bono-total').textContent = formatMoney(bonoTotal);
    document.getElementById('bono-gastado').textContent = formatMoney(bonoGastado);
    
    // Stats
    const pendientes = ventasCliente.filter(v => !v.enviado);
    const totalCompras = ventasCliente.length;
    
    document.getElementById('stat-en-caja').textContent = pendientes.length;
    document.getElementById('stat-total-compras').textContent = totalCompras;
    
    if (clienteActual.ultima_compra) {
        document.getElementById('stat-ultima-compra').textContent = formatDate(clienteActual.ultima_compra);
    } else if (ventasCliente.length > 0) {
        document.getElementById('stat-ultima-compra').textContent = formatDate(ventasCliente[0].fecha);
    }
    
    // Estado caja
    const estadoCaja = clienteActual.caja_vacia ? 'Vacía' : 'Con artículos';
    document.getElementById('estado-caja').textContent = pendientes.length > 0 ? `${pendientes.length} pendientes` : 'Vacía';
    
    // Listas
    renderizarListas();
}

function renderizarListas() {
    const pendientes = ventasCliente.filter(v => !v.enviado);
    const enviados = ventasCliente.filter(v => v.enviado);
    
    // En caja (pendientes)
    const listaEnCaja = document.getElementById('lista-en-caja');
    const emptyCaja = document.getElementById('empty-caja');
    
    if (pendientes.length === 0) {
        listaEnCaja.style.display = 'none';
        emptyCaja.style.display = 'block';
    } else {
        listaEnCaja.style.display = 'flex';
        emptyCaja.style.display = 'none';
        listaEnCaja.innerHTML = pendientes.map(venta => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${venta.descripcion || 'Artículo'}</div>
                    <div class="item-date">${formatDateFull(venta.fecha)}</div>
                </div>
                <div class="item-status">
                    <span class="item-price">${formatMoney(venta.precio)}</span>
                    <span class="status-badge pendiente">Pendiente</span>
                </div>
            </div>
        `).join('');
    }
    
    // Historial (enviados)
    const listaHistorial = document.getElementById('lista-historial');
    const emptyHistorial = document.getElementById('empty-historial');
    
    if (enviados.length === 0) {
        listaHistorial.style.display = 'none';
        emptyHistorial.style.display = 'block';
    } else {
        listaHistorial.style.display = 'flex';
        emptyHistorial.style.display = 'none';
        listaHistorial.innerHTML = enviados.map(venta => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${venta.descripcion || 'Artículo'}</div>
                    <div class="item-date">${formatDateFull(venta.fecha)}</div>
                </div>
                <div class="item-status">
                    <span class="item-price">${formatMoney(venta.precio)}</span>
                    <span class="status-badge enviado">Enviado ✓</span>
                </div>
            </div>
        `).join('');
    }
}

// ========== LOGOUT ==========
function logout() {
    clienteActual = null;
    ventasCliente = [];
    localStorage.removeItem('clienteNumero');
    inputNumero.value = '';
    inputTiktok.value = '';
    showScreen(loginScreen);
}

// ========== TABS ==========
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            // Activar tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Mostrar panel
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// ========== AUTO-LOGIN ==========
async function checkAutoLogin() {
    const savedNumero = localStorage.getItem('clienteNumero');
    if (savedNumero) {
        inputNumero.value = savedNumero;
        await login();
    }
}

// ========== REFRESH AUTOMÁTICO ==========
function startAutoRefresh() {
    // Refrescar datos cada 30 segundos
    setInterval(async () => {
        if (clienteActual) {
            try {
                // Recargar cliente
                const { data: clienteData } = await supabase
                    .from('clientes')
                    .select('*')
                    .eq('numero', clienteActual.numero)
                    .single();
                
                if (clienteData) {
                    clienteActual = clienteData;
                }
                
                // Recargar ventas
                await cargarVentas();
                
                // Actualizar UI
                mostrarDatosCliente();
            } catch (err) {
                console.error('Error en auto-refresh:', err);
            }
        }
    }, 30000);
}

// ========== SERVICE WORKER (PWA) ==========
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registrado'))
            .catch(err => console.log('SW error:', err));
    });
}

// ========== EVENTOS ==========
btnLogin.addEventListener('click', login);
btnLogout.addEventListener('click', logout);

// Enter para login
inputNumero.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});
inputTiktok.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});

// Limpiar el otro campo al escribir
inputNumero.addEventListener('input', () => {
    inputTiktok.value = '';
    loginError.textContent = '';
});
inputTiktok.addEventListener('input', () => {
    inputNumero.value = '';
    loginError.textContent = '';
});

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    checkAutoLogin();
    startAutoRefresh();
});



