const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const adminScreen = document.getElementById('admin-screen');
const loadingOverlay = document.getElementById('loading');

const inputNumero = document.getElementById('input-numero');
const inputPassword = document.getElementById('input-password');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');
const btnAdminLogout = document.getElementById('btn-admin-logout');

let clienteActual = null;
let ventasCliente = [];
let todasLasVentas = [];
let todosLosClientes = [];
let isAdmin = false;
let clienteEditando = null;

function showLoading() { loadingOverlay.classList.add('active'); }
function hideLoading() { loadingOverlay.classList.remove('active'); }

function formatMoney(amount) {
    return (parseFloat(amount) || 0).toFixed(2).replace('.', ',') + ' EUR';
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    var parts = dateStr.split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1];
    return dateStr;
}

function formatDateFull(dateStr) {
    if (!dateStr) return '--';
    var parts = dateStr.split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    return dateStr;
}

function formatHora(horaStr) {
    if (!horaStr) return '';
    return horaStr.substring(0, 5);
}

function showScreen(screen) {
    loginScreen.classList.remove('active');
    mainScreen.classList.remove('active');
    adminScreen.classList.remove('active');
    screen.classList.add('active');
}

function getHoy() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth()+1).toString().padStart(2,'0') + '-' + d.getDate().toString().padStart(2,'0');
}

function getAyer() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + (d.getMonth()+1).toString().padStart(2,'0') + '-' + d.getDate().toString().padStart(2,'0');
}

function getInicioSemana() {
    var d = new Date();
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.getFullYear() + '-' + (d.getMonth()+1).toString().padStart(2,'0') + '-' + d.getDate().toString().padStart(2,'0');
}

function getInicioMes() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth()+1).toString().padStart(2,'0') + '-01';
}

function getNombreCliente(numeroCliente) {
    var cliente = todosLosClientes.find(function(c) { return c.numero == numeroCliente; });
    return cliente ? cliente.nombre : 'Cliente #' + numeroCliente;
}

async function recargarDatosAdmin() {
    await cargarDatosAdmin();
    alert('Datos recargados - Total ventas: ' + todasLasVentas.length);
}

async function recargarDatosCliente() {
    if (!clienteActual) return;
    var btnRecargar = document.getElementById('btn-recargar-cliente');
    if (btnRecargar) btnRecargar.classList.add('rotating');
    showLoading();
    try {
        // Recargar datos del cliente desde Supabase
        var resp = await supabase.from('clientes').select('*').eq('numero', clienteActual.numero).maybeSingle();
        if (resp.data) {
            clienteActual = resp.data;
        }
        // Recargar ventas
        await cargarVentas();
        // Actualizar la pantalla
        mostrarDatosCliente();
    } catch (err) {
        console.error('Error al recargar:', err);
    }
    hideLoading();
    if (btnRecargar) btnRecargar.classList.remove('rotating');
}

async function login() {
    var numero = inputNumero.value.trim();
    var password = inputPassword.value.trim();
    if (!numero) { loginError.textContent = 'Introduce tu numero de caja'; return; }
    loginError.textContent = '';
    showLoading();
    if (numero.toLowerCase() === 'admin') {
        if (password === ADMIN_PASSWORD) {
            isAdmin = true;
            await cargarDatosAdmin();
            showScreen(adminScreen);
        } else { loginError.textContent = 'Contrasena de admin incorrecta'; }
        hideLoading();
        return;
    }
    try {
        var resp = await supabase.from('clientes').select('*').eq('numero', parseInt(numero)).maybeSingle();
        if (resp.error) { loginError.textContent = 'Error de conexion'; hideLoading(); return; }
        if (!resp.data) { loginError.textContent = 'No se encontro esa caja'; hideLoading(); return; }
        var data = resp.data;
        if (data.password) {
            if (!password) { loginError.textContent = 'Introduce tu contrasena'; hideLoading(); return; }
            if (data.password !== password) { loginError.textContent = 'Contrasena incorrecta'; hideLoading(); return; }
        }
        // Si no tiene contraseña, no dejarlo entrar - primero debe crearla
        if (!data.password) {
            clienteActual = data;
            hideLoading();
            mostrarPopupCrearPassword();
            return;
        }
        clienteActual = data;
        localStorage.setItem('clienteNumero', data.numero);
        localStorage.setItem('clientePassword', password);
        await cargarVentas();
        mostrarDatosCliente();
        showScreen(mainScreen);
    } catch (err) { loginError.textContent = 'Error al conectar'; }
    hideLoading();
}

