import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export type Message = {
  role: 'user' | 'ai'
  content: string
}

interface ChatMessageProps {
  message: Message
  assistantLabel?: string | null
  contentOverride?: ReactNode
}

export default function ChatMessage({ message, assistantLabel = 'Centelha', contentOverride }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <motion.li
      className={`chat-message-row ${isUser ? 'user' : 'ai'}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className={`chat-message-bubble ${isUser ? 'user' : 'ai'}`}>
        {!isUser && assistantLabel ? <span className="chat-message-speaker">{assistantLabel}</span> : null}
        <div>{contentOverride ?? message.content}</div>
      </div>
    </motion.li>
  )
}
