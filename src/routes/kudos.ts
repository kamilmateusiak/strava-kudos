import { FastifyInstance, FastifyRequest } from 'fastify';

export async function kudosRoutes(fastify: FastifyInstance): Promise<void> {
  // Get kudos bot status
  fastify.get('/status', async (request: FastifyRequest) => {
    return {
      status: 'active',
      mode: 'webhook',
      description: 'Automatically gives kudos to new activities from followed athletes',
      lastActivity: new Date().toISOString(),
      webhookUrl: `${request.protocol}://${request.hostname}/strava/webhook`
    };
  });

  // Start the kudos bot (for future use if needed)
  fastify.post('/start', async () => {
    return {
      success: true,
      message: 'Kudos bot is already running in webhook mode',
      status: 'active'
    };
  });

  // Stop the kudos bot (for future use if needed)
  fastify.post('/stop', async () => {
    return {
      success: true,
      message: 'Kudos bot is running in webhook mode and cannot be stopped',
      status: 'active'
    };
  });

  // Get recent kudos activity (placeholder for future database integration)
  fastify.get('/recent', async () => {
    return {
      message: 'Recent kudos activity will be available when database integration is added',
      activities: []
    };
  });
}
