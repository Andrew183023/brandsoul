import { useEffect, useState } from 'react'
import React, { type ChangeEvent, type FormEvent } from 'react'

void React

import { getEntityBusinessConfig, saveEntityBusinessConfig } from '../backend-bridge/api/adminApi'
import AdminBusinessConfigForm, {
  DEFAULT_FORM_STATE,
  mapConfigToFormState,
  mapFormStateToConfig,
  type BusinessConfigFormState,
  type BusinessConfigUiState,
} from '../components/AdminBusinessConfigForm'
import AdminEntityLayout from '../components/AdminEntityLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'

type AdminEntityIdentityPageProps = {
  entityId: string
}

export default function AdminEntityIdentityPage({ entityId }: AdminEntityIdentityPageProps) {
  const [uiState, setUiState] = useState<BusinessConfigUiState>('loading')
  const [formState, setFormState] = useState<BusinessConfigFormState>(DEFAULT_FORM_STATE)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    async function loadBusinessConfig() {
      try {
        setUiState('loading')
        setError(null)
        setSuccessMessage(null)

        const payload = await getEntityBusinessConfig(entityId)
        setFormState(mapConfigToFormState(payload.businessConfig))
        setUiState(payload.businessConfig ? 'ready' : 'empty')
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar configuracao.')
        setUiState('error')
      }
    }

    void loadBusinessConfig()
  }, [entityId])

  function handleTextField(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target
    setFormState((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleCheckboxField(event: ChangeEvent<HTMLInputElement>) {
    const { name, checked } = event.target
    setFormState((current) => ({
      ...current,
      [name]: checked,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setIsSaving(true)
      setError(null)
      setSuccessMessage(null)

      const payload = await saveEntityBusinessConfig(entityId, mapFormStateToConfig(formState))
      setFormState(mapConfigToFormState(payload.businessConfig))
      setUiState('ready')
      setSuccessMessage('Configuracao salva com sucesso.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao salvar configuracao.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminEntityLayout
      entityId={entityId}
      section="identity"
      title="Identity"
      subtitle="Configuração canônica da entidade: tipo, tom, canais e regras de base."
    >
      {uiState === 'loading' ? (
        <SurfaceCard tone="admin">
          <FeedbackBanner>Carregando configuracao...</FeedbackBanner>
        </SurfaceCard>
      ) : null}
      {uiState === 'error' ? (
        <SurfaceCard tone="admin">
          <FeedbackBanner tone="error">{error ?? 'Erro ao carregar configuracao.'}</FeedbackBanner>
        </SurfaceCard>
      ) : null}
      {(uiState === 'empty' || uiState === 'ready') ? (
        <AdminBusinessConfigForm
          entityId={entityId}
          uiState={uiState}
          formState={formState}
          error={error}
          successMessage={successMessage}
          isSaving={isSaving}
          onTextField={handleTextField}
          onCheckboxField={handleCheckboxField}
          onSubmit={(event) => void handleSubmit(event)}
        />
      ) : null}
    </AdminEntityLayout>
  )
}
