let currentUser = null;
let expedientes = [];
let distritos = [];
let organismos = [];
let currentExpediente = null;
let usuarios = [];
let derivaciones = [];
let currentDeriveExpediente = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserInfo();
    await loadReferenceData();
    await loadExpedientes();
    await loadDashboardStats();
    setupEventListeners();
    
    // Show dashboard by default
    showTab('dashboard');
});

// Load user information
async function loadUserInfo() {
    try {
        const response = await fetch('/api/user');
        currentUser = await response.json();
        
        document.getElementById('user-name').textContent = currentUser.nombre;
        const roleSpan = document.getElementById('user-role');
        roleSpan.textContent = currentUser.rol_sistema;
        roleSpan.className = currentUser.rol_sistema === 'ADMIN' 
            ? 'px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800'
            : 'px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800';
        
        // Show admin menu if user is admin
        if (currentUser.rol_sistema === 'ADMIN') {
            document.getElementById('admin-menu').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

// Load reference data
async function loadReferenceData() {
    try {
        const [distritosRes, organismosRes] = await Promise.all([
            fetch('/api/distritos'),
            fetch('/api/organismos')
        ]);
        
        distritos = await distritosRes.json();
        organismos = await organismosRes.json();
        
        populateSelects();
    } catch (error) {
        console.error('Error loading reference data:', error);
    }
}

// Populate select elements
function populateSelects() {
    const distritoSelect = document.querySelector('select[name="distrito_judicial_id"]');
    const organismoSelect = document.querySelector('select[name="organo_jurisdiccional_id"]');
    
    distritoSelect.innerHTML = '<option value="">Seleccionar distrito</option>';
    organismoSelect.innerHTML = '<option value="">Seleccionar órgano</option>';
    
    distritos.forEach(distrito => {
        distritoSelect.innerHTML += `<option value="${distrito.id_distrito}">${distrito.nombre_distrito}</option>`;
    });
    
    organismos.forEach(organismo => {
        organismoSelect.innerHTML += `<option value="${organismo.id_organismo}">${organismo.nombre_organismo}</option>`;
    });
}

// Load expedientes
async function loadExpedientes() {
    try {
        const response = await fetch('/api/expedientes');
        expedientes = await response.json();
        renderExpedientes(expedientes);
    } catch (error) {
        console.error('Error loading expedientes:', error);
    }
}

// Render expedientes table
function renderExpedientes(data) {
    const tbody = document.getElementById('expedientesTable');
    
    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                    No hay expedientes registrados
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = data.map(exp => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                ${exp.cod_expediente}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
                ${exp.sumilla ? exp.sumilla.substring(0, 50) + '...' : 'Sin sumilla'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(exp.estado_expediente)}">
                    ${exp.estado_expediente}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${exp.nombre_distrito || 'N/A'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${formatDate(exp.fecha_registro)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button onclick="viewExpediente('${exp.cod_expediente}')" 
                    class="text-sky-600 hover:text-sky-900 transition-colors">
                    Ver
                </button>
                <button onclick="editExpediente('${exp.cod_expediente}')" 
                    class="text-indigo-600 hover:text-indigo-900 transition-colors">
                    Editar
                </button>
                <button onclick="viewDocuments('${exp.cod_expediente}')" 
                    class="text-green-600 hover:text-green-900 transition-colors">
                    Documentos
                </button>
                ${currentUser.rol_sistema === 'ADMIN' ? `
                    <button onclick="openDeriveModal('${exp.cod_expediente}')" 
                        class="text-purple-600 hover:text-purple-900 transition-colors">
                        Derivar
                    </button>
                ` : ''}
                ${currentUser.rol_sistema === 'ADMIN' ? `
                    <button onclick="deleteExpediente('${exp.cod_expediente}')" 
                        class="text-red-600 hover:text-red-900 transition-colors">
                        Eliminar
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

// Get status color
function getStatusColor(status) {
    switch (status) {
        case 'ACTIVO': return 'bg-green-100 text-green-800';
        case 'ARCHIVADO': return 'bg-gray-100 text-gray-800';
        case 'SUSPENDIDO': return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-blue-100 text-blue-800';
    }
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = expedientes.filter(exp => 
            exp.cod_expediente.toLowerCase().includes(searchTerm) ||
            (exp.sumilla && exp.sumilla.toLowerCase().includes(searchTerm)) ||
            (exp.nombre_distrito && exp.nombre_distrito.toLowerCase().includes(searchTerm))
        );
        renderExpedientes(filtered);
    });

    // Form submission
    document.getElementById('expedienteForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('uploadForm').addEventListener('submit', handleFileUpload);
    document.getElementById('userForm').addEventListener('submit', handleUserSubmit);
    document.getElementById('deriveForm').addEventListener('submit', handleDeriveSubmit);
}

// Modal functions
function openCreateModal() {
    document.getElementById('modalTitle').textContent = 'Nuevo Expediente';
    document.getElementById('expedienteForm').reset();
    document.querySelector('input[name="cod_expediente"]').disabled = false;
    currentExpediente = null;
    document.getElementById('expedienteModal').classList.remove('hidden');
}

function editExpediente(cod) {
    const expediente = expedientes.find(exp => exp.cod_expediente === cod);
    if (!expediente) return;
    
    document.getElementById('modalTitle').textContent = 'Editar Expediente';
    document.querySelector('input[name="cod_expediente"]').disabled = true;
    currentExpediente = cod;
    
    // Fill form with expediente data
    const form = document.getElementById('expedienteForm');
    Object.keys(expediente).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = expediente[key] || '';
        }
    });
    
    document.getElementById('expedienteModal').classList.remove('hidden');
}

function viewExpediente(cod) {
    const expediente = expedientes.find(exp => exp.cod_expediente === cod);
    if (!expediente) return;
    
    // Create a read-only view
    editExpediente(cod);
    document.getElementById('modalTitle').textContent = 'Ver Expediente';
    
    // Disable all form inputs
    const form = document.getElementById('expedienteForm');
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => input.disabled = true);
    
    // Hide save button
    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.style.display = 'none';
}

function closeModal() {
    document.getElementById('expedienteModal').classList.add('hidden');
    
    // Re-enable form inputs
    const form = document.getElementById('expedienteForm');
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => input.disabled = false);
    
    // Show save button
    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.style.display = 'inline-block';
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    try {
        const url = currentExpediente ? `/api/expedientes/${currentExpediente}` : '/api/expedientes';
        const method = currentExpediente ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            await loadExpedientes();
            await loadDashboardStats();
            showNotification('Expediente guardado exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al guardar expediente', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// Delete expediente
async function deleteExpediente(cod) {
    if (!confirm('¿Está seguro de que desea eliminar este expediente?')) return;
    
    try {
        const response = await fetch(`/api/expedientes/${cod}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadExpedientes();
            await loadDashboardStats();
            showNotification('Expediente eliminado exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al eliminar expediente', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// Documents functionality
async function viewDocuments(cod) {
    currentExpediente = cod;
    document.getElementById('documentsModal').classList.remove('hidden');
    await loadDocuments(cod);
}

function closeDocumentsModal() {
    document.getElementById('documentsModal').classList.add('hidden');
    currentExpediente = null;
}

async function loadDocuments(cod) {
    try {
        const response = await fetch(`/api/expedientes/${cod}/documentos`);
        const documents = await response.json();
        renderDocuments(documents);
    } catch (error) {
        console.error('Error loading documents:', error);
    }
}

function renderDocuments(documents) {
    const container = document.getElementById('documentsList');
    
    if (documents.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No hay documentos subidos</p>';
        return;
    }
    
    container.innerHTML = documents.map(doc => `
        <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div class="flex items-center space-x-3">
                <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                </svg>
                <div>
                    <h4 class="font-medium text-gray-900">${doc.nombre_documento}</h4>
                    <p class="text-sm text-gray-500">
                        Subido por ${doc.usuario_subida} el ${formatDate(doc.fecha_subida)}
                    </p>
                    <p class="text-xs text-gray-400">${formatFileSize(doc.tamaño_archivo)}</p>
                </div>
            </div>
            <div class="flex space-x-2">
                <button onclick="downloadDocument(${doc.id_documento})" 
                    class="text-sky-600 hover:text-sky-900 transition-colors">
                    Descargar
                </button>
                <button onclick="deleteDocument(${doc.id_documento})" 
                    class="text-red-600 hover:text-red-900 transition-colors">
                    Eliminar
                </button>
            </div>
        </div>
    `).join('');
}

async function handleFileUpload(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch(`/api/expedientes/${currentExpediente}/documentos`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            e.target.reset();
            await loadDocuments(currentExpediente);
            showNotification('Documento subido exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al subir documento', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function downloadDocument(id) {
    window.open(`/api/documentos/${id}/download`, '_blank');
}

async function deleteDocument(id) {
    if (!confirm('¿Está seguro de que desea eliminar este documento?')) return;
    
    try {
        const response = await fetch(`/api/documentos/${id}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadDocuments(currentExpediente);
            showNotification('Documento eliminado exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al eliminar documento', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

async function logout() {
    try {
        await fetch('/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (error) {
        console.error('Error logging out:', error);
    }
}
// Users Management Functions
async function openUsersModal() {
    document.getElementById('usersModal').classList.remove('hidden');
    await loadUsers();
}

function closeUsersModal() {
    document.getElementById('usersModal').classList.add('hidden');
    document.getElementById('userForm').reset();
}

async function loadUsers() {
    try {
        const response = await fetch('/api/usuarios');
        usuarios = await response.json();
        renderUsers(usuarios);
        populateUserSelects();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTable');
    
    tbody.innerHTML = users.map(user => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                ${user.nombre}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${user.email}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${user.rol_sistema === 'ADMIN' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">
                    ${user.rol_sistema}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${user.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    ${user.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button onclick="toggleUserStatus(${user.id_usuario}, ${!user.activo})" 
                    class="text-indigo-600 hover:text-indigo-900 transition-colors">
                    ${user.activo ? 'Desactivar' : 'Activar'}
                </button>
                ${user.id_usuario !== currentUser.id_usuario ? `
                    <button onclick="deleteUser(${user.id_usuario})" 
                        class="text-red-600 hover:text-red-900 transition-colors">
                        Eliminar
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function populateUserSelects() {
    const userSelect = document.querySelector('select[name="usuario_destino"]');
    userSelect.innerHTML = '<option value="">Seleccionar usuario</option>';
    
    usuarios.filter(user => user.activo && user.id_usuario !== currentUser.id_usuario).forEach(user => {
        userSelect.innerHTML += `<option value="${user.id_usuario}">${user.nombre} (${user.email})</option>`;
    });
}

async function handleUserSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    try {
        const response = await fetch('/api/usuarios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            e.target.reset();
            await loadUsers();
            showNotification('Usuario creado exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al crear usuario', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function toggleUserStatus(userId, newStatus) {
    try {
        const user = usuarios.find(u => u.id_usuario === userId);
        const response = await fetch(`/api/usuarios/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                nombre: user.nombre,
                rol_sistema: user.rol_sistema,
                activo: newStatus
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadUsers();
            showNotification(`Usuario ${newStatus ? 'activado' : 'desactivado'} exitosamente`, 'success');
        } else {
            showNotification(result.error || 'Error al actualizar usuario', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('¿Está seguro de que desea eliminar este usuario?')) return;
    
    try {
        const response = await fetch(`/api/usuarios/${userId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadUsers();
            showNotification('Usuario eliminado exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al eliminar usuario', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

// Derivation Functions
function openDeriveModal(cod) {
    currentDeriveExpediente = cod;
    document.getElementById('derive-expediente').value = cod;
    document.getElementById('deriveModal').classList.remove('hidden');
}

function closeDeriveModal() {
    document.getElementById('deriveModal').classList.add('hidden');
    document.getElementById('deriveForm').reset();
    currentDeriveExpediente = null;
}

async function handleDeriveSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    data.cod_expediente = currentDeriveExpediente;
    
    try {
        const response = await fetch('/api/derivaciones', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeDeriveModal();
            showNotification('Expediente derivado exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al derivar expediente', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function openDerivationsModal() {
    document.getElementById('derivationsModal').classList.remove('hidden');
    await loadDerivations();
}

function closeDerivationsModal() {
    document.getElementById('derivationsModal').classList.add('hidden');
}

async function loadDerivations() {
    try {
        const response = await fetch('/api/derivaciones');
        derivaciones = await response.json();
        renderDerivations(derivaciones);
    } catch (error) {
        console.error('Error loading derivations:', error);
    }
}

function renderDerivations(derivations) {
    const tbody = document.getElementById('derivationsTable');
    
    if (derivations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                    No hay derivaciones registradas
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = derivations.map(der => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                ${der.cod_expediente}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${der.usuario_origen_nombre}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${der.usuario_destino_nombre}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${getDerivationStatusColor(der.estado)}">
                    ${der.estado}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${formatDate(der.fecha_derivacion)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                ${der.estado === 'PENDIENTE' && der.usuario_destino === currentUser.id_usuario ? `
                    <button onclick="acceptDerivation(${der.id_derivacion})" 
                        class="text-green-600 hover:text-green-900 transition-colors">
                        Aceptar
                    </button>
                    <button onclick="rejectDerivation(${der.id_derivacion})" 
                        class="text-red-600 hover:text-red-900 transition-colors">
                        Rechazar
                    </button>
                ` : `
                    <button onclick="viewDerivationDetails(${der.id_derivacion})" 
                        class="text-sky-600 hover:text-sky-900 transition-colors">
                        Ver
                    </button>
                `}
            </td>
        </tr>
    `).join('');
}

function getDerivationStatusColor(status) {
    switch (status) {
        case 'PENDIENTE': return 'bg-yellow-100 text-yellow-800';
        case 'ACEPTADA': return 'bg-green-100 text-green-800';
        case 'RECHAZADA': return 'bg-red-100 text-red-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

async function acceptDerivation(id) {
    const observaciones = prompt('Observaciones (opcional):');
    
    try {
        const response = await fetch(`/api/derivaciones/${id}/aceptar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ observaciones: observaciones || '' })
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadDerivations();
            showNotification('Derivación aceptada exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al aceptar derivación', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

async function rejectDerivation(id) {
    const observaciones = prompt('Motivo del rechazo:');
    if (!observaciones) return;
    
    try {
        const response = await fetch(`/api/derivaciones/${id}/rechazar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ observaciones })
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadDerivations();
            showNotification('Derivación rechazada exitosamente', 'success');
        } else {
            showNotification(result.error || 'Error al rechazar derivación', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión', 'error');
    }
}

function viewDerivationDetails(id) {
    const derivation = derivaciones.find(d => d.id_derivacion === id);
    if (!derivation) return;
    
    alert(`Derivación: ${derivation.cod_expediente}\n\nMotivo: ${derivation.motivo}\n\nEstado: ${derivation.estado}\n\nObservaciones: ${derivation.observaciones || 'Ninguna'}`);
}

// Tab Navigation Functions
function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab-button').forEach(button => {
        button.className = 'tab-button border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors';
    });
    
    // Show selected tab content
    document.getElementById(`${tabName}-content`).classList.remove('hidden');
    
    // Add active class to selected tab
    document.getElementById(`${tabName}-tab`).className = 'tab-button border-sky-500 text-sky-600 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm';
    
    // Load data if needed
    if (tabName === 'dashboard') {
        loadDashboardStats();
    }
}

// Dashboard Functions
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const stats = await response.json();
        
        // Update stat cards
        document.getElementById('total-expedientes').textContent = stats.totalExpedientes.count;
        document.getElementById('expedientes-activos').textContent = stats.expedientesActivos.count;
        document.getElementById('expedientes-vencidos').textContent = stats.expedientesVencidos.count;
        document.getElementById('expedientes-por-vencer').textContent = stats.expedientesPorVencer.count;
        
        // Render charts
        renderDistritoChart(stats.expedientesPorDistrito);
        renderRecentExpedientes(stats.expedientesRecientes);
        renderMonthlyChart(stats.expedientesPorMes);
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function renderDistritoChart(data) {
    const container = document.getElementById('expedientes-por-distrito');
    const maxCount = Math.max(...data.map(d => d.count));
    
    container.innerHTML = data.map(distrito => {
        const percentage = maxCount > 0 ? (distrito.count / maxCount) * 100 : 0;
        return `
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700 w-24 truncate">${distrito.nombre_distrito}</span>
                <div class="flex-1 mx-3">
                    <div class="bg-gray-200 rounded-full h-2">
                        <div class="bg-sky-500 h-2 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
                    </div>
                </div>
                <span class="text-sm font-semibold text-gray-900 w-8 text-right">${distrito.count}</span>
            </div>
        `;
    }).join('');
}

function renderRecentExpedientes(data) {
    const container = document.getElementById('expedientes-recientes');
    
    if (data.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No hay expedientes recientes</p>';
        return;
    }
    
    container.innerHTML = data.map(exp => `
        <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
            <div class="flex-1">
                <p class="text-sm font-medium text-gray-900">${exp.cod_expediente}</p>
                <p class="text-xs text-gray-500">${exp.sumilla ? exp.sumilla.substring(0, 40) + '...' : 'Sin sumilla'}</p>
            </div>
            <div class="text-right">
                <p class="text-xs text-gray-500">${exp.nombre_distrito}</p>
                <p class="text-xs text-gray-400">${formatDate(exp.fecha_registro)}</p>
            </div>
        </div>
    `).join('');
}

function renderMonthlyChart(data) {
    const container = document.getElementById('expedientes-por-mes');
    const maxCount = Math.max(...data.map(d => d.count));
    
    if (data.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No hay datos disponibles</p>';
        return;
    }
    
    container.innerHTML = data.map(month => {
        const percentage = maxCount > 0 ? (month.count / maxCount) * 100 : 0;
        const monthName = new Date(month.mes + '-01').toLocaleDateString('es-PE', { year: 'numeric', month: 'short' });
        
        return `
            <div class="flex items-center justify-between py-1">
                <span class="text-sm font-medium text-gray-700 w-20">${monthName}</span>
                <div class="flex-1 mx-3">
                    <div class="bg-gray-200 rounded-full h-3">
                        <div class="bg-green-500 h-3 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
                    </div>
                </div>
                <span class="text-sm font-semibold text-gray-900 w-8 text-right">${month.count}</span>
            </div>
        `;
    }).join('');
}