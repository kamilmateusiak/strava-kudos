import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { config } from './config/config';
import stravaRoutes from './routes/strava';
import { kudosRoutes } from './routes/kudos';
import { healthRoutes } from './routes/health';

const server = Fastify({
    logger: {
        level: config.get('NODE_ENV') === 'development' ? 'info' : 'warn'
    }
});

async function start() {
    try {
        // Register static file serving
        await server.register(fastifyStatic, {
            root: path.join(__dirname, '../public'),
            prefix: '/'
        });

        // Register routes
        await server.register(stravaRoutes, { prefix: '/strava' });
        await server.register(kudosRoutes, { prefix: '/kudos' });
        await server.register(healthRoutes, { prefix: '/health' });

        // Global error handler
        server.setErrorHandler((error, request, reply) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            console.error('Global error handler:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        });

        await server.listen({ port: config.get('PORT'), host: '0.0.0.0' });
        console.log(`Server listening on port ${config.get('PORT')}`);
    } catch (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
}

start();
