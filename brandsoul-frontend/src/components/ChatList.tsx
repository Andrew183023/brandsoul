import { Fragment, useEffect, useRef } from 'react'

import ChatMessage, { type Message } from './ChatMessage'
import ContentBlock from './ContentBlock'
import { parseStructuredContent } from '../lib/contentHistory'

interface ChatListProps {
  messages: Message[]
  introTagline?: string | null
  showIntroTagline?: boolean
  assistantLabel?: string | null
  enableContentBlocks?: boolean
}

export default function ChatList({
  messages,
  introTagline = null,
  showIntroTagline = false,
  assistantLabel = 'Centelha',
  enableContentBlocks = false,
}: ChatListProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-empty-state">
        <p>Estou aqui.</p>
        <span>Me diga por onde voce quer comecar que eu sustento a conversa daqui.</span>
      </div>
    )
  }

  return (
    <div className="chat-list-shell">
      <ul className="chat-list" aria-live="polite">
        {messages.map((message, index) => (
          <Fragment key={`${message.role}-${index}-${message.content.slice(0, 24)}`}>
            <ChatMessage
              message={message}
              assistantLabel={assistantLabel}
              contentOverride={
                enableContentBlocks && message.role === 'ai'
                  ? (() => {
                      const parsedContent = parseStructuredContent(message.content)
                      return parsedContent ? <ContentBlock content={parsedContent} /> : undefined
                    })()
                  : undefined
              }
            />
            {showIntroTagline && introTagline && index === 0 && message.role === 'ai' ? (
              <li className="spark-intro" aria-hidden="true">
                <span className="spark-tagline">{introTagline}</span>
              </li>
            ) : null}
          </Fragment>
        ))}
      </ul>
      <div ref={endRef} />
    </div>
  )
}
