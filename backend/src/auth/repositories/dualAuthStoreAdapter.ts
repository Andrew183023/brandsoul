import type { ObservabilityService } from '../../services/observabilityService.js'
import type { AuthMembershipRecord, AuthTenantRecord, AuthUserRecord } from '../authTypes.js'
import type {
  AuthIdentityStoreRepository,
  CreateAuthMembershipInput,
  CreateAuthPasswordResetTokenInput,
  CreateAuthTenantInput,
  CreateAuthUserInput,
} from './authIdentityStoreRepository.js'
import type {
  AuthMembershipUserRecord,
  AuthPasswordResetTokenRecord,
  AuthTenantMembershipRecord,
} from './legacyAuthStoreRepository.js'

export type AuthStoreMode =
  | 'legacy_only'
  | 'native_only'
  | 'dual_write_legacy_read'
  | 'dual_write_native_read'

export type AuthStoreDivergenceSeverity = 'info' | 'warning' | 'critical'
export type AuthStoreEntityType = 'user' | 'tenant' | 'membership' | 'password_reset'
export type AuthStoreDivergenceClassification =
  | 'REAL_LOGICAL_DIVERGENCE'
  | 'TIMESTAMP_NORMALIZATION_DRIFT'
  | 'WRITE_ORDERING_DRIFT'
  | 'SERIALIZATION_DRIFT'
  | 'OBSERVABILITY_FALSE_POSITIVE'

export type AuthStoreDivergenceReport = {
  mode: AuthStoreMode
  operation: string
  severity: AuthStoreDivergenceSeverity
  classification?: AuthStoreDivergenceClassification
  entityType: AuthStoreEntityType
  legacyPresent: boolean
  nativePresent: boolean
  mismatchFields: string[]
  failClosed: boolean
  occurredAt: string
  usedAtDeltaMs?: number
  semanticDanger?: boolean
}

type LogFn = (...args: unknown[]) => void

type LoggerCompat = {
  info: LogFn
  warn: LogFn
  error: LogFn
}

type DualAuthStoreAdapterOptions = {
  mode: AuthStoreMode
  logger?: LoggerCompat
  observability?: ObservabilityService
  nodeEnv?: string
  now?: () => string
  passwordResetUsedAtDriftToleranceMs?: number
}

const DEFAULT_PASSWORD_RESET_USED_AT_DRIFT_TOLERANCE_MS = 1000

