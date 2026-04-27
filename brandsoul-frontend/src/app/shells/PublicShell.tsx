import React, { type ReactNode } from 'react'

import '../styles/publicShell.css'

type PublicShellProps = {
  children: ReactNode
  isAuthenticated?: boolean
}

export default function PublicShell({ children, isAuthenticated = false }: PublicShellProps) {
  void React

  return (
    <main className="public-shell">
      <header className="public-shell__topbar">
        <div className="public-shell__topbar-inner">
          <a href="/" className="public-shell__brand" aria-label="BrandSoul">
            <span className="public-shell__brand-mark" aria-hidden="true">◌</span>
            <span className="public-shell__brand-copy">
              <strong>BrandSoul</strong>
              <span>entidades vivas em presenca</span>
            </span>
          </a>

          <nav className="public-shell__nav" aria-label="Public navigation">
            <a href="/discover" className="public-shell__link">Explorar</a>
            <a href={isAuthenticated ? '/admin' : '/login'} className="public-shell__button">
              {isAuthenticated ? 'Entrar no console' : 'Entrar'}
            </a>
          </nav>
        </div>
      </header>

      <div className="public-shell__content">
        {children}
      </div>

      <footer className="public-shell__footer">
        <div className="public-shell__footer-inner">
          <span>BrandSoul</span>
          <span>presenca, relacao e operacao dentro da plataforma</span>
        </div>
      </footer>
    </main>
  )
}
