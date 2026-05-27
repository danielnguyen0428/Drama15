import Fastify from 'fastify';

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = Fastify({ logger: true });

app.get('/voices', async (request, reply) => {
    return reply.send({ voices: [{ id: 'default', name: 'Test' }] });
});

try {
    const address = await app.listen({ port: 3001, host: '127.0.0.1' });
    app.log.info(`Server listening at ${address}`);
    // Keep alive with heartbeat
    setInterval(() => {
        app.log.info('Heartbeat...');
    }, 3000);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
