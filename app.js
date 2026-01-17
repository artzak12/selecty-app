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

// ══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE NOTIFICACIONES
// ══════════════════════════════════════════════════════════════════════════════
let estadoAnterior = {
    bonos: [],
    ventas: [],
    ultimaCompra: null
};
let intervaloNotificaciones = null;
let intervaloRecordatorioLive = null;
let recordatorioLiveEnviado = false;
let recordatorio7DiasEnviado = false;

// ══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE NOTIFICACIONES
// ══════════════════════════════════════════════════════════════════════════════

// Solicitar permisos de notificaciones
async function solicitarPermisosNotificaciones() {
    if (!('Notification' in window)) {
        console.log('Este navegador no soporta notificaciones');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        var permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    
    return false;
}

// Enviar notificación
function enviarNotificacion(titulo, mensaje, icono = '📦') {
    if (Notification.permission === 'granted') {
        var notification = new Notification(titulo, {
            body: mensaje,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'selecty-notification',
            requireInteraction: false
        });
        
        // Cerrar automáticamente después de 5 segundos
        setTimeout(function() {
            notification.close();
        }, 5000);
        
        // Hacer sonido (opcional)
        try {
            var audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
            audio.play().catch(function() {});
        } catch (e) {}
    }
}

// Verificar cambios y enviar notificaciones
async function verificarCambiosYNotificar() {
    if (!clienteActual || isAdmin) return;
    
    try {
        // 1. Verificar nuevos bonos
        var respBonos = await supabase
            .from('log_bonos')
            .select('*')
            .eq('numero', clienteActual.numero)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .limit(5);
        
        if (respBonos.data && respBonos.data.length > 0) {
            var bonosNuevos = respBonos.data.filter(function(bono) {
                // Verificar si es un bono nuevo comparando con el estado anterior
                var existe = estadoAnterior.bonos.some(function(b) {
                    return b.id === bono.id;
                });
                return !existe;
            });
            
            if (bonosNuevos.length > 0) {
                var ultimoBono = bonosNuevos[0];
                var importe = parseFloat(ultimoBono.importe) || 0;
                enviarNotificacion(
                    '💰 ¡Nuevo bono añadido!',
                    'Se ha añadido ' + importe.toFixed(0) + '€ a tu saldo disponible',
                    '💰'
                );
                // 🎯 RECARGAR PUNTOS cuando se detecta un nuevo bono
                console.log('[NOTIFICACIONES] Nuevo bono detectado, recargando puntos...');
                cargarPuntosCliente();
                // Actualizar estado anterior
                estadoAnterior.bonos = respBonos.data.slice(0, 5);
            }
        }
        
        // 2. Verificar nuevas ventas/artículos
        var respVentas = await supabase
            .from('ventas')
            .select('*')
            .eq('numero_cliente', clienteActual.numero)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .limit(10);
        
        if (respVentas.data && respVentas.data.length > 0) {
            var ventasNuevas = respVentas.data.filter(function(venta) {
                // Verificar si es una venta nueva
                var existe = estadoAnterior.ventas.some(function(v) {
                    return v.id === venta.id;
                });
                return !existe;
            });
            
            if (ventasNuevas.length > 0) {
                var ultimaVenta = ventasNuevas[0];
                var descripcion = ultimaVenta.descripcion || 'Nuevo artículo';
                var precio = parseFloat(ultimaVenta.precio) || 0;
                enviarNotificacion(
                    '📦 ¡Nuevo artículo en tu caja!',
                    descripcion + ' - ' + precio.toFixed(2) + '€',
                    '📦'
                );
                // Actualizar estado anterior
                estadoAnterior.ventas = respVentas.data.slice(0, 10);
            }
        }
        
        // 3. Verificar recordatorio de 7 días sin comprar
        if (respVentas.data && respVentas.data.length > 0) {
            var ultimaVenta = respVentas.data[0];
            var fechaUltima = ultimaVenta.fecha;
            if (fechaUltima) {
                var fechaUltimaDate = new Date(fechaUltima + 'T00:00:00');
                var ahora = new Date();
                var diasSinComprar = Math.floor((ahora - fechaUltimaDate) / (1000 * 60 * 60 * 24));
                
                if (diasSinComprar >= 7 && !recordatorio7DiasEnviado) {
                    enviarNotificacion(
                        '⏰ Recordatorio',
                        'Llevas ' + diasSinComprar + ' días sin comprar. ¡Participa en nuestros LIVES!',
                        '⏰'
                    );
                    recordatorio7DiasEnviado = true;
                } else if (diasSinComprar < 7) {
                    recordatorio7DiasEnviado = false;
                }
            }
        } else {
            // Si no tiene ventas, verificar días desde registro (si es posible)
            // Por ahora, solo notificar si tiene ventas previas
        }
        
    } catch (err) {
        console.error('Error verificando cambios:', err);
    }
}

// Verificar recordatorio de LIVE (10 minutos antes)
function verificarRecordatorioLive() {
    if (!clienteActual || isAdmin) return;
    
    var proximo = getProximoLiveHorario();
    if (!proximo || proximo.enVivo) {
        recordatorioLiveEnviado = false;
        return;
    }
    
    var ahora = new Date();
    var diff = proximo.fecha - ahora;
    var minutosRestantes = Math.floor(diff / (1000 * 60));
    
    // Notificar 10 minutos antes
    if (minutosRestantes <= 10 && minutosRestantes > 0 && !recordatorioLiveEnviado) {
        var nombresDia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        var diaTexto = nombresDia[proximo.fecha.getDay()];
        var horaTexto = proximo.horaInicio;
        
        enviarNotificacion(
            '📺 LIVE empezando pronto',
            proximo.nombre + ' empieza en ' + minutosRestantes + ' minutos (' + diaTexto + ' ' + horaTexto + ')',
            '📺'
        );
        recordatorioLiveEnviado = true;
    }
    
    // Resetear si ya pasó el LIVE
    if (minutosRestantes < 0) {
        recordatorioLiveEnviado = false;
    }
}

// Iniciar sistema de notificaciones
function iniciarSistemaNotificaciones() {
    if (isAdmin) return;
    
    // Solicitar permisos al iniciar
    solicitarPermisosNotificaciones();
    
    // Verificar cambios cada 30 segundos
    if (intervaloNotificaciones) {
        clearInterval(intervaloNotificaciones);
    }
    intervaloNotificaciones = setInterval(verificarCambiosYNotificar, 30000);
    
    // Verificar recordatorio LIVE cada minuto
    if (intervaloRecordatorioLive) {
        clearInterval(intervaloRecordatorioLive);
    }
    intervaloRecordatorioLive = setInterval(verificarRecordatorioLive, 60000);
    
    // Verificación inicial
    setTimeout(function() {
        verificarCambiosYNotificar();
        verificarRecordatorioLive();
    }, 5000);
}

// Detener sistema de notificaciones
function detenerSistemaNotificaciones() {
    if (intervaloNotificaciones) {
        clearInterval(intervaloNotificaciones);
        intervaloNotificaciones = null;
    }
    if (intervaloRecordatorioLive) {
        clearInterval(intervaloRecordatorioLive);
        intervaloRecordatorioLive = null;
    }
    recordatorioLiveEnviado = false;
    recordatorio7DiasEnviado = false;
}

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
        // Verificar cambios y notificar (sin esperar)
        verificarCambiosYNotificar();
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
                    // Detener notificaciones si estaba activo
                    detenerSistemaNotificaciones();
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
        
        // Iniciar sistema de notificaciones después del login
        iniciarSistemaNotificaciones();
        
        // Guardar estado inicial para comparaciones
        if (ventasCliente.length > 0) {
            estadoAnterior.ventas = ventasCliente.slice(0, 10);
            estadoAnterior.ultimaCompra = ventasCliente[0].fecha;
        }
        
        // Cargar bonos iniciales
        try {
            var respBonos = await supabase
                .from('log_bonos')
                .select('*')
                .eq('numero', clienteActual.numero)
                .order('fecha', { ascending: false })
                .order('hora', { ascending: false })
                .limit(5);
            if (respBonos.data) {
                estadoAnterior.bonos = respBonos.data;
            }
        } catch (err) {
            console.error('Error cargando bonos iniciales:', err);
        }
    } catch (err) {
        console.error('Error en login:', err);
        loginError.textContent = 'Error al conectar: ' + (err.message || 'Error desconocido');
        hideLoading();
    }
}

