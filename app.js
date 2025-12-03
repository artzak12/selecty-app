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
function showLoading() { loadingOverlay.classList.add('active'); }
function hideLoading() { loadingOverlay.classList.remove('active'); }

function formatMoney(amount) {
    const num = parseFloat(amount) || 0;
    return num.toFixed(2).replace('.', ',') + '€';
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}`;
}

function formatDateFull(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
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
        
        // Si tiene contraseña, verificarla
        if (data.password) {
            if (!password) {
                loginError.textContent = 'Introduce tu contraseña';
                hideLoading();
                return;
            }
            if (data.password !== password) {
                loginError.textContent = 'Contraseña incorrecta';
                hideLoading();
                return;
            }
        }
        
        clienteActual = data;
        localStorage.setItem('clienteNumero', data.numero);
        if (data.password) {
            localStorage.setItem('clientePassword', password);
        }
        
        await cargarVentas();
        suscribirseACambios();
        mostrarDatosCliente();
        showScreen(mainScreen);
        
        // Si no tiene contraseña, mostrar popup para crearla
        if (!data.password) {
            setTimeout(() => mostrarPopupCrearPassword(), 500);
        }
        
    } catch (err) {
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
        if (!error && data) ventasCliente = data;
    } catch (err) { console.error('Error cargando ventas:', err); }
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
    document.getElementById('stat-en-caja').textContent = pendientes.length;
    document.getElementById('stat-total-compras').textContent = ventasCliente.length;
    
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
        listaEnCaja.innerHTML = pendientes.map(v => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${v.descripcion || 'Artículo'}</div>
                    <div class="item-date">${formatDateFull(v.fecha)}</div>
                </div>
                <div class="item-status">
                    <span class="item-price">${formatMoney(v.precio)}</span>
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
        listaHistorial.innerHTML = enviados.map(v => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${v.descripcion || 'Artículo'}</div>
                    <div class="item-date">${formatDateFull(v.fecha)}</div>
                </div>
                <div class="item-status">
                    <span class="item-price">${formatMoney(v.precio)}</span>
                    <span class="status-badge enviado">Enviado ✓</span>
                </div>
            </div>
        `).join('');
    }
}

// ========== LOGOUT ==========
function logout() {
    if (subscripcionCliente) { supabase.removeChannel(subscripcionCliente); subscripcionCliente = null; }
    if (subscripcionVentas) { supabase.removeChannel(subscripcionVentas); subscripcionVentas = null; }
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
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
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
    if (savedNumero) {
        inputNumero.value = savedNumero;
        if (savedPassword) inputPassword.value = savedPassword;
        await login();
    }
}

// ========== POPUP CREAR CONTRASEÑA ==========
function mostrarPopupCrearPassword() {
    const popup = document.getElementById('popup-password');
    if (popup) popup.classList.add('active');
}

function cerrarPopupPassword() {
    const popup = document.getElementById('popup-password');
    if (popup) popup.classList.remove('active');
}

async function guardarNuevaPassword() {
    const password = document.getElementById('nueva-password').value.trim();
    const confirmPassword = document.getElementById('confirmar-password').value.trim();
    const errorMsg = document.getElementById('password-error');
    
    if (!password) { errorMsg.textContent = 'Introduce una contraseña'; return; }
    if (password.length < 4) { errorMsg.textContent = 'Mínimo 4 caracteres'; return; }
    if (password !== confirmPassword) { errorMsg.textContent = 'Las contraseñas no coinciden'; return; }
    
    errorMsg.textContent = '';
    
    try {
        const { error } = await supabase
            .from('clientes')
            .update({ password: password })
            .eq('numero', clienteActual.numero);
        
        if (error) { errorMsg.textContent = 'Error al guardar'; return; }
        
        clienteActual.password = password;
        localStorage.setItem('clientePassword', password);
        cerrarPopupPassword();
    } catch (err) {
        errorMsg.textContent = 'Error de conexión';
    }
}

// ========== TIEMPO REAL ==========
function suscribirseACambios() {
    if (!clienteActual) return;
    
    subscripcionCliente = supabase
        .channel('cliente-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes', filter: `numero=eq.${clienteActual.numero}` },
            (payload) => { if (payload.new) { clienteActual = payload.new; mostrarDatosCliente(); } })
        .subscribe();
    
    subscripcionVentas = supabase
        .channel('ventas-changes
