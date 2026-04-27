import { useState } from 'react'
import type { FormEvent } from 'react'

import { loginAccount } from '../lib/auth'
import { finalizePendingEntityBirth, loadEntityBirthDraft } from '../lib/entityBirth.ts'
import { navigateTo } from '../lib/persona'
import { saveSession } from '../lib/session'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const session = await loginAccount({ email, password })
      saveSession(session)

      if (loadEntityBirthDraft()) {
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

      navigateTo('/admin')
    } catch (error) {
      console.error(error)
      setErrorMessage('Não consegui entrar agora. Revise seu email e sua senha.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page-shell">
      <section className="auth-card">
        <div className="auth-copy">
          <div className="eyebrow">Acesso BrandSoul</div>
          <h1>Entre para operar sua marca por dentro.</h1>
          <p>Use sua conta para abrir o admin, conversar com a Centelha e concluir o nascimento se ele estiver pendente.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="persona-field">
            <span className="persona-label">Email</span>
            <input className="persona-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contato@marca.com" autoComplete="email" />
          </label>

          <label className="persona-field">
            <span className="persona-label">Senha</span>
            <input className="persona-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" autoComplete="current-password" />
          </label>

          {errorMessage ? <p className="persona-error">{errorMessage}</p> : null}

          <div className="auth-inline-link-row">
            <button type="button" className="auth-inline-link" onClick={() => navigateTo('/forgot-password')}>
              Esqueci minha senha
            </button>
          </div>

          <div className="auth-actions">
            <button type="submit" className="persona-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </button>
            <button type="button" className="chat-header-button subtle" onClick={() => navigateTo('/register')}>
              Criar conta
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
