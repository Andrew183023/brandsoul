import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { open, type Database as SQLiteDatabase } from 'sqlite'
import sqlite3 from 'sqlite3'
import { Pool, type Pool as PostgresPool } from 'pg'

export type DatabaseDialect = 'sqlite' | 'postgres'

export type DatabaseConfig = {
  provider: DatabaseDialect
  connectionString?: string
  sqliteFile: string
}

export type DatabaseRunResult = {
  changes?: number
  lastID?: number
}

export type BackendDatabase = {
  dialect: DatabaseDialect
  run(sql: string, ...params: unknown[]): Promise<DatabaseRunResult>
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>
  all<T>(sql: string, ...params: unknown[]): Promise<T>
  exec(sql: string): Promise<void>
  transaction<T>(callback: (db: BackendDatabase) => Promise<T>): Promise<T>
  close(): Promise<void>
}

type PostgresQueryable = Pick<PostgresPool, 'query'>
type PostgresTransactionQueryable = PostgresQueryable & {
  release(): void
}
type PostgresPoolHandle = PostgresQueryable & {
  connect(): Promise<PostgresTransactionQueryable>
  end(): Promise<void>
}

function normalizePostgresSql(sql: string) {
  let parameterIndex = 0
  return sql.replace(/\?/g, () => {
    parameterIndex += 1
    return `$${parameterIndex}`
  })
}

type PostgresColumnDefinition = {
  name: string
  definition: string
}

function mapSqliteColumnDefinitionToPostgres(definition: string) {
  return definition
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bINTEGER\b/gi, 'INTEGER')
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION')
    .replace(/\bTEXT\b/gi, 'TEXT')
}

class SQLiteClient implements BackendDatabase {
  readonly dialect = 'sqlite' as const

  constructor(private readonly db: SQLiteDatabase) {}

  async run(sql: string, ...params: unknown[]) {
    const result = await this.db.run(sql, ...params)
    return {
      changes: result.changes,
      lastID: result.lastID,
    }
  }

  async get<T>(sql: string, ...params: unknown[]) {
    return this.db.get<T>(sql, ...params)
  }

  async all<T>(sql: string, ...params: unknown[]) {
    return this.db.all<T>(sql, ...params)
  }

  async exec(sql: string) {
    await this.db.exec(sql)
  }

  async transaction<T>(callback: (db: BackendDatabase) => Promise<T>) {
    await this.db.exec('BEGIN')

    try {
      const result = await callback(this)
      await this.db.exec('COMMIT')
      return result
    } catch (error) {
      await this.db.exec('ROLLBACK')
      throw error
    }
  }

  async close() {
    await this.db.close()
  }
}

class PostgresClientBase implements BackendDatabase {
  readonly dialect = 'postgres' as const

  constructor(private readonly queryable: PostgresQueryable) {}

  async run(sql: string, ...params: unknown[]) {
    const result = await this.queryable.query(normalizePostgresSql(sql), params)
    return {
      changes: result.rowCount ?? 0,
    }
  }

  async get<T>(sql: string, ...params: unknown[]) {
    const result = await this.queryable.query(normalizePostgresSql(sql), params)
    return result.rows[0] as T | undefined
  }

  async all<T>(sql: string, ...params: unknown[]) {
    const result = await this.queryable.query(normalizePostgresSql(sql), params)
    return result.rows as T
  }

  async exec(sql: string) {
    await this.queryable.query(sql)
  }

  async transaction<T>(_callback: (db: BackendDatabase) => Promise<T>): Promise<T> {
    throw new Error('Nested transaction is not supported on this database handle.')
  }

  async close() {
    return
  }
}

class PostgresClient extends PostgresClientBase {
  constructor(private readonly pool: PostgresPoolHandle) {
    super(pool)
  }

  async transaction<T>(callback: (db: BackendDatabase) => Promise<T>) {
    const client = await this.pool.connect()
    const transactionClient = new PostgresTransactionClient(client)

    try {
      await client.query('BEGIN')
      const result = await callback(transactionClient)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async close() {
    await this.pool.end()
  }
}

class PostgresTransactionClient extends PostgresClientBase {
  constructor(private readonly client: PostgresTransactionQueryable) {
    super(client)
  }
}

export async function createDatabaseConnection(config: DatabaseConfig): Promise<BackendDatabase> {
  if (config.provider === 'postgres') {
    if (!config.connectionString) {
      throw new Error('DATABASE_URL is required when provider=postgres.')
    }

    const pool = new Pool({
      connectionString: config.connectionString,
    })

    return new PostgresClient(pool as unknown as PostgresPoolHandle)
  }

  await mkdir(path.dirname(config.sqliteFile), { recursive: true })
  const db = await open({
    filename: config.sqliteFile,
    driver: sqlite3.Database,
  })

  return new SQLiteClient(db)
}

export async function ensureColumn(db: BackendDatabase, tableName: string, columnName: string, definition: string) {
  if (db.dialect === 'postgres') {
    const row = await db.get<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = ?
            AND column_name = ?
        ) AS exists
      `,
      tableName,
      columnName,
    )

    if (!row?.exists) {
      await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${mapSqliteColumnDefinitionToPostgres(definition)}`)
    }

    return
  }

  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${tableName})`)
  const hasColumn = columns.some((column) => column.name === columnName)

  if (!hasColumn) {
    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

export async function ensureIndexes(db: BackendDatabase, statements: string[]) {
  for (const statement of statements) {
    await db.exec(statement)
  }
}

export function toPostgresCreateTable(sql: string) {
  return sql
    .replace(/\bAUTOINCREMENT\b/gi, '')
    .replace(/\bINTEGER PRIMARY KEY\b/gi, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION')
}

export function splitSqlStatements(sql: string) {
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean)
}

export type MigrationColumn = PostgresColumnDefinition
