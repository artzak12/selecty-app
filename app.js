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
    var d = new Date(dateStr);
    return d.getDate().toString().padStart(2,'0') + '/' + (d.getMonth()+1).toString().padStart(2,'0');
}

function formatDateFull(dateStr) {
    if (!dateStr) return '--';
    var d = new Date(dateStr);
    return d.getDate().toString().padStart(2,'0') + '/' + (d.getMonth()+1).toString().padStart(2,'0') + '/' + d.getFullYear();
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

async function recargarDatosAdmin() {
    await cargarDatosAdmin();
    alert('Datos recargados - Total ventas: ' + todasLasVentas.length);
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
        } else {
            loginError.textContent = 'Contrasena de admin incorrecta';
        }
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
        
        clienteActual = data;
        localStorage.setItem('clienteNumero', data.numero);
        if (data.password) localStorage.setItem('clientePassword', password);
        
        await cargarVentas();
        mostrarDatosCliente();
        showScreen(mainScreen);
        
        if (!data.password) setTimeout(mostrarPopupCrearPassword, 500);
        
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
    var bonoGastado = parseFloat(clienteActual.bono_gastado) || 0;
    
    document.getElementById('bono-disponible').textContent = formatMoney(bonoTotal - bonoGastado);
    document.getElementById('bono-total').textContent = formatMoney(bonoTotal);
    document.getElementById('bono-gastado').textContent = formatMoney(bonoGastado);
    
    var pendientes = ventasCliente.filter(function(v) { return !v.enviado; });
    document.getElementById('stat-en-caja').textContent = pendientes.length;
    document.getElementById('stat-total-compras').textContent = ventasCliente.length;
    
    if (ventasCliente.length > 0) {
        document.getElementById('stat-ultima-compra').textContent = formatDate(ventasCliente[0].fecha);
    }
    
    document.getElementById('estado-caja').textContent = pendientes.length > 0 ? pendientes.length + ' pendientes' : 'Vacia';
    renderizarListas();
}

function renderizarListas() {
    var pendientes = ventasCliente.filter(function(v) { return !v.enviado; });
    var enviados = ventasCliente.filter(function(v) { return v.enviado; });
    
    var listaEnCaja = document.getElementById('lista-en-caja');
    var emptyCaja = document.getElementById('empty-caja');
    
    if (pendientes.length === 0) {
        listaEnCaja.style.display = 'none';
        emptyCaja.style.display = 'block';
    } else {
        listaEnCaja.style.display = 'flex';
        emptyCaja.style.display = 'none';
        var html = '';
        for (var i = 0; i < pendientes.length; i++) {
            var v = pendientes[i];
            html += '<div class="item-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + formatDateFull(v.fecha) + '</div></div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge pendiente">Pendiente</span></div></div>';
        }
        listaEnCaja.innerHTML = html;
    }
    
    var listaHistorial = document.getElementById('lista-historial');
    var emptyHistorial = document.getElementById('empty-historial');
    
    if (enviados.length === 0) {
        listaHistorial.style.display = 'none';
        emptyHistorial.style.display = 'block';
    } else {
        listaHistorial.style.display = 'flex';
        emptyHistorial.style.display = 'none';
        var html = '';
        for (var i = 0; i < enviados.length; i++) {
            var v = enviados[i];
            html += '<div class="item-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + formatDateFull(v.fecha) + '</div></div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge enviado">Enviado</span></div></div>';
        }
        listaHistorial.innerHTML = html;
    }
}

function logout() {
    clienteActual = null;
    ventasCliente = [];
    isAdmin = false;
    localStorage.removeItem('clienteNumero');
    localStorage.removeItem('clientePassword');
    inputNumero.value = '';
    inputPassword.value = '';
    showScreen(loginScreen);
}

function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].onclick = function() {
            var tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
            document.getElementById('tab-' + tabId).classList.add('active');
        };
    }
}

