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
let todosLosBonos = [];
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
        // Solo guardar si "Recordarme" está marcado
        var recordarme = document.getElementById('recordarme');
        if (recordarme && recordarme.checked) {
            localStorage.setItem('clienteNumero', data.numero);
            localStorage.setItem('clientePassword', password);
        } else {
            localStorage.removeItem('clienteNumero');
            localStorage.removeItem('clientePassword');
        }
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
    // Solo mostrar el saldo disponible (sin desglose)
    document.getElementById('bono-disponible').textContent = formatMoney(bonoDisponible);
    // Pendientes = productos SIN seguimiento (aún no enviados)
    var pendientes = ventasCliente.filter(function(v) { return !v.seguimiento; });
    document.getElementById('stat-en-caja').textContent = pendientes.length;
    document.getElementById('stat-total-compras').textContent = ventasCliente.length;
    if (ventasCliente.length > 0) document.getElementById('stat-ultima-compra').textContent = formatDate(ventasCliente[0].fecha);
    document.getElementById('estado-caja').textContent = pendientes.length > 0 ? pendientes.length + ' pendientes' : 'Vacia';
    renderizarListas();
    cargarBonosCliente();
    cargarProximoLive();
    cargarOfertas();
}

function renderizarListas() {
    // Pendientes = SIN seguimiento (no enviados)
    var pendientes = ventasCliente.filter(function(v) { return !v.seguimiento; });
    // Enviados = CON seguimiento
    var enviados = ventasCliente.filter(function(v) { return v.seguimiento; });
    
    var listaEnCaja = document.getElementById('lista-en-caja');
    var emptyCaja = document.getElementById('empty-caja');
    if (pendientes.length === 0) { listaEnCaja.style.display = 'none'; emptyCaja.style.display = 'block'; }
    else {
        listaEnCaja.style.display = 'flex'; emptyCaja.style.display = 'none';
        var html = '';
        for (var i = 0; i < pendientes.length; i++) {
            var v = pendientes[i];
            html += '<div class="item-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + formatDateFull(v.fecha) + '</div></div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge pendiente">En caja</span></div></div>';
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
            var seguimientoHtml = '';
            if (v.seguimiento) {
                seguimientoHtml = '<a href="https://mygls.gls-spain.es/e/' + v.seguimiento + '/03130" target="_blank" class="seguimiento-link">📦 ' + v.seguimiento + '</a>';
            }
            html += '<div class="item-card enviado-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + formatDateFull(v.fecha) + '</div>' + seguimientoHtml + '</div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge enviado">Enviado</span></div></div>';
        }
        listaHistorial.innerHTML = html;
    }
}

async function cargarBonosCliente() {
    if (!clienteActual) return;
    try {
        // Cargar bonos del cliente desde log_bonos
        var resp = await supabase
            .from('log_bonos')
            .select('*')
            .eq('numero', clienteActual.numero)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false });
        
        var listaBonos = document.getElementById('lista-bonos');
        var emptyBonos = document.getElementById('empty-bonos');
        
        if (!resp.data || resp.data.length === 0) {
            listaBonos.style.display = 'none';
            emptyBonos.style.display = 'block';
            return;
        }
        
        listaBonos.style.display = 'flex';
        emptyBonos.style.display = 'none';
        
        var html = '';
        for (var i = 0; i < resp.data.length; i++) {
            var bono = resp.data[i];
            var fecha = formatDateFull(bono.fecha);
            var importe = parseFloat(bono.importe) || 0;
            html += '<div class="item-card bono-card-item">';
            html += '<div class="item-info">';
            html += '<div class="item-name">Bono ' + importe.toFixed(0) + ' EUR</div>';
            html += '<div class="item-date">' + fecha + '</div>';
            html += '</div>';
            html += '<div class="item-status">';
            html += '<span class="bono-check">✓</span>';
            html += '</div>';
            html += '</div>';
        }
        listaBonos.innerHTML = html;
    } catch (err) {
        console.error('Error cargando bonos:', err);
    }
}

