// ========== INICIALIZACIÓN SUPABASE ==========
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========== ELEMENTOS DOM ==========
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const loadingOverlay = document.getElementById('loading');

const inputNumero = document.getElementById('input-numero');
const inputPassword = document.getElementById('input-password');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

// ========== ESTADO ==========
let clienteActual = null;
let ventasCliente = [];
let subscripcionCliente = null;
let subscripcionVentas = null;

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
    const password = inputPassword.value.trim();
    
    if (!numero) {
        loginError.textContent = 'Introduce tu número de caja';
        return;
    }
    
    if (!password) {
        loginError.textContent = 'Introduce tu contraseña';
        return;
    }
    
    loginError.textContent = '';
    showLoading();
    
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('numero', parseInt(numero))
            .maybeSingle();
        
        if (error) {
            loginError.textContent = 'Error de conexión';
            hideLoading();
            return;
        }
        
        if (!data) {
            loginError.textContent = 'No se encontró ninguna caja con ese número';
            hideLoading();
            return;
        }
        
        // Verificar contraseña
        if (data.password && data.password !== password) {
            loginError.textContent = 'Contraseña incorrecta';
            hideLoading();
            return;
        }
        
        // Si no tiene contraseña, la primera que ponga será su contraseña
        if (!data.password) {
            await supabase
                .from('clientes')
                .update({ password: password })
                .eq('numero', parseInt(numero));
            data.password = password;
        }
        
        clienteActual = data;
        
        localStorage.setItem('clienteNumero', data.numero);
        localStorage.setItem('clientePassword', password);
        
        await cargarVentas();
        suscribirseACambios();
        mostrarDatosCliente();
        showScreen(mainScreen);
        
    } catch (err) {
        console.error('Error login:', err);
        loginError.textContent = 'Error al conectar';
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
    
    document.getElementById('header-numero').textContent = `#${clienteActual.numero}`;
    document.getElementById('header-nombre').textContent = clienteActual.nombre || 'Cliente';
    
    const bonoTotal = parseFloat(clienteActual.bono_total) || 0;
    const bonoGastado = parseFloat(clienteActual.bono_gastado) || 0;
    const bonoDisponible = bonoTotal - bonoGastado;
    
    document.getElementById('bono-disponible').textContent = formatMoney(bonoDisponible);
    document.getElementById('bono-total').textContent = formatMoney(bonoTotal);
    document.getElementById('bono-gastado').textContent = formatMoney(bonoGastado);
    
    const pendientes = ventasCliente.filter(v => !v.enviado);
    const totalCompras = ventasCliente.length;
    
    document.getElementById('stat-en-caja').textContent = pendientes.length;
    document.getElementById('stat-total-compras').textContent = totalCompras;
    
    if (clienteActual.ultima_compra) {
        document.getElementById('stat-ultima-compra').textContent = formatDate(clienteActual.ultima_compra);
    } else if (ventasCliente.length > 0) {
        document.getElementById('stat-ultima-compra').textContent = formatDate(ventasCliente[0].fecha);
    }
    
    document.getElementById('estado-caja').textContent = pendientes.length > 0 ? `${pendientes.length} pendientes` : 'Vacía';
    
    renderizarListas();
}

function renderizarListas() {
    const pendientes = ventasCliente.filter(v => !v.enviado);
    const enviados = ventasCliente.filter(v => v.enviado);
    
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
    if (subscripcionCliente) {
        supabase.removeChannel(subscripcionCliente);
        subscripcionCliente = null;
    }
    if (subscripcionVentas) {
        supabase.removeChannel(subscripcionVentas);
        subscripcionVentas = null;
    }
    
    clienteActual = null;
    ventasCliente = [];
    localStorage.removeItem('clienteNumero');
    localStorage.removeItem('clientePassword');
    inputNumero.value = '';
    inputPassword.value = '';
    showScreen(loginScreen);
}

// ========== TABS ==========
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// ========== AUTO-LOGIN ==========
async function checkAutoLogin() {
    const savedNumero = localStorage.getItem('clienteNumero');
    const savedPassword = localStorage.getItem('clientePassword');
    if (savedNumero && savedPassword) {
        inputNumero.value = savedNumero;
        inputPassword.value = savedPassword;
        await login();
    }
}

// ========== TIEMPO REAL ==========
function suscribirseACambios() {
    if (!clienteActual) return;
    
    subscripcionCliente = supabase
        .channel('cliente-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'clientes',
            filter: `numero=eq.${clienteActual.numero}`
        }, (payload) => {
            console.log('Cliente actualizado:', payload);
            if (payload.new) {
                clienteActual = payload.new;
                mostrarDatosCliente();
            }
        })
        .subscribe();
    
    subscripcionVentas = supabase
        .channel('ventas-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'ventas',
            filter: `numero_cliente=eq.${clienteActual.numero}`
        }, async (payload) => {
            console.log('Venta actualizada:', payload);
            await cargarVentas();
            mostrarDatosCliente();
        })
        .subscribe();
    
    console.log('Suscrito a cambios en tiempo real');
}

// ========== SERVICE WORKER ==========
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

inputNumero.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') inputPassword.focus();
});
inputPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});

inputNumero.addEventListener('input', () => {
    loginError.textContent = '';
});
inputPassword.addEventListener('input', () => {
    loginError.textContent = '';
});

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    checkAutoLogin();
});
