import { motion } from 'framer-motion'

export type Message = {
  role: 'user' | 'ai'
  content: string
}

interface ChatMessageProps {
  message: Message
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <motion.li
      className={`chat-message-row ${isUser ? 'user' : 'ai'}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className={`chat-message-bubble ${isUser ? 'user' : 'ai'}`}>
        {!isUser ? <span className="chat-message-speaker">Centelha</span> : null}
        <div>{message.content}</div>
      </div>
    </motion.li>
  )
}