function detectPasswordHashProfile(hash: string | undefined) {
  const value = String(hash ?? '').trim()
  if (!value) {
    return 'empty'
  }
  if (value.startsWith('$2')) {
    return 'bcrypt'
  }
  if (value.startsWith('bcrypt_sha256$')) {
    return 'bcrypt_sha256'
  }
  if (value.startsWith('pbkdf2:')) {
    return 'pbkdf2'
  }
  return 'other'
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function defaultLogger(): LoggerCompat {
  return {
    info: (...args: unknown[]) => console.info(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args),
  }
}

export class DualAuthStoreAdapter implements AuthIdentityStoreRepository {
  private readonly logger: LoggerCompat
  private readonly now: () => string
  private readonly nodeEnv: string
  private readonly passwordResetUsedAtDriftToleranceMs: number

  constructor(
    private readonly legacyStore: AuthIdentityStoreRepository,
    private readonly nativeStore: AuthIdentityStoreRepository,
    private readonly options: DualAuthStoreAdapterOptions,
  ) {
    this.logger = options.logger ?? defaultLogger()
    this.now = options.now ?? (() => new Date().toISOString())
    this.nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development'
    this.passwordResetUsedAtDriftToleranceMs = options.passwordResetUsedAtDriftToleranceMs
      ?? DEFAULT_PASSWORD_RESET_USED_AT_DRIFT_TOLERANCE_MS
  }

  private isProduction() {
    return this.nodeEnv === 'production'
  }

  private incrementMetric(name: string, labels?: Record<string, string>) {
    this.options.observability?.incrementMetric?.(name, 1, labels)
  }

  private emitDivergence(report: AuthStoreDivergenceReport) {
    this.incrementMetric('auth_store_divergence_total', {
      mode: report.mode,
      operation: report.operation,
      severity: report.severity,
      entityType: report.entityType,
    })

    const payload = {
      event: 'auth.store.divergence',
      ...report,
    }

    if (report.severity === 'critical') {
      this.logger.error(payload, 'Auth store divergence detected')
    } else if (report.severity === 'warning') {
      this.logger.warn(payload, 'Auth store divergence detected')
    } else {
      this.logger.info(payload, 'Auth store divergence detected')
    }
  }

  private buildReport(args: {
    operation: string
    severity: AuthStoreDivergenceSeverity
    classification?: AuthStoreDivergenceClassification
    entityType: AuthStoreEntityType
    legacyPresent: boolean
    nativePresent: boolean
    mismatchFields: string[]
    failClosed: boolean
    usedAtDeltaMs?: number
    semanticDanger?: boolean
  }): AuthStoreDivergenceReport {
    return {
      mode: this.options.mode,
      operation: args.operation,
      severity: args.severity,
      classification: args.classification,
      entityType: args.entityType,
      legacyPresent: args.legacyPresent,
      nativePresent: args.nativePresent,
      mismatchFields: args.mismatchFields,
      failClosed: args.failClosed,
      occurredAt: this.now(),
      usedAtDeltaMs: args.usedAtDeltaMs,
      semanticDanger: args.semanticDanger,
    }
  }

  private parseIsoTimestamp(value?: string) {
    if (!value) {
      return null
    }

    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : null
  }

  private classifyPasswordResetConsumeDivergence(
    legacyRecord: AuthPasswordResetTokenRecord | null,
    nativeRecord: AuthPasswordResetTokenRecord | null,
  ) {
    const mismatchFields = this.comparePasswordResetTokens(legacyRecord, nativeRecord)
    if (mismatchFields.length === 0 && Boolean(legacyRecord) === Boolean(nativeRecord)) {
      return null
    }

    const usedAtPresenceMismatch = (legacyRecord?.usedAt ?? null) !== null || (nativeRecord?.usedAt ?? null) !== null
      ? Boolean(legacyRecord?.usedAt) !== Boolean(nativeRecord?.usedAt)
      : false
    const usedAtDeltaMs = legacyRecord?.usedAt && nativeRecord?.usedAt
      ? Math.abs((this.parseIsoTimestamp(legacyRecord.usedAt) ?? 0) - (this.parseIsoTimestamp(nativeRecord.usedAt) ?? 0))
      : undefined
    const nonUsedAtMismatch = mismatchFields.some((field) => field !== 'usedAt')

    if (
      nonUsedAtMismatch
      || usedAtPresenceMismatch
      || (typeof usedAtDeltaMs === 'number' && usedAtDeltaMs > this.passwordResetUsedAtDriftToleranceMs)
    ) {
      return this.buildReport({
        operation: 'markPasswordResetTokenUsed',
        severity: 'critical',
        classification: 'REAL_LOGICAL_DIVERGENCE',
        entityType: 'password_reset',
        legacyPresent: Boolean(legacyRecord),
        nativePresent: Boolean(nativeRecord),
        mismatchFields,
        failClosed: this.options.mode === 'dual_write_native_read',
        usedAtDeltaMs,
        semanticDanger: true,
      })
    }

    if (
      legacyRecord?.usedAt
      && nativeRecord?.usedAt
      && typeof usedAtDeltaMs === 'number'
      && usedAtDeltaMs <= this.passwordResetUsedAtDriftToleranceMs
    ) {
      return this.buildReport({
        operation: 'markPasswordResetTokenUsed',
        severity: 'warning',
        classification: 'WRITE_ORDERING_DRIFT',
        entityType: 'password_reset',
        legacyPresent: true,
        nativePresent: true,
        mismatchFields: ['usedAt'],
        failClosed: false,
        usedAtDeltaMs,
        semanticDanger: false,
      })
    }

    return this.buildReport({
      operation: 'markPasswordResetTokenUsed',
      severity: 'warning',
      classification: 'REAL_LOGICAL_DIVERGENCE',
      entityType: 'password_reset',
      legacyPresent: Boolean(legacyRecord),
      nativePresent: Boolean(nativeRecord),
      mismatchFields,
      failClosed: false,
      usedAtDeltaMs,
      semanticDanger: true,
    })
  }

  private compareUsers(legacyRecord: AuthUserRecord | null, nativeRecord: AuthUserRecord | null) {
    const mismatchFields: string[] = []

    if ((legacyRecord?.id ?? null) !== (nativeRecord?.id ?? null)) mismatchFields.push('id')
    if ((legacyRecord?.email ?? null) !== (nativeRecord?.email ?? null)) mismatchFields.push('email')
    if ((legacyRecord?.isActive ?? null) !== (nativeRecord?.isActive ?? null)) mismatchFields.push('isActive')
    if (
      detectPasswordHashProfile(legacyRecord?.passwordHash)
      !== detectPasswordHashProfile(nativeRecord?.passwordHash)
    ) mismatchFields.push('passwordHashProfile')

    return mismatchFields
  }

  private compareUsersWithoutId(legacyRecord: AuthUserRecord | null, nativeRecord: AuthUserRecord | null) {
    return this.compareUsers(legacyRecord, nativeRecord).filter((field) => field !== 'id')
  }

  private compareTenants(legacyRecord: AuthTenantRecord | null, nativeRecord: AuthTenantRecord | null) {
    const mismatchFields: string[] = []

    if ((legacyRecord?.id ?? null) !== (nativeRecord?.id ?? null)) mismatchFields.push('id')
    if ((legacyRecord?.slug ?? null) !== (nativeRecord?.slug ?? null)) mismatchFields.push('slug')
    if ((legacyRecord?.isActive ?? null) !== (nativeRecord?.isActive ?? null)) mismatchFields.push('isActive')
    if ((legacyRecord?.businessModel ?? null) !== (nativeRecord?.businessModel ?? null)) mismatchFields.push('businessModel')

    return mismatchFields
  }

  private compareTenantsWithoutId(legacyRecord: AuthTenantRecord | null, nativeRecord: AuthTenantRecord | null) {
    return this.compareTenants(legacyRecord, nativeRecord).filter((field) => field !== 'id')
  }

  private compareMemberships(legacyRecord: AuthMembershipRecord | null, nativeRecord: AuthMembershipRecord | null) {
    const mismatchFields: string[] = []

    if ((legacyRecord?.userId ?? null) !== (nativeRecord?.userId ?? null)) mismatchFields.push('userId')
    if ((legacyRecord?.tenantId ?? null) !== (nativeRecord?.tenantId ?? null)) mismatchFields.push('tenantId')
    if ((legacyRecord?.role ?? null) !== (nativeRecord?.role ?? null)) mismatchFields.push('role')

    return mismatchFields
  }

  private comparePasswordResetTokens(
    legacyRecord: AuthPasswordResetTokenRecord | null,
    nativeRecord: AuthPasswordResetTokenRecord | null,
  ) {
    const mismatchFields: string[] = []

    if (Boolean(legacyRecord) !== Boolean(nativeRecord)) mismatchFields.push('tokenExists')
    if ((legacyRecord?.token ?? null) !== (nativeRecord?.token ?? null)) mismatchFields.push('token')
    if ((legacyRecord?.userId ?? null) !== (nativeRecord?.userId ?? null)) mismatchFields.push('userId')
    if ((legacyRecord?.usedAt ?? null) !== (nativeRecord?.usedAt ?? null)) mismatchFields.push('usedAt')
    if ((legacyRecord?.expiresAt ?? null) !== (nativeRecord?.expiresAt ?? null)) mismatchFields.push('expiresAt')

    return mismatchFields
  }

  private reportReadComparison<T>(
    operation: string,
    entityType: AuthStoreEntityType,
    primary: T | null,
    secondary: T | null,
    compare: (legacyRecord: T | null, nativeRecord: T | null) => string[],
  ) {
    const mismatchFields = compare(primary, secondary)
    if (mismatchFields.length === 0 && Boolean(primary) === Boolean(secondary)) {
      return
    }

    const nativeReadMode = this.options.mode === 'dual_write_native_read'
    const report = this.buildReport({
      operation,
      severity: nativeReadMode ? 'critical' : 'warning',
      entityType,
      legacyPresent: this.options.mode === 'dual_write_native_read' ? Boolean(secondary) : Boolean(primary),
      nativePresent: this.options.mode === 'dual_write_native_read' ? Boolean(primary) : Boolean(secondary),
      mismatchFields: mismatchFields.length > 0 ? mismatchFields : ['presence'],
      failClosed: nativeReadMode,
    })
    this.emitDivergence(report)

    if (nativeReadMode) {
      throw new Error(`AUTH_STORE_DIVERGENCE:${entityType}:${operation}`)
    }
  }

  private async compareReadUserByEmail(email: string, legacyUser: AuthUserRecord | null) {
    const nativeUser = await this.nativeStore.findUserByEmail(email)
    this.reportReadComparison('findUserByEmail', 'user', legacyUser, nativeUser, this.compareUsers.bind(this))
  }

  private async compareReadUserById(userId: number, nativePrimary: boolean, primary: AuthUserRecord | null) {
    const counterpart = nativePrimary
      ? await this.legacyStore.findUserById(userId)
      : await this.nativeStore.findUserById(userId)
    this.reportReadComparison(
      'findUserById',
      'user',
      nativePrimary ? counterpart : primary,
      nativePrimary ? primary : counterpart,
      this.compareUsers.bind(this),
    )
  }

  private async compareReadTenantById(tenantId: number, nativePrimary: boolean, primary: AuthTenantRecord | null) {
    const counterpart = nativePrimary
      ? await this.legacyStore.findTenantById(tenantId)
      : await this.nativeStore.findTenantById(tenantId)
    this.reportReadComparison(
      'findTenantById',
      'tenant',
      nativePrimary ? counterpart : primary,
      nativePrimary ? primary : counterpart,
      this.compareTenants.bind(this),
    )
  }

  private async compareReadTenantBySlug(slug: string, legacyTenant: AuthTenantRecord | null) {
    const nativeTenant = await this.nativeStore.findTenantBySlug(slug)
    this.reportReadComparison('findTenantBySlug', 'tenant', legacyTenant, nativeTenant, this.compareTenants.bind(this))
  }

  private async compareReadMembership(userId: number, tenantId: number, nativePrimary: boolean, primary: AuthMembershipRecord | null) {
    const counterpart = nativePrimary
      ? await this.legacyStore.findMembershipForUserAndTenant(userId, tenantId)
      : await this.nativeStore.findMembershipForUserAndTenant(userId, tenantId)
    this.reportReadComparison(
      'findMembershipForUserAndTenant',
      'membership',
      nativePrimary ? counterpart : primary,
      nativePrimary ? primary : counterpart,
      this.compareMemberships.bind(this),
    )
  }

  private compareMembershipLists(legacyList: AuthTenantMembershipRecord[], nativeList: AuthTenantMembershipRecord[]) {
    if (legacyList.length !== nativeList.length) {
      return ['count']
    }

    const mismatchFields: string[] = []
    for (let index = 0; index < legacyList.length; index += 1) {
      const legacyEntry = legacyList[index]
      const nativeEntry = nativeList[index]
      const membershipMismatch = this.compareMemberships(legacyEntry?.membership ?? null, nativeEntry?.membership ?? null)
      const tenantMismatch = this.compareTenants(legacyEntry?.tenant ?? null, nativeEntry?.tenant ?? null)

      if (membershipMismatch.length > 0) mismatchFields.push(`membership[${index}]`)
      if (tenantMismatch.length > 0) mismatchFields.push(`tenant[${index}]`)
    }

    return mismatchFields
  }

  private async compareReadMembershipList(userId: number, nativePrimary: boolean, primary: AuthTenantMembershipRecord[]) {
    const counterpart = nativePrimary
      ? await this.legacyStore.listMembershipsForUser(userId)
      : await this.nativeStore.listMembershipsForUser(userId)
    const mismatchFields = this.compareMembershipLists(
      nativePrimary ? counterpart : primary,
      nativePrimary ? primary : counterpart,
    )
    if (mismatchFields.length === 0) {
      return
    }

    const report = this.buildReport({
      operation: 'listMembershipsForUser',
      severity: nativePrimary ? 'critical' : 'warning',
      entityType: 'membership',
      legacyPresent: (nativePrimary ? counterpart : primary).length > 0,
      nativePresent: (nativePrimary ? primary : counterpart).length > 0,
      mismatchFields,
      failClosed: nativePrimary,
    })
    this.emitDivergence(report)
    if (nativePrimary) {
      throw new Error('AUTH_STORE_DIVERGENCE:membership:listMembershipsForUser')
    }
  }

  private async compareReadPasswordResetByToken(token: string, nativePrimary: boolean, primary: AuthPasswordResetTokenRecord | null) {
    const counterpart = nativePrimary
      ? await this.legacyStore.findPasswordResetTokenByToken(token)
      : await this.nativeStore.findPasswordResetTokenByToken(token)
    this.reportReadComparison(
      'findPasswordResetTokenByToken',
      'password_reset',
      nativePrimary ? counterpart : primary,
      nativePrimary ? primary : counterpart,
      this.comparePasswordResetTokens.bind(this),
    )
  }

  private async compareReadLatestPasswordReset(userId: number, nativePrimary: boolean, primary: AuthPasswordResetTokenRecord | null) {
    const counterpart = nativePrimary
      ? await this.legacyStore.findLatestPasswordResetTokenForUser(userId)
      : await this.nativeStore.findLatestPasswordResetTokenForUser(userId)
    this.reportReadComparison(
      'findLatestPasswordResetTokenForUser',
      'password_reset',
      nativePrimary ? counterpart : primary,
      nativePrimary ? primary : counterpart,
      this.comparePasswordResetTokens.bind(this),
    )
  }

  private handleSecondaryWriteFailure(args: {
    operation: string
    entityType: AuthStoreEntityType
    error: unknown
    failClosed: boolean
  }) {
    const report = this.buildReport({
      operation: args.operation,
      severity: args.failClosed ? 'critical' : 'warning',
      entityType: args.entityType,
      legacyPresent: false,
      nativePresent: false,
      mismatchFields: ['secondaryWriteFailure'],
      failClosed: args.failClosed,
    })

    this.emitDivergence(report)
    this.incrementMetric('auth_store_write_failure_total', {
      mode: this.options.mode,
      operation: args.operation,
      entityType: args.entityType,
    })

    this.logger[args.failClosed ? 'error' : 'warn']({
      event: 'auth.store.write_failure',
      mode: this.options.mode,
      operation: args.operation,
      entityType: args.entityType,
      failClosed: args.failClosed,
      errorMessage: normalizeErrorMessage(args.error),
      occurredAt: this.now(),
    }, 'Auth store secondary write failed')

    if (args.failClosed) {
      throw args.error
    }
  }

  private async dualWriteLegacyFirst<TPrimary, TSecondary>(args: {
    operation: string
    entityType: AuthStoreEntityType
    writeLegacy: () => Promise<TPrimary>
    writeNative: () => Promise<TSecondary>
    compare?: (legacyResult: TPrimary, nativeResult: TSecondary) => string[]
  }) {
    const legacyResult = await args.writeLegacy()
    try {
      const nativeResult = await args.writeNative()
      const mismatchFields = args.compare?.(legacyResult, nativeResult) ?? []
      if (mismatchFields.length > 0) {
        this.emitDivergence(this.buildReport({
          operation: args.operation,
          severity: 'warning',
          entityType: args.entityType,
          legacyPresent: Boolean(legacyResult),
          nativePresent: Boolean(nativeResult),
          mismatchFields,
          failClosed: false,
        }))
      }
    } catch (error) {
      this.handleSecondaryWriteFailure({
        operation: args.operation,
        entityType: args.entityType,
        error,
        failClosed: this.isProduction(),
      })
    }

    return legacyResult
  }

  private async dualWriteNativeFirst<TPrimary, TSecondary>(args: {
    operation: string
    entityType: AuthStoreEntityType
    writeNative: () => Promise<TPrimary>
    writeLegacy: () => Promise<TSecondary>
    compare?: (legacyResult: TSecondary, nativeResult: TPrimary) => string[]
  }) {
    const nativeResult = await args.writeNative()
    try {
      const legacyResult = await args.writeLegacy()
      const mismatchFields = args.compare?.(legacyResult, nativeResult) ?? []
      if (mismatchFields.length > 0) {
        this.emitDivergence(this.buildReport({
          operation: args.operation,
          severity: 'critical',
          entityType: args.entityType,
          legacyPresent: Boolean(legacyResult),
          nativePresent: Boolean(nativeResult),
          mismatchFields,
          failClosed: true,
        }))
        throw new Error(`AUTH_STORE_DIVERGENCE:${args.entityType}:${args.operation}`)
      }
    } catch (error) {
      this.handleSecondaryWriteFailure({
        operation: args.operation,
        entityType: args.entityType,
        error,
        failClosed: true,
      })
    }

    return nativeResult
  }

  async createUser(input: CreateAuthUserInput) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.createUser(input)
      case 'native_only':
        return this.nativeStore.createUser(input)
      case 'dual_write_legacy_read':
        return this.dualWriteLegacyFirst({
          operation: 'createUser',
          entityType: 'user',
          writeLegacy: () => this.legacyStore.createUser(input),
          writeNative: async () => {
            const legacyResult = await this.legacyStore.findUserByEmail(input.email.toLowerCase())
            return this.nativeStore.createUser({
              ...input,
              legacySource: input.legacySource ?? 'brandsoul',
              legacyId: input.legacyId ?? legacyResult?.id,
            })
          },
          compare: (legacyUser, nativeUser) => this.compareUsersWithoutId(legacyUser, nativeUser),
        })
      case 'dual_write_native_read':
        return this.dualWriteNativeFirst({
          operation: 'createUser',
          entityType: 'user',
          writeNative: () => this.nativeStore.createUser(input),
          writeLegacy: () => this.legacyStore.createUser(input),
          compare: (legacyUser, nativeUser) => this.compareUsersWithoutId(legacyUser, nativeUser),
        })
    }
  }

  async findUserByEmail(email: string) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.findUserByEmail(email)
      case 'native_only':
        return this.nativeStore.findUserByEmail(email)
      case 'dual_write_legacy_read': {
        const legacyUser = await this.legacyStore.findUserByEmail(email)
        await this.compareReadUserByEmail(email, legacyUser)
        return legacyUser
      }
      case 'dual_write_native_read': {
        const nativeUser = await this.nativeStore.findUserByEmail(email)
        const legacyUser = await this.legacyStore.findUserByEmail(email)
        this.reportReadComparison('findUserByEmail', 'user', legacyUser, nativeUser, this.compareUsers.bind(this))
        return nativeUser
      }
    }
  }

  async findUserById(userId: number) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.findUserById(userId)
      case 'native_only':
        return this.nativeStore.findUserById(userId)
      case 'dual_write_legacy_read': {
        const legacyUser = await this.legacyStore.findUserById(userId)
        await this.compareReadUserById(userId, false, legacyUser)
        return legacyUser
      }
      case 'dual_write_native_read': {
        const nativeUser = await this.nativeStore.findUserById(userId)
        await this.compareReadUserById(userId, true, nativeUser)
        return nativeUser
      }
    }
  }

  async updateUserPassword(userId: number, passwordHash: string) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.updateUserPassword(userId, passwordHash)
      case 'native_only':
        return this.nativeStore.updateUserPassword(userId, passwordHash)
      case 'dual_write_legacy_read':
        return this.dualWriteLegacyFirst({
          operation: 'updateUserPassword',
          entityType: 'user',
          writeLegacy: () => this.legacyStore.updateUserPassword(userId, passwordHash),
          writeNative: () => this.nativeStore.updateUserPassword(userId, passwordHash),
          compare: (legacyUser, nativeUser) => this.compareUsersWithoutId(legacyUser, nativeUser),
        })
      case 'dual_write_native_read':
        return this.dualWriteNativeFirst({
          operation: 'updateUserPassword',
          entityType: 'user',
          writeNative: () => this.nativeStore.updateUserPassword(userId, passwordHash),
          writeLegacy: () => this.legacyStore.updateUserPassword(userId, passwordHash),
          compare: (legacyUser, nativeUser) => this.compareUsersWithoutId(legacyUser, nativeUser),
        })
    }
  }

  async updateUserPasswordHash(userId: number, passwordHash: string) {
    return this.updateUserPassword(userId, passwordHash)
  }

  async createTenant(input: CreateAuthTenantInput) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.createTenant(input)
      case 'native_only':
        return this.nativeStore.createTenant(input)
      case 'dual_write_legacy_read':
        return this.dualWriteLegacyFirst({
          operation: 'createTenant',
          entityType: 'tenant',
          writeLegacy: () => this.legacyStore.createTenant(input),
          writeNative: async () => {
            const legacyResult = await this.legacyStore.findTenantBySlug(input.slug)
            return this.nativeStore.createTenant({
              ...input,
              legacySource: input.legacySource ?? 'brandsoul',
              legacyId: input.legacyId ?? legacyResult?.id,
            })
          },
          compare: (legacyTenant, nativeTenant) => this.compareTenantsWithoutId(legacyTenant, nativeTenant),
        })
      case 'dual_write_native_read':
        return this.dualWriteNativeFirst({
          operation: 'createTenant',
          entityType: 'tenant',
          writeNative: () => this.nativeStore.createTenant(input),
          writeLegacy: () => this.legacyStore.createTenant(input),
          compare: (legacyTenant, nativeTenant) => this.compareTenantsWithoutId(legacyTenant, nativeTenant),
        })
    }
  }

  async findTenantById(tenantId: number) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.findTenantById(tenantId)
      case 'native_only':
        return this.nativeStore.findTenantById(tenantId)
      case 'dual_write_legacy_read': {
        const legacyTenant = await this.legacyStore.findTenantById(tenantId)
        await this.compareReadTenantById(tenantId, false, legacyTenant)
        return legacyTenant
      }
      case 'dual_write_native_read': {
        const nativeTenant = await this.nativeStore.findTenantById(tenantId)
        await this.compareReadTenantById(tenantId, true, nativeTenant)
        return nativeTenant
      }
    }
  }

  async findTenantBySlug(slug: string) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.findTenantBySlug(slug)
      case 'native_only':
        return this.nativeStore.findTenantBySlug(slug)
      case 'dual_write_legacy_read': {
        const legacyTenant = await this.legacyStore.findTenantBySlug(slug)
        await this.compareReadTenantBySlug(slug, legacyTenant)
        return legacyTenant
      }
      case 'dual_write_native_read': {
        const nativeTenant = await this.nativeStore.findTenantBySlug(slug)
        const legacyTenant = await this.legacyStore.findTenantBySlug(slug)
        this.reportReadComparison('findTenantBySlug', 'tenant', legacyTenant, nativeTenant, this.compareTenants.bind(this))
        return nativeTenant
      }
    }
  }

  async createMembership(input: CreateAuthMembershipInput) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.createMembership(input)
      case 'native_only':
        return this.nativeStore.createMembership(input)
      case 'dual_write_legacy_read':
        return this.dualWriteLegacyFirst({
          operation: 'createMembership',
          entityType: 'membership',
          writeLegacy: () => this.legacyStore.createMembership(input),
          writeNative: async () => {
            const legacyResult = await this.legacyStore.findMembershipForUserAndTenant(input.userId, input.tenantId)
            return this.nativeStore.createMembership({
              ...input,
              legacySource: input.legacySource ?? 'brandsoul',
              legacyId: input.legacyId ?? legacyResult?.id,
            })
          },
          compare: (legacyMembership, nativeMembership) => this.compareMemberships(legacyMembership, nativeMembership),
        })
      case 'dual_write_native_read':
        return this.dualWriteNativeFirst({
          operation: 'createMembership',
          entityType: 'membership',
          writeNative: () => this.nativeStore.createMembership(input),
          writeLegacy: () => this.legacyStore.createMembership(input),
          compare: (legacyMembership, nativeMembership) => this.compareMemberships(legacyMembership, nativeMembership),
        })
    }
  }

  async findMembershipForUserAndTenant(userId: number, tenantId: number) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.findMembershipForUserAndTenant(userId, tenantId)
      case 'native_only':
        return this.nativeStore.findMembershipForUserAndTenant(userId, tenantId)
      case 'dual_write_legacy_read': {
        const legacyMembership = await this.legacyStore.findMembershipForUserAndTenant(userId, tenantId)
        await this.compareReadMembership(userId, tenantId, false, legacyMembership)
        return legacyMembership
      }
      case 'dual_write_native_read': {
        const nativeMembership = await this.nativeStore.findMembershipForUserAndTenant(userId, tenantId)
        await this.compareReadMembership(userId, tenantId, true, nativeMembership)
        return nativeMembership
      }
    }
  }

  async listMembershipsForUser(userId: number) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.listMembershipsForUser(userId)
      case 'native_only':
        return this.nativeStore.listMembershipsForUser(userId)
      case 'dual_write_legacy_read': {
        const memberships = await this.legacyStore.listMembershipsForUser(userId)
        await this.compareReadMembershipList(userId, false, memberships)
        return memberships
      }
      case 'dual_write_native_read': {
        const memberships = await this.nativeStore.listMembershipsForUser(userId)
        await this.compareReadMembershipList(userId, true, memberships)
        return memberships
      }
    }
  }

  async listMembershipUsersByTenant(tenantId: number) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.listMembershipUsersByTenant(tenantId)
      case 'native_only':
        return this.nativeStore.listMembershipUsersByTenant(tenantId)
      case 'dual_write_legacy_read':
        return this.legacyStore.listMembershipUsersByTenant(tenantId)
      case 'dual_write_native_read':
        return this.nativeStore.listMembershipUsersByTenant(tenantId)
    }
  }

  async createPasswordResetToken(input: CreateAuthPasswordResetTokenInput) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.createPasswordResetToken(input)
      case 'native_only':
        return this.nativeStore.createPasswordResetToken(input)
      case 'dual_write_legacy_read':
        return this.dualWriteLegacyFirst({
          operation: 'createPasswordResetToken',
          entityType: 'password_reset',
          writeLegacy: () => this.legacyStore.createPasswordResetToken(input),
          writeNative: async () => {
            const legacyResult = await this.legacyStore.findPasswordResetTokenByToken(input.token)
            return this.nativeStore.createPasswordResetToken({
              ...input,
              legacySource: input.legacySource ?? 'brandsoul',
              legacyId: input.legacyId ?? legacyResult?.id,
            })
          },
          compare: (legacyToken, nativeToken) => this.comparePasswordResetTokens(legacyToken, nativeToken),
        })
      case 'dual_write_native_read':
        return this.dualWriteNativeFirst({
          operation: 'createPasswordResetToken',
          entityType: 'password_reset',
          writeNative: () => this.nativeStore.createPasswordResetToken(input),
          writeLegacy: () => this.legacyStore.createPasswordResetToken(input),
          compare: (legacyToken, nativeToken) => this.comparePasswordResetTokens(legacyToken, nativeToken),
        })
    }
  }

  async findPasswordResetTokenByToken(token: string) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.findPasswordResetTokenByToken(token)
      case 'native_only':
        return this.nativeStore.findPasswordResetTokenByToken(token)
      case 'dual_write_legacy_read': {
        const legacyToken = await this.legacyStore.findPasswordResetTokenByToken(token)
        await this.compareReadPasswordResetByToken(token, false, legacyToken)
        return legacyToken
      }
      case 'dual_write_native_read': {
        const nativeToken = await this.nativeStore.findPasswordResetTokenByToken(token)
        await this.compareReadPasswordResetByToken(token, true, nativeToken)
        return nativeToken
      }
    }
  }

  async findLatestPasswordResetTokenForUser(userId: number) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.findLatestPasswordResetTokenForUser(userId)
      case 'native_only':
        return this.nativeStore.findLatestPasswordResetTokenForUser(userId)
      case 'dual_write_legacy_read': {
        const legacyToken = await this.legacyStore.findLatestPasswordResetTokenForUser(userId)
        await this.compareReadLatestPasswordReset(userId, false, legacyToken)
        return legacyToken
      }
      case 'dual_write_native_read': {
        const nativeToken = await this.nativeStore.findLatestPasswordResetTokenForUser(userId)
        await this.compareReadLatestPasswordReset(userId, true, nativeToken)
        return nativeToken
      }
    }
  }

  async markPasswordResetTokenUsed(tokenId: number) {
    switch (this.options.mode) {
      case 'legacy_only':
        return this.legacyStore.markPasswordResetTokenUsed(tokenId)
      case 'native_only':
        return this.nativeStore.markPasswordResetTokenUsed(tokenId)
      case 'dual_write_legacy_read': {
        const legacyToken = await this.legacyStore.markPasswordResetTokenUsed(tokenId)
        if (!legacyToken) {
          return null
        }

        try {
          const nativeToken = await this.nativeStore.findPasswordResetTokenByToken(legacyToken.token)
          const markedNative = nativeToken
            ? await this.nativeStore.markPasswordResetTokenUsed(nativeToken.id)
            : null
          const divergence = this.classifyPasswordResetConsumeDivergence(legacyToken, markedNative)
          if (divergence) {
            this.emitDivergence(divergence)
          }
        } catch (error) {
          this.handleSecondaryWriteFailure({
            operation: 'markPasswordResetTokenUsed',
            entityType: 'password_reset',
            error,
            failClosed: this.isProduction(),
          })
        }

        return legacyToken
      }
      case 'dual_write_native_read': {
        const nativeToken = await this.nativeStore.markPasswordResetTokenUsed(tokenId)
        if (!nativeToken) {
          return null
        }

        try {
          const legacyToken = await this.legacyStore.findPasswordResetTokenByToken(nativeToken.token)
          const markedLegacy = legacyToken
            ? await this.legacyStore.markPasswordResetTokenUsed(legacyToken.id)
            : null
          const divergence = this.classifyPasswordResetConsumeDivergence(markedLegacy, nativeToken)
          if (divergence) {
            this.emitDivergence(divergence)
          }
          if (divergence?.semanticDanger) {
            throw new Error('AUTH_STORE_DIVERGENCE:password_reset:markPasswordResetTokenUsed')
          }
        } catch (error) {
          this.handleSecondaryWriteFailure({
            operation: 'markPasswordResetTokenUsed',
            entityType: 'password_reset',
            error,
            failClosed: true,
          })
        }

        return nativeToken
      }
    }
  }
}

export function createDualAuthStoreAdapter(
  legacyStore: AuthIdentityStoreRepository,
  nativeStore: AuthIdentityStoreRepository,
  options: DualAuthStoreAdapterOptions,
) {
  return new DualAuthStoreAdapter(legacyStore, nativeStore, options)
}
