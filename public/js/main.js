// Página de inicio: estado en vivo de la API, URL base y botones de copiar.
// Se carga como archivo externo porque la CSP no permite scripts en línea.
(function () {
    'use strict';

    const TIEMPO_MAXIMO_MS = 15000;
    const TEXTOS_HTTP = {
        200: 'OK',
        404: 'Not Found',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };

    const aviso = document.getElementById('aviso');

    function anunciar(mensaje) {
        if (!aviso) return;
        // Vaciar primero hace que el lector de pantalla repita el aviso aunque sea el mismo texto
        aviso.textContent = '';
        window.setTimeout(() => {
            aviso.textContent = mensaje;
        }, 50);
    }

    // ---------- URL base del servidor actual ----------

    const origen = window.location.origin;
    if (origen && origen !== 'null') {
        document.querySelectorAll('[data-origen]').forEach((elemento) => {
            elemento.textContent = origen;
        });
    }

    // ---------- JSON con colores (sin innerHTML) ----------

    const TOKEN_JSON = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

    function span(clase, texto) {
        const elemento = document.createElement('span');
        elemento.className = clase;
        elemento.textContent = texto;
        return elemento;
    }

    function jsonConColores(datos) {
        const texto = JSON.stringify(datos, null, 2);
        const fragmento = document.createDocumentFragment();
        let ultimo = 0;

        for (const coincidencia of texto.matchAll(TOKEN_JSON)) {
            const [completo, cadena, dosPuntos] = coincidencia;
            fragmento.append(texto.slice(ultimo, coincidencia.index));

            if (cadena && dosPuntos) {
                fragmento.append(span('j-clave', cadena), dosPuntos);
            } else if (cadena) {
                fragmento.append(span('j-texto', cadena));
            } else if (/^(true|false|null)$/.test(completo)) {
                fragmento.append(span('j-literal', completo));
            } else {
                fragmento.append(span('j-numero', completo));
            }
            ultimo = coincidencia.index + completo.length;
        }
        fragmento.append(texto.slice(ultimo));
        return fragmento;
    }

    // ---------- Estado en vivo: GET /api/health ----------

    const estado = document.getElementById('estado');
    const estadoTexto = document.getElementById('estado-texto');
    const codigo = document.getElementById('salud-codigo');
    const cuerpo = document.querySelector('#salud-json code');
    const recargar = document.getElementById('salud-recargar');
    let comprobando = false;

    function mostrarEstado(clave, texto) {
        estado.dataset.estado = clave;
        estadoTexto.textContent = texto;
        codigo.dataset.estado = clave;
    }

    function mostrarCuerpo(contenido) {
        const envoltura = document.createElement('span');
        envoltura.className = 'recien';
        envoltura.append(contenido);
        cuerpo.replaceChildren(envoltura);
    }

    async function comprobarSalud() {
        if (comprobando || !estado) return;
        comprobando = true;
        recargar?.setAttribute('aria-busy', 'true');
        mostrarEstado('cargando', 'Comprobando…');
        codigo.textContent = '…';

        const controlador = new AbortController();
        const temporizador = window.setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

        try {
            const respuesta = await fetch('/api/health', {
                cache: 'no-store',
                headers: { Accept: 'application/json' },
                signal: controlador.signal
            });

            let datos = null;
            try {
                datos = await respuesta.json();
            } catch {
                datos = null;
            }

            const enLinea = respuesta.ok && datos?.estado === 'ok';
            mostrarEstado(
                enLinea ? 'ok' : 'degradado',
                enLinea ? 'API en línea · MongoDB Atlas conectado' : 'Servicio degradado'
            );
            codigo.textContent = `${respuesta.status} ${respuesta.statusText || TEXTOS_HTTP[respuesta.status] || ''}`.trim();
            mostrarCuerpo(datos ? jsonConColores(datos) : span('j-comentario', '// La respuesta no es JSON'));
        } catch (error) {
            const motivo = error.name === 'AbortError' ? 'se agotó el tiempo de espera' : 'no hubo conexión con el servidor';
            mostrarEstado('degradado', 'Servicio degradado');
            codigo.textContent = 'Sin respuesta';
            mostrarCuerpo(span('j-comentario', `// Sin respuesta: ${motivo}`));
        } finally {
            window.clearTimeout(temporizador);
            recargar?.removeAttribute('aria-busy');
            comprobando = false;
        }
    }

    recargar?.addEventListener('click', comprobarSalud);
    comprobarSalud();

    // ---------- Botones de copiar ----------

    async function copiarTexto(texto) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(texto);
                return;
            } catch {
                // Permiso denegado o navegador embebido: se intenta el método clásico
            }
        }
        // Respaldo para contextos sin Clipboard API (http que no es localhost)
        const area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        const copiado = document.execCommand('copy');
        area.remove();
        if (!copiado) throw new Error('No se pudo copiar');
    }

    function marcarBoton(boton, exito) {
        const etiqueta = boton.querySelector('.btn-copiar-texto');
        const icono = boton.querySelector('use');
        window.clearTimeout(boton._temporizador);

        boton.toggleAttribute('data-copiado', exito);
        if (etiqueta) etiqueta.textContent = exito ? 'Copiado' : 'Error';
        if (icono && exito) icono.setAttribute('href', '#i-listo');

        boton._temporizador = window.setTimeout(() => {
            boton.removeAttribute('data-copiado');
            if (etiqueta) etiqueta.textContent = 'Copiar';
            if (icono) icono.setAttribute('href', '#i-copiar');
        }, 2000);
    }

    document.addEventListener('click', async (evento) => {
        const boton = evento.target.closest('[data-copiar]');
        if (!boton) return;

        const fuente = document.querySelector(boton.dataset.copiar);
        if (!fuente) return;

        try {
            await copiarTexto(fuente.textContent.trim());
            marcarBoton(boton, true);
            anunciar('Copiado al portapapeles');
        } catch {
            // Deja el texto seleccionado para que se pueda copiar con el teclado
            window.getSelection()?.selectAllChildren(fuente);
            marcarBoton(boton, false);
            anunciar('No se pudo copiar. El texto quedó seleccionado para copiarlo manualmente.');
        }
    });
})();