function initAdminTabs() {
    var tabs = document.querySelectorAll('.admin-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].onclick = function() {
            var tabId = this.getAttribute('data-admin-tab');
            if (!tabId) return;
            document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            document.querySelectorAll('.admin-panel').forEach(function(p) { p.classList.remove('active'); });
            document.getElementById('admin-' + tabId).classList.add('active');
        };
    }
}

async function checkAutoLogin() {
    var savedNumero = localStorage.getItem('clienteNumero');
    var savedPassword = localStorage.getItem('clientePassword');
    if (savedNumero) {
        inputNumero.value = savedNumero;
        if (savedPassword) inputPassword.value = savedPassword;
        await login();
    }
}

function mostrarPopupCrearPassword() {
    var popup = document.getElementById('popup-password');
    if (popup) popup.classList.add('active');
}

function cerrarPopupPassword() {
    var popup = document.getElementById('popup-password');
    if (popup) popup.classList.remove('active');
}

async function guardarNuevaPassword() {
    var password = document.getElementById('nueva-password').value.trim();
    var confirmPassword = document.getElementById('confirmar-password').value.trim();
    var errorMsg = document.getElementById('password-error');
    
    if (!password) { errorMsg.textContent = 'Introduce una contrasena'; return; }
    if (password.length < 4) { errorMsg.textContent = 'Minimo 4 caracteres'; return; }
    if (password !== confirmPassword) { errorMsg.textContent = 'No coinciden'; return; }
    
    try {
        await supabase.from('clientes').update({ password: password }).eq('numero', clienteActual.numero);
        clienteActual.password = password;
        localStorage.setItem('clientePassword', password);
        cerrarPopupPassword();
    } catch (err) { errorMsg.textContent = 'Error'; }
}

async function cargarDatosAdmin() {
    showLoading();
    try {
        var resp1 = await supabase.from('ventas').select('*').order('fecha', { ascending: false });
        todasLasVentas = resp1.data || [];
        console.log('Total ventas cargadas:', todasLasVentas.length);
        
        var resp2 = await supabase.from('clientes').select('*').order('numero', { ascending: true });
        todosLosClientes = resp2.data || [];
        
        actualizarDashboard();
        mostrarListaClientes();
        mostrarListaVentas();
    } catch (err) { console.error('Error:', err); }
    hideLoading();
}

function sumarPrecios(arr) {
    var total = 0;
    for (var i = 0; i < arr.length; i++) total += parseFloat(arr[i].precio) || 0;
    return total;
}