async function cargarProximoLive() {
    try {
        var hoy = getHoy();
        // Buscar lives activos con fecha >= hoy, ordenados por fecha
        var resp = await supabase
            .from('proximos_lives')
            .select('*')
            .eq('activo', true)
            .gte('fecha', hoy)
            .order('fecha', { ascending: true })
            .order('hora', { ascending: true })
            .limit(1);
        
        var seccionLives = document.getElementById('seccion-lives');
        var contenido = document.getElementById('proximo-live-content');
        
        if (!resp.data || resp.data.length === 0) {
            // No hay lives programados
            contenido.innerHTML = '<div class="live-info"><div class="live-titulo">Sin LIVE programado</div><div class="live-fecha">¡Estate atento a nuestras redes!</div></div>';
            return;
        }
        
        var live = resp.data[0];
        var fechaLive = formatDateFull(live.fecha);
        var horaLive = live.hora ? live.hora.substring(0, 5) : '';
        
        var html = '<div class="live-info">';
        html += '<div class="live-titulo">' + (live.titulo || 'LIVE en directo') + '</div>';
        html += '<div class="live-fecha">📅 ' + fechaLive + ' a las ' + horaLive + '</div>';
        if (live.descripcion) {
            html += '<div class="live-descripcion">' + live.descripcion + '</div>';
        }
        html += '</div>';
        html += '<div class="live-icon-big">📺</div>';
        
        contenido.innerHTML = html;
    } catch (err) {
        console.error('Error cargando lives:', err);
    }
}

async function cargarOfertas() {
    try {
        var hoy = getHoy();
        // Buscar ofertas activas
        var resp = await supabase
            .from('ofertas')
            .select('*')
            .eq('activo', true)
            .order('created_at', { ascending: false });
        
        var seccionOfertas = document.getElementById('seccion-ofertas');
        var listaOfertas = document.getElementById('lista-ofertas');
        
        if (!resp.data || resp.data.length === 0) {
            seccionOfertas.style.display = 'none';
            return;
        }
        
        // Filtrar por fecha si tienen fecha_fin
        var ofertasValidas = resp.data.filter(function(o) {
            if (o.fecha_fin && o.fecha_fin < hoy) return false;
            if (o.fecha_inicio && o.fecha_inicio > hoy) return false;
            return true;
        });
        
        if (ofertasValidas.length === 0) {
            seccionOfertas.style.display = 'none';
            return;
        }
        
        seccionOfertas.style.display = 'block';
        
        var html = '';
        for (var i = 0; i < ofertasValidas.length; i++) {
            var oferta = ofertasValidas[i];
            html += '<div class="oferta-card">';
            html += '<div class="oferta-icon">🎁</div>';
            html += '<div class="oferta-info">';
            html += '<div class="oferta-titulo">' + oferta.titulo + '</div>';
            if (oferta.descripcion) {
                html += '<div class="oferta-descripcion">' + oferta.descripcion + '</div>';
            }
            if (oferta.codigo) {
                html += '<div class="oferta-codigo">Código: <strong>' + oferta.codigo + '</strong></div>';
            }
            html += '</div>';
            html += '</div>';
        }
        listaOfertas.innerHTML = html;
    } catch (err) {
        console.error('Error cargando ofertas:', err);
    }
}

function logout() {
    clienteActual = null; ventasCliente = []; isAdmin = false;
    localStorage.removeItem('clienteNumero'); localStorage.removeItem('clientePassword');
    inputNumero.value = ''; inputPassword.value = '';
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
    var recordarme = document.getElementById('recordarme');
    if (savedNumero) {
        inputNumero.value = savedNumero;
        if (savedPassword) inputPassword.value = savedPassword;
        if (recordarme) recordarme.checked = true;
        await login();
    }
}

let telefonoVerificado = false;

function mostrarPopupCrearPassword() {
    telefonoVerificado = false;
    var popup = document.getElementById('popup-password');
    if (popup) {
        popup.classList.add('active');
        // Resetear estado
        document.getElementById('verificar-telefono').value = '';
        document.getElementById('nueva-password').value = '';
        document.getElementById('confirmar-password').value = '';
        document.getElementById('password-error').textContent = '';
        document.getElementById('password-fields').style.display = 'none';
        document.getElementById('btn-verificar-tel').style.display = 'block';
        document.getElementById('btn-guardar-pwd').style.display = 'none';
    }
}

