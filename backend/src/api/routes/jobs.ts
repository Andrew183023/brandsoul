import type { FastifyInstance } from 'fastify'

import type { JobQueue } from '../../jobs/index.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { getRequestAuth, requireAuth } from '../middleware/requireAuth.js'
import { validateEntityOwnership } from '../middleware/requireEntityOwner.js'

type BackendContext = {
  backendContext: {
    jobQueue: JobQueue
    entityRepository: EntityRepository
  }
}

function getJobQueue(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.jobQueue
}

function getEntityRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityRepository
}

export async function registerJobRoutes(app: FastifyInstance) {
  // Internal job inspection is private and owner-scoped by the job entityId.
  app.get<{ Params: { id: string } }>('/jobs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const job = await getJobQueue(app).getJob(request.params.id)

    if (!job) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Job "${request.params.id}" was not found.`,
        },
      })
    }

    if (!job.entityId) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'JOB_ACCESS_DENIED',
          message: 'This job is not accessible from the current API surface.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById(job.entityId)
    if (!entity || !validateEntityOwnership(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'JOB_ACCESS_DENIED',
          message: 'You do not own the entity associated with this job.',
        },
      })
    }

    return {
      status: 'ready',
      job,
    }
  })

  app.get<{ Querystring: { limit?: string } }>('/jobs', { preHandler: requireAuth }, async (request) => {
    const auth = getRequestAuth(request)!
    const limit = Number(request.query.limit ?? 20)
    const jobs = await getJobQueue(app).listJobs(Number.isFinite(limit) ? limit : 20)
    const ownedJobs = []

    for (const job of jobs) {
      if (!job.entityId) {
        continue
      }

      const entity = await getEntityRepository(app).getEntityById(job.entityId)
      if (!entity || !validateEntityOwnership(entity, auth.userId, auth.tenantId)) {
        continue
      }

      ownedJobs.push(job)
    }

    return {
      status: 'ready',
      jobs: ownedJobs,
    }
  })
}