function actualizarDashboard() {
    var hoy = getHoy();
    var ayer = getAyer();
    var inicioSemana = getInicioSemana();
    var inicioMes = getInicioMes();
    
    console.log('Fechas - Hoy:', hoy, 'Semana desde:', inicioSemana);
    
    var ventasHoy = todasLasVentas.filter(function(v) { return v.fecha === hoy; });
    var ventasAyer = todasLasVentas.filter(function(v) { return v.fecha === ayer; });
    var ventasSemana = todasLasVentas.filter(function(v) { return v.fecha >= inicioSemana; });
    var ventasMes = todasLasVentas.filter(function(v) { return v.fecha >= inicioMes; });
    
    console.log('Ventas semana:', ventasSemana.length, '- Total:', sumarPrecios(ventasSemana).toFixed(2));
    
    document.getElementById('admin-ventas-hoy').textContent = ventasHoy.length;
    document.getElementById('admin-total-hoy').textContent = formatMoney(sumarPrecios(ventasHoy));
    document.getElementById('admin-ventas-ayer').textContent = ventasAyer.length;
    document.getElementById('admin-total-ayer').textContent = formatMoney(sumarPrecios(ventasAyer));
    document.getElementById('admin-ventas-semana').textContent = ventasSemana.length;
    document.getElementById('admin-total-semana').textContent = formatMoney(sumarPrecios(ventasSemana));
    document.getElementById('admin-ventas-mes').textContent = ventasMes.length;
    document.getElementById('admin-total-mes').textContent = formatMoney(sumarPrecios(ventasMes));
    
    var ventasManana = ventasHoy.filter(function(v) { var h = parseInt((v.hora || '12:00').split(':')[0]); return h >= 8 && h < 16; });
    var ventasTarde = ventasHoy.filter(function(v) { var h = parseInt((v.hora || '12:00').split(':')[0]); return h >= 16 || h < 8; });
    
    document.getElementById('turno-manana-ventas').textContent = ventasManana.length + ' ventas';
    document.getElementById('turno-manana-total').textContent = formatMoney(sumarPrecios(ventasManana));
    document.getElementById('turno-tarde-ventas').textContent = ventasTarde.length + ' ventas';
    document.getElementById('turno-tarde-total').textContent = formatMoney(sumarPrecios(ventasTarde));
    
    var clienteGastos = {};
    for (var i = 0; i < todasLasVentas.length; i++) {
        var v = todasLasVentas[i];
        if (!clienteGastos[v.numero_cliente]) clienteGastos[v.numero_cliente] = 0;
        clienteGastos[v.numero_cliente] += parseFloat(v.precio) || 0;
    }
    
    var ranking = [];
    for (var num in clienteGastos) {
        var cliente = todosLosClientes.find(function(c) { return c.numero == num; });
        ranking.push({ numero: num, nombre: cliente ? cliente.nombre : 'Cliente ' + num, total: clienteGastos[num] });
    }
    ranking.sort(function(a, b) { return b.total - a.total; });
    ranking = ranking.slice(0, 5);
    
    var topHtml = '';
    for (var i = 0; i < ranking.length; i++) {
        var r = ranking[i];
        var posClass = i === 0 ? 'oro' : (i === 1 ? 'plata' : (i === 2 ? 'bronce' : 'normal'));
        topHtml += '<div class="top-cliente"><div class="top-posicion ' + posClass + '">' + (i+1) + '</div><div class="top-info"><div class="top-nombre">' + r.nombre + '</div><div class="top-numero">#' + r.numero + '</div></div><div class="top-total">' + formatMoney(r.total) + '</div></div>';
    }
    document.getElementById('top-clientes').innerHTML = topHtml || '<p style="color:#888;">Sin datos</p>';
}

function mostrarListaClientes() {
    var html = '';
    for (var i = 0; i < todosLosClientes.length; i++) {
        var c = todosLosClientes[i];
        var bono = (parseFloat(c.bono_total) || 0) - (parseFloat(c.bono_gastado) || 0);
        html += '<div class="cliente-mini" onclick="buscarClientePorNumero(' + c.numero + ')"><span class="cliente-mini-num">#' + c.numero + '</span><span class="cliente-mini-nombre">' + (c.nombre || 'Sin nombre') + '</span><span class="cliente-mini-bono">' + formatMoney(bono) + '</span></div>';
    }
    document.getElementById('lista-todos-clientes').innerHTML = html || '<p style="color:#888;">No hay clientes</p>';
}

function buscarClientePorNumero(num) {
    var cliente = todosLosClientes.find(function(c) { return c.numero == num; });
    if (cliente) mostrarClienteParaEditar(cliente);
}

function buscarCliente() {
    var texto = document.getElementById('admin-buscar-cliente').value.trim().toLowerCase();
    if (!texto) return;
    var cliente = todosLosClientes.find(function(c) { return c.numero == texto || (c.nombre && c.nombre.toLowerCase().indexOf(texto) >= 0); });
    if (cliente) mostrarClienteParaEditar(cliente);
    else { document.getElementById('cliente-resultado').style.display = 'none'; alert('No encontrado'); }
}

function mostrarClienteParaEditar(cliente) {
    clienteEditando = cliente;
    document.getElementById('cliente-resultado').style.display = 'block';
    document.getElementById('edit-cliente-num').textContent = '#' + cliente.numero;
    document.getElementById('edit-cliente-nombre').textContent = cliente.nombre || 'Sin nombre';
    document.getElementById('edit-nombre').value = cliente.nombre || '';
    document.getElementById('edit-bono-total').value = cliente.bono_total || 0;
    document.getElementById('edit-bono-gastado').value = cliente.bono_gastado || 0;
    document.getElementById('edit-password').value = cliente.password || '';
    document.getElementById('edit-cliente-msg').innerHTML = '';
}

