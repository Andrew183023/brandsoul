import { useEffect, useRef } from 'react'

import ChatMessage, { type Message } from './ChatMessage'

interface ChatListProps {
  messages: Message[]
}

export default function ChatList({ messages }: ChatListProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-empty-state">
        <p>A Centelha ainda nao ouviu nada.</p>
        <span>Comece a conversa e deixe a personalidade da marca responder.</span>
      </div>
    )
  }

  return (
    <div className="chat-list-shell">
      <ul className="chat-list" aria-live="polite">
        {messages.map((message, index) => (
          <ChatMessage key={`${message.role}-${index}-${message.content.slice(0, 24)}`} message={message} />
        ))}
      </ul>
      <div ref={endRef} />
    </div>
  )
}