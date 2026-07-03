import {
  normalizeCanonicalEmail,
  normalizeCanonicalPhone,
  normalizeCanonicalWhatsapp,
} from './legalContactNormalization.js'

type IntakeFieldErrorCode =
  | 'required'
  | 'invalid_type'
  | 'too_short'
  | 'too_long'
  | 'invalid_enum'
  | 'invalid_contact'

export type LegalIntakeValidationField =
  | 'clientName'
  | 'contactValue'
  | 'city'
  | 'legalArea'
  | 'objective'
  | 'urgency'
  | 'contactPreference'
  | 'userMessage'

export type LegalIntakeValidationError = {
  field: LegalIntakeValidationField
  code: IntakeFieldErrorCode
  message: string
}

export type SanitizedLegalIntake = {
  userMessage: string
  triage: {
    clientName: string
    preferredName?: string
    city: string
    legalArea: string
    context: string
    urgency: 'low' | 'medium' | 'high' | 'urgent'
    objective: string
    contactPreference: 'whatsapp' | 'phone' | 'email'
    contactValue: string
  }
  compatibility: {
    practiceArea: string
    urgency: 'planned' | 'priority' | 'critical'
    contactPreference: 'whatsapp' | 'telefone' | 'email'
  }
}

type ValidationResult =
  | {
      ok: true
      value: SanitizedLegalIntake
    }
  | {
      ok: false
      errors: LegalIntakeValidationError[]
    }

type RawLegalIntakeRequest = {
  userMessage?: unknown
  triage?: {
    clientName?: unknown
    preferredName?: unknown
    city?: unknown
    legalArea?: unknown
    practiceArea?: unknown
    context?: unknown
    urgency?: unknown
    objective?: unknown
    contactPreference?: unknown
    contactValue?: unknown
  } | unknown
}

const INVISIBLE_CHARACTERS_PATTERN = /[\u200B-\u200D\uFEFF]/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeString(value: string) {
  return value
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function readOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const sanitized = sanitizeString(value)
  return sanitized.length > 0 ? sanitized : undefined
}

function readRequiredString(args: {
  value: unknown
  field: LegalIntakeValidationField
  min: number
  max: number
  requiredMessage: string
  tooShortMessage: string
  tooLongMessage: string
  invalidTypeMessage?: string
  errors: LegalIntakeValidationError[]
}) {
  if (typeof args.value !== 'string') {
    args.errors.push({
      field: args.field,
      code: args.value == null ? 'required' : 'invalid_type',
      message: args.value == null ? args.requiredMessage : (args.invalidTypeMessage ?? args.requiredMessage),
    })
    return undefined
  }

  const sanitized = sanitizeString(args.value)
  if (sanitized.length === 0) {
    args.errors.push({
      field: args.field,
      code: 'required',
      message: args.requiredMessage,
    })
    return undefined
  }

  if (sanitized.length < args.min) {
    args.errors.push({
      field: args.field,
      code: 'too_short',
      message: args.tooShortMessage,
    })
    return undefined
  }

  if (sanitized.length > args.max) {
    args.errors.push({
      field: args.field,
      code: 'too_long',
      message: args.tooLongMessage,
    })
    return undefined
  }

  return sanitized
}

function normalizeUrgency(value: unknown) {
  const normalized = readOptionalString(value)?.toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (normalized === 'urgent' || normalized === 'critical') {
    return 'urgent' as const
  }

  if (normalized === 'high' || normalized === 'priority') {
    return 'high' as const
  }

  if (normalized === 'medium' || normalized === 'planned') {
    return 'medium' as const
  }

  if (normalized === 'low') {
    return 'low' as const
  }

  return null
}

function normalizeContactPreference(value: unknown) {
  const normalized = readOptionalString(value)?.toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (normalized === 'whatsapp') {
    return 'whatsapp' as const
  }

  if (normalized === 'phone' || normalized === 'telefone') {
    return 'phone' as const
  }

  if (normalized === 'email') {
    return 'email' as const
  }

  return null
}

function toCompatibilityUrgency(value: SanitizedLegalIntake['triage']['urgency']) {
  if (value === 'urgent') {
    return 'critical' as const
  }

  if (value === 'high') {
    return 'priority' as const
  }

  return 'planned' as const
}

function toCompatibilityContactPreference(value: SanitizedLegalIntake['triage']['contactPreference']) {
  if (value === 'phone') {
    return 'telefone' as const
  }

  return value
}

function isCanonicalContactValueValid(args: {
  contactPreference: SanitizedLegalIntake['triage']['contactPreference']
  contactValue: string
}) {
  if (args.contactPreference === 'email') {
    return typeof normalizeCanonicalEmail(args.contactValue) === 'string'
  }

  if (args.contactPreference === 'phone') {
    return typeof normalizeCanonicalPhone(args.contactValue) === 'string'
  }

  return typeof normalizeCanonicalWhatsapp(args.contactValue) === 'string'
}