function cerrarPopupPassword() {
    var popup = document.getElementById('popup-password');
    if (popup) popup.classList.remove('active');
    telefonoVerificado = false;
}

function verificarTelefono() {
    var digitos = document.getElementById('verificar-telefono').value.trim();
    var errorMsg = document.getElementById('password-error');
    
    if (!digitos || digitos.length !== 4) {
        errorMsg.textContent = 'Introduce los 4 ultimos digitos';
        return;
    }
    
    // Obtener teléfono del cliente
    var telefono = clienteActual.telefono || '';
    telefono = telefono.replace(/\s/g, '').replace(/-/g, '').replace(/\+/g, '');
    
    if (telefono.length < 4) {
        errorMsg.textContent = 'No tienes telefono registrado. Contacta con soporte.';
        return;
    }
    
    var ultimos4 = telefono.slice(-4);
    
    if (digitos !== ultimos4) {
        errorMsg.textContent = 'Los digitos no coinciden. Intentalo de nuevo.';
        return;
    }
    
    // Verificación correcta
    telefonoVerificado = true;
    errorMsg.textContent = '';
    document.getElementById('password-fields').style.display = 'block';
    document.getElementById('btn-verificar-tel').style.display = 'none';
    document.getElementById('btn-guardar-pwd').style.display = 'block';
    document.getElementById('nueva-password').focus();
}

async function guardarNuevaPassword() {
    var errorMsg = document.getElementById('password-error');
    
    if (!telefonoVerificado) {
        errorMsg.textContent = 'Primero verifica tu telefono';
        return;
    }
    
    var password = document.getElementById('nueva-password').value.trim();
    var confirmPassword = document.getElementById('confirmar-password').value.trim();
    
    if (!password) { errorMsg.textContent = 'Introduce una contrasena'; return; }
    if (password.length < 4) { errorMsg.textContent = 'Minimo 4 caracteres'; return; }
    if (password !== confirmPassword) { errorMsg.textContent = 'Las contrasenas no coinciden'; return; }
    
    try {
        await supabase.from('clientes').update({ password: password }).eq('numero', clienteActual.numero);
        clienteActual.password = password;
        // Solo guardar si "Recordarme" está marcado
        var recordarme = document.getElementById('recordarme');
        if (recordarme && recordarme.checked) {
            localStorage.setItem('clienteNumero', clienteActual.numero);
            localStorage.setItem('clientePassword', password);
        }
        cerrarPopupPassword();
        await cargarVentas();
        mostrarDatosCliente();
        showScreen(mainScreen);
    } catch (err) { errorMsg.textContent = 'Error al guardar'; }
}

async function cargarDatosAdmin() {
    showLoading();
    try {
        // Primero cargar clientes
        var resp2 = await supabase.from('clientes').select('*').order('numero', { ascending: true });
        todosLosClientes = resp2.data || [];
        
        // Cargar TODAS las ventas (sin limite de 1000)
        // Supabase tiene limite de 1000 por defecto, usamos range para obtener más
        var allVentas = [];
        var pageSize = 1000;
        var offset = 0;
        var hasMore = true;
        
        while (hasMore) {
            var resp = await supabase
                .from('ventas')
                .select('*')
                .order('fecha', { ascending: false })
                .order('hora', { ascending: false })
                .range(offset, offset + pageSize - 1);
            
            if (resp.data && resp.data.length > 0) {
                allVentas = allVentas.concat(resp.data);
                offset += pageSize;
                hasMore = resp.data.length === pageSize;
            } else {
                hasMore = false;
            }
        }
        
        todasLasVentas = allVentas;
        console.log('Total ventas cargadas:', todasLasVentas.length);
        
        // Cargar log de bonos (últimos 7 días para estadísticas)
        try {
            var hace7dias = new Date();
            hace7dias.setDate(hace7dias.getDate() - 7);
            var fechaDesde = hace7dias.getFullYear() + '-' + (hace7dias.getMonth()+1).toString().padStart(2,'0') + '-' + hace7dias.getDate().toString().padStart(2,'0');
            
            var respBonos = await supabase
                .from('log_bonos')
                .select('*')
                .gte('fecha', fechaDesde)
                .order('fecha', { ascending: false })
                .order('hora', { ascending: false });
            
            todosLosBonos = respBonos.data || [];
            console.log('Bonos cargados:', todosLosBonos.length);
        } catch (errBonos) {
            console.log('No se pudieron cargar bonos:', errBonos);
            todosLosBonos = [];
        }
        
        actualizarDashboard();
        mostrarListaClientes();
        mostrarListaVentas();
    } catch (err) { console.error('Error:', err); }
    hideLoading();
}

