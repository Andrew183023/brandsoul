import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'

import { registerAccount } from '../lib/auth'
import {
  clearEntityBirthContinuationPending,
  finalizePendingEntityBirth,
  loadEntityBirthDraft,
} from '../lib/entityBirth.ts'
import { navigateTo } from '../lib/persona'
import { saveSession } from '../lib/session'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [businessModel, setBusinessModel] = useState<'product' | 'service' | 'hybrid'>('hybrid')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedEmail = email.trim()
    const normalizedTenantName = tenantName.trim()

    if (normalizedName.length < 2) {
      setErrorMessage('Informe seu nome com pelo menos 2 caracteres.')
      return
    }

    if (normalizedEmail.length < 5) {
      setErrorMessage('Informe um email válido.')
      return
    }

    if (password.length < 8) {
      setErrorMessage('Sua senha precisa ter pelo menos 8 caracteres.')
      return
    }

    if (normalizedTenantName.length < 2) {
      setErrorMessage('Informe o nome da empresa com pelo menos 2 caracteres.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const hasBirthDraft = Boolean(loadEntityBirthDraft())

      const session = await registerAccount({
        name: normalizedName,
        email: normalizedEmail,
        password,
        tenant_name: normalizedTenantName,
        business_model: businessModel,
      })
      saveSession(session)

      if (hasBirthDraft) {
        try {
          const payload = await finalizePendingEntityBirth()
          if (payload) {
            navigateTo(`/admin/entity/${payload.entityId}/identity`)
            return
          }
        } catch (error) {
          console.error(error)
          setErrorMessage('Sua conta foi criada, mas não conseguimos concluir o nascimento da Centelha. Tente novamente.')
          return
        }
      }

      clearEntityBirthContinuationPending()
      navigateTo('/admin')
    } catch (error) {
      console.error(error)
      clearEntityBirthContinuationPending()
      if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail
        if (Array.isArray(detail) && detail.length > 0) {
          const firstIssue = detail[0]
          const field = Array.isArray(firstIssue?.loc) ? firstIssue.loc[firstIssue.loc.length - 1] : ''
          if (field === 'tenant_name') {
            setErrorMessage('O nome da empresa é obrigatório e precisa ter pelo menos 2 caracteres.')
            return
          }
          if (field === 'password') {
            setErrorMessage('Sua senha precisa ter pelo menos 8 caracteres.')
            return
          }
          if (field === 'email') {
            setErrorMessage('Revise o email informado.')
            return
          }
          if (field === 'name') {
            setErrorMessage('Revise seu nome antes de continuar.')
            return
          }
          if (field === 'business_model') {
            setErrorMessage('Escolha um modelo de negócio válido.')
            return
          }
        }
      }

      setErrorMessage('Não consegui criar sua conta agora. Revise os dados e tente de novo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page-shell">
      <section className="auth-card">
        <div className="auth-copy">
          <div className="eyebrow">Criar conta</div>
          <h1>Comece sua operação no BrandSoul.</h1>
          <p>Sua conta será criada e a primeira Centelha nascerá em seguida.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="persona-field">
            <span className="persona-label">Seu nome</span>
            <input className="persona-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Como posso te chamar?" autoComplete="name" />
          </label>

          <label className="persona-field">
            <span className="persona-label">Email</span>
            <input className="persona-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contato@marca.com" autoComplete="email" />
          </label>

          <label className="persona-field">
            <span className="persona-label">Senha</span>
            <input className="persona-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Crie uma senha segura" autoComplete="new-password" />
          </label>

          <label className="persona-field">
            <span className="persona-label">Nome da empresa</span>
            <input className="persona-input" value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="Nome da sua marca" autoComplete="organization" />
          </label>

          <label className="persona-field">
            <span className="persona-label">Modelo de negócio</span>
            <select className="persona-input" value={businessModel} onChange={(event) => setBusinessModel(event.target.value as 'product' | 'service' | 'hybrid')}>
              <option value="product">Produto</option>
              <option value="service">Serviço</option>
              <option value="hybrid">Híbrido</option>
            </select>
          </label>

          {errorMessage ? <p className="persona-error">{errorMessage}</p> : null}

          <div className="auth-actions">
            <button type="submit" className="persona-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Criando...' : 'Criar conta'}
            </button>
            <button type="button" className="chat-header-button subtle" onClick={() => navigateTo('/login')}>
              Já tenho conta
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