async function guardarCambiosCliente() {
    if (!clienteEditando) return;
    try {
        await supabase.from('clientes').update({
            nombre: document.getElementById('edit-nombre').value.trim(),
            bono_total: parseFloat(document.getElementById('edit-bono-total').value) || 0,
            bono_gastado: parseFloat(document.getElementById('edit-bono-gastado').value) || 0,
            password: document.getElementById('edit-password').value.trim() || null
        }).eq('numero', clienteEditando.numero);
        document.getElementById('edit-cliente-msg').innerHTML = '<div class="msg success">Guardado</div>';
        await cargarDatosAdmin();
    } catch (err) { document.getElementById('edit-cliente-msg').innerHTML = '<div class="msg error">Error</div>'; }
}

function mostrarListaVentas() {
    var ventas = todasLasVentas.slice();
    var filtroFecha = document.getElementById('filtro-fecha').value;
    
    if (filtroFecha === 'hoy') ventas = ventas.filter(function(v) { return v.fecha === getHoy(); });
    else if (filtroFecha === 'ayer') ventas = ventas.filter(function(v) { return v.fecha === getAyer(); });
    else if (filtroFecha === 'semana') ventas = ventas.filter(function(v) { return v.fecha >= getInicioSemana(); });
    else if (filtroFecha === 'mes') ventas = ventas.filter(function(v) { return v.fecha >= getInicioMes(); });
    
    var filtroCliente = document.getElementById('filtro-cliente').value.trim().toLowerCase();
    if (filtroCliente) {
        ventas = ventas.filter(function(v) { return v.numero_cliente == filtroCliente || (v.descripcion && v.descripcion.toLowerCase().indexOf(filtroCliente) >= 0); });
    }
    
    var html = '';
    for (var i = 0; i < Math.min(ventas.length, 100); i++) {
        var v = ventas[i];
        var cliente = todosLosClientes.find(function(c) { return c.numero == v.numero_cliente; });
        html += '<div class="venta-admin-item"><span class="venta-fecha">' + formatDate(v.fecha) + '</span><span class="venta-cliente">' + (cliente ? cliente.nombre : '#' + v.numero_cliente) + '</span><span class="venta-desc">' + (v.descripcion || '-') + '</span><span class="venta-precio">' + formatMoney(v.precio) + '</span><button class="venta-delete" onclick="borrarVentaAdmin(' + v.id + ')">🗑️</button></div>';
    }
    document.getElementById('ventas-lista').innerHTML = html || '<p style="color:#888;padding:20px;">No hay ventas</p>';
}

async function borrarVentaAdmin(ventaId) {
    if (!confirm('Borrar esta venta?')) return;
    try {
        await supabase.from('ventas').delete().eq('id', ventaId);
        todasLasVentas = todasLasVentas.filter(function(v) { return v.id !== ventaId; });
        mostrarListaVentas();
        actualizarDashboard();
    } catch (err) { alert('Error'); }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() { navigator.serviceWorker.register('sw.js').catch(function() {}); });
}

btnLogin.addEventListener('click', login);
btnLogout.addEventListener('click', logout);
btnAdminLogout.addEventListener('click', logout);
inputNumero.addEventListener('keypress', function(e) { if (e.key === 'Enter') inputPassword.focus(); });
inputPassword.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
document.getElementById('btn-buscar-cliente').addEventListener('click', buscarCliente);
document.getElementById('admin-buscar-cliente').addEventListener('keypress', function(e) { if (e.key === 'Enter') buscarCliente(); });
document.getElementById('btn-guardar-cliente').addEventListener('click', guardarCambiosCliente);
document.getElementById('btn-filtrar-ventas').addEventListener('click', mostrarListaVentas);
document.getElementById('filtro-fecha').addEventListener('change', mostrarListaVentas);

document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initAdminTabs();
    checkAutoLogin();
});
