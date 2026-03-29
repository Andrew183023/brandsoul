import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { resetPassword } from '../lib/auth'
import { navigateTo } from '../lib/persona'
import '../App.css'

const REDIRECT_DELAY_MS = 1400

export default function ResetPasswordPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token')?.trim() ?? '', [])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setFeedbackMessage('')

    if (!token) {
      setErrorMessage('Esse link de redefinição não está válido.')
      return
    }

    if (password.trim().length < 6) {
      setErrorMessage('Use uma senha com pelo menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('A confirmação da senha precisa ser igual.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await resetPassword({ token, new_password: password })
      setFeedbackMessage(response.message || 'Senha redefinida com sucesso.')
      window.setTimeout(() => {
        navigateTo('/login')
      }, REDIRECT_DELAY_MS)
    } catch (error) {
      console.error(error)
      setErrorMessage('Não consegui redefinir sua senha agora. Tente usar um link válido.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page-shell">
      <section className="auth-card">
        <div className="auth-copy">
          <div className="eyebrow">Nova senha</div>
          <h1>Defina uma senha nova para seguir.</h1>
          <p>Crie uma senha nova e confirme para voltar ao admin com segurança.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="persona-field">
            <span className="persona-label">Nova senha</span>
            <input className="persona-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Crie uma nova senha" autoComplete="new-password" />
          </label>

          <label className="persona-field">
            <span className="persona-label">Confirmar senha</span>
            <input className="persona-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repita a nova senha" autoComplete="new-password" />
          </label>

          {errorMessage ? <p className="persona-error">{errorMessage}</p> : null}
          {feedbackMessage ? <p className="auth-feedback success">{feedbackMessage}</p> : null}

          <div className="auth-actions">
            <button type="submit" className="persona-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Redefinindo...' : 'Redefinir senha'}
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
