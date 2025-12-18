// APP_CLIENTES v2.0 - Fix: Eliminada declaración duplicada de 'supabase'
// Variables globales
var loginScreen, mainScreen, adminScreen, loadingOverlay;
var inputNumero, inputPassword, btnLogin, loginError, btnLogout, btnAdminLogout;
// supabase se inicializa en initApp() sin declaración previa para evitar conflictos

// Inicializar Supabase y elementos del DOM
function initApp() {
    try {
        if (!window.supabase) {
            console.error('Supabase no está cargado');
            alert('Error: No se pudo cargar Supabase. Verifica tu conexión a internet.');
            return;
        }
        
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.error('Variables de configuración no disponibles');
            alert('Error: Configuración de Supabase no disponible');
            return;
        }
        
        // Crear cliente de Supabase (variable global implícita)
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('Supabase inicializado');

        loginScreen = document.getElementById('login-screen');
        mainScreen = document.getElementById('main-screen');
        adminScreen = document.getElementById('admin-screen');
        loadingOverlay = document.getElementById('loading');

        inputNumero = document.getElementById('input-numero');
        inputPassword = document.getElementById('input-password');
        btnLogin = document.getElementById('btn-login');
        loginError = document.getElementById('login-error');
        btnLogout = document.getElementById('btn-logout');
        btnAdminLogout = document.getElementById('btn-admin-logout');
        
        if (!inputNumero || !inputPassword || !btnLogin || !loginError) {
            console.error('Elementos del DOM no encontrados:', {
                inputNumero: !!inputNumero,
                inputPassword: !!inputPassword,
                btnLogin: !!btnLogin,
                loginError: !!loginError
            });
            return;
        }
        
        console.log('Elementos del DOM cargados correctamente');
        
        // Conectar eventos
        if (btnLogin) {
            btnLogin.addEventListener('click', login);
            console.log('Botón de login conectado');
        }
        if (btnLogout) btnLogout.addEventListener('click', logout);
        if (btnAdminLogout) btnAdminLogout.addEventListener('click', logout);
        if (inputNumero) {
            inputNumero.addEventListener('keypress', function(e) { 
                if (e.key === 'Enter') {
                    if (inputPassword) inputPassword.focus();
                }
            });
        }
        if (inputPassword) {
            inputPassword.addEventListener('keypress', function(e) { 
                if (e.key === 'Enter') login(); 
            });
        }
    } catch (err) {
        console.error('Error inicializando app:', err);
        alert('Error inicializando la aplicación: ' + err.message);
    }
}

let clienteActual = null;
let ventasCliente = [];
let todasLasVentas = [];
let todosLosClientes = [];
let todosLosBonos = [];
let isAdmin = false;
let clienteEditando = null;