async function cargarVentas() {
    if (!clienteActual) return;
    try {
        // Cargar ventas ordenadas por fecha DESC y hora DESC (más reciente arriba)
        var resp = await supabase
            .from('ventas')
            .select('*')
            .eq('numero_cliente', clienteActual.numero)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false });
        
        if (!resp.error && resp.data) {
            ventasCliente = resp.data;
            // Ordenar manualmente por fecha+hora (más reciente primero) por si acaso
            ventasCliente.sort(function(a, b) {
                var fechaA = (a.fecha || '') + ' ' + (a.hora || '00:00:00');
                var fechaB = (b.fecha || '') + ' ' + (b.hora || '00:00:00');
                return fechaB.localeCompare(fechaA);
            });
        }
    } catch (err) {
        console.error('Error cargando ventas:', err);
    }
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
    
    // Actualizar botón de envío
    var statusBar = document.getElementById('status-envio');
    var statusText = statusBar.querySelector('.status-text');
    var statusIcon = statusBar.querySelector('.status-icon');
    if (pendientes.length > 0) {
        // Mostrar solo texto sin emoji duplicado (el icono ya está en el HTML)
        statusText.innerHTML = 'Envía mi caja (' + pendientes.length + ' artículo' + (pendientes.length > 1 ? 's' : '') + ')';
        statusBar.classList.add('btn-enviar-activo');
        statusBar.classList.remove('btn-enviar-inactivo');
        statusBar.style.cursor = 'pointer';
        statusBar.onclick = enviarMiCaja;
        if (statusIcon) statusIcon.style.display = 'inline';
    } else {
        statusText.innerHTML = 'Estado de tu caja: <strong>Vacía</strong>';
        statusBar.classList.remove('btn-enviar-activo');
        statusBar.classList.add('btn-enviar-inactivo');
        statusBar.style.cursor = 'default';
        statusBar.onclick = null;
        if (statusIcon) statusIcon.style.display = 'none';
    }
    
    renderizarListas();
    cargarBonosCliente();
    cargarProximoLive();
    cargarOfertas();
    // Solo cargar puntos si no están ya cargados o si el número de cliente cambió
    // IMPORTANTE: No recargar si acabamos de girar la ruleta (para evitar resetear los puntos)
    if (!puntosCliente || puntosCliente.numero !== clienteActual.numero) {
        cargarPuntosCliente(); // 🎯 Cargar puntos del cliente solo si no están cargados
    } else {
        // Si ya tenemos puntos cargados, solo actualizar la vista sin recargar desde Supabase
        actualizarVistaPuntos();
    }
    cargarHistorialRuleta(); // 🎯 NUEVO: Cargar historial de ruleta
}