function sumarPrecios(arr) { var total = 0; for (var i = 0; i < arr.length; i++) total += parseFloat(arr[i].precio) || 0; return total; }

function actualizarDashboard() {
    var hoy = getHoy(); var ayer = getAyer(); var inicioSemana = getInicioSemana();
    console.log('Fechas - Hoy:', hoy, 'Ayer:', ayer, 'Inicio Semana:', inicioSemana);
    
    // HOY = ventas de hoy desde las 08:00
    var ventasHoy = todasLasVentas.filter(function(v) {
        if (v.fecha !== hoy) return false;
        if (!v.hora) return true;
        var h = parseInt(v.hora.split(':')[0]);
        return h >= 8;
    });
    
    // AYER = ventas de ayer desde 08:00 + ventas de hoy antes de las 05:00 (madrugada)
    var ventasAyer = todasLasVentas.filter(function(v) {
        if (v.fecha === ayer) {
            if (!v.hora) return true;
            var h = parseInt(v.hora.split(':')[0]);
            return h >= 8;
        }
        if (v.fecha === hoy) {
            if (!v.hora) return false;
            var h = parseInt(v.hora.split(':')[0]);
            return h < 5;
        }
        return false;
    });
    
    // SEMANA = desde lunes 08:00 (ventas de madrugada del lunes van a semana anterior)
    var ventasSemana = todasLasVentas.filter(function(v) {
        if (v.fecha < inicioSemana) return false;
        if (v.fecha > inicioSemana) return true;
        // Si es el lunes, solo contar desde las 08:00
        if (v.fecha === inicioSemana) {
            if (!v.hora) return true;
            var h = parseInt(v.hora.split(':')[0]);
            return h >= 8;
        }
        return true;
    });
    
    console.log('Ventas HOY:', ventasHoy.length, '- Total:', sumarPrecios(ventasHoy).toFixed(2));
    console.log('Ventas SEMANA:', ventasSemana.length, '- Total:', sumarPrecios(ventasSemana).toFixed(2));
    
    document.getElementById('admin-ventas-hoy').textContent = ventasHoy.length;
    document.getElementById('admin-total-hoy').textContent = formatMoney(sumarPrecios(ventasHoy));
    document.getElementById('admin-ventas-ayer').textContent = ventasAyer.length;
    document.getElementById('admin-total-ayer').textContent = formatMoney(sumarPrecios(ventasAyer));
    document.getElementById('admin-ventas-semana').textContent = ventasSemana.length;
    document.getElementById('admin-total-semana').textContent = formatMoney(sumarPrecios(ventasSemana));
    
    // TURNOS - Mañana: 10-18h, Tarde: 18-6h
    var ventasManana = ventasHoy.filter(function(v) { if (!v.hora) return false; var h = parseInt(v.hora.split(':')[0]); return h >= 10 && h < 18; });
    var ventasTarde = ventasHoy.filter(function(v) { if (!v.hora) return false; var h = parseInt(v.hora.split(':')[0]); return h >= 18; });
    
    document.getElementById('turno-manana-ventas').textContent = ventasManana.length + ' ventas';
    document.getElementById('turno-manana-total').textContent = formatMoney(sumarPrecios(ventasManana));
    document.getElementById('turno-tarde-ventas').textContent = ventasTarde.length + ' ventas';
    document.getElementById('turno-tarde-total').textContent = formatMoney(sumarPrecios(ventasTarde));
    
    // BONOS CARGADOS - HOY (desde 08:00) y AYER (08:00 a 08:00)
    var bonosHoy = todosLosBonos.filter(function(b) {
        if (b.fecha !== hoy) return false;
        if (!b.hora) return true;
        var h = parseInt(b.hora.split(':')[0]);
        return h >= 8;
    });
    
    var bonosAyer = todosLosBonos.filter(function(b) {
        if (b.fecha === ayer) {
            if (!b.hora) return true;
            var h = parseInt(b.hora.split(':')[0]);
            return h >= 8;
        }
        if (b.fecha === hoy) {
            if (!b.hora) return false;
            var h = parseInt(b.hora.split(':')[0]);
            return h < 8;
        }
        return false;
    });
    
    var totalBonosHoy = 0;
    for (var i = 0; i < bonosHoy.length; i++) totalBonosHoy += parseFloat(bonosHoy[i].importe) || 0;
    
    var totalBonosAyer = 0;
    for (var i = 0; i < bonosAyer.length; i++) totalBonosAyer += parseFloat(bonosAyer[i].importe) || 0;
    
    document.getElementById('admin-bonos-hoy').textContent = bonosHoy.length;
    document.getElementById('admin-bonos-total-hoy').textContent = formatMoney(totalBonosHoy);
    document.getElementById('admin-bonos-ayer').textContent = bonosAyer.length;
    document.getElementById('admin-bonos-total-ayer').textContent = formatMoney(totalBonosAyer);
    
    // Top 5
    var clienteGastos = {};
    for (var i = 0; i < todasLasVentas.length; i++) { var v = todasLasVentas[i]; if (!clienteGastos[v.numero_cliente]) clienteGastos[v.numero_cliente] = 0; clienteGastos[v.numero_cliente] += parseFloat(v.precio) || 0; }
    var ranking = [];
    for (var num in clienteGastos) { var cliente = todosLosClientes.find(function(c) { return c.numero == num; }); ranking.push({ numero: num, nombre: cliente ? cliente.nombre : 'Cliente ' + num, total: clienteGastos[num] }); }
    ranking.sort(function(a, b) { return b.total - a.total; });
    ranking = ranking.slice(0, 5);
    var topHtml = '';
    for (var i = 0; i < ranking.length; i++) { var r = ranking[i]; var posClass = i === 0 ? 'oro' : (i === 1 ? 'plata' : (i === 2 ? 'bronce' : 'normal')); topHtml += '<div class="top-cliente"><div class="top-posicion ' + posClass + '">' + (i+1) + '</div><div class="top-info"><div class="top-nombre">' + r.nombre + '</div><div class="top-numero">#' + r.numero + '</div></div><div class="top-total">' + formatMoney(r.total) + '</div></div>'; }
    document.getElementById('top-clientes').innerHTML = topHtml || '<p style="color:#888;">Sin datos</p>';
}