export function validatePublicLegalIntakePayload(value: unknown): ValidationResult {
  const errors: LegalIntakeValidationError[] = []
  const request = isRecord(value) ? value as RawLegalIntakeRequest : {}
  const triage = isRecord(request.triage) ? request.triage : undefined

  const userMessage = readRequiredString({
    value: request.userMessage,
    field: 'userMessage',
    min: 1,
    max: 3000,
    requiredMessage: 'Informe o contexto inicial do atendimento.',
    tooShortMessage: 'Informe o contexto inicial do atendimento.',
    tooLongMessage: 'O resumo inicial do atendimento deve ter no máximo 3000 caracteres.',
    invalidTypeMessage: 'Informe um contexto inicial válido para o atendimento.',
    errors,
  })

  if (!triage) {
    errors.push({
      field: 'clientName',
      code: 'required',
      message: 'Informe o nome completo do cliente.',
    })
    errors.push({
      field: 'contactValue',
      code: 'required',
      message: 'Informe um contato principal para o cliente.',
    })
    errors.push({
      field: 'city',
      code: 'required',
      message: 'Informe a cidade do cliente.',
    })
    errors.push({
      field: 'legalArea',
      code: 'required',
      message: 'Informe a área jurídica do atendimento.',
    })
    errors.push({
      field: 'objective',
      code: 'required',
      message: 'Informe o objetivo principal do atendimento.',
    })
    errors.push({
      field: 'urgency',
      code: 'required',
      message: 'Informe o grau de urgência do atendimento.',
    })
    errors.push({
      field: 'contactPreference',
      code: 'required',
      message: 'Informe o meio de contato preferencial.',
    })

    return {
      ok: false,
      errors,
    }
  }

  const clientName = readRequiredString({
    value: triage.clientName,
    field: 'clientName',
    min: 3,
    max: 120,
    requiredMessage: 'Informe o nome completo do cliente.',
    tooShortMessage: 'O nome completo do cliente deve ter ao menos 3 caracteres.',
    tooLongMessage: 'O nome completo do cliente deve ter no máximo 120 caracteres.',
    invalidTypeMessage: 'Informe um nome completo válido para o cliente.',
    errors,
  })

  const contactValue = readRequiredString({
    value: triage.contactValue,
    field: 'contactValue',
    min: 5,
    max: 120,
    requiredMessage: 'Informe um contato principal para o cliente.',
    tooShortMessage: 'O contato principal do cliente deve ter ao menos 5 caracteres.',
    tooLongMessage: 'O contato principal do cliente deve ter no máximo 120 caracteres.',
    invalidTypeMessage: 'Informe um contato principal válido para o cliente.',
    errors,
  })

  const city = readRequiredString({
    value: triage.city,
    field: 'city',
    min: 2,
    max: 120,
    requiredMessage: 'Informe a cidade do cliente.',
    tooShortMessage: 'A cidade do cliente deve ter ao menos 2 caracteres.',
    tooLongMessage: 'A cidade do cliente deve ter no máximo 120 caracteres.',
    invalidTypeMessage: 'Informe uma cidade válida para o cliente.',
    errors,
  })

  const legalArea = readRequiredString({
    value: triage.legalArea ?? triage.practiceArea,
    field: 'legalArea',
    min: 2,
    max: 80,
    requiredMessage: 'Informe a área jurídica do atendimento.',
    tooShortMessage: 'A área jurídica deve ter ao menos 2 caracteres.',
    tooLongMessage: 'A área jurídica deve ter no máximo 80 caracteres.',
    invalidTypeMessage: 'Informe uma área jurídica válida para o atendimento.',
    errors,
  })

  const objective = readRequiredString({
    value: triage.objective,
    field: 'objective',
    min: 10,
    max: 3000,
    requiredMessage: 'Informe o objetivo principal do atendimento.',
    tooShortMessage: 'O objetivo principal deve ter ao menos 10 caracteres.',
    tooLongMessage: 'O objetivo principal deve ter no máximo 3000 caracteres.',
    invalidTypeMessage: 'Informe um objetivo válido para o atendimento.',
    errors,
  })

  const urgency = normalizeUrgency(triage.urgency)
  if (typeof urgency === 'undefined') {
    errors.push({
      field: 'urgency',
      code: 'required',
      message: 'Informe o grau de urgência do atendimento.',
    })
  } else if (urgency === null) {
    errors.push({
      field: 'urgency',
      code: 'invalid_enum',
      message: 'A urgência deve ser low, medium, high ou urgent.',
    })
  }

  const contactPreference = normalizeContactPreference(triage.contactPreference)
  if (typeof contactPreference === 'undefined') {
    errors.push({
      field: 'contactPreference',
      code: 'required',
      message: 'Informe o meio de contato preferencial.',
    })
  } else if (contactPreference === null) {
    errors.push({
      field: 'contactPreference',
      code: 'invalid_enum',
      message: 'O meio de contato deve ser whatsapp, phone ou email.',
    })
  }

  if (errors.length > 0 || !userMessage || !clientName || !contactValue || !city || !legalArea || !objective || !urgency || !contactPreference) {
    return {
      ok: false,
      errors,
    }
  }

  if (!isCanonicalContactValueValid({ contactPreference, contactValue })) {
    return {
      ok: false,
      errors: [
        ...errors,
        {
          field: 'contactValue',
          code: 'invalid_contact',
          message: 'Informe um contato válido para o canal escolhido.',
        },
      ],
    }
  }

  const preferredName = readOptionalString(triage.preferredName)
  const context = readOptionalString(triage.context) ?? userMessage

  return {
    ok: true,
    value: {
      userMessage,
      triage: {
        clientName,
        preferredName,
        city,
        legalArea,
        context,
        urgency,
        objective,
        contactPreference,
        contactValue,
      },
      compatibility: {
        practiceArea: legalArea,
        urgency: toCompatibilityUrgency(urgency),
        contactPreference: toCompatibilityContactPreference(contactPreference),
      },
    },
  }
}
