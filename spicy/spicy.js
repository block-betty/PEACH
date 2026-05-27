/* ══ spicy module ════════════════════════════════════════════════════
   "Spicy" easter egg for PEACH.

   A very subtle toggle button (bottom-left). Toggling it ON:
     · Flips the entire visible UI from English to Spanish, live, by
       translating text nodes + select display/placeholder/title attributes
       against the dictionary below. A MutationObserver keeps re-rendered
       content (dashboards, tables, modals) translated as it appears.
     · Plays a song through a hidden <audio> element — audio only, no
       visible player. The track (song.mp3) was extracted from the source
       video so there is no heavyweight video/iframe to load.
   Toggling it OFF restores English everywhere and stops the song.

   Self-contained: drop <link rel="stylesheet" href="/spicy/spicy.css"> in
   <head> and <script defer src="/spicy/spicy.js"></script> before </body>.
   No markup changes required — the button and audio element are injected here. */

(function () {
  "use strict";

  var SONG_URL = "/spicy/song.mp3";           // extracted from youtu.be/ILN7hG4kUFg
  var STORAGE_KEY = "peach.spicy";            // "on" | "off"
  var VOLUME = 0.75;                          // HTML5 audio volume (0–1)

  /* ── EN → ES dictionary ───────────────────────────────────────────────
     Keys are matched after collapsing internal whitespace and trimming, so
     HTML indentation/line-wrapping does not matter. Brand tokens (PEACH,
     LOTO), proper data, codes and emails are intentionally left untranslated. */
  var DICT = {
    // Login / brand
    "Protected Equipment Access Control Hub": "Centro de Control de Acceso a Equipos Protegidos",
    "Sign In": "Iniciar Sesión",
    "Sign Up": "Registrarse",
    "Email / Admin": "Correo / Admin",
    "Password": "Contraseña",
    "Full Name": "Nombre Completo",
    "Email": "Correo Electrónico",
    "Confirm Password": "Confirmar Contraseña",
    "Requested User Group": "Grupo de Usuario Solicitado",
    "Role requests above Authorized User require Super Admin approval.": "Las solicitudes de rol superiores a Usuario Autorizado requieren la aprobación del Super Administrador.",
    "Create Account": "Crear Cuenta",
    "Authorized use only. Activity is recorded in the audit log.": "Uso autorizado únicamente. La actividad se registra en el registro de auditoría.",
    "Resend Verification Email": "Reenviar Correo de Verificación",
    "Track lock events and equipment status.": "Seguimiento de eventos de bloqueo y estado de los equipos.",

    // Nav / banner
    "Toolbar": "Barra de Herramientas",
    "Not signed in": "Sesión no iniciada",
    "Home": "Inicio",
    "PEACH Dashboard": "Panel de PEACH",
    "Create Lock Event": "Crear Evento de Bloqueo",
    "Check Out Lock": "Retirar Candado",
    "Search Records": "Buscar Registros",
    "Reports": "Informes",
    "Send Help Request": "Enviar Solicitud de Ayuda",
    "Admin": "Administración",
    "Manage Master Equipment List": "Gestionar Lista Maestra de Equipos",
    "Manage Lock Master List": "Gestionar Lista Maestra de Candados",
    "Manage Location List": "Gestionar Lista de Ubicaciones",
    "Manage Users": "Gestionar Usuarios",
    "Lock Application": "Bloquear Aplicación",

    // Dashboard
    "At a Glance": "Resumen General",
    "Locks by Building": "Candados por Edificio",
    "Locks by Department": "Candados por Departamento",
    "Active lock events grouped by building, counted by lock color. Empty buildings are hidden.": "Eventos de bloqueo activos agrupados por edificio, contados por color de candado. Los edificios vacíos se ocultan.",
    "Active lock events grouped by the assigned user's department. Free-text names that do not match the user index appear under \"Unassigned.\"": "Eventos de bloqueo activos agrupados por el departamento del usuario asignado. Los nombres de texto libre que no coinciden con el índice de usuarios aparecen como «Sin asignar».",
    "Active Lock Dashboard": "Panel de Candados Activos",
    "Remove lock only when safe condition is verified.": "Retire el candado solo cuando se verifique la condición segura.",
    "Quick Notes": "Notas Rápidas",
    "Completed Lock Catalog": "Catálogo de Candados Completados",
    "Locks removed from the dashboard are preserved here with removal details.": "Los candados retirados del panel se conservan aquí con los detalles de retiro.",
    "Audit Log": "Registro de Auditoría",

    // Table headers / common labels
    "Event ID": "ID de Evento",
    "Equipment": "Equipo",
    "Type": "Tipo",
    "Locked By / When": "Bloqueado Por / Cuándo",
    "Removed By / When": "Retirado Por / Cuándo",
    "Timestamp (UTC)": "Marca de Tiempo (UTC)",
    "Action": "Acción",
    "Actor": "Actor",
    "Details": "Detalles",
    "Details:": "Detalles:",
    "Asset #": "Activo #",
    "Class": "Clase",
    "Name": "Nombre",
    "Building": "Edificio",
    "Location": "Ubicación",
    "Room": "Sala",
    "Description": "Descripción",
    "Lock #": "Candado #",
    "Color": "Color",
    "Key Location": "Ubicación de la Llave",
    "Notes": "Notas",
    "User": "Usuario",
    "Locks Assigned": "Candados Asignados",
    "Number": "Número",
    "Issued": "Emitido",
    "Returned": "Devuelto",
    "Call Sign": "Indicativo",
    "Supervisor": "Supervisor",
    "Phone": "Teléfono",
    "Cell": "Celular",
    "LOTO Training": "Capacitación LOTO",
    "Last Training": "Última Capacitación",
    "Days Overdue": "Días Vencidos",
    "Locked By": "Bloqueado Por",
    "Locked At": "Bloqueado El",
    "Age (days)": "Antigüedad (días)",
    "Active Lock Events": "Eventos de Bloqueo Activos",
    "Active Locks": "Candados Activos",
    "Lock Number": "Número de Candado",
    "Days Held": "Días Retenido",
    "Primary": "Principal",
    "Results": "Resultados",
    "Department": "Departamento",

    // Create Lock Event modal
    "Locked Out By": "Bloqueado Por",
    "Link to Lock Master (optional)": "Vincular a Candado Maestro (opcional)",
    "Lock Location (optional)": "Ubicación del Candado (opcional)",
    "Lock Timestamp": "Marca de Tiempo del Bloqueo",
    "Expected Removal Date": "Fecha Estimada de Retiro",
    "Lock Reason": "Motivo del Bloqueo",
    "Key Location (Required for Green lock events)": "Ubicación de la Llave (Requerida para eventos de candado Verde)",
    "Lock Type": "Tipo de Candado",
    "Safety Verification": "Verificación de Seguridad",
    "Apply Lock": "Aplicar Candado",

    // Equipment modal
    "Room Number": "Número de Sala",
    "Equipment Class": "Clase de Equipo",
    "Equipment Name": "Nombre del Equipo",
    "Asset Number": "Número de Activo",
    "Add Equipment": "Agregar Equipo",
    "Cancel Edit": "Cancelar Edición",
    "Filter By Building": "Filtrar Por Edificio",
    "Mass Upload Equipment (Excel)": "Carga Masiva de Equipos (Excel)",
    "Upload Excel columns:": "Columnas de Excel a cargar:",
    "Existing rows are updated by asset number.": "Las filas existentes se actualizan por número de activo.",

    // Lock Master modal
    "Register lock inventory so lock events can reference assigned lock numbers and key control details.": "Registre el inventario de candados para que los eventos de bloqueo puedan referenciar los números de candado asignados y los detalles de control de llaves.",
    "Lock Color": "Color del Candado",
    "Add Lock to Master List": "Agregar Candado a la Lista Maestra",

    // Location modal
    "Add and maintain lock locations used by Create Lock Event.": "Agregue y mantenga las ubicaciones de candados usadas por Crear Evento de Bloqueo.",
    "Add Location": "Agregar Ubicación",

    // Checkout modal
    "Issue a physical lock to an authorized user. Track returns and view per-user assignment counts below.": "Entregue un candado físico a un usuario autorizado. Realice el seguimiento de las devoluciones y vea los conteos de asignación por usuario a continuación.",
    "Issue To User": "Entregar al Usuario",
    "Date of Issue": "Fecha de Entrega",
    "User Assignment Dashboard": "Panel de Asignación de Usuarios",
    "Currently Checked-Out Locks": "Candados Actualmente Retirados",
    "Check-Out / Return History": "Historial de Retiro / Devolución",

    // Users modal
    "User index for associating lock events to external personnel. Application account access and user-group roles are managed through email sign-in (Super Admin, Supervisor, Controlling Organization, Authorized User).": "Índice de usuarios para asociar eventos de bloqueo con personal externo. El acceso a la cuenta de la aplicación y los roles de grupo de usuario se gestionan mediante el inicio de sesión por correo (Super Administrador, Supervisor, Organización Controladora, Usuario Autorizado).",
    "User Type": "Tipo de Usuario",
    "First Name": "Nombre",
    "Last Name": "Apellido",
    "Phone Number": "Número de Teléfono",
    "Cell Phone": "Teléfono Celular",
    "LOTO Training Date": "Fecha de Capacitación LOTO",
    "Add User": "Agregar Usuario",
    "User Index": "Índice de Usuarios",

    // Reports modal
    "Reports refresh each time this view is opened.": "Los informes se actualizan cada vez que se abre esta vista.",
    "1. Overdue LOTO Training": "1. Capacitación LOTO Vencida",
    "Users with a training date older than one year, or with no training date on file.": "Usuarios con una fecha de capacitación de más de un año, o sin fecha de capacitación registrada.",
    "2. Aged Locks": "2. Candados Antiguos",
    "Active lock events older than 30 days that have not been removed.": "Eventos de bloqueo activos de más de 30 días que no han sido retirados.",
    "3. Excessive Locks": "3. Candados Excesivos",
    "Users with more than five active lock events (matched against the user index by name).": "Usuarios con más de cinco eventos de bloqueo activos (cotejados con el índice de usuarios por nombre).",
    "4. Configuration Warning": "4. Advertencia de Configuración",
    "Buildings with more than ten active lock events.": "Edificios con más de diez eventos de bloqueo activos.",
    "5. Lock Collector": "5. Acumulador de Candados",
    "Users with a green lock checked out for more than three days who have no matching active lock event.": "Usuarios con un candado verde retirado por más de tres días que no tienen un evento de bloqueo activo correspondiente.",

    // Search modal
    "Search Equipment and Lock Numbers": "Buscar Equipos y Números de Candado",
    "Search Term (equipment name, asset #, lock #, location, room)": "Término de Búsqueda (nombre de equipo, activo #, candado #, ubicación, sala)",
    "Search": "Buscar",
    "Enter a term to search equipment and lock records.": "Ingrese un término para buscar registros de equipos y candados.",

    // Help modal
    "Send Admin a Help Request": "Enviar Solicitud de Ayuda al Administrador",
    "This opens your email client to send a request to": "Esto abre su cliente de correo para enviar una solicitud a",
    "Request Type": "Tipo de Solicitud",
    "Help Request": "Solicitud de Ayuda",
    "Feature Suggestion": "Sugerencia de Función",
    "Bug Report": "Informe de Error",
    "Subject": "Asunto",
    "Open Email to Admin": "Abrir Correo al Administrador",

    // Remove modal
    "Safety Verification Required Before Lock Removal": "Verificación de Seguridad Requerida Antes de Retirar el Candado",
    "Removed By": "Retirado Por",
    "Removal Timestamp": "Marca de Tiempo de Retiro",
    "Removal Notes": "Notas de Retiro",
    "Cancel": "Cancelar",
    "Confirm Remove Lock": "Confirmar Retiro de Candado",

    // Roles / user types
    "Super Admin": "Super Administrador",
    "Controlling Organization": "Organización Controladora",
    "Authorized User": "Usuario Autorizado",
    "Affected User": "Usuario Afectado",
    "Equipment Controller": "Controlador de Equipo",
    "Administrator": "Administrador",
    "System": "Sistema",
    "Unknown Role": "Rol Desconocido",
    "Unknown User": "Usuario Desconocido",

    // Stat tiles / summaries
    "Indexed Users": "Usuarios Indexados",
    "Locks Checked Out": "Candados Retirados",
    "Overdue Locks": "Candados Vencidos",
    "Master Equipment": "Equipos Maestros",
    "Master Locks": "Candados Maestros",
    "Master Locations": "Ubicaciones Maestras",
    "Location Master": "Maestro de Ubicaciones",
    "Lock Master": "Candado Maestro",
    "Active Lock Event": "Evento de Bloqueo Activo",
    "Checked-Out Lock": "Candado Retirado",

    // Lock colors
    "Red (Life on the Line)": "Rojo (Vida en Riesgo)",
    "Red - Life": "Rojo - Vida",
    "Red Locks": "Candados Rojos",
    "Green (Configuration Control)": "Verde (Control de Configuración)",
    "Green - Config": "Verde - Config",
    "Green Locks": "Candados Verdes",
    "Red": "Rojo",
    "Green": "Verde",
    "Blue": "Azul",
    "Silver": "Plateado",

    // Equipment classes
    "Boiler": "Caldera",
    "Breaker": "Interruptor",
    "Chiller": "Enfriadora",
    "Furnace": "Horno",
    "Generator": "Generador",
    "Panel": "Tablero",
    "Pump": "Bomba",
    "Valve": "Válvula",
    "Outdoor": "Exterior",

    // Departments / teams
    "Controls": "Controles",
    "Electrical": "Eléctrica",
    "Engineering": "Ingeniería",
    "Operations": "Operaciones",
    "Safety": "Seguridad",
    "Projects": "Proyectos",
    "MAC Team": "Equipo MAC",
    "Critical Systems": "Sistemas Críticos",
    "Critical Infrastructure": "Infraestructura Crítica",

    // Safety checklist labels
    "Affected workers notified": "Trabajadores afectados notificados",
    "Energy sources isolated": "Fuentes de energía aisladas",
    "Zero-energy state verified": "Estado de energía cero verificado",

    // Dynamic submit-button labels
    "Save Equipment Changes": "Guardar Cambios de Equipo",
    "Save Location Changes": "Guardar Cambios de Ubicación",
    "Save Lock Changes": "Guardar Cambios de Candado",
    "Save Lock Event Changes": "Guardar Cambios del Evento de Bloqueo",

    // Status / placeholder values
    "Not set": "No establecido",
    "Missing": "Faltante",
    "Unassigned": "Sin asignar",
    "Unclassified": "Sin clasificar",
    "Unspecified": "Sin especificar",
    "Unverified": "Sin verificar",
    "Unknown": "Desconocido",
    "No description provided": "No se proporcionó descripción",
    "Signed in": "Sesión iniciada",
    "Application locked": "Aplicación bloqueada",
    "Application locked (legacy mode)": "Aplicación bloqueada (modo heredado)",
    "Application unlocked (legacy mode)": "Aplicación desbloqueada (modo heredado)",
    "Verification email sent.": "Correo de verificación enviado.",

    // Validation / status messages
    "Account created. Sign in with your new credentials.": "Cuenta creada. Inicie sesión con sus nuevas credenciales.",
    "Account created. Verify your email before access is granted.": "Cuenta creada. Verifique su correo antes de que se conceda el acceso.",
    "Add equipment to the master list before creating a lock event.": "Agregue equipos a la lista maestra antes de crear un evento de bloqueo.",
    "All signup fields are required.": "Todos los campos de registro son obligatorios.",
    "All user fields are required.": "Todos los campos de usuario son obligatorios.",
    "Another equipment record already uses this asset number.": "Otro registro de equipo ya usa este número de activo.",
    "Another lock master entry already uses this lock number.": "Otra entrada de candado maestro ya usa este número de candado.",
    "Authentication error.": "Error de autenticación.",
    "Authentication request failed.": "La solicitud de autenticación falló.",
    "Building, room, and description are required.": "El edificio, la sala y la descripción son obligatorios.",
    "Call sign already exists in the user index.": "El indicativo ya existe en el índice de usuarios.",
    "Email already registered.": "El correo ya está registrado.",
    "Email and password are required.": "El correo y la contraseña son obligatorios.",
    "Email format is invalid.": "El formato del correo es inválido.",
    "Email/Admin and password are required.": "El correo/admin y la contraseña son obligatorios.",
    "Enter a valid email address.": "Ingrese una dirección de correo válida.",
    "Enter your username for equipment edits:": "Ingrese su nombre de usuario para editar equipos:",
    "Enter your username for lock event edits:": "Ingrese su nombre de usuario para editar eventos de bloqueo:",
    "Enter your username for lock master deletion:": "Ingrese su nombre de usuario para eliminar candado maestro:",
    "Enter your username for lock master edits:": "Ingrese su nombre de usuario para editar candado maestro:",
    "Equipment record no longer exists.": "El registro de equipo ya no existe.",
    "Excel file contains no worksheet.": "El archivo Excel no contiene ninguna hoja.",
    "Excel parser is unavailable. Reload the page and try again.": "El analizador de Excel no está disponible. Recargue la página e intente de nuevo.",
    "Expected removal date cannot be earlier than lock timestamp.": "La fecha estimada de retiro no puede ser anterior a la marca de tiempo del bloqueo.",
    "Expected removal date is required.": "La fecha estimada de retiro es obligatoria.",
    "Incorrect credentials.": "Credenciales incorrectas.",
    "Incorrect email or password.": "Correo o contraseña incorrectos.",
    "Invalid lock color selected.": "Color de candado inválido seleccionado.",
    "Invalid lock color.": "Color de candado inválido.",
    "Key location is required for green lock entries.": "La ubicación de la llave es obligatoria para entradas de candado verde.",
    "Key location is required for green lock events.": "La ubicación de la llave es obligatoria para eventos de candado verde.",
    "Local auth API is unavailable.": "La API de autenticación local no está disponible.",
    "Location already exists in the location list.": "La ubicación ya existe en la lista de ubicaciones.",
    "Location record no longer exists.": "El registro de ubicación ya no existe.",
    "Lock color, lock number, user, and date of issue are required.": "El color del candado, el número de candado, el usuario y la fecha de entrega son obligatorios.",
    "Lock event no longer exists.": "El evento de bloqueo ya no existe.",
    "Lock master record no longer exists.": "El registro de candado maestro ya no existe.",
    "Lock number already exists in the lock master list.": "El número de candado ya existe en la lista de candados maestros.",
    "Lock number is required.": "El número de candado es obligatorio.",
    "Lock number, color, building, location, and room are required.": "El número de candado, color, edificio, ubicación y sala son obligatorios.",
    "No equipment rows found in the Excel worksheet.": "No se encontraron filas de equipos en la hoja de Excel.",
    "Password does not meet security requirements.": "La contraseña no cumple los requisitos de seguridad.",
    "Password must be at least 12 characters.": "La contraseña debe tener al menos 12 caracteres.",
    "Password must include at least one number.": "La contraseña debe incluir al menos un número.",
    "Password must include at least one symbol.": "La contraseña debe incluir al menos un símbolo.",
    "Password must include upper and lower case letters.": "La contraseña debe incluir mayúsculas y minúsculas.",
    "Passwords do not match.": "Las contraseñas no coinciden.",
    "Safety verification is required before lock removal.": "La verificación de seguridad es obligatoria antes de retirar el candado.",
    "Select a valid department.": "Seleccione un departamento válido.",
    "Select a valid lock type.": "Seleccione un tipo de candado válido.",
    "Select a valid user type.": "Seleccione un tipo de usuario válido.",
    "Selected equipment is not available.": "El equipo seleccionado no está disponible.",
    "Selected lock location no longer exists.": "La ubicación del candado seleccionada ya no existe.",
    "Selected lock master record no longer exists.": "El registro de candado maestro seleccionado ya no existe.",
    "Selected user is no longer in the user index.": "El usuario seleccionado ya no está en el índice de usuarios.",
    "Subject and details are required.": "El asunto y los detalles son obligatorios.",
    "Super Admin cannot be requested from self-service signup.": "No se puede solicitar Super Administrador desde el registro de autoservicio.",
    "Too many attempts. Please wait and try again.": "Demasiados intentos. Espere e intente de nuevo.",
    "Unable to reach local authentication service.": "No se puede contactar el servicio de autenticación local.",
    "User account not found.": "Cuenta de usuario no encontrada.",
    "Username is required for this edit.": "Se requiere nombre de usuario para esta edición.",
    "Your role does not have access to the dashboard.": "Su rol no tiene acceso al panel.",
    "Your role does not have access to this section.": "Su rol no tiene acceso a esta sección.",

    // Permission messages
    "You do not have permission to add equipment.": "No tiene permiso para agregar equipos.",
    "You do not have permission to add locations.": "No tiene permiso para agregar ubicaciones.",
    "You do not have permission to add lock master records.": "No tiene permiso para agregar registros de candado maestro.",
    "You do not have permission to add users.": "No tiene permiso para agregar usuarios.",
    "You do not have permission to check out locks.": "No tiene permiso para retirar candados.",
    "You do not have permission to create lock events.": "No tiene permiso para crear eventos de bloqueo.",
    "You do not have permission to delete locations.": "No tiene permiso para eliminar ubicaciones.",
    "You do not have permission to edit equipment.": "No tiene permiso para editar equipos.",
    "You do not have permission to edit locations.": "No tiene permiso para editar ubicaciones.",
    "You do not have permission to edit lock events.": "No tiene permiso para editar eventos de bloqueo.",
    "You do not have permission to edit lock master records.": "No tiene permiso para editar registros de candado maestro.",
    "You do not have permission to remove lock events.": "No tiene permiso para retirar eventos de bloqueo.",
    "You do not have permission to remove lock master records.": "No tiene permiso para eliminar registros de candado maestro.",
    "You do not have permission to remove users.": "No tiene permiso para eliminar usuarios.",
    "You do not have permission to return locks.": "No tiene permiso para devolver candados.",
    "You do not have permission to search records.": "No tiene permiso para buscar registros.",
    "You do not have permission to send help requests.": "No tiene permiso para enviar solicitudes de ayuda.",
    "You do not have permission to upload equipment.": "No tiene permiso para cargar equipos.",

    // Input placeholders (instructional hints; format/code samples left as-is)
    "user@domain.com or Admin": "usuario@dominio.com o Admin",
    "First Last": "Nombre Apellido",
    "12+ chars, upper/lower/number/symbol": "12+ caracteres, mayúsc/minúsc/número/símbolo",
    "e.g. 0421": "ej. 0421",
    "e.g. Bravo-7": "ej. Bravo-7",
    "Enter search term": "Ingrese el término de búsqueda",
    "Reason equipment is locked out": "Motivo por el que el equipo está bloqueado",
    "Cabinet, safe, control room, or key manager location": "Gabinete, caja fuerte, sala de control o ubicación del encargado de llaves",
    "Mechanical Yard East": "Patio Mecánico Este",
    "Electrical Yard North": "Patio Eléctrico Norte",
    "Room 110 / Roof / Exterior": "Sala 110 / Techo / Exterior",
    "Room 102 / Roof / Exterior": "Sala 102 / Techo / Exterior",
    "Room 2B / Exterior / Roof": "Sala 2B / Exterior / Techo",
    "Hydraulic Press #4": "Prensa Hidráulica #4",
    "Short equipment description and critical notes": "Descripción breve del equipo y notas críticas",
    "Short location description": "Descripción breve de la ubicación",
    "Key cabinet / lock box / supervisor desk": "Gabinete de llaves / caja de candados / escritorio del supervisor",
    "Optional lock-specific constraints or custody notes": "Restricciones específicas del candado o notas de custodia (opcional)",
    "Optional closeout notes": "Notas de cierre (opcional)",
    "Employee name or ID": "Nombre o ID del empleado",
    "Short summary": "Resumen breve",
    "What do you need help with?": "¿Con qué necesita ayuda?"
  };

  /* ── Live DOM translator ───────────────────────────────────────────── */

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, OPTION: 1, TEXTAREA: 1, IFRAME: 1 };
  var ATTRS = ["placeholder", "title", "aria-label"];
  var changedText = new Map();   // textNode -> original nodeValue
  var changedAttrs = new Map();  // element  -> { attrName: originalValue }
  var observer = null;
  var active = false;

  function normKey(s) {
    return s.replace(/\s+/g, " ").trim();
  }

  function translateString(s) {
    if (s == null) return null;
    var key = normKey(s);
    if (!key) return null;
    var es = DICT[key];
    if (es == null) return null;
    var lead = (s.match(/^\s*/) || [""])[0];
    var trail = (s.match(/\s*$/) || [""])[0];
    return lead + es + trail;
  }

  function isSkipped(node) {
    var el = node;
    while (el && el.nodeType === 1) {
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.hasAttribute && el.hasAttribute("data-spicy-skip")) return true;
      el = el.parentNode;
    }
    return false;
  }

  function translateTextNode(node) {
    var t = node.nodeValue;
    var translated = translateString(t);
    if (translated != null && translated !== t) {
      changedText.set(node, t);   // store/refresh the English original
      node.nodeValue = translated;
    }
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var v = el.getAttribute(a);
      var t = translateString(v);
      if (t != null && t !== v) {
        var rec = changedAttrs.get(el) || {};
        if (!(a in rec)) rec[a] = v;
        changedAttrs.set(el, rec);
        el.setAttribute(a, t);
      }
    }
    if (el.tagName === "INPUT") {
      var type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "button" || type === "submit" || type === "reset") {
        var vv = el.getAttribute("value");
        var tt = translateString(vv);
        if (tt != null && tt !== vv) {
          var r = changedAttrs.get(el) || {};
          if (!("value" in r)) r.value = vv;
          changedAttrs.set(el, r);
          el.setAttribute("value", tt);
        }
      }
    }
  }

  function walk(root) {
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return isSkipped(n.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var list = [];
    var n;
    while ((n = tw.nextNode())) list.push(n);
    for (var i = 0; i < list.length; i++) translateTextNode(list[i]);

    if (root.nodeType === 1 && !isSkipped(root)) translateAttrs(root);
    if (root.querySelectorAll) {
      var els = root.querySelectorAll("*");
      for (var k = 0; k < els.length; k++) {
        if (!isSkipped(els[k])) translateAttrs(els[k]);
      }
    }
  }

  function processNode(node) {
    if (node.nodeType === 3) {
      if (!isSkipped(node.parentNode)) translateTextNode(node);
      return;
    }
    if (node.nodeType !== 1 || isSkipped(node)) return;
    walk(node);
  }

  var OBS_OPTS = { childList: true, subtree: true, characterData: true };

  function handleMutations(records) {
    observer.disconnect();
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (rec.type === "characterData") {
        if (!isSkipped(rec.target.parentNode)) translateTextNode(rec.target);
      } else {
        for (var j = 0; j < rec.addedNodes.length; j++) processNode(rec.addedNodes[j]);
      }
    }
    if (active) observer.observe(document.body, OBS_OPTS);
  }

  function activateTranslation() {
    walk(document.body);
    if (!observer) observer = new MutationObserver(handleMutations);
    observer.observe(document.body, OBS_OPTS);
  }

  function deactivateTranslation() {
    if (observer) observer.disconnect();
    changedText.forEach(function (orig, node) {
      try { node.nodeValue = orig; } catch (_) {}
    });
    changedText.clear();
    changedAttrs.forEach(function (rec, el) {
      Object.keys(rec).forEach(function (a) {
        try { el.setAttribute(a, rec[a]); } catch (_) {}
      });
    });
    changedAttrs.clear();
  }

  /* ── Hidden audio ──────────────────────────────────────────────────────
     The song was extracted from the source video to a small MP3 and plays
     through a bare <audio loop> element — no visible player, no YouTube
     iframe (far lighter than embedding the video). Created lazily on first
     use so it costs nothing for visitors who never toggle Spicy on. */

  var audio = null;
  var armed = false;

  function getAudio() {
    if (audio) return audio;
    audio = document.createElement("audio");
    audio.id = "spicy-audio";
    audio.src = SONG_URL;
    audio.loop = true;
    audio.preload = "none";
    audio.volume = VOLUME;
    audio.setAttribute("data-spicy-skip", "");
    document.body.appendChild(audio);
    return audio;
  }

  function startAudio() {
    var a = getAudio();
    var p = a.play();
    // If autoplay is blocked (e.g. Spicy was restored from storage with no
    // gesture yet), resume on the next user interaction.
    if (p && typeof p.catch === "function") {
      p.catch(function () { armAudioOnGesture(); });
    }
  }

  function stopAudio() {
    if (audio) { try { audio.pause(); } catch (_) {} }
  }

  // Browsers block sound until a user gesture. When Spicy is restored from
  // storage (not a click), start the song on the next interaction.
  function armAudioOnGesture() {
    if (armed) return;
    armed = true;
    var events = ["pointerdown", "keydown", "touchstart"];
    function go() {
      armed = false;
      events.forEach(function (ev) { document.removeEventListener(ev, go, true); });
      if (active) startAudio();
    }
    events.forEach(function (ev) { document.addEventListener(ev, go, true); });
  }

  /* ── Toggle button + wiring ────────────────────────────────────────── */

  var btn = null;

  function injectButton() {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "spicy-toggle";
    btn.setAttribute("data-spicy-skip", "");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Toggle Spicy mode");
    btn.title = "Spicy";
    btn.innerHTML = '<span class="spicy-dot"></span><span>Spicy</span>';
    btn.addEventListener("click", function () {
      setActive(!active, true);
    });
    document.body.appendChild(btn);
  }

  function setActive(on, userGesture) {
    active = on;
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
    document.documentElement.lang = on ? "es" : "en";
    try { localStorage.setItem(STORAGE_KEY, on ? "on" : "off"); } catch (_) {}

    if (on) {
      activateTranslation();
      if (userGesture) startAudio();
      else armAudioOnGesture();
    } else {
      deactivateTranslation();
      stopAudio();
    }
  }

  function init() {
    injectButton();
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    if (stored === "on") setActive(true, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
