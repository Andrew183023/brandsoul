import React, { type ChangeEvent, type FormEvent } from 'react'

void React

import type { EntityBusinessConfig, EntityBusinessType } from '../backend-bridge/api/adminApi'

export type BusinessConfigUiState = 'loading' | 'error' | 'empty' | 'ready'

export type BusinessConfigFormState = {
  businessType: EntityBusinessType
  description: string
  toneVoice: string
  toneStyle: string
  toneIntensity: 'soft' | 'balanced' | 'strong'
  whatsapp: string
  phone: string
  email: string
  address: string
  website: string
  attendanceMode: 'sales' | 'support' | 'guidance' | 'mixed'
  responseWindowLabel: string
  bookingEnabled: boolean
  catalogEnabled: boolean
}

export const DEFAULT_FORM_STATE: BusinessConfigFormState = {
  businessType: 'services',
  description: '',
  toneVoice: '',
  toneStyle: '',
  toneIntensity: 'balanced',
  whatsapp: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  attendanceMode: 'mixed',
  responseWindowLabel: '',
  bookingEnabled: false,
  catalogEnabled: false,
}

export function mapConfigToFormState(config: EntityBusinessConfig | null): BusinessConfigFormState {
  if (!config) {
    return DEFAULT_FORM_STATE
  }

  return {
    businessType: config.businessType,
    description: config.description ?? '',
    toneVoice: config.toneProfile?.voice ?? '',
    toneStyle: config.toneProfile?.style ?? '',
    toneIntensity: config.toneProfile?.intensity ?? 'balanced',
    whatsapp: config.channels?.whatsapp ?? '',
    phone: config.channels?.phone ?? '',
    email: config.channels?.email ?? '',
    address: config.channels?.address ?? '',
    website: config.channels?.website ?? '',
    attendanceMode: config.serviceRules?.attendanceMode ?? 'mixed',
    responseWindowLabel: config.serviceRules?.responseWindowLabel ?? '',
    bookingEnabled: config.serviceRules?.bookingEnabled === true,
    catalogEnabled: config.serviceRules?.catalogEnabled === true,
  }
}

export function mapFormStateToConfig(form: BusinessConfigFormState): EntityBusinessConfig {
  return {
    businessType: form.businessType,
    description: form.description.trim() || undefined,
    toneProfile: {
      voice: form.toneVoice.trim() || undefined,
      style: form.toneStyle.trim() || undefined,
      intensity: form.toneIntensity,
    },
    channels: {
      whatsapp: form.whatsapp.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      website: form.website.trim() || undefined,
    },
    serviceRules: {
      attendanceMode: form.attendanceMode,
      responseWindowLabel: form.responseWindowLabel.trim() || undefined,
      bookingEnabled: form.bookingEnabled,
      catalogEnabled: form.catalogEnabled,
    },
  }
}

type AdminBusinessConfigFormProps = {
  entityId: string
  uiState: BusinessConfigUiState
  formState: BusinessConfigFormState
  error?: string | null
  successMessage?: string | null
  isSaving: boolean
  onTextField: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  onCheckboxField: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export default function AdminBusinessConfigForm({
  entityId,
  uiState,
  formState,
  error,
  successMessage,
  isSaving,
  onTextField,
  onCheckboxField,
  onSubmit,
}: AdminBusinessConfigFormProps) {
  return (
    <section className="admin-card admin-config-card">
      <div className="admin-card-header">
        <div>
          <h2>Identidade operacional</h2>
          <p className="admin-diagnosis-meta">
            {uiState === 'empty' ? 'Nenhuma configuracao encontrada ainda.' : 'Configuracao carregada.'}
          </p>
        </div>
        <span>{entityId}</span>
      </div>

      {error ? <div className="admin-feedback admin-feedback--error">{error}</div> : null}
      {successMessage ? <div className="admin-feedback">{successMessage}</div> : null}

      <form className="admin-form" onSubmit={onSubmit}>
        <section className="admin-diagnosis-section">
          <h3>Tipo de negocio</h3>
          <label className="admin-field">
            <span>businessType</span>
            <select name="businessType" value={formState.businessType} onChange={onTextField}>
              <option value="restaurant">restaurant</option>
              <option value="store">store</option>
              <option value="legal">legal</option>
              <option value="services">services</option>
            </select>
          </label>
        </section>

        <section className="admin-diagnosis-section">
          <h3>Descrição</h3>
          <label className="admin-field">
            <span>Descrição pública de base</span>
            <textarea
              name="description"
              value={formState.description}
              onChange={onTextField}
              placeholder="Descreva o negocio e a proposta principal da entidade."
              rows={4}
            />
          </label>
        </section>

        <section className="admin-diagnosis-section">
          <h3>Tom</h3>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Voice</span>
              <input name="toneVoice" value={formState.toneVoice} onChange={onTextField} placeholder="consultive, warm, direct..." />
            </label>
            <label className="admin-field">
              <span>Style</span>
              <input name="toneStyle" value={formState.toneStyle} onChange={onTextField} placeholder="clean, premium, helpful..." />
            </label>
            <label className="admin-field">
              <span>Intensity</span>
              <select name="toneIntensity" value={formState.toneIntensity} onChange={onTextField}>
                <option value="soft">soft</option>
                <option value="balanced">balanced</option>
                <option value="strong">strong</option>
              </select>
            </label>
          </div>
        </section>

        <section className="admin-diagnosis-section">
          <h3>Canais</h3>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>WhatsApp</span>
              <input name="whatsapp" value={formState.whatsapp} onChange={onTextField} placeholder="+55..." />
            </label>
            <label className="admin-field">
              <span>Telefone</span>
              <input name="phone" value={formState.phone} onChange={onTextField} placeholder="+55..." />
            </label>
            <label className="admin-field">
              <span>Email</span>
              <input name="email" value={formState.email} onChange={onTextField} placeholder="contato@..." />
            </label>
            <label className="admin-field">
              <span>Endereco</span>
              <input name="address" value={formState.address} onChange={onTextField} placeholder="Rua, numero..." />
            </label>
            <label className="admin-field">
              <span>Website</span>
              <input name="website" value={formState.website} onChange={onTextField} placeholder="https://..." />
            </label>
          </div>
        </section>

        <section className="admin-diagnosis-section">
          <h3>Regras basicas</h3>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Attendance mode</span>
              <select name="attendanceMode" value={formState.attendanceMode} onChange={onTextField}>
                <option value="mixed">mixed</option>
                <option value="sales">sales</option>
                <option value="support">support</option>
                <option value="guidance">guidance</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Janela de resposta</span>
              <input name="responseWindowLabel" value={formState.responseWindowLabel} onChange={onTextField} placeholder="Ex: Segunda a sexta, 9h as 18h" />
            </label>
          </div>
          <div className="admin-toggle-row">
            <label className="admin-toggle">
              <input type="checkbox" name="bookingEnabled" checked={formState.bookingEnabled} onChange={onCheckboxField} />
              <span>Booking enabled</span>
            </label>
            <label className="admin-toggle">
              <input type="checkbox" name="catalogEnabled" checked={formState.catalogEnabled} onChange={onCheckboxField} />
              <span>Catalog enabled</span>
            </label>
          </div>
        </section>

        <div className="admin-actions">
          <button type="submit" className="admin-button" disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar configuração'}
          </button>
        </div>
      </form>
    </section>
  )
}