async function cargarVentas() {
    if (!clienteActual) return;
    try {
        var resp = await supabase.from('ventas').select('*').eq('numero_cliente', clienteActual.numero).order('fecha', { ascending: false });
        if (!resp.error && resp.data) ventasCliente = resp.data;
    } catch (err) {}
}

function mostrarDatosCliente() {
    if (!clienteActual) return;
    document.getElementById('header-numero').textContent = '#' + clienteActual.numero;
    document.getElementById('header-nombre').textContent = clienteActual.nombre || 'Cliente';
    var bonoTotal = parseFloat(clienteActual.bono_total) || 0;
    // CALCULAR bono gastado sumando las ventas (siempre actualizado)
    var bonoGastado = 0;
    for (var i = 0; i < ventasCliente.length; i++) {
        bonoGastado += parseFloat(ventasCliente[i].precio) || 0;
    }
    var bonoDisponible = bonoTotal - bonoGastado;
    if (bonoDisponible < 0) bonoDisponible = 0;
    document.getElementById('bono-disponible').textContent = formatMoney(bonoDisponible);
    document.getElementById('bono-total').textContent = formatMoney(bonoTotal);
    document.getElementById('bono-gastado').textContent = formatMoney(bonoGastado);
    var pendientes = ventasCliente.filter(function(v) { return !v.enviado; });
    document.getElementById('stat-en-caja').textContent = pendientes.length;
    document.getElementById('stat-total-compras').textContent = ventasCliente.length;
    if (ventasCliente.length > 0) document.getElementById('stat-ultima-compra').textContent = formatDate(ventasCliente[0].fecha);
    document.getElementById('estado-caja').textContent = pendientes.length > 0 ? pendientes.length + ' pendientes' : 'Vacia';
    renderizarListas();
}

function renderizarListas() {
    var pendientes = ventasCliente.filter(function(v) { return !v.enviado; });
    var enviados = ventasCliente.filter(function(v) { return v.enviado; });
    var listaEnCaja = document.getElementById('lista-en-caja');
    var emptyCaja = document.getElementById('empty-caja');
    if (pendientes.length === 0) { listaEnCaja.style.display = 'none'; emptyCaja.style.display = 'block'; }
    else {
        listaEnCaja.style.display = 'flex'; emptyCaja.style.display = 'none';
        var html = '';
        for (var i = 0; i < pendientes.length; i++) {
            var v = pendientes[i];
            html += '<div class="item-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + formatDateFull(v.fecha) + '</div></div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge pendiente">Pendiente</span></div></div>';
        }
        listaEnCaja.innerHTML = html;
    }
    var listaHistorial = document.getElementById('lista-historial');
    var emptyHistorial = document.getElementById('empty-historial');
    if (enviados.length === 0) { listaHistorial.style.display = 'none'; emptyHistorial.style.display = 'block'; }
    else {
        listaHistorial.style.display = 'flex'; emptyHistorial.style.display = 'none';
        var html = '';
        for (var i = 0; i < enviados.length; i++) {
            var v = enviados[i];
            html += '<div class="item-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + formatDateFull(v.fecha) + '</div></div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge enviado">Enviado</span></div></div>';
        }
        listaHistorial.innerHTML = html;
    }
}
