import './caseCollections.css'

import type { AdminLegalCaseMessage } from '../../backend-bridge/api/adminApi'
import { formatDateTime, formatMessageRole } from '../../pages/adminCaseUi'

export type ConversationThreadMessage = AdminLegalCaseMessage & {
  pending?: boolean
}

type ConversationThreadProps = {
  messages: ConversationThreadMessage[]
}

export function ConversationThread({ messages }: ConversationThreadProps) {
  return (
    <div className="admin-case-messages entity-case-messages conversation-thread">
      {messages.map((message) => {
        const metaTimestamp = message.pending ? 'agora' : formatDateTime(message.createdAt)
        const metaRole = message.pending ? 'enviando' : formatMessageRole(message.role)
        const pendingClassName = message.pending ? ' conversation-thread__message--pending entity-case-message--pending' : ''

        return (
          <article
            key={message.id}
            className={[
              'admin-case-message',
              `admin-case-message--${message.role}`,
              'entity-case-message',
              `entity-case-message--${message.role}`,
              'conversation-thread__message',
              `conversation-thread__message--${message.role}`,
            ].join(' ') + pendingClassName}
          >
            <div className="admin-case-message__meta">
              <strong>{metaRole}</strong>
              <span>{metaTimestamp}</span>
            </div>
            <p>{message.text}</p>
          </article>
        )
      })}
    </div>
  )
}