// Función para calcular el total gastado de un cliente sumando sus ventas
function calcularGastadoCliente(numeroCliente) {
    var total = 0;
    for (var i = 0; i < todasLasVentas.length; i++) {
        if (todasLasVentas[i].numero_cliente == numeroCliente) {
            total += parseFloat(todasLasVentas[i].precio) || 0;
        }
    }
    return total;
}

function mostrarListaClientes() {
    var html = '';
    for (var i = 0; i < todosLosClientes.length; i++) { 
        var c = todosLosClientes[i]; 
        var bonoTotal = parseFloat(c.bono_total) || 0;
        // Calcular gastado sumando las ventas del cliente
        var bonoGastado = calcularGastadoCliente(c.numero);
        var bonoDisponible = bonoTotal - bonoGastado;
        if (bonoDisponible < 0) bonoDisponible = 0;
        html += '<div class="cliente-mini" onclick="buscarClientePorNumero(' + c.numero + ')"><span class="cliente-mini-num">#' + c.numero + '</span><span class="cliente-mini-nombre">' + (c.nombre || 'Sin nombre') + '</span><span class="cliente-mini-bono">' + formatMoney(bonoDisponible) + '</span></div>'; 
    }
    document.getElementById('lista-todos-clientes').innerHTML = html || '<p style="color:#888;">No hay clientes</p>';
}