function showLoading() { 
    if (loadingOverlay) loadingOverlay.classList.add('active'); 
}
function hideLoading() { 
    if (loadingOverlay) loadingOverlay.classList.remove('active'); 
}

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
    if (!screen) return;
    if (loginScreen) loginScreen.classList.remove('active');
    if (mainScreen) mainScreen.classList.remove('active');
    if (adminScreen) adminScreen.classList.remove('active');
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
    console.log('Login llamado');
    try {
        if (!inputNumero || !inputPassword || !loginError) {
            console.error('Elementos del DOM no encontrados');
            alert('Error: La aplicación no se cargó correctamente. Por favor, recarga la página.');
            return;
        }
        
        var numero = inputNumero.value.trim();
        var password = inputPassword.value.trim();
        console.log('Número:', numero);
        if (!numero) { loginError.textContent = 'Introduce tu numero de caja'; return; }
        loginError.textContent = '';
        showLoading();
        
        if (numero.toLowerCase() === 'admin') {
            // Verificar contraseña de admin en Supabase (seguro)
            try {
                var resp = await supabase.rpc('verificar_admin', { pass: password });
                if (resp.data === true) {
                    isAdmin = true;
                    await cargarDatosAdmin();
                    showScreen(adminScreen);
                } else {
                    loginError.textContent = 'Contrasena de admin incorrecta';
                }
            } catch (err) {
                console.error('Error verificando admin:', err);
                loginError.textContent = 'Error verificando admin: ' + (err.message || 'Error desconocido');
            }
            hideLoading();
            return;
        }
        
        // Verificar que supabase esté disponible
        if (!supabase) {
            loginError.textContent = 'Error: No se pudo conectar con el servidor';
            hideLoading();
            return;
        }
        
        var resp = await supabase.from('clientes').select('*').eq('numero', parseInt(numero)).maybeSingle();
        
        if (resp.error) {
            console.error('Error Supabase:', resp.error);
            loginError.textContent = 'Error de conexion: ' + (resp.error.message || 'Error desconocido');
            hideLoading();
            return;
        }
        
        if (!resp.data) {
            loginError.textContent = 'No se encontro esa caja';
            hideLoading();
            return;
        }
        
        var data = resp.data;
        if (data.password) {
            if (!password) {
                loginError.textContent = 'Introduce tu contrasena';
                hideLoading();
                return;
            }
            if (data.password !== password) {
                loginError.textContent = 'Contrasena incorrecta';
                hideLoading();
                return;
            }
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
        hideLoading();
    } catch (err) {
        console.error('Error en login:', err);
        loginError.textContent = 'Error al conectar: ' + (err.message || 'Error desconocido');
        hideLoading();
    }
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
    // Mostrar el saldo disponible (incluyendo negativos con estilo diferente)
    var bonoElement = document.getElementById('bono-disponible');
    bonoElement.textContent = formatMoney(bonoDisponible);
    if (bonoDisponible < 0) {
        bonoElement.classList.add('negativo');
    } else {
        bonoElement.classList.remove('negativo');
    }
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

// Horario fijo de LIVES
var HORARIO_LIVES = {
    0: [{ inicio: '18:00', fin: '01:00', nombre: 'Domingo Noche' }], // Domingo
    1: [{ inicio: '11:00', fin: '15:00', nombre: 'Lunes Mañana' }, { inicio: '19:00', fin: '01:00', nombre: 'Lunes Noche' }], // Lunes
    2: [{ inicio: '11:00', fin: '15:00', nombre: 'Martes Mañana' }, { inicio: '19:00', fin: '01:00', nombre: 'Martes Noche' }], // Martes
    3: [{ inicio: '11:00', fin: '15:00', nombre: 'Miércoles Mañana' }, { inicio: '19:00', fin: '01:00', nombre: 'Miércoles Noche' }], // Miércoles
    4: [{ inicio: '19:00', fin: '01:00', nombre: 'Jueves Noche' }], // Jueves
    5: [{ inicio: '19:00', fin: '01:00', nombre: 'Viernes Noche' }], // Viernes
    6: [{ inicio: '19:00', fin: '04:00', nombre: 'Sábado Noche' }]  // Sábado
};

var contadorInterval = null;

function getProximoLiveHorario() {
    var ahora = new Date();
    var diaActual = ahora.getDay();
    var horaActual = ahora.getHours();
    var minActual = ahora.getMinutes();
    var tiempoActual = horaActual * 60 + minActual;
    
    // Buscar en los próximos 7 días
    for (var i = 0; i < 7; i++) {
        var dia = (diaActual + i) % 7;
        var horarios = HORARIO_LIVES[dia] || [];
        
        for (var j = 0; j < horarios.length; j++) {
            var h = horarios[j];
            var partesInicio = h.inicio.split(':');
            var tiempoInicio = parseInt(partesInicio[0]) * 60 + parseInt(partesInicio[1]);
            
            // Si es hoy, verificar si el LIVE ya pasó
            if (i === 0) {
                // Verificar si estamos EN el LIVE (entre inicio y fin)
                var partesFin = h.fin.split(':');
                var tiempoFin = parseInt(partesFin[0]) * 60 + parseInt(partesFin[1]);
                if (tiempoFin < tiempoInicio) tiempoFin += 24 * 60; // Cruza medianoche
                
                var tiempoActualAjustado = tiempoActual;
                if (tiempoActual < tiempoInicio && tiempoFin > 24 * 60) {
                    tiempoActualAjustado += 24 * 60;
                }
                
                if (tiempoActualAjustado >= tiempoInicio && tiempoActualAjustado <= tiempoFin) {
                    // ¡Estamos EN el LIVE ahora!
                    return { enVivo: true, nombre: h.nombre, fin: h.fin };
                }
                
                if (tiempoActual >= tiempoInicio) {
                    continue; // Ya pasó, siguiente
                }
            }
            
            // Calcular fecha del próximo LIVE
            var fechaLive = new Date(ahora);
            fechaLive.setDate(fechaLive.getDate() + i);
            fechaLive.setHours(parseInt(partesInicio[0]), parseInt(partesInicio[1]), 0, 0);
            
            return {
                enVivo: false,
                nombre: h.nombre,
                fecha: fechaLive,
                horaInicio: h.inicio,
                horaFin: h.fin
            };
        }
    }
    return null;
}

function formatContador(ms) {
    if (ms <= 0) return '¡Ahora!';
    var segundos = Math.floor(ms / 1000);
    var minutos = Math.floor(segundos / 60);
    var horas = Math.floor(minutos / 60);
    var dias = Math.floor(horas / 24);
    
    horas = horas % 24;
    minutos = minutos % 60;
    segundos = segundos % 60;
    
    if (dias > 0) {
        return dias + 'd ' + horas + 'h ' + minutos + 'm';
    } else if (horas > 0) {
        return horas + 'h ' + minutos + 'm ' + segundos + 's';
    } else {
        return minutos + 'm ' + segundos + 's';
    }
}

function actualizarContadorLive() {
    var contenido = document.getElementById('proximo-live-content');
    if (!contenido) return;
    
    var proximo = getProximoLiveHorario();
    
    if (!proximo) {
        contenido.innerHTML = '<div class="live-info"><div class="live-titulo">Sin LIVE programado</div></div>';
        return;
    }
    
    if (proximo.enVivo) {
        // ¡Estamos EN VIVO!
        contenido.innerHTML = '<div class="live-info">' +
            '<div class="live-titulo live-ahora">🔴 ¡EN DIRECTO!</div>' +
            '<div class="live-fecha">' + proximo.nombre + '</div>' +
            '<div class="live-descripcion">Hasta las ' + proximo.fin + '</div>' +
            '</div>' +
            '<div class="live-icon-big pulse">🔴</div>';
    } else {
        var ahora = new Date();
        var diff = proximo.fecha - ahora;
        var contador = formatContador(diff);
        
        var nombresDia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        var diaTexto = nombresDia[proximo.fecha.getDay()];
        var fechaTexto = proximo.fecha.getDate() + '/' + (proximo.fecha.getMonth() + 1);
        
        contenido.innerHTML = '<div class="live-info">' +
            '<div class="live-titulo">Próximo LIVE</div>' +
            '<div class="live-fecha">📅 ' + diaTexto + ' ' + fechaTexto + ' a las ' + proximo.horaInicio + '</div>' +
            '<div class="live-contador">⏱️ ' + contador + '</div>' +
            '</div>' +
            '<div class="live-icon-big">📺</div>';
    }
}

async function cargarProximoLive() {
    // Primero verificar si hay un LIVE especial programado en Supabase
    try {
        var hoy = getHoy();
        var resp = await supabase
            .from('proximos_lives')
            .select('*')
            .eq('activo', true)
            .gte('fecha', hoy)
            .order('fecha', { ascending: true })
            .order('hora', { ascending: true })
            .limit(1);
        
        var contenido = document.getElementById('proximo-live-content');
        
        if (resp.data && resp.data.length > 0) {
            // Hay un LIVE especial programado - mostrarlo
            var live = resp.data[0];
            var fechaLive = formatDateFull(live.fecha);
            var horaLive = live.hora ? live.hora.substring(0, 5) : '';
            
            var html = '<div class="live-info">';
            html += '<div class="live-titulo">🌟 ' + (live.titulo || 'LIVE Especial') + '</div>';
            html += '<div class="live-fecha">📅 ' + fechaLive + ' a las ' + horaLive + '</div>';
            if (live.descripcion) {
                html += '<div class="live-descripcion">' + live.descripcion + '</div>';
            }
            html += '</div>';
            html += '<div class="live-icon-big">⭐</div>';
            
            contenido.innerHTML = html;
            
            // Limpiar intervalo si existe
            if (contadorInterval) {
                clearInterval(contadorInterval);
                contadorInterval = null;
            }
        } else {
            // No hay LIVE especial - usar horario fijo
            actualizarContadorLive();
            
            // Actualizar contador cada segundo
            if (contadorInterval) clearInterval(contadorInterval);
            contadorInterval = setInterval(actualizarContadorLive, 1000);
        }
    } catch (err) {
        console.error('Error cargando lives:', err);
        // Fallback: usar horario fijo
        actualizarContadorLive();
        if (contadorInterval) clearInterval(contadorInterval);
        contadorInterval = setInterval(actualizarContadorLive, 1000);
    }
}

function calcularContadorOferta(fechaFin) {
    if (!fechaFin) return null;
    
    // Normalizar fecha
    var fechaNorm = fechaFin;
    if (fechaFin.match(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/)) {
        var partes = fechaFin.split(/[-\/]/);
        fechaNorm = partes[2] + '-' + partes[1] + '-' + partes[0];
    }
    
    // Crear fecha fin a las 23:59:59
    var fin = new Date(fechaNorm + 'T23:59:59');
    var ahora = new Date();
    var diff = fin - ahora;
    
    if (diff <= 0) return 'Finalizada';
    
    var segundos = Math.floor(diff / 1000);
    var minutos = Math.floor(segundos / 60);
    var horas = Math.floor(minutos / 60);
    var dias = Math.floor(horas / 24);
    
    horas = horas % 24;
    minutos = minutos % 60;
    segundos = segundos % 60;
    
    if (dias > 0) {
        return dias + 'd ' + horas + 'h ' + minutos + 'm';
    } else if (horas > 0) {
        return horas + 'h ' + minutos + 'm ' + segundos + 's';
    } else {
        return minutos + 'm ' + segundos + 's';
    }
}

function renderizarOfertas() {
    var listaOfertas = document.getElementById('lista-ofertas');
    if (!listaOfertas || !window.ofertasActivas) return;
    
    var html = '';
    for (var i = 0; i < window.ofertasActivas.length; i++) {
        var oferta = window.ofertasActivas[i];
        var contador = calcularContadorOferta(oferta.fecha_fin);
        
        html += '<div class="item-card oferta-card-item">';
        html += '<div class="item-info">';
        html += '<div class="item-name">' + oferta.titulo + '</div>';
        if (oferta.descripcion) {
            html += '<div class="item-date">' + oferta.descripcion + '</div>';
        }
        if (oferta.codigo) {
            html += '<div class="oferta-codigo-badge">🏷️ ' + oferta.codigo + '</div>';
        }
        if (contador) {
            html += '<div class="oferta-contador">⏱️ Acaba en: ' + contador + '</div>';
        }
        html += '</div>';
        html += '<div class="item-status">';
        html += '<span class="oferta-icon-big">🎁</span>';
        html += '</div>';
        html += '</div>';
    }
    listaOfertas.innerHTML = html;
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
        
        var listaOfertas = document.getElementById('lista-ofertas');
        var emptyOfertas = document.getElementById('empty-ofertas');
        
        if (!resp.data || resp.data.length === 0) {
            listaOfertas.style.display = 'none';
            emptyOfertas.style.display = 'block';
            return;
        }
        
        // Filtrar por fecha si tienen fecha_fin
        // Función para normalizar fecha a YYYY-MM-DD
        function normalizarFecha(f) {
            if (!f) return null;
            // Si ya está en formato YYYY-MM-DD
            if (f.match(/^\d{4}-\d{2}-\d{2}$/)) return f;
            // Si está en formato DD-MM-YYYY o DD/MM/YYYY
            var partes = f.split(/[-\/]/);
            if (partes.length === 3 && partes[0].length <= 2) {
                return partes[2] + '-' + partes[1].padStart(2, '0') + '-' + partes[0].padStart(2, '0');
            }
            return f;
        }
        
        var ofertasValidas = resp.data.filter(function(o) {
            var fechaFin = normalizarFecha(o.fecha_fin);
            var fechaInicio = normalizarFecha(o.fecha_inicio);
            if (fechaFin && fechaFin < hoy) return false;
            if (fechaInicio && fechaInicio > hoy) return false;
            return true;
        });
        
        if (ofertasValidas.length === 0) {
            listaOfertas.style.display = 'none';
            emptyOfertas.style.display = 'block';
            return;
        }
        
        listaOfertas.style.display = 'flex';
        emptyOfertas.style.display = 'none';
        
        // Guardar ofertas para el contador
        window.ofertasActivas = ofertasValidas;
        
        renderizarOfertas();
        
        // Iniciar contador de ofertas
        if (window.contadorOfertasInterval) clearInterval(window.contadorOfertasInterval);
        window.contadorOfertasInterval = setInterval(renderizarOfertas, 1000);
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
        var claseNegativo = bonoDisponible < 0 ? ' negativo' : '';
        html += '<div class="cliente-mini" onclick="buscarClientePorNumero(' + c.numero + ')"><span class="cliente-mini-num">#' + c.numero + '</span><span class="cliente-mini-nombre">' + (c.nombre || 'Sin nombre') + '</span><span class="cliente-mini-bono' + claseNegativo + '">' + formatMoney(bonoDisponible) + '</span></div>'; 
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

if ('serviceWorker' in navigator) { 
    window.addEventListener('load', function() { 
        navigator.serviceWorker.register('sw.js').catch(function() {}); 
    }); 
}

// Conectar eventos adicionales
document.addEventListener('DOMContentLoaded', function() { 
    initApp();
    initTabs(); 
    initAdminTabs(); 
    checkAutoLogin(); 
    
    // Eventos adicionales que necesitan elementos del DOM
    var btnBuscarCliente = document.getElementById('btn-buscar-cliente');
    if (btnBuscarCliente) {
        btnBuscarCliente.addEventListener('click', buscarCliente);
    }
    
    var adminBuscarCliente = document.getElementById('admin-buscar-cliente');
    if (adminBuscarCliente) {
        adminBuscarCliente.addEventListener('keypress', function(e) { 
            if (e.key === 'Enter') buscarCliente(); 
        });
    }
    
    var btnGuardarCliente = document.getElementById('btn-guardar-cliente');
    if (btnGuardarCliente) {
        btnGuardarCliente.addEventListener('click', guardarCambiosCliente);
    }
    
    var btnFiltrarVentas = document.getElementById('btn-filtrar-ventas');
    if (btnFiltrarVentas) {
        btnFiltrarVentas.addEventListener('click', mostrarListaVentas);
    }
    
    var filtroFecha = document.getElementById('filtro-fecha');
    if (filtroFecha) {
        filtroFecha.addEventListener('change', mostrarListaVentas);
    }
});

