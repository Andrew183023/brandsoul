import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue | undefined }

export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type EntityProfileDocument = EntityProfile

export type StoredEntityProfile<T extends EntityProfileDocument = EntityProfileDocument> = {
  id: string
  ownerId?: string
  ownerUserId?: number
  ownerTenantId?: number
  createdAt: string
  updatedAt: string
  entityProfile: T
}