function buscarClientePorNumero(num) { var cliente = todosLosClientes.find(function(c) { return c.numero == num; }); if (cliente) mostrarClienteParaEditar(cliente); }

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
    // Calcular bono gastado sumando ventas (valor real actualizado)
    var bonoGastadoReal = calcularGastadoCliente(cliente.numero);
    document.getElementById('edit-bono-gastado').value = bonoGastadoReal.toFixed(2);
    document.getElementById('edit-password').value = cliente.password || '';
    document.getElementById('edit-cliente-msg').innerHTML = '';
}

async function guardarCambiosCliente() {
    if (!clienteEditando) return;
    try {
        await supabase.from('clientes').update({ nombre: document.getElementById('edit-nombre').value.trim(), bono_total: parseFloat(document.getElementById('edit-bono-total').value) || 0, bono_gastado: parseFloat(document.getElementById('edit-bono-gastado').value) || 0, password: document.getElementById('edit-password').value.trim() || null }).eq('numero', clienteEditando.numero);
        document.getElementById('edit-cliente-msg').innerHTML = '<div class="msg success">Guardado</div>';
        await cargarDatosAdmin();
    } catch (err) { document.getElementById('edit-cliente-msg').innerHTML = '<div class="msg error">Error</div>'; }
}

function mostrarListaVentas() {
    var ventas = todasLasVentas.slice();
    ventas.sort(function(a, b) { var fechaA = a.fecha + (a.hora || '00:00'); var fechaB = b.fecha + (b.hora || '00:00'); return fechaB.localeCompare(fechaA); });
    var filtroFecha = document.getElementById('filtro-fecha').value;
    if (filtroFecha === 'hoy') ventas = ventas.filter(function(v) { return v.fecha === getHoy(); });
    else if (filtroFecha === 'ayer') ventas = ventas.filter(function(v) { return v.fecha === getAyer(); });
    else if (filtroFecha === 'semana') ventas = ventas.filter(function(v) { return v.fecha >= getInicioSemana(); });
    else if (filtroFecha === 'mes') ventas = ventas.filter(function(v) { return v.fecha >= getInicioMes(); });
    var filtroCliente = document.getElementById('filtro-cliente').value.trim().toLowerCase();
    if (filtroCliente) ventas = ventas.filter(function(v) { return v.numero_cliente == filtroCliente || (v.descripcion && v.descripcion.toLowerCase().indexOf(filtroCliente) >= 0); });
    
    var html = '';
    for (var i = 0; i < Math.min(ventas.length, 200); i++) {
        var v = ventas[i];
        var nombreCliente = getNombreCliente(v.numero_cliente);
        var hora = v.hora ? formatHora(v.hora) : '--:--';
        html += '<div class="venta-admin-item">';
        html += '<span class="venta-fecha">' + formatDate(v.fecha) + ' ' + hora + '</span>';
        html += '<span class="venta-cliente">' + nombreCliente + '</span>';
        html += '<span class="venta-precio">' + formatMoney(v.precio) + '</span>';
        html += '<button class="venta-delete" onclick="borrarVentaAdmin(' + v.id + ')">🗑️</button>';
        html += '</div>';
    }
    document.getElementById('ventas-lista').innerHTML = html || '<p style="color:#888;padding:20px;">No hay ventas</p>';
}

async function borrarVentaAdmin(ventaId) {
    if (!confirm('Borrar esta venta?')) return;
    try { await supabase.from('ventas').delete().eq('id', ventaId); todasLasVentas = todasLasVentas.filter(function(v) { return v.id !== ventaId; }); mostrarListaVentas(); actualizarDashboard(); }
    catch (err) { alert('Error'); }
}

if ('serviceWorker' in navigator) { window.addEventListener('load', function() { navigator.serviceWorker.register('sw.js').catch(function() {}); }); }

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

document.addEventListener('DOMContentLoaded', function() { initTabs(); initAdminTabs(); checkAutoLogin(); });
