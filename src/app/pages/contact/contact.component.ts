import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FooterComponent } from '../../components/footer/footer.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [FooterComponent, FormsModule, NavbarComponent],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.css'
})
export class ContactComponent {
  private readonly draftStorageKey = 'nexus_contact_draft';
  private readonly requestsStorageKey = 'nexus_contact_requests';
  private readonly namePattern = /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+(?:[ '\-][A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+)*$/;

  form = {
    nombre: '',
    apellido: '',
    correo: '',
    tipoSolicitud: '',
    mensaje: ''
  };

  touched = {
    nombre: false,
    apellido: false,
    correo: false,
    tipoSolicitud: false,
    mensaje: false
  };

  submitted = false;
  successMessage = '';

  constructor() {
    this.loadDraft();
  }

  saveDraft(): void {
    try {
      localStorage.setItem(this.draftStorageKey, JSON.stringify(this.form));
    } catch {
      // localStorage puede no estar disponible en navegación privada.
    }
  }

  markTouched(field: keyof typeof this.touched): void {
    this.touched[field] = true;
    this.successMessage = '';
  }

  getError(field: keyof typeof this.touched): string {
    if (!this.touched[field] && !this.submitted) return '';

    switch (field) {
      case 'nombre':
        if (!this.form.nombre.trim()) return 'Por favor, escribe tu nombre.';
        if (!this.namePattern.test(this.form.nombre.trim())) return 'El nombre solo puede contener letras.';
        return '';
      case 'apellido':
        if (!this.form.apellido.trim()) return 'Por favor, escribe tu apellido.';
        if (!this.namePattern.test(this.form.apellido.trim())) return 'El apellido solo puede contener letras.';
        return '';
      case 'correo':
        if (!this.form.correo.trim()) return 'Por favor, escribe tu correo electrónico.';
        if (!this.form.correo.includes('@')) return 'El correo debe contener un @.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.correo.trim())) return 'El correo debe tener un formato válido, por ejemplo: usuario@correo.com';
        return '';
      case 'tipoSolicitud':
        return this.isRequestTypeValid() ? '' : 'Selecciona un tipo de solicitud.';
      case 'mensaje':
        if (!this.form.mensaje.trim()) return 'Por favor, escribe un mensaje.';
        if (this.form.mensaje.trim().length < 10) return 'El mensaje debe tener al menos 10 caracteres.';
        return '';
    }
  }

  isFieldInvalid(field: keyof typeof this.touched): boolean {
    return Boolean(this.getError(field));
  }

  onSubmit(): void {
    this.submitted = true;
    Object.keys(this.touched).forEach((field) => {
      this.touched[field as keyof typeof this.touched] = true;
    });

    if (!this.isFormValid()) return;

    this.saveRequest();

    const asunto = encodeURIComponent(`Solicitud de ${this.form.nombre} ${this.form.apellido}`);
    const cuerpo = encodeURIComponent([
      `Nombre: ${this.form.nombre} ${this.form.apellido}`,
      `Correo: ${this.form.correo}`,
      `Tipo de solicitud: ${this.form.tipoSolicitud}`,
      `Mensaje: ${this.form.mensaje}`
    ].join('\n'));

    this.resetForm();
    this.successMessage = '✓ Mensaje enviado con éxito.';
    window.location.href = `mailto:hola@torquenorte.cl?subject=${asunto}&body=${cuerpo}`;
  }

  private isFormValid(): boolean {
    return (Object.keys(this.touched) as Array<keyof typeof this.touched>).every((field) => !this.getError(field));
  }

  private isRequestTypeValid(): boolean {
    return ['diagnostico', 'mantencion', 'reparacion', 'electricidad', 'cotizacion', 'reclamo', 'otro'].includes(this.form.tipoSolicitud);
  }

  private resetForm(): void {
    this.form = { nombre: '', apellido: '', correo: '', tipoSolicitud: '', mensaje: '' };
    this.submitted = false;
    this.touched = { nombre: false, apellido: false, correo: false, tipoSolicitud: false, mensaje: false };
    try {
      localStorage.removeItem(this.draftStorageKey);
    } catch {
      // El formulario ya fue limpiado aunque no se pueda borrar el borrador.
    }
  }

  private loadDraft(): void {
    try {
      const stored = localStorage.getItem(this.draftStorageKey);
      if (stored) {
        this.form = { ...this.form, ...JSON.parse(stored) };
      }
    } catch {
      // Ignora borradores dañados y deja el formulario vacío.
    }
  }

  private saveRequest(): void {
    try {
      const stored = localStorage.getItem(this.requestsStorageKey);
      const requests = stored ? JSON.parse(stored) : [];
      const request = { ...this.form, createdAt: new Date().toISOString() };
      localStorage.setItem(this.requestsStorageKey, JSON.stringify([...requests, request]));
    } catch {
      // El envío por correo sigue funcionando aunque no se pueda guardar.
    }
  }
}
