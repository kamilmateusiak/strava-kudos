import { FastifyInstance } from 'fastify';
import { config } from '../config/config';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
	// Health check endpoint
	fastify.get('/', async () => {
		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: config.get('NODE_ENV')
		};
	});

	// Detailed health check
	fastify.get('/detailed', async () => {
		const health = {
			status: 'ok',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: config.get('NODE_ENV'),
			memory: process.memoryUsage(),
			version: process.version,
			platform: process.platform,
			arch: process.arch
		};

		return health;
	});
}
