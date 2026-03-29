import { useState } from 'react'
import type { FormEvent } from 'react'

import { requestPasswordReset } from '../lib/auth'
import { navigateTo } from '../lib/persona'
import '../App.css'

const SUCCESS_MESSAGE = 'Se existir uma conta com este email, enviamos instruções.'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setFeedbackMessage('')

    try {
      await requestPasswordReset({ email })
      setFeedbackMessage(SUCCESS_MESSAGE)
    } catch (error) {
      console.error(error)
      setFeedbackMessage(SUCCESS_MESSAGE)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page-shell">
      <section className="auth-card">
        <div className="auth-copy">
          <div className="eyebrow">Recuperar acesso</div>
          <h1>Vamos te ajudar a entrar de novo.</h1>
          <p>Digite seu email e, se existir uma conta com ele, você recebe as instruções para redefinir sua senha.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="persona-field">
            <span className="persona-label">Email</span>
            <input className="persona-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contato@marca.com" autoComplete="email" />
          </label>

          {feedbackMessage ? <p className="auth-feedback success">{feedbackMessage}</p> : null}

          <div className="auth-actions">
            <button type="submit" className="persona-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar instruções'}
            </button>
            <button type="button" className="chat-header-button subtle" onClick={() => navigateTo('/login')}>
              Voltar para login
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