function renderizarListas() {
    // Pendientes = SIN seguimiento (no enviados)
    // Ordenar por fecha+hora descendente (más reciente arriba)
    var pendientes = ventasCliente.filter(function(v) { return !v.seguimiento; });
    pendientes.sort(function(a, b) {
        var fechaA = (a.fecha || '') + ' ' + (a.hora || '00:00:00');
        var fechaB = (b.fecha || '') + ' ' + (b.hora || '00:00:00');
        return fechaB.localeCompare(fechaA);
    });
    
    // Enviados = CON seguimiento
    // Ordenar por fecha+hora descendente (más reciente arriba)
    var enviados = ventasCliente.filter(function(v) { return v.seguimiento; });
    enviados.sort(function(a, b) {
        var fechaA = (a.fecha || '') + ' ' + (a.hora || '00:00:00');
        var fechaB = (b.fecha || '') + ' ' + (b.hora || '00:00:00');
        return fechaB.localeCompare(fechaA);
    });
    
    var listaEnCaja = document.getElementById('lista-en-caja');
    var emptyCaja = document.getElementById('empty-caja');
    if (pendientes.length === 0) { listaEnCaja.style.display = 'none'; emptyCaja.style.display = 'block'; }
    else {
        listaEnCaja.style.display = 'flex'; emptyCaja.style.display = 'none';
        var html = '';
        for (var i = 0; i < pendientes.length; i++) {
            var v = pendientes[i];
            var fechaHora = formatDateFull(v.fecha);
            if (v.hora) {
                fechaHora += ' ' + formatHora(v.hora);
            }
            html += '<div class="item-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + fechaHora + '</div></div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge pendiente">En caja</span></div></div>';
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
            var fechaHora = formatDateFull(v.fecha);
            if (v.hora) {
                fechaHora += ' ' + formatHora(v.hora);
            }
            var seguimientoHtml = '';
            if (v.seguimiento) {
                seguimientoHtml = '<a href="https://mygls.gls-spain.es/e/' + v.seguimiento + '/03130" target="_blank" class="seguimiento-link">📦 ' + v.seguimiento + '</a>';
            }
            html += '<div class="item-card enviado-card"><div class="item-info"><div class="item-name">' + (v.descripcion || 'Articulo') + '</div><div class="item-date">' + fechaHora + '</div>' + seguimientoHtml + '</div><div class="item-status"><span class="item-price">' + formatMoney(v.precio) + '</span><span class="status-badge enviado">Enviado</span></div></div>';
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
    var listaOfertasDesplegable = document.getElementById('lista-ofertas-desplegable');
    var emptyOfertas = document.getElementById('empty-ofertas');
    var emptyOfertasDesplegable = document.getElementById('empty-ofertas-desplegable');
    
    if (!window.ofertasActivas) return;
    
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
    // Renderizar en ambos contenedores (pestaña y desplegable)
    if (listaOfertas) {
        listaOfertas.innerHTML = html;
        if (emptyOfertas) emptyOfertas.style.display = 'none';
    }
    if (listaOfertasDesplegable) {
        listaOfertasDesplegable.innerHTML = html;
        if (emptyOfertasDesplegable) {
            emptyOfertasDesplegable.style.display = window.ofertasActivas.length === 0 ? 'block' : 'none';
        }
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
        
        var listaOfertas = document.getElementById('lista-ofertas');
        var listaOfertasDesplegable = document.getElementById('lista-ofertas-desplegable');
        var emptyOfertas = document.getElementById('empty-ofertas');
        var emptyOfertasDesplegable = document.getElementById('empty-ofertas-desplegable');
        
        if (!resp.data || resp.data.length === 0) {
            if (listaOfertas) listaOfertas.style.display = 'none';
            if (emptyOfertas) emptyOfertas.style.display = 'block';
            if (listaOfertasDesplegable) listaOfertasDesplegable.style.display = 'none';
            if (emptyOfertasDesplegable) emptyOfertasDesplegable.style.display = 'block';
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
            if (listaOfertas) listaOfertas.style.display = 'none';
            if (emptyOfertas) emptyOfertas.style.display = 'block';
            if (listaOfertasDesplegable) listaOfertasDesplegable.style.display = 'none';
            if (emptyOfertasDesplegable) emptyOfertasDesplegable.style.display = 'block';
            return;
        }
        
        if (listaOfertas) listaOfertas.style.display = 'flex';
        if (emptyOfertas) emptyOfertas.style.display = 'none';
        if (listaOfertasDesplegable) listaOfertasDesplegable.style.display = 'flex';
        if (emptyOfertasDesplegable) emptyOfertasDesplegable.style.display = 'none';
        
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
    // Detener sistema de notificaciones
    detenerSistemaNotificaciones();
    
    clienteActual = null; ventasCliente = []; isAdmin = false;
    localStorage.removeItem('clienteNumero'); localStorage.removeItem('clientePassword');
    inputNumero.value = ''; inputPassword.value = '';
    
    // Resetear estado anterior
    estadoAnterior = {
        bonos: [],
        ventas: [],
        ultimaCompra: null
    };
    
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
    
    // Crear la ruleta visual al cargar la página
    setTimeout(function() {
        crearRuletaVisual();
    }, 500);
    
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

// Función para enviar mi caja (crear petición de envío)
async function enviarMiCaja() {
    if (!clienteActual) {
        alert('Error: No hay sesión activa');
        return;
    }
    
    // Verificar que haya artículos pendientes
    var pendientes = ventasCliente.filter(function(v) { return !v.seguimiento; });
    if (pendientes.length === 0) {
        alert('Tu caja ya está vacía. No hay artículos pendientes de envío.');
        return;
    }
    
    // Confirmar acción
    if (!confirm('¿Enviar tu caja ahora?\n\nSe creará una petición de envío con ' + pendientes.length + ' artículo(s) pendiente(s).')) {
        return;
    }
    
    try {
        showLoading();
        
        // Obtener fecha y hora actual
        var ahora = new Date();
        var fecha = ahora.getFullYear() + '-' + 
                   (ahora.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                   ahora.getDate().toString().padStart(2, '0');
        var hora = ahora.getHours().toString().padStart(2, '0') + ':' + 
                  ahora.getMinutes().toString().padStart(2, '0');
        var fecha_peticion = fecha + ' ' + hora;
        
        var numero = clienteActual.numero;
        var nombre = clienteActual.nombre || 'Cliente #' + numero;
        
        // Verificar si ya existe una petición para este número
        var respCheck = await supabase
            .from('peticiones_envio')
            .select('numero')
            .eq('numero', numero)
            .maybeSingle();
        
        if (respCheck.data) {
            // Actualizar petición existente
            var respUpdate = await supabase
                .from('peticiones_envio')
                .update({
                    nombre: nombre,
                    fecha_peticion: fecha_peticion
                })
                .eq('numero', numero);
            
            if (respUpdate.error) {
                throw new Error('Error actualizando petición: ' + (respUpdate.error.message || 'Error desconocido'));
            }
            
            alert('✅ Petición de envío actualizada.\n\nTu caja aparecerá en la lista de envíos.');
        } else {
            // Crear nueva petición
            var respInsert = await supabase
                .from('peticiones_envio')
                .insert({
                    numero: numero,
                    nombre: nombre,
                    fecha_peticion: fecha_peticion
                });
            
            if (respInsert.error) {
                // Si la tabla no existe, mostrar error descriptivo
                if (respInsert.error.code === 'PGRST116' || respInsert.error.message.includes('does not exist')) {
                    alert('❌ Error: La tabla "peticiones_envio" no existe en Supabase.\n\nContacta con el administrador.');
                } else {
                    throw new Error('Error creando petición: ' + (respInsert.error.message || 'Error desconocido'));
                }
                hideLoading();
                return;
            }
            
            alert('✅ Petición de envío creada.\n\nTu caja aparecerá en la lista de envíos.');
        }
        
        // Actualizar estado visual (feedback visual temporal)
        var statusBar = document.getElementById('status-envio');
        if (statusBar) {
            statusBar.style.background = 'var(--success)';
            setTimeout(function() {
                statusBar.style.background = '';
                // Recargar datos para actualizar el estado
                recargarDatosCliente();
            }, 2000);
        }
        
    } catch (err) {
        console.error('Error enviando caja:', err);
        alert('❌ Error al crear la petición de envío:\n\n' + (err.message || 'Error desconocido'));
    } finally {
        hideLoading();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 🎰 SISTEMA DE PUNTOS Y RULETA
// ══════════════════════════════════════════════════════════════════════════════

let puntosCliente = null;

// Cargar puntos del cliente desde Supabase
async function cargarPuntosCliente() {
    if (!clienteActual) {
        // Si no hay clienteActual, crear valores por defecto para evitar errores
        puntosCliente = {
            numero: 0,
            puntos_acumulados: 0,
            puntos_disponibles: 0,
            giros_totales: 0,
            nivel_actual: 1,
            nombre_nivel: '🌱 Novato'
        };
        return;
    }
    try {
        var resp = await supabase
            .from('puntos_clientes')
            .select('*')
            .eq('numero', clienteActual.numero)
            .maybeSingle();
        
        if (resp.error) {
            console.error('Error cargando puntos:', resp.error);
            // Crear valores por defecto en caso de error
            puntosCliente = {
                numero: clienteActual.numero,
                puntos_acumulados: 0,
                puntos_disponibles: 0,
                giros_totales: 0,
                nivel_actual: 1,
                nombre_nivel: '🌱 Novato'
            };
            actualizarVistaPuntos();
            return;
        }
        
        if (resp.data) {
            puntosCliente = resp.data;
        } else {
            // Cliente no tiene puntos aún, crear valores por defecto
            puntosCliente = {
                numero: clienteActual.numero,
                puntos_acumulados: 0,
                puntos_disponibles: 0,
                giros_totales: 0,
                nivel_actual: 1,
                nombre_nivel: '🌱 Novato'
            };
        }
        
        actualizarVistaPuntos();
    } catch (err) {
        console.error('Error cargando puntos:', err);
        // Crear valores por defecto en caso de excepción
        if (clienteActual) {
            puntosCliente = {
                numero: clienteActual.numero,
                puntos_acumulados: 0,
                puntos_disponibles: 0,
                giros_totales: 0,
                nivel_actual: 1,
                nombre_nivel: '🌱 Novato'
            };
            actualizarVistaPuntos();
        }
    }
}

// Función para extraer el escudo del nombre del nivel
function obtenerEscudoNivel(nombreNivel) {
    if (!nombreNivel) return '🌱';
    // Extraer el primer emoji del nombre (ej: "🌱 Novato" -> "🌱")
    var match = nombreNivel.match(/^[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u);
    return match ? match[0] : '🌱';
}

// Función para extraer el nombre sin el emoji
function obtenerNombreSinEscudo(nombreNivel) {
    if (!nombreNivel) return 'Novato';
    // Remover el primer emoji y espacios iniciales
    return nombreNivel.replace(/^[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]\s*/u, '').trim() || 'Novato';
}

// Actualizar la vista de puntos
function actualizarVistaPuntos() {
    // Asegurarse de que los elementos existan antes de actualizarlos
    var puntosDisponiblesEl = document.getElementById('puntos-disponibles');
    var puntosAcumuladosEl = document.getElementById('puntos-acumulados');
    var nivelActualEl = document.getElementById('nivel-actual');
    var btnRuleta = document.getElementById('btn-girar-ruleta');
    
    // Elementos del nivel display (debajo del saldo)
    var nivelDisplay = document.getElementById('nivel-display');
    var nivelEscudo = document.getElementById('nivel-escudo');
    var nivelNombre = document.getElementById('nivel-nombre');
    var nivelNumero = document.getElementById('nivel-numero');
    
    if (!puntosDisponiblesEl || !puntosAcumuladosEl || !nivelActualEl || !btnRuleta) {
        return; // Los elementos aún no están en el DOM
    }
    
    // Si no hay puntosCliente, crear valores por defecto
    if (!puntosCliente) {
        puntosCliente = {
            numero: clienteActual ? clienteActual.numero : 0,
            puntos_acumulados: 0,
            puntos_disponibles: 0,
            giros_totales: 0,
            nivel_actual: 1,
            nombre_nivel: '🌱 Novato'
        };
    }
    
    // Asegurar que los valores sean números
    var puntosDisp = parseInt(puntosCliente.puntos_disponibles) || 0;
    var puntosAcum = parseInt(puntosCliente.puntos_acumulados) || 0;
    var nivelActual = parseInt(puntosCliente.nivel_actual) || 1;
    var nombreNivel = puntosCliente.nombre_nivel || '🌱 Novato';
    
    puntosDisponiblesEl.textContent = puntosDisp;
    puntosAcumuladosEl.textContent = puntosAcum;
    nivelActualEl.textContent = nombreNivel;
    
    // Actualizar el nivel display debajo del saldo
    if (nivelDisplay && nivelEscudo && nivelNombre && nivelNumero) {
        nivelEscudo.textContent = obtenerEscudoNivel(nombreNivel);
        nivelNombre.textContent = obtenerNombreSinEscudo(nombreNivel);
        nivelNumero.textContent = nivelActual;
    }
    
    // Habilitar/deshabilitar botón de ruleta según puntos disponibles
    var puntosDisponibles = puntosDisp;
    
    console.log('Puntos disponibles:', puntosDisponibles, 'Tipo:', typeof puntosDisponibles);
    
    if (puntosDisponibles >= 3) {
        btnRuleta.disabled = false;
        btnRuleta.removeAttribute('disabled');
        btnRuleta.classList.remove('disabled');
        btnRuleta.style.opacity = '1';
        btnRuleta.style.cursor = 'pointer';
        btnRuleta.onclick = girarRuleta; // Asegurar que el onclick esté asignado
    } else {
        btnRuleta.disabled = true;
        btnRuleta.setAttribute('disabled', 'disabled');
        btnRuleta.classList.add('disabled');
        btnRuleta.style.opacity = '0.5';
        btnRuleta.style.cursor = 'not-allowed';
    }
}

// Girar la ruleta
async function girarRuleta() {
    if (!clienteActual) {
        alert('❌ Error: No se pudo cargar la información del cliente');
        return;
    }
    
    // Si no hay puntos cargados, intentar cargarlos primero
    if (!puntosCliente) {
        await cargarPuntosCliente();
    }
    
    // Si aún no hay puntosCliente, crear valores por defecto
    if (!puntosCliente) {
        puntosCliente = {
            numero: clienteActual.numero,
            puntos_acumulados: 0,
            puntos_disponibles: 0,
            giros_totales: 0,
            nivel_actual: 1,
            nombre_nivel: '🌱 Novato'
        };
    }
    
    var puntosDisponibles = parseInt(puntosCliente.puntos_disponibles) || 0;
    console.log('Intentando girar ruleta. Puntos disponibles:', puntosDisponibles, 'Tipo:', typeof puntosDisponibles);
    
    if (puntosDisponibles < 3) {
        alert('❌ No tienes suficientes puntos.\n\nNecesitas 3 puntos para girar la ruleta.\n\nTienes: ' + puntosDisponibles + ' puntos');
        return;
    }
    
    showLoading();
    
    try {
        // Generar premio aleatorio según probabilidades
        var premio = generarPremioAleatorio();
        console.log('[RULETA] ========================================');
        console.log('[RULETA] PREMIO GENERADO ALEATORIAMENTE:', premio);
        console.log('[RULETA] ========================================');
        
        // Restar puntos
        var puntosNuevos = puntosDisponibles - 3;
        var girosTotales = (puntosCliente.giros_totales || 0) + 1;
        
        // Actualizar puntos en Supabase
        console.log('[RULETA] Actualizando puntos en Supabase:', {
            numero: clienteActual.numero,
            puntos_disponibles: puntosNuevos,
            giros_totales: girosTotales
        });
        
        // IMPORTANTE: Usar .select() después del update para obtener los datos actualizados
        var respUpdate = await supabase
            .from('puntos_clientes')
            .update({
                puntos_disponibles: puntosNuevos,
                giros_totales: girosTotales
            })
            .eq('numero', clienteActual.numero)
            .select(); // Añadir select() para obtener los datos actualizados
        
        if (respUpdate.error) {
            console.error('[RULETA] Error actualizando puntos:', respUpdate.error);
            throw new Error('Error actualizando puntos: ' + respUpdate.error.message);
        }
        
        console.log('[RULETA] Puntos actualizados correctamente en Supabase');
        console.log('[RULETA] Respuesta de Supabase (UPDATE):', respUpdate);
        
        // Verificar que los puntos se guardaron correctamente leyendo desde Supabase
        // Esperar un poco para asegurar que la actualización se haya propagado
        await new Promise(resolve => setTimeout(resolve, 500));
        
        var respVerificar = await supabase
            .from('puntos_clientes')
            .select('puntos_disponibles, giros_totales')
            .eq('numero', clienteActual.numero)
            .maybeSingle();
        
        if (respVerificar.error) {
            console.error('[RULETA] Error verificando puntos:', respVerificar.error);
        } else if (respVerificar.data) {
            var puntosVerificados = respVerificar.data.puntos_disponibles;
            console.log('[RULETA] Puntos verificados en Supabase:', puntosVerificados);
            if (puntosVerificados !== puntosNuevos) {
                console.warn('[RULETA] ADVERTENCIA: Los puntos en Supabase no coinciden! Esperado:', puntosNuevos, 'Encontrado:', puntosVerificados);
                // Intentar actualizar de nuevo si no coinciden
                console.log('[RULETA] Reintentando actualización...');
                var respRetry = await supabase
                    .from('puntos_clientes')
                    .update({
                        puntos_disponibles: puntosNuevos,
                        giros_totales: girosTotales
                    })
                    .eq('numero', clienteActual.numero)
                    .select();
                console.log('[RULETA] Respuesta del reintento:', respRetry);
            } else {
                console.log('[RULETA] OK: Los puntos se guardaron correctamente en Supabase');
            }
        } else {
            console.warn('[RULETA] No se encontraron datos del cliente en puntos_clientes');
        }
        
        // Registrar tirada en Supabase
        var ahora = new Date();
        var fecha = ahora.getFullYear() + '-' + 
                    String(ahora.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(ahora.getDate()).padStart(2, '0');
        var hora = String(ahora.getHours()).padStart(2, '0') + ':' + 
                   String(ahora.getMinutes()).padStart(2, '0') + ':' + 
                   String(ahora.getSeconds()).padStart(2, '0');
        
        var respTirada = await supabase
            .from('tiradas_ruleta')
            .insert({
                numero: clienteActual.numero,
                nombre: clienteActual.nombre || '',
                fecha: fecha,
                hora: hora,
                premio: premio,
                gano_premio: premio !== 'NADA'
            })
            .select(); // Añadir select() para obtener los datos insertados
        
        if (respTirada.error) {
            console.error('[RULETA] Error registrando tirada:', respTirada.error);
            console.error('[RULETA] Detalles del error:', JSON.stringify(respTirada.error, null, 2));
        } else {
            console.log('[RULETA] Tirada registrada correctamente:', respTirada.data);
            if (respTirada.data && respTirada.data.length > 0) {
                console.log('[RULETA] ID de la tirada:', respTirada.data[0].id);
            }
        }
        
        // Verificar que la actualización fue exitosa
        console.log('[RULETA] Puntos actualizados en Supabase:', {
            antes: puntosDisponibles,
            despues: puntosNuevos,
            giros_totales: girosTotales
        });
        
        // Actualizar puntos locales DESPUÉS de que se haya guardado en Supabase
        puntosCliente.puntos_disponibles = puntosNuevos;
        puntosCliente.giros_totales = girosTotales;
        
        // Mostrar animación de ruleta y resultado
        mostrarAnimacionRuleta(premio);
        
        // Actualizar vista (sin recargar desde Supabase todavía)
        actualizarVistaPuntos();
        
        // Recargar historial después de un pequeño delay para asegurar que se guardó
        setTimeout(function() {
            cargarHistorialRuleta();
            // Verificar que los puntos se mantengan actualizados (sin recargar desde Supabase)
            console.log('[RULETA] Verificando puntos después del giro:', puntosCliente.puntos_disponibles);
        }, 500);
        
        // NO recargar puntos desde Supabase aquí - esperar a que el usuario cierre el resultado
        
    } catch (err) {
        console.error('Error girando ruleta:', err);
        alert('❌ Error al girar la ruleta:\n\n' + (err.message || 'Error desconocido'));
    } finally {
        hideLoading();
    }
}

// Definición global de premios (para sincronizar entre ruleta visual y generación aleatoria)
var PREMIOS_RULETA_CONFIG = [
    { nombre: 'NADA', porcentaje: 50.0, color: '#666666', color2: '#444444', emoji: '😔' },
    { nombre: 'Regalo COBRE', porcentaje: 3.0, color: '#CD7F32', color2: '#8B4513', emoji: '🥉' },
    { nombre: 'Regalo PLATA', porcentaje: 2.5, color: '#C0C0C0', color2: '#808080', emoji: '🥈' },
    { nombre: 'Regalo ORO', porcentaje: 1.5, color: '#FFD700', color2: '#FFA500', emoji: '🥇' },
    { nombre: '10€ BONO', porcentaje: 1.7, color: '#4CAF50', color2: '#2E7D32', emoji: '💶' },
    { nombre: '20€ BONO', porcentaje: 1.0, color: '#2196F3', color2: '#1565C0', emoji: '💶' },
    { nombre: '30€ BONO', porcentaje: 0.3, color: '#9C27B0', color2: '#6A1B9A', emoji: '💶' },
    { nombre: '50€ BONO', porcentaje: 0.2, color: '#F44336', color2: '#C62828', emoji: '💶' },
    { nombre: 'Tortuguita', porcentaje: 9.95, color: '#8BC34A', color2: '#689F38', emoji: '🐢' },
    { nombre: 'Chuche', porcentaje: 9.95, color: '#FF9800', color2: '#F57C00', emoji: '🍬' },
    { nombre: 'Panda', porcentaje: 9.95, color: '#000000', color2: '#FFFFFF', emoji: '🐼' },
    { nombre: 'Cacharrito', porcentaje: 9.95, color: '#607D8B', color2: '#37474F', emoji: '🎮' }
];

// Crear ruleta visual con todos los premios
function crearRuletaVisual() {
    var ruletaVisual = document.getElementById('ruleta-visual');
    if (!ruletaVisual) return;
    
    // Usar la configuración global de premios para asegurar sincronización
    var premios = PREMIOS_RULETA_CONFIG;
    
    // Crear conic-gradient con todos los premios
    var gradientes = [];
    var anguloAcumulado = 0;
    
    for (var i = 0; i < premios.length; i++) {
        var premio = premios[i];
        var anguloInicio = anguloAcumulado;
        var anguloFin = anguloAcumulado + (premio.porcentaje * 3.6); // 3.6 grados por 1%
        gradientes.push(premio.color + ' ' + anguloInicio + 'deg ' + anguloFin + 'deg');
        anguloAcumulado = anguloFin;
    }
    
    ruletaVisual.style.background = 'conic-gradient(' + gradientes.join(', ') + ')';
    
    // Guardar información de premios para calcular posición
    ruletaVisual.dataset.premios = JSON.stringify(premios);
}

// Calcular ángulo exacto donde debe parar según el premio
function calcularAnguloPremio(premioGanado) {
    var ruletaVisual = document.getElementById('ruleta-visual');
    if (!ruletaVisual || !ruletaVisual.dataset.premios) {
        // Si no hay datos, crear la ruleta primero
        crearRuletaVisual();
        ruletaVisual = document.getElementById('ruleta-visual');
        if (!ruletaVisual || !ruletaVisual.dataset.premios) return 0;
    }
    
    var premios = JSON.parse(ruletaVisual.dataset.premios);
    var anguloAcumulado = 0;
    
    // Buscar el premio y calcular su posición central
    for (var i = 0; i < premios.length; i++) {
        var premio = premios[i];
        var anguloSector = premio.porcentaje * 3.6;
        var anguloMedio = anguloAcumulado + (anguloSector / 2);
        
        // Normalizar nombre del premio para comparación (case-insensitive)
        var nombrePremio = premioGanado.trim().toUpperCase();
        var nombrePremioLista = premio.nombre.trim().toUpperCase();
        
        if (nombrePremio === nombrePremioLista) {
            // CORRECCIÓN CRÍTICA: El cálculo anterior estaba invertido
            // 
            // La flecha está fija arriba (0 grados = posición 12 en punto)
            // El conic-gradient empieza desde arriba (0 grados) y va en sentido horario
            // El ánguloMedio es la posición del centro del sector desde el inicio (0 grados)
            // 
            // Cuando rotamos la ruleta con rotate(Xdeg) en CSS:
            // - La rotación es en sentido horario (positivo) o antihorario (negativo)
            // - Si rotamos X grados positivos, todo se mueve X grados en sentido horario
            // 
            // Para que el sector que está en anguloMedio quede exactamente arriba (0°):
            // Necesitamos que después de rotar, el sector en anguloMedio quede en 0°
            // 
            // Si rotamos Y grados positivos: (anguloMedio + Y) mod 360 = 0
            // Esto significa: anguloMedio + Y = 360 (o múltiplos)
            // Por lo tanto: Y = 360 - anguloMedio
            // 
            // PERO: El problema es que CSS rotate() puede estar interpretando la rotación de manera diferente
            // o el conic-gradient puede estar empezando desde una posición diferente.
            // 
            // PRUEBA: Invertir el cálculo. Si rotamos -anguloMedio (sentido antihorario):
            // El sector que estaba en anguloMedio ahora estará en: (anguloMedio - anguloMedio) mod 360 = 0° ✓
            // 
            // Ejemplo con Chuche (naranja) en 270.5°:
            // Rotamos: -270.5° (sentido antihorario)
            // El sector ahora estará en: (270.5 - 270.5) mod 360 = 0° ✓
            var anguloRotacion = anguloMedio === 0 ? 0 : -anguloMedio;
            
            console.log('[RULETA] ========================================');
            console.log('[RULETA] Premio encontrado:', premioGanado);
            console.log('[RULETA] Sector visual:', anguloAcumulado.toFixed(1) + '°-' + (anguloAcumulado + anguloSector).toFixed(1) + '°');
            console.log('[RULETA] Centro del sector:', anguloMedio.toFixed(1) + '°');
            console.log('[RULETA] Rotación calculada (NUEVO MÉTODO):', anguloRotacion.toFixed(1) + '° (negativo = antihorario)');
            console.log('[RULETA] Verificación: Sector en ' + anguloMedio.toFixed(1) + '° + rotación ' + anguloRotacion.toFixed(1) + '° = ' + ((anguloMedio + anguloRotacion + 360) % 360).toFixed(1) + '° (debe ser 0°)');
            console.log('[RULETA] ========================================');
            
            return anguloRotacion;
        }
        
        anguloAcumulado += anguloSector;
    }
    
    // Si no se encuentra el premio, devolver 0
    console.warn('[RULETA] Premio no encontrado en la ruleta:', premioGanado);
    return 0;
}

// Mostrar animación de ruleta y resultado (MEJORADA CON RULETA VISUAL)
function mostrarAnimacionRuleta(premio) {
    var resultadoDiv = document.getElementById('ruleta-resultado');
    var premioText = document.getElementById('ruleta-premio-text');
    var ruletaVisual = document.getElementById('ruleta-visual');
    var ruletaContainer = document.getElementById('ruleta-visual-container');
    
    // Crear ruleta visual si no existe
    if (ruletaVisual && !ruletaVisual.dataset.premios) {
        crearRuletaVisual();
    }
    
    // Ocultar botón de ruleta temporalmente
    var btnRuleta = document.getElementById('btn-girar-ruleta');
    if (btnRuleta) {
        btnRuleta.style.display = 'none';
    }
    
    // Mostrar contenedor de resultado
    resultadoDiv.style.display = 'block';
    resultadoDiv.style.animation = 'none';
    void resultadoDiv.offsetWidth; // Forzar reflow
    resultadoDiv.style.animation = 'pulse-glow 0.5s ease-in-out';
    
    // Mostrar ruleta visual girando
    ruletaContainer.style.display = 'block';
    premioText.style.display = 'none';
    
    // Resetear rotación de la ruleta
    if (ruletaVisual) {
        ruletaVisual.style.transform = 'rotate(0deg)';
        ruletaVisual.style.transition = 'none';
    }
    
    // Efectos de partículas/confeti durante el giro
    crearEfectosGiro();
    
    // Calcular rotación final exacta según el premio
    var anguloPremio = calcularAnguloPremio(premio);
    console.log('[RULETA] Premio ganado:', premio, 'Ángulo calculado:', anguloPremio);
    
    var vueltasCompletas = 8 + Math.random() * 4; // Entre 8 y 12 vueltas para más emoción
    // Asegurar que el ángulo final sea positivo y correcto
    // Si anguloPremio es negativo, sumamos vueltas completas para hacerlo positivo
    var anguloFinal = (vueltasCompletas * 360) + anguloPremio;
    // Normalizar a un valor positivo (módulo 360 si es muy grande, pero mantener positivo)
    if (anguloFinal < 0) {
        anguloFinal = anguloFinal + Math.ceil(Math.abs(anguloFinal) / 360) * 360;
    }
    
    // Duración de la animación: 11 segundos (más emocionante)
    var duracionAnimacion = 11000; // 11 segundos en milisegundos
    
    console.log('[RULETA] Vueltas:', vueltasCompletas.toFixed(2), 'Ángulo final:', anguloFinal.toFixed(2));
    console.log('[RULETA] Duración de animación:', (duracionAnimacion / 1000) + ' segundos');
    
    // Iniciar animación de giro
    setTimeout(function() {
        if (ruletaVisual) {
            // Usar una curva de animación más dramática con desaceleración al final
            ruletaVisual.style.transition = 'transform ' + (duracionAnimacion / 1000) + 's cubic-bezier(0.25, 0.1, 0.25, 1)';
            ruletaVisual.style.transform = 'rotate(' + anguloFinal + 'deg)';
        }
    }, 50);
    
    // Simular giro de ruleta (duración ajustada para más dramatismo - 11 segundos)
    setTimeout(function() {
        // Detener efectos
        detenerEfectosGiro();
        
        // Ocultar ruleta visual
        ruletaContainer.style.display = 'none';
        premioText.style.display = 'block';
        
        if (premio === 'NADA') {
            premioText.innerHTML = '<div style="font-size: 48px; margin-bottom: 10px; animation: celebrate 0.6s ease-out;">😔</div><span class="premio-nada">No has ganado nada</span><div style="font-size: 14px; color: var(--text-secondary); margin-top: 10px;">¡Sigue intentando!</div>';
            premioText.className = 'ruleta-premio nada';
            resultadoDiv.style.borderColor = 'var(--text-secondary)';
            resultadoDiv.style.boxShadow = '0 0 20px rgba(128, 128, 128, 0.3)';
        } else {
            // Efecto de celebración para premios
            crearEfectosCelebracion();
            premioText.innerHTML = '<div style="font-size: 64px; margin-bottom: 15px; animation: celebrate 0.6s ease-out;">🎉</div><span class="premio-ganado">¡FELICIDADES!</span><br><span class="premio-nombre">' + premio + '</span><div style="font-size: 14px; color: var(--success); margin-top: 15px;">✨ ¡Premio añadido a tu cuenta! ✨</div>';
            premioText.className = 'ruleta-premio ganado';
            resultadoDiv.style.borderColor = 'var(--success)';
            resultadoDiv.style.boxShadow = '0 0 40px rgba(0, 210, 106, 0.5)';
        }
        
        // Mostrar botón de nuevo
        if (btnRuleta) {
            btnRuleta.style.display = 'flex';
        }
        
        // Enviar notificación
        if (premio !== 'NADA') {
            enviarNotificacion('🎡 ¡Premio en la ruleta!', 'Has ganado: ' + premio, '🎡');
        }
    }, duracionAnimacion);
}

// Funciones auxiliares para efectos visuales
function crearEfectosGiro() {
    var resultadoDiv = document.getElementById('ruleta-resultado');
    if (!resultadoDiv) return;
    
    // Crear partículas girando alrededor
    for (var i = 0; i < 8; i++) {
        var particula = document.createElement('div');
        particula.className = 'particula-giro';
        particula.style.cssText = 'position: absolute; width: 6px; height: 6px; background: var(--primary); border-radius: 50%; pointer-events: none;';
        var angulo = (i * 45) * Math.PI / 180;
        particula.style.left = '50%';
        particula.style.top = '50%';
        particula.style.transform = 'translate(-50%, -50%) translate(' + (Math.cos(angulo) * 60) + 'px, ' + (Math.sin(angulo) * 60) + 'px)';
        particula.style.animation = 'orbitar 2s linear infinite';
        particula.style.animationDelay = (i * 0.25) + 's';
        resultadoDiv.appendChild(particula);
    }
}

function detenerEfectosGiro() {
    var resultadoDiv = document.getElementById('ruleta-resultado');
    if (!resultadoDiv) return;
    
    var particulas = resultadoDiv.querySelectorAll('.particula-giro');
    particulas.forEach(function(p) { p.remove(); });
}

function crearEfectosCelebracion() {
    var resultadoDiv = document.getElementById('ruleta-resultado');
    if (!resultadoDiv) return;
    
    // Crear confeti/estrellas
    var emojis = ['✨', '⭐', '🎉', '🎊', '💫'];
    for (var i = 0; i < 12; i++) {
        setTimeout(function() {
            var confeti = document.createElement('div');
            confeti.style.cssText = 'position: absolute; font-size: 20px; pointer-events: none; z-index: 10;';
            confeti.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            var x = Math.random() * 100;
            var y = Math.random() * 100;
            confeti.style.left = x + '%';
            confeti.style.top = y + '%';
            confeti.style.animation = 'confeti-caida 1.5s ease-out forwards';
            resultadoDiv.appendChild(confeti);
            
            setTimeout(function() { confeti.remove(); }, 1500);
        }, i * 100);
    }
}

// Cerrar resultado de la ruleta
function cerrarResultadoRuleta() {
    var resultadoDiv = document.getElementById('ruleta-resultado');
    var ruletaContainer = document.getElementById('ruleta-visual-container');
    var premioText = document.getElementById('ruleta-premio-text');
    
    if (resultadoDiv) {
        resultadoDiv.style.display = 'none';
        resultadoDiv.style.borderColor = 'var(--primary)';
        resultadoDiv.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.3)';
    }
    
    // Ocultar ruleta visual si está visible
    if (ruletaContainer) {
        ruletaContainer.style.display = 'none';
    }
    
    // Mostrar texto de premio por si estaba oculto
    if (premioText) {
        premioText.style.display = 'block';
    }
    
    // NO recargar puntos aquí - los puntos ya están actualizados localmente
    // Solo recargar si el usuario hace refresh manual
}

// Cargar historial de tiradas de ruleta
async function cargarHistorialRuleta() {
    if (!clienteActual) return;
    try {
        var resp = await supabase
            .from('tiradas_ruleta')
            .select('*')
            .eq('numero', clienteActual.numero)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .limit(50);
        
        if (resp.error) {
            console.error('Error cargando historial ruleta:', resp.error);
            return;
        }
        
        var listaRuleta = document.getElementById('historial-ruleta');
        var emptyRuleta = document.getElementById('empty-ruleta');
        
        if (!resp.data || resp.data.length === 0) {
            listaRuleta.style.display = 'none';
            emptyRuleta.style.display = 'block';
            return;
        }
        
        listaRuleta.style.display = 'flex';
        emptyRuleta.style.display = 'none';
        
        var html = '';
        for (var i = 0; i < resp.data.length; i++) {
            var tirada = resp.data[i];
            var fechaHora = formatDateFull(tirada.fecha);
            if (tirada.hora) {
                fechaHora += ' ' + formatHora(tirada.hora);
            }
            
            var clasePremio = tirada.gano_premio ? 'ganado' : 'nada';
            var iconoPremio = tirada.gano_premio ? '🎉' : '😔';
            
            html += '<div class="item-card ruleta-card ' + clasePremio + '">' +
                    '<div class="item-info">' +
                    '<div class="item-name">' + iconoPremio + ' ' + tirada.premio + '</div>' +
                    '<div class="item-date">' + fechaHora + '</div>' +
                    '</div>' +
                    '</div>';
        }
        
        listaRuleta.innerHTML = html;
    } catch (err) {
        console.error('Error cargando historial ruleta:', err);
    }
}

// Generar premio aleatorio según probabilidades (usa la misma configuración que la ruleta visual)
function generarPremioAleatorio() {
    // Usar la configuración global para asegurar sincronización
    var premios = PREMIOS_RULETA_CONFIG.map(function(p) {
        return { premio: p.nombre, probabilidad: p.porcentaje };
    });
    
    var premiosAcumulados = [];
    var acumulado = 0.0;
    
    for (var i = 0; i < premios.length; i++) {
        acumulado += premios[i].probabilidad;
        premiosAcumulados.push({
            premio: premios[i].premio,
            probabilidad_acumulada: acumulado
        });
    }
    
    var numeroAleatorio = Math.random() * 100;
    
    for (var j = 0; j < premiosAcumulados.length; j++) {
        if (numeroAleatorio <= premiosAcumulados[j].probabilidad_acumulada) {
            return premiosAcumulados[j].premio;
        }
    }
    
    return 'NADA';
}

// Función para toggle de secciones desplegables
function toggleSeccion(seccion) {
    var contenido = document.getElementById('contenido-' + seccion);
    var toggle = document.getElementById('toggle-' + seccion);
    
    if (!contenido || !toggle) return;
    
    if (contenido.style.display === 'none') {
        contenido.style.display = 'block';
        toggle.textContent = '▲';
        toggle.style.transform = 'rotate(0deg)';
        
        // Si es ofertas, cargar las ofertas si no están cargadas
        if (seccion === 'ofertas' && (!window.ofertasActivas || window.ofertasActivas.length === 0)) {
            cargarOfertas();
        }
    } else {
        contenido.style.display = 'none';
        toggle.textContent = '▼';
        toggle.style.transform = 'rotate(0deg)';
    }
}

// Mostrar modal de ayuda de la ruleta
function mostrarAyudaRuleta() {
    var modal = document.getElementById('modal-ayuda-ruleta');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevenir scroll del body
    }
}

// Cerrar modal de ayuda de la ruleta
function cerrarAyudaRuleta() {
    var modal = document.getElementById('modal-ayuda-ruleta');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll del body
    }